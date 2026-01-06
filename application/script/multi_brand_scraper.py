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

def load_existing_hashes(model_dir):
    """Charge les hash de toutes les images existantes dans le dossier"""
    existing_hashes = set()
    
    if not os.path.exists(model_dir):
        return existing_hashes
    
    print(f"   📂 Analyse des images existantes dans {model_dir}...")
    
    image_files = [f for f in os.listdir(model_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
    
    if not image_files:
        print(f"   ℹ️  Aucune image existante")
        return existing_hashes
    
    for img_file in image_files:
        try:
            img_path = os.path.join(model_dir, img_file)
            img = Image.open(img_path).convert("RGB")
            img_hash = compute_image_hash(img)
            existing_hashes.add(img_hash)
        except Exception as e:
            print(f"   ⚠️  Erreur sur {img_file}: {e}")
    
    print(f"   ✅ {len(existing_hashes)} images existantes indexées")
    return existing_hashes

def get_next_available_index(model_dir):
    """Trouve le prochain index disponible pour nommer les images"""
    if not os.path.exists(model_dir):
        return 0
    
    existing_files = [f for f in os.listdir(model_dir) if f.endswith(('.jpg', '.jpeg', '.png'))]
    
    if not existing_files:
        return 0
    
    # Extraire les numéros des fichiers existants
    indices = []
    for f in existing_files:
        try:
            index = int(os.path.splitext(f)[0])
            indices.append(index)
        except ValueError:
            continue
    
    return max(indices) + 1 if indices else 0

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

def scrape_model(model_name, folder_name, search_variations, max_images=500):
    """Scrape principal avec gestion d'erreurs robuste"""
    model_dir = f"dataset/{folder_name}"
    os.makedirs(model_dir, exist_ok=True)
    
    # Charger les hash des images existantes
    existing_hashes = load_existing_hashes(model_dir)
    current_count = len(existing_hashes)
    
    # Calculer combien d'images manquent
    images_needed = max(0, max_images - current_count)
    
    print(f"\n{'='*60}")
    print(f"🎯 DATASET : {model_name}")
    print(f"📁 Dossier : {model_dir}")
    print(f"📊 Images actuelles : {current_count}")
    print(f"🎪 Objectif total : {max_images}")
    print(f"🆕 À télécharger : {images_needed}")
    print(f"{'='*60}\n")
    
    if images_needed <= 0:
        print(f"✅ Objectif déjà atteint ! ({current_count} images)")
        return
    
    collected_urls = set()
    
    # Collecte des URLs
    for query in search_variations:
        print(f"\n🔍 Recherche : '{query}'")
        urls = scroll_and_collect_images(query, scroll_count=40)
        
        new_urls = set(urls) - collected_urls
        collected_urls.update(urls)
        
        print(f"   ✓ {len(new_urls)} nouvelles URLs | Total : {len(collected_urls)}")
        
        if len(collected_urls) >= images_needed * 2:  # Marge pour filtrage et doublons
            print("   ⚠️ Quota d'URLs atteint, arrêt de la collecte")
            break
        
        time.sleep(random.uniform(2, 4))  # Pause entre recherches
    
    collected_urls = list(collected_urls)[:int(images_needed * 2)]
    
    print(f"\n{'='*60}")
    print(f"📦 TÉLÉCHARGEMENT : {len(collected_urls)} URLs à traiter")
    print(f"{'='*60}\n")
    
    # Obtenir le prochain index disponible
    next_index = get_next_available_index(model_dir)
    
    # Téléchargement parallèle avec suivi
    downloaded_count = 0
    failed_reasons = {}
    
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(download_image, url, model_dir, next_index + i, existing_hashes): (i, url) 
            for i, url in enumerate(collected_urls)
        }
        
        for future in as_completed(futures):
            success, info, img_hash = future.result()
            
            if success:
                downloaded_count += 1
                if img_hash:
                    existing_hashes.add(img_hash)  # Ajouter le hash
                if downloaded_count % 10 == 0:
                    total_now = current_count + downloaded_count
                    print(f"   ✅ +{downloaded_count} nouvelles | Total: {total_now}/{max_images}")
            else:
                # Compter les raisons d'échec
                failed_reasons[info] = failed_reasons.get(info, 0) + 1
            
            if downloaded_count >= images_needed:
                print(f"   🎉 Objectif atteint : {max_images} images au total !")
                break
    
    # Rapport final
    final_count = current_count + downloaded_count
    print(f"\n{'='*60}")
    print(f"✅ TERMINÉ : +{downloaded_count} nouvelles images")
    print(f"📊 Total dans le dataset : {final_count}/{max_images}")
    print(f"📂 Dossier : {model_dir}")
    
    if final_count < max_images:
        print(f"⚠️  Il manque encore {max_images - final_count} images pour atteindre l'objectif")
    
    if failed_reasons:
        print(f"\n📊 Raisons d'échec :")
        for reason, count in sorted(failed_reasons.items(), key=lambda x: -x[1])[:5]:
            print(f"   - {reason}: {count}x")
    
    print(f"{'='*60}\n")

# CONFIGURATION DES MODÈLES À SCRAPER
SNEAKER_MODELS = {
    "Adidas Forum Low": {
        "folder": "adidas_forum_low",
        "queries": [
            "Adidas Forum Low sneakers",
            "Adidas Forum Low white",
            "Adidas Forum Low side view",
            "Adidas Forum Low on feet",
            "Adidas Forum Low close up",
            "Adidas Forum Low product photo",
            "Adidas Forum 84 Low",
            "Adidas Forum Low detail"
        ]
    },
    "Adidas Spezial": {
        "folder": "adidas_spezial",
        "queries": [
            "Adidas Spezial blue",
            "Adidas Spezial sneakers",
            "Adidas Spezial handball",
            "Adidas Spezial side view",
            "Adidas Spezial on feet",
            "Adidas Spezial close up",
            "Adidas Spezial product",
            "Adidas Spezial gum sole"
        ]
    },
    "Asics Gel-Kayano": {
        "folder": "asics_gel-kayano",
        "queries": [
            "Asics Gel Kayano 14",
            "Asics Gel Kayano sneakers",
            "Gel Kayano close up",
            "Asics Gel Kayano side view",
            "Asics Gel Kayano on feet",
            "Gel Kayano product photo",
            "Asics Gel Kayano detail",
            "Asics Kayano street style"
        ]
    },
    "Asics Gel-NYC": {
        "folder": "asics_gel-nyc",
        "queries": [
            "Asics Gel NYC sneakers",
            "Asics Gel NYC colorway",
            "Asics Gel NYC side view",
            "Asics Gel NYC on feet",
            "Asics Gel NYC close up",
            "Asics Gel NYC product",
            "Asics Gel NYC detail",
            "Asics Gel NYC street style"
        ]
    },
    "Jordan 4": {
        "folder": "jordan_4",
        "queries": [
            "Air Jordan 4 sneakers",
            "Jordan 4 retro",
            "Jordan 4 military black",
            "Jordan 4 side view",
            "Jordan 4 on feet",
            "Jordan 4 close up",
            "Jordan 4 product photo",
            "Jordan 4 detail"
        ]
    },
    "New Balance 530": {
        "folder": "new_balance_530",
        "queries": [
            "New Balance 530 sneakers",
            "NB 530 grey",
            "New Balance 530 side view",
            "New Balance 530 on feet",
            "New Balance 530 close up",
            "New Balance 530 product",
            "New Balance 530 colorway",
            "New Balance 530 retro"
        ]
    },
    "New Balance 550": {
        "folder": "new_balance_550",
        "queries": [
            "New Balance 550 sneakers",
            "NB 550 white green",
            "New Balance 550 side view",
            "New Balance 550 on feet",
            "New Balance 550 close up",
            "New Balance 550 product",
            "New Balance 550 colorway",
            "New Balance 550 basketball"
        ]
    },
    "New Balance 2002R": {
        "folder": "new_balance_2002r",
        "queries": [
            "New Balance 2002R protection pack",
            "New Balance 2002R sneakers",
            "NB 2002R grey",
            "New Balance 2002R side view",
            "New Balance 2002R on feet",
            "New Balance 2002R close up",
            "New Balance 2002R product",
            "New Balance 2002R detail"
        ]
    },
    "Nike Dunk Low": {
        "folder": "nike_dunk_low",
        "queries": [
            "Nike Dunk Low panda",
            "Nike Dunk Low retro",
            "Nike Dunk Low sneakers",
            "Nike Dunk Low side view",
            "Nike Dunk Low on feet",
            "Nike Dunk Low close up",
            "Nike Dunk Low product photo",
            "Nike Dunk Low detail"
        ]
    },
    "Nike P6000": {
        "folder": "nike_p6000",
        "queries": [
            "Nike P6000 sneakers",
            "Nike P6000 CNPT",
            "Nike P6000 silver",
            "Nike P6000 side view",
            "Nike P6000 on feet",
            "Nike P6000 close up",
            "Nike P6000 product",
            "Nike P6000 runner"
        ]
    }
}

# EXEMPLE D'UTILISATION
if __name__ == "__main__":
    print("\n" + "="*70)
    print("🚀 SCRAPER MULTI-MODÈLES DE SNEAKERS - ÉQUILIBRAGE DATASET")
    print("="*70)
    print(f"📊 {len(SNEAKER_MODELS)} modèles à scraper")
    print(f"🎯 Objectif: 220 images par modèle (total: 2200 images)")
    print("="*70 + "\n")
    
    # Scraper tous les modèles avec objectif 220 images
    for model_name, config in SNEAKER_MODELS.items():
        try:
            scrape_model(
                model_name=model_name,
                folder_name=config["folder"],
                search_variations=config["queries"],
                max_images=220  # Objectif équilibré à 220
            )
            print(f"\n⏳ Pause de 5 secondes avant le prochain modèle...\n")
            time.sleep(5)  # Pause entre modèles pour éviter le blocage
        except Exception as e:
            print(f"\n❌ ERREUR sur {model_name}: {e}\n")
            continue
    
    print("\n" + "="*70)
    print("🎉 SCRAPING TERMINÉ POUR TOUS LES MODÈLES")
    print("="*70)
    
    # Rapport final du dataset
    print("\n📊 ÉTAT FINAL DU DATASET:")
    print("-"*70)
    total_images = 0
    for model_name, config in SNEAKER_MODELS.items():
        folder_path = f"dataset/{config['folder']}"
        if os.path.exists(folder_path):
            count = len([f for f in os.listdir(folder_path) if f.endswith(('.jpg', '.jpeg', '.png'))])
            total_images += count
            status = "✅" if count >= 200 else "⚠️" if count >= 150 else "❌"
            print(f"{status} {model_name:25} {count:3}/220 images")
        else:
            print(f"❌ {model_name:25}   0/220 images (dossier non créé)")
    
    print("-"*70)
    print(f"📈 Total: {total_images}/2200 images")
    avg = total_images / len(SNEAKER_MODELS) if total_images > 0 else 0
    print(f"📊 Moyenne: {avg:.0f} images par classe")
    print("="*70)

# SCRAPING CIBLÉ - Seulement les classes incomplètes
if __name__ == "__main__":
    # Classes à compléter (< 220 images)
    INCOMPLETE_MODELS = {
        "Adidas Forum Low": {
            "folder": "adidas_forum_low",
            "queries": [
                "Adidas Forum Low sneakers",
                "Adidas Forum Low white",
                "Adidas Forum Low side view",
                "Adidas Forum Low on feet",
                "Adidas Forum Low close up",
                "Adidas Forum Low product photo",
                "Adidas Forum 84 Low",
                "Adidas Forum Low detail"
            ]
        },
        "Jordan 4": {
            "folder": "jordan_4",
            "queries": [
                "Air Jordan 4 sneakers",
                "Jordan 4 retro",
                "Jordan 4 military black",
                "Jordan 4 side view",
                "Jordan 4 on feet",
                "Jordan 4 close up",
                "Jordan 4 product photo",
                "Jordan 4 detail"
            ]
        },
        "New Balance 530": {
            "folder": "new_balance_530",
            "queries": [
                "New Balance 530 sneakers",
                "NB 530 grey",
                "New Balance 530 side view",
                "New Balance 530 on feet",
                "New Balance 530 close up",
                "New Balance 530 product",
                "New Balance 530 colorway",
                "New Balance 530 retro"
            ]
        },
        "Nike P6000": {
            "folder": "nike_p6000",
            "queries": [
                "Nike P6000 sneakers",
                "Nike P6000 CNPT",
                "Nike P6000 silver",
                "Nike P6000 side view",
                "Nike P6000 on feet",
                "Nike P6000 close up",
                "Nike P6000 product",
                "Nike P6000 runner"
            ]
        }
    }
    
    print("\n" + "="*70)
    print("🔧 SCRAPING CIBLÉ - COMPLÉTION DES CLASSES INCOMPLÈTES")
    print("="*70)
    print(f"📊 {len(INCOMPLETE_MODELS)} classes à compléter")
    print(f"🎯 Objectif: 220 images par classe")
    print("="*70 + "\n")
    
    # Scraper uniquement les modèles incomplets
    for model_name, config in INCOMPLETE_MODELS.items():
        try:
            scrape_model(
                model_name=model_name,
                folder_name=config["folder"],
                search_variations=config["queries"],
                max_images=220
            )
            print(f"\n⏳ Pause de 5 secondes avant le prochain modèle...\n")
            time.sleep(5)
        except Exception as e:
            print(f"\n❌ ERREUR sur {model_name}: {e}\n")
            continue
    
    print("\n" + "="*70)
    print("🎉 COMPLÉTION TERMINÉE")
    print("="*70)
    
    # Rapport final complet (toutes les 10 classes)
    print("\n📊 ÉTAT FINAL DU DATASET COMPLET:")
    print("-"*70)
    total_images = 0
    
    for model_name, config in SNEAKER_MODELS.items():
        folder_path = f"dataset/{config['folder']}"
        if os.path.exists(folder_path):
            count = len([f for f in os.listdir(folder_path) if f.endswith(('.jpg', '.jpeg', '.png'))])
            total_images += count
            status = "✅" if count >= 220 else "⚠️" if count >= 200 else "❌"
            print(f"{status} {model_name:25} {count:3}/220 images")
        else:
            print(f"❌ {model_name:25}   0/220 images")
    
    print("-"*70)
    print(f"📈 Total: {total_images}/2200 images")
    avg = total_images / len(SNEAKER_MODELS) if total_images > 0 else 0
    print(f"📊 Moyenne: {avg:.0f} images par classe")
    
    # Vérifier si toutes les classes sont >= 220
    all_complete = all(
        len([f for f in os.listdir(f"dataset/{config['folder']}") 
             if f.endswith(('.jpg', '.jpeg', '.png'))]) >= 220
        for config in SNEAKER_MODELS.values()
        if os.path.exists(f"dataset/{config['folder']}")
    )
    
    if all_complete:
        print("\n🎉 DATASET COMPLET ! Toutes les classes ont >= 220 images")
    else:
        print("\n⚠️  Certaines classes sont encore incomplètes")
    
    print("="*70)