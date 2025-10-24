# ===========================
# 👟 Nike Scraper (Selenium)
# ===========================
import os, time, random, requests
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from PIL import Image
from io import BytesIO

# --- CONFIG ---
URL = "https://www.nike.com/fr/w/hommes-air-force-1-chaussures-5sj3yznik1zy7ok"
OUTPUT_DIR = "dataset_nike"
os.makedirs(OUTPUT_DIR, exist_ok=True)
MAX_PRODUCTS = 10

# --- SELENIUM SETUP ---
options = Options()
options.add_argument("--headless")
options.add_argument("--window-size=1920,1080")
driver = webdriver.Chrome(service=Service("/chromedriver"), options=options)

def scroll_to_bottom():
    """Scroll jusqu’à la fin de la page pour charger tous les produits."""
    last_height = driver.execute_script("return document.body.scrollHeight")
    while True:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(3)
        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            break
        last_height = new_height

def download_image(url, dest_folder, index):
    try:
        r = requests.get(url, timeout=10)
        img = Image.open(BytesIO(r.content)).convert("RGB")
        path = os.path.join(dest_folder, f"image_{index}.jpg")
        img.save(path, "JPEG")
    except Exception as e:
        print(f"❌ Erreur téléchargement {url}: {e}")

# --- MAIN SCRAPER ---
print(f"🚀 Ouverture de {URL}")
driver.get(URL)
scroll_to_bottom()
time.sleep(2)

# Récupération des produits
products = driver.find_elements(By.CSS_SELECTOR, 'a.product-card__link-overlay')
print(f"➡️ {len(products)} produits trouvés sur la page Nike.")

for i, product in enumerate(products[:MAX_PRODUCTS]):
    link = product.get_attribute("href")
    print(f"\n📦 Produit {i+1}: {link}")
    driver.get(link)
    time.sleep(3)

    # Attendre que les images du carrousel se chargent
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.CSS_SELECTOR, "img"))
        )
    except:
        print("⚠️ Aucune image détectée, on passe.")
        continue

    imgs = driver.find_elements(By.CSS_SELECTOR, "img")
    img_urls = []
    for img in imgs:
        src = img.get_attribute("src")
        if src and "media" in src:
            if src not in img_urls:
                img_urls.append(src)

    print(f"📸 {len(img_urls)} images détectées.")

    # Dossier produit
    product_dir = os.path.join(OUTPUT_DIR, f"Product_{i+1}")
    os.makedirs(product_dir, exist_ok=True)

    # Téléchargement
    for j, url in enumerate(img_urls):
        download_image(url, product_dir, j + 1)

driver.quit()
print("\n✅ Scraping Nike terminé !")