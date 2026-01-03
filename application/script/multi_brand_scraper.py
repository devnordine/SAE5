import os, re, time, requests, random
from io import BytesIO
from PIL import Image
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from concurrent.futures import ThreadPoolExecutor, as_completed

def setup_driver():
    """Configure un driver Selenium avec options anti-détection"""
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")
    
    # User agent réaliste
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
    
    # Désactive la détection webdriver
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    driver.execute_cdp_cmd('Network.setUserAgentOverride', {
        "userAgent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    
    return driver

def scroll_and_collect_images(query, scroll_count=40, wait_time=2):
    """Collecte les URLs d'images avec attente du chargement dynamique"""
    driver = setup_driver()
    image_urls = set()
    
    try:
        url = f"https://www.pinterest.fr/search/pins/?q={query.replace(' ', '%20')}"
        print(f"🌐 Ouverture : {url}")
        driver.get(url)
        
        # Attendre le chargement initial
        time.sleep(3)
        
        last_height = driver.execute_script("return document.body.scrollHeight")
        no_change_count = 0
        
        for i in range(scroll_count):
            # Scroll progressif (plus naturel)
            driver.execute_script(f"window.scrollTo(0, {last_height * (i+1) / scroll_count});")
            time.sleep(wait_time)
            
            # Attendre que de nouveaux éléments se chargent
            try:
                WebDriverWait(driver, 5).until(
                    lambda d: d.execute_script("return document.body.scrollHeight") > last_height
                )
            except:
                no_change_count += 1
                if no_change_count > 3:
                    print("⚠️ Plus de nouvelles images détectées")
                    break
            
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                no_change_count += 1
            else:
                no_change_count = 0
                last_height = new_height
            
            # Extraire les images avec plusieurs patterns
            html = driver.page_source
            
            # Pattern 1: URLs directes pinimg
            urls_pinimg = re.findall(r'https://i\.pinimg\.com/[^"\'>\s]+\.(?:jpg|jpeg|png)', html)
            
            # Pattern 2: URLs dans srcset
            urls_srcset = re.findall(r'https://i\.pinimg\.com/[^"\'>\s,]+(?:jpg|jpeg|png)', html)
            
            # Pattern 3: URLs origsize (meilleure qualité)
            urls_origsize = re.findall(r'https://i\.pinimg\.com/originals/[^"\'>\s]+\.(?:jpg|jpeg|png)', html)
            
            all_urls = set(urls_pinimg + urls_srcset + urls_origsize)
            
            # Filtrer les miniatures (contiennent 236x ou 474x)
            filtered_urls = {url for url in all_urls if '236x' not in url and '474x' not in url}
            
            # Éviter les doublons d'URL (parfois Pinterest duplique avec des paramètres)
            unique_filtered = set()
            for url in filtered_urls:
                # Nettoyer l'URL des paramètres de tracking
                clean_url = url.split('?')[0]
                unique_filtered.add(clean_url)
            
            image_urls.update(unique_filtered)
            
            if i % 5 == 0:
                print(f"  Scroll {i+1}/{scroll_count} → {len(image_urls)} URLs uniques")
            
            # Pause aléatoire pour simuler comportement humain
            time.sleep(random.uniform(0.5, 1.5))
    
    except Exception as e:
        print(f"❌ Erreur lors du scroll : {e}")
    
    finally:
        driver.quit()
    
    return list(image_urls)

def is_valid_sneaker_image(img):
    """Vérifie la qualité et pertinence de l'image"""
    try:
        # Vérifications de base
        if img.width < 400 or img.height < 400:
            return False, "Trop petite"
        
        # Ratio acceptable pour une chaussure (évite les bannières)
        ratio = img.width / img.height
        if ratio < 0.5 or ratio > 3:
            return False, f"Ratio incorrect: {ratio:.2f}"
        
        # Vérifier que l'image n'est pas trop sombre/claire (souvent = erreur)
        import numpy as np
        img_array = np.array(img.convert('L'))
        mean_brightness = img_array.mean()
        
        if mean_brightness < 20 or mean_brightness > 245:
            return False, f"Luminosité anormale: {mean_brightness:.0f}"
        
        return True, "OK"
    
    except Exception as e:
        return False, f"Erreur: {e}"

def compute_image_hash(img):
    """Calcule un hash perceptuel pour détecter les doublons"""
    import hashlib
    # Redimensionner à 8x8 pour comparaison rapide
    img_small = img.resize((8, 8), Image.Resampling.LANCZOS).convert('L')
    
    # Calculer la moyenne
    pixels = list(img_small.getdata())
    avg = sum(pixels) / len(pixels)
    
    # Créer un hash basé sur les pixels au-dessus de la moyenne
    bits = ''.join('1' if p > avg else '0' for p in pixels)
    
    # Convertir en hash hex
    return hashlib.md5(bits.encode()).hexdigest()

def download_image(img_url, output, index, existing_hashes):
    """Télécharge et valide une image en évitant les doublons"""
    try:
        # Headers pour éviter le blocage
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.pinterest.fr/'
        }
        
        response = requests.get(img_url, timeout=10, headers=headers)
        
        if response.status_code != 200:
            return False, f"HTTP {response.status_code}", None
        
        img = Image.open(BytesIO(response.content)).convert("RGB")
        
        # Validation de base
        is_valid, reason = is_valid_sneaker_image(img)
        if not is_valid:
            return False, reason, None
        
        # Vérifier si l'image est un doublon
        img_hash = compute_image_hash(img)
        
        if img_hash in existing_hashes:
            return False, "Doublon détecté", None
        
        # Sauvegarder avec métadonnées
        filepath = os.path.join(output, f"{index}.jpg")
        img.save(filepath, "JPEG", quality=95)
        
        return True, filepath, img_hash
    
    except Exception as e:
        return False, str(e), None

def scrape_model(model_name, search_variations, max_images=500):
    """Scrape principal avec gestion d'erreurs robuste"""
    model_dir = f"dataset/{model_name.replace(' ', '_').lower()}"
    os.makedirs(model_dir, exist_ok=True)
    
    print(f"\n{'='*60}")
    print(f"🎯 DATASET : {model_name}")
    print(f"📁 Dossier : {model_dir}")
    print(f"🎪 Objectif : {max_images} images")
    print(f"{'='*60}\n")
    
    collected_urls = set()
    
    # Collecte des URLs
    for query in search_variations:
        print(f"\n🔍 Recherche : '{query}'")
        urls = scroll_and_collect_images(query, scroll_count=40)
        
        new_urls = set(urls) - collected_urls
        collected_urls.update(urls)
        
        print(f"   ✓ {len(new_urls)} nouvelles URLs | Total : {len(collected_urls)}")
        
        if len(collected_urls) >= max_images * 1.5:  # Marge pour filtrage
            print("   ⚠️ Quota atteint, arrêt de la collecte")
            break
        
        time.sleep(random.uniform(2, 4))  # Pause entre recherches
    
    collected_urls = list(collected_urls)[:int(max_images * 1.5)]
    
    print(f"\n{'='*60}")
    print(f"📦 TÉLÉCHARGEMENT : {len(collected_urls)} URLs à traiter")
    print(f"{'='*60}\n")
    
    # Téléchargement parallèle avec suivi
    downloaded_count = 0
    failed_reasons = {}
    existing_hashes = set()  # Pour tracker les doublons
    
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(download_image, url, model_dir, i, existing_hashes): (i, url) 
            for i, url in enumerate(collected_urls)
        }
        
        for future in as_completed(futures):
            success, info, img_hash = future.result()
            
            if success:
                downloaded_count += 1
                if img_hash:
                    existing_hashes.add(img_hash)  # Ajouter le hash
                if downloaded_count % 10 == 0:
                    print(f"   ✅ {downloaded_count}/{max_images} téléchargées ({len(existing_hashes)} uniques)")
            else:
                # Compter les raisons d'échec
                failed_reasons[info] = failed_reasons.get(info, 0) + 1
            
            if downloaded_count >= max_images:
                print(f"   🎉 Objectif atteint : {max_images} images !")
                break
    
    # Rapport final
    print(f"\n{'='*60}")
    print(f"✅ TERMINÉ : {downloaded_count} images sauvegardées")
    print(f"📂 Dossier : {model_dir}")
    
    if failed_reasons:
        print(f"\n📊 Raisons d'échec :")
        for reason, count in sorted(failed_reasons.items(), key=lambda x: -x[1])[:5]:
            print(f"   - {reason}: {count}x")
    
    print(f"{'='*60}\n")

# CONFIGURATION DES MODÈLES À SCRAPER
SNEAKER_MODELS = {
    "New Balance 530": [
        "New Balance 530 silver",
        "New Balance 530 sneakers",
        "NB 530 outfit",
        "New Balance 530 side view",
        "New Balance 530 on feet",
        "New Balance 530 close up",
        "New Balance 530 product photo",
        "New Balance 530 detail"
    ],
    "Adidas Forum Low": [
        "Adidas Forum Low white",
        "Adidas Forum Low sneakers",
        "Adidas Forum Low side view",
        "Adidas Forum Low on feet",
        "Adidas Forum Low close up",
        "Adidas Forum Low product photo",
        "Adidas Forum Low strap detail",
        "Adidas Forum Low vintage"
    ],
    "Nike P6000": [
        "Nike P6000 metallic silver",
        "Nike P-6000 sneakers",
        "Nike P6000 running",
        "Nike P6000 side view",
        "Nike P6000 on feet",
        "Nike P6000 close up",
        "Nike P6000 product photo",
        "Nike P6000 detail"
    ],
    "Jordan 4": [
        "Air Jordan 4 Bred",
        "Jordan 4 sneakers",
        "Jordan 4 side view",
        "Jordan 4 on feet",
        "Jordan 4 close up",
        "Jordan 4 product photo",
        "Jordan 4 detail",
        "Air Jordan 4 retro"
    ],
    "Asics Gel-NYC": [
        "Asics Gel NYC sneakers",
        "Asics Gel NYC cream",
        "Asics Gel NYC side view",
        "Asics Gel NYC on feet",
        "Asics Gel NYC close up",
        "Asics Gel NYC product photo",
        "Asics Gel NYC detail",
        "Asics Gel NYC street style"
    ]
}

# EXEMPLE D'UTILISATION
if __name__ == "__main__":
    print("\n" + "="*70)
    print("🚀 SCRAPER MULTI-MODÈLES DE SNEAKERS")
    print("="*70)
    print(f"📊 {len(SNEAKER_MODELS)} modèles à scraper")
    print(f"🎯 200 images par modèle")
    print(f"📦 Total attendu : {len(SNEAKER_MODELS) * 200} images")
    print("="*70 + "\n")
    
    # Scraper tous les modèles
    for model_name, search_queries in SNEAKER_MODELS.items():
        try:
            scrape_model(model_name, search_queries, max_images=200)
            print(f"\n⏳ Pause de 5 secondes avant le prochain modèle...\n")
            time.sleep(5)  # Pause entre modèles pour éviter le blocage
        except Exception as e:
            print(f"\n❌ ERREUR sur {model_name}: {e}\n")
            continue
    
    print("\n" + "="*70)
    print("🎉 SCRAPING TERMINÉ POUR TOUS LES MODÈLES")
    print("="*70)