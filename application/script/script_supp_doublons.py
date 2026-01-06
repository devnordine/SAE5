import os
import random
import shutil
import hashlib
from PIL import Image
from collections import defaultdict

def compute_image_hash(img):
    """Calcule un hash perceptuel pour détecter les doublons"""
    # Redimensionner à 8x8 pour comparaison rapide
    img_small = img.resize((8, 8), Image.Resampling.LANCZOS).convert('L')
    
    # Calculer la moyenne
    pixels = list(img_small.getdata())
    avg = sum(pixels) / len(pixels)
    
    # Créer un hash basé sur les pixels au-dessus de la moyenne
    bits = ''.join('1' if p > avg else '0' for p in pixels)
    
    # Convertir en hash hex
    return hashlib.md5(bits.encode()).hexdigest()

def get_image_quality_score(img_path):
    """Calcule un score de qualité pour prioriser les meilleures images"""
    try:
        img = Image.open(img_path)
        
        # Score basé sur :
        # 1. Résolution (plus c'est grand, mieux c'est)
        resolution_score = img.width * img.height
        
        # 2. Pas trop sombre/clair
        import numpy as np
        img_array = np.array(img.convert('L'))
        brightness = img_array.mean()
        brightness_score = 1000 if 30 < brightness < 230 else 0
        
        # 3. Format (JPEG > PNG pour les photos)
        format_score = 500 if img.format == 'JPEG' else 0
        
        total_score = resolution_score + brightness_score + format_score
        
        return total_score
    except:
        return 0

def remove_duplicates_and_balance(dataset_dir="dataset", target=150):
    """Supprime les doublons ET équilibre à 'target' images par classe"""
    
    print("\n" + "="*70)
    print(f"🔧 NETTOYAGE + ÉQUILIBRAGE DU DATASET")
    print("="*70)
    print(f"1️⃣  Suppression des doublons")
    print(f"2️⃣  Équilibrage à {target} images par classe")
    print("="*70 + "\n")
    
    total_duplicates = 0
    total_removed = 0
    
    for folder in sorted(os.listdir(dataset_dir)):
        folder_path = os.path.join(dataset_dir, folder)
        
        if not os.path.isdir(folder_path) or folder.startswith('_backup'):
            continue
        
        print(f"\n📁 Traitement : {folder}")
        print("-" * 70)
        
        # Lister toutes les images
        image_files = [f for f in os.listdir(folder_path) 
                       if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
        
        initial_count = len(image_files)
        print(f"   Images initiales : {initial_count}")
        
        # ====================================================================
        # ÉTAPE 1 : DÉTECTION ET SUPPRESSION DES DOUBLONS
        # ====================================================================
        
        hash_to_images = defaultdict(list)
        
        # Calculer le hash de chaque image
        for img_file in image_files:
            img_path = os.path.join(folder_path, img_file)
            try:
                img = Image.open(img_path).convert("RGB")
                img_hash = compute_image_hash(img)
                
                # Stocker avec score de qualité
                quality_score = get_image_quality_score(img_path)
                hash_to_images[img_hash].append((img_file, quality_score))
            except Exception as e:
                print(f"   ⚠️  Erreur sur {img_file}: {e}")
        
        # Créer backup pour doublons
        backup_dir = os.path.join(dataset_dir, f"_backup_{folder}_duplicates")
        os.makedirs(backup_dir, exist_ok=True)
        
        # Garder la meilleure image de chaque groupe de doublons
        unique_images = []
        duplicates_found = 0
        
        for img_hash, images in hash_to_images.items():
            if len(images) > 1:
                duplicates_found += len(images) - 1
                # Trier par qualité décroissante
                images.sort(key=lambda x: x[1], reverse=True)
            
            # Garder la meilleure
            best_image = images[0][0]
            unique_images.append(best_image)
            
            # Déplacer les doublons vers backup
            for img_file, _ in images[1:]:
                src = os.path.join(folder_path, img_file)
                dst = os.path.join(backup_dir, img_file)
                shutil.move(src, dst)
        
        if duplicates_found > 0:
            print(f"   🗑️  Doublons supprimés : {duplicates_found}")
            total_duplicates += duplicates_found
        else:
            print(f"   ✅ Aucun doublon détecté")
        
        after_dedup_count = len(unique_images)
        
        # ====================================================================
        # ÉTAPE 2 : ÉQUILIBRAGE À TARGET IMAGES
        # ====================================================================
        
        if after_dedup_count > target:
            # Créer backup pour images en trop
            backup_excess_dir = os.path.join(dataset_dir, f"_backup_{folder}_excess")
            os.makedirs(backup_excess_dir, exist_ok=True)
            
            # Sélectionner les meilleures images
            images_with_scores = []
            for img_file in unique_images:
                img_path = os.path.join(folder_path, img_file)
                score = get_image_quality_score(img_path)
                images_with_scores.append((img_file, score))
            
            # Trier par qualité et garder les N meilleures
            images_with_scores.sort(key=lambda x: x[1], reverse=True)
            images_to_keep = [img for img, _ in images_with_scores[:target]]
            images_to_remove = [img for img, _ in images_with_scores[target:]]
            
            # Déplacer les images en trop
            for img_file in images_to_remove:
                src = os.path.join(folder_path, img_file)
                dst = os.path.join(backup_excess_dir, img_file)
                if os.path.exists(src):
                    shutil.move(src, dst)
            
            removed_count = len(images_to_remove)
            total_removed += removed_count
            print(f"   ✂️  Images en trop : {removed_count} (gardées les {target} meilleures)")
        
        elif after_dedup_count < target:
            print(f"   ⚠️  Seulement {after_dedup_count} images (manque {target - after_dedup_count})")
        else:
            print(f"   ✅ Exactement {target} images")
        
        final_count = min(after_dedup_count, target)
        print(f"   📊 Résultat : {initial_count} → {final_count} images")
    
    # ====================================================================
    # RAPPORT FINAL
    # ====================================================================
    
    print("\n" + "="*70)
    print("✅ NETTOYAGE TERMINÉ")
    print("="*70)
    print(f"🗑️  Total doublons supprimés : {total_duplicates}")
    print(f"✂️  Total images en trop : {total_removed}")
    print("="*70)
    
    # Rapport final du dataset
    print("\n📊 DATASET FINAL :")
    print("-"*70)
    total = 0
    classes_below_target = []
    
    for folder in sorted(os.listdir(dataset_dir)):
        folder_path = os.path.join(dataset_dir, folder)
        if os.path.isdir(folder_path) and not folder.startswith('_backup'):
            count = len([f for f in os.listdir(folder_path) 
                        if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
            total += count
            
            status = "✅" if count >= target else "⚠️"
            print(f"{status} {folder:25} {count:3}/{target} images")
            
            if count < target:
                classes_below_target.append((folder, count, target - count))
    
    print("-"*70)
    print(f"📈 Total: {total} images")
    
    if classes_below_target:
        print(f"\n⚠️  Classes en dessous de {target} images :")
        for folder, count, missing in classes_below_target:
            print(f"   - {folder}: {count} images (manque {missing})")
    else:
        print(f"\n🎉 DATASET PARFAITEMENT ÉQUILIBRÉ !")
    
    print(f"\n💾 Backups sauvegardés dans dataset/_backup_*")
    print(f"🚀 Dataset prêt pour l'entraînement !")
    print("="*70)

if __name__ == "__main__":
    # Installer numpy si nécessaire
    try:
        import numpy
    except ImportError:
        print("Installation de numpy...")
        os.system("pip install numpy")
        import numpy
    
    remove_duplicates_and_balance(target=150)