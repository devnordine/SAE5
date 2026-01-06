"""
Script d'entraînement pour classification de sneakers (10 classes)
Utilise Transfer Learning avec MobileNetV2 + Data Augmentation
Export automatique en TensorFlow.js pour React Native
"""

import os
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, models
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.preprocessing.image import ImageDataGenerator
import matplotlib.pyplot as plt
from datetime import datetime

# =====================================================================
# CONFIGURATION
# =====================================================================

# Chemins des données
DATASET_DIR = "dataset"  # Dossier contenant les 10 sous-dossiers de classes
OUTPUT_DIR = "trained_model"
TFJS_DIR = "../../SneackScan/assets/model"  # Export vers React Native

# Hyperparamètres
IMG_SIZE = (224, 224)
BATCH_SIZE = 32
EPOCHS = 50
LEARNING_RATE = 0.0001
VALIDATION_SPLIT = 0.2

# Classes (ordre alphabétique - important pour la cohérence)
CLASSES = [
    "adidas forum low",
    "adidas spezial",
    "asics gel-kayano",
    "asics gel-NYC",
    "jordan 4",
    "new balance 530",
    "new balance 550",
    "new balance 2002r",
    "nike dunk low",
    "nike p6000"
]

# =====================================================================
# VÉRIFICATION DU DATASET
# =====================================================================

def verify_dataset():
    """Vérifie que le dataset est équilibré et suffisant"""
    print("\n" + "="*60)
    print("VÉRIFICATION DU DATASET")
    print("="*60)
    
    total_images = 0
    class_counts = {}
    
    for class_name in CLASSES:
        class_path = os.path.join(DATASET_DIR, class_name)
        if not os.path.exists(class_path):
            print(f"❌ Dossier manquant: {class_name}")
            return False
        
        count = len([f for f in os.listdir(class_path) 
                    if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
        class_counts[class_name] = count
        total_images += count
        
        status = "✅" if count >= 150 else "⚠️" if count >= 100 else "❌"
        print(f"{status} {class_name:25} {count:4} images")
    
    print("-"*60)
    print(f"Total: {total_images} images")
    
    # Vérification de l'équilibre
    counts = list(class_counts.values())
    min_count, max_count = min(counts), max(counts)
    imbalance_ratio = (max_count - min_count) / max_count * 100
    
    print(f"\nDéséquilibre: {imbalance_ratio:.1f}%")
    if imbalance_ratio > 20:
        print("⚠️  ATTENTION: Dataset déséquilibré (>20%)")
        print("   Recommandation: Équilibrer à ~150 images par classe")
    else:
        print("✅ Dataset bien équilibré")
    
    return min_count >= 80  # Au moins 80 images par classe

# =====================================================================
# GÉNÉRATEURS DE DONNÉES AVEC AUGMENTATION
# =====================================================================

def create_data_generators():
    """Crée les générateurs avec data augmentation pour training"""
    
    # Augmentation pour l'entraînement (simule variations réelles)
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=20,           # Rotation ±20°
        width_shift_range=0.2,       # Translation horizontale
        height_shift_range=0.2,      # Translation verticale
        shear_range=0.15,            # Cisaillement
        zoom_range=0.2,              # Zoom
        horizontal_flip=True,        # Flip horizontal
        brightness_range=[0.8, 1.2], # Variation luminosité
        fill_mode='nearest',
        validation_split=VALIDATION_SPLIT
    )
    
    # Pas d'augmentation pour la validation (données originales)
    val_datagen = ImageDataGenerator(
        rescale=1./255,
        validation_split=VALIDATION_SPLIT
    )
    
    # Générateur d'entraînement
    train_generator = train_datagen.flow_from_directory(
        DATASET_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        classes=CLASSES,  # Force l'ordre des classes
        subset='training',
        shuffle=True
    )
    
    # Générateur de validation
    val_generator = val_datagen.flow_from_directory(
        DATASET_DIR,
        target_size=IMG_SIZE,
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        classes=CLASSES,
        subset='validation',
        shuffle=False
    )
    
    print("\n" + "="*60)
    print("GÉNÉRATEURS DE DONNÉES")
    print("="*60)
    print(f"Training samples:   {train_generator.samples}")
    print(f"Validation samples: {val_generator.samples}")
    print(f"Classes: {len(CLASSES)}")
    print(f"Batch size: {BATCH_SIZE}")
    
    return train_generator, val_generator

# =====================================================================
# CONSTRUCTION DU MODÈLE
# =====================================================================

def build_model():
    """Construit le modèle avec Transfer Learning (MobileNetV2)"""
    
    print("\n" + "="*60)
    print("CONSTRUCTION DU MODÈLE")
    print("="*60)
    
    # Base pré-entraînée MobileNetV2 (ImageNet)
    base_model = MobileNetV2(
        input_shape=(*IMG_SIZE, 3),
        include_top=False,
        weights='imagenet'
    )
    
    # Gèle les couches de base (Transfer Learning)
    base_model.trainable = False
    
    # Construction du modèle complet
    model = models.Sequential([
        # Rescaling (cohérent avec le modèle actuel)
        layers.Rescaling(1./127.5, offset=-1, input_shape=(*IMG_SIZE, 3)),
        
        # Base pré-entraînée
        base_model,
        
        # Tête de classification personnalisée
        layers.GlobalAveragePooling2D(),
        layers.Dropout(0.3),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(len(CLASSES), activation='softmax')
    ])
    
    # Compilation
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss='categorical_crossentropy',
        metrics=['accuracy', keras.metrics.TopKCategoricalAccuracy(k=3, name='top_3_accuracy')]
    )
    
    print(f"\n✅ Modèle créé: {model.count_params():,} paramètres")
    print(f"   Base MobileNetV2: {base_model.count_params():,} paramètres (gelés)")
    
    return model

# =====================================================================
# ENTRAÎNEMENT
# =====================================================================

def train_model(model, train_gen, val_gen):
    """Entraîne le modèle avec callbacks"""
    
    print("\n" + "="*60)
    print("ENTRAÎNEMENT")
    print("="*60)
    
    # Callbacks
    callbacks = [
        # Sauvegarde du meilleur modèle
        keras.callbacks.ModelCheckpoint(
            os.path.join(OUTPUT_DIR, 'best_model.h5'),
            monitor='val_accuracy',
            save_best_only=True,
            verbose=1
        ),
        
        # Early stopping (arrêt si pas d'amélioration)
        keras.callbacks.EarlyStopping(
            monitor='val_accuracy',
            patience=10,
            restore_best_weights=True,
            verbose=1
        ),
        
        # Réduction du learning rate
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-7,
            verbose=1
        ),
        
        # TensorBoard
        keras.callbacks.TensorBoard(
            log_dir=os.path.join(OUTPUT_DIR, 'logs'),
            histogram_freq=1
        )
    ]
    
    # Entraînement
    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=EPOCHS,
        callbacks=callbacks,
        verbose=1
    )
    
    return history

# =====================================================================
# FINE-TUNING
# =====================================================================

def fine_tune_model(model, train_gen, val_gen, history):
    """Dégèle et fine-tune les dernières couches de MobileNetV2"""
    
    print("\n" + "="*60)
    print("FINE-TUNING")
    print("="*60)
    
    # Dégèle les 30 dernières couches de MobileNetV2
    base_model = model.layers[1]
    base_model.trainable = True
    
    for layer in base_model.layers[:-30]:
        layer.trainable = False
    
    print(f"Couches dégelées: {sum(1 for l in base_model.layers if l.trainable)}")
    
    # Recompilation avec learning rate plus faible
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=LEARNING_RATE / 10),
        loss='categorical_crossentropy',
        metrics=['accuracy', keras.metrics.TopKCategoricalAccuracy(k=3, name='top_3_accuracy')]
    )
    
    # Fine-tuning (moins d'epochs)
    history_fine = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=20,
        initial_epoch=len(history.history['loss']),
        callbacks=[
            keras.callbacks.ModelCheckpoint(
                os.path.join(OUTPUT_DIR, 'best_model_finetuned.h5'),
                monitor='val_accuracy',
                save_best_only=True,
                verbose=1
            ),
            keras.callbacks.EarlyStopping(
                monitor='val_accuracy',
                patience=5,
                restore_best_weights=True
            )
        ]
    )
    
    # Combine les historiques
    for key in history.history:
        history.history[key].extend(history_fine.history[key])
    
    return history

# =====================================================================
# VISUALISATION
# =====================================================================

def plot_training_history(history):
    """Affiche les courbes d'entraînement"""
    
    fig, axes = plt.subplots(2, 2, figsize=(15, 10))
    
    # Accuracy
    axes[0, 0].plot(history.history['accuracy'], label='Train')
    axes[0, 0].plot(history.history['val_accuracy'], label='Validation')
    axes[0, 0].set_title('Model Accuracy')
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Accuracy')
    axes[0, 0].legend()
    axes[0, 0].grid(True)
    
    # Loss
    axes[0, 1].plot(history.history['loss'], label='Train')
    axes[0, 1].plot(history.history['val_loss'], label='Validation')
    axes[0, 1].set_title('Model Loss')
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Loss')
    axes[0, 1].legend()
    axes[0, 1].grid(True)
    
    # Top-3 Accuracy
    axes[1, 0].plot(history.history['top_3_accuracy'], label='Train')
    axes[1, 0].plot(history.history['val_top_3_accuracy'], label='Validation')
    axes[1, 0].set_title('Top-3 Accuracy')
    axes[1, 0].set_xlabel('Epoch')
    axes[1, 0].set_ylabel('Top-3 Accuracy')
    axes[1, 0].legend()
    axes[1, 0].grid(True)
    
    # Learning Rate (si disponible)
    if 'lr' in history.history:
        axes[1, 1].plot(history.history['lr'])
        axes[1, 1].set_title('Learning Rate')
        axes[1, 1].set_xlabel('Epoch')
        axes[1, 1].set_ylabel('LR')
        axes[1, 1].set_yscale('log')
        axes[1, 1].grid(True)
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'training_history.png'), dpi=300)
    print(f"\n✅ Graphique sauvegardé: {OUTPUT_DIR}/training_history.png")

# =====================================================================
# ÉVALUATION
# =====================================================================

def evaluate_model(model, val_gen):
    """Évalue le modèle final"""
    
    print("\n" + "="*60)
    print("ÉVALUATION FINALE")
    print("="*60)
    
    results = model.evaluate(val_gen, verbose=0)
    
    print(f"Loss:          {results[0]:.4f}")
    print(f"Accuracy:      {results[1]*100:.2f}%")
    print(f"Top-3 Accuracy: {results[2]*100:.2f}%")
    
    return results

# =====================================================================
# EXPORT TENSORFLOW.JS
# =====================================================================

def export_to_tfjs(model):
    """Exporte le modèle en TensorFlow.js pour React Native"""
    
    print("\n" + "="*60)
    print("EXPORT TENSORFLOW.JS")
    print("="*60)
    
    import tensorflowjs as tfjs
    
    # Crée le dossier de destination
    os.makedirs(TFJS_DIR, exist_ok=True)
    
    # Export
    tfjs.converters.save_keras_model(model, TFJS_DIR)
    
    # Sauvegarde le mapping des classes
    class_mapping = {
        "classes": CLASSES,
        "num_classes": len(CLASSES),
        "input_shape": list(IMG_SIZE) + [3],
        "trained_date": datetime.now().isoformat(),
        "accuracy": None  # À remplir manuellement après évaluation
    }
    
    with open(os.path.join(TFJS_DIR, 'class_mapping.json'), 'w') as f:
        json.dump(class_mapping, f, indent=2)
    
    print(f"✅ Modèle TensorFlow.js exporté vers: {TFJS_DIR}")
    print(f"✅ Mapping des classes sauvegardé: {TFJS_DIR}/class_mapping.json")
    
    # Génère le code JavaScript pour CameraClassifier.js
    generate_js_code()

# =====================================================================
# GÉNÉRATION CODE JAVASCRIPT
# =====================================================================

def generate_js_code():
    """Génère le code OUTPUT_CLASSES pour CameraClassifier.js"""
    
    print("\n" + "="*60)
    print("CODE POUR CameraClassifier.js")
    print("="*60)
    
    print("\nRemplace OUTPUT_CLASSES dans CameraClassifier.js par:\n")
    print("const OUTPUT_CLASSES = {")
    for i, class_name in enumerate(CLASSES):
        print(f"  {i}: \"{class_name}\",")
    print("};")
    
    # Sauvegarde dans un fichier
    with open(os.path.join(OUTPUT_DIR, 'output_classes.js'), 'w') as f:
        f.write("const OUTPUT_CLASSES = {\n")
        for i, class_name in enumerate(CLASSES):
            f.write(f"  {i}: \"{class_name}\",\n")
        f.write("};\n\nexport default OUTPUT_CLASSES;\n")
    
    print(f"\n✅ Code sauvegardé: {OUTPUT_DIR}/output_classes.js")

# =====================================================================
# MAIN
# =====================================================================

def main():
    """Pipeline d'entraînement complet"""
    
    print("\n" + "="*60)
    print("🚀 ENTRAÎNEMENT MODÈLE SNEAKERS - 10 CLASSES")
    print("="*60)
    print(f"Début: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Crée les dossiers de sortie
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 1. Vérification du dataset
    if not verify_dataset():
        print("\n❌ Dataset insuffisant. Minimum 80 images par classe requis.")
        return
    
    # 2. Création des générateurs
    train_gen, val_gen = create_data_generators()
    
    # 3. Construction du modèle
    model = build_model()
    
    # 4. Entraînement initial
    history = train_model(model, train_gen, val_gen)
    
    # 5. Fine-tuning
    history = fine_tune_model(model, train_gen, val_gen, history)
    
    # 6. Visualisation
    plot_training_history(history)
    
    # 7. Évaluation finale
    results = evaluate_model(model, val_gen)
    
    # 8. Sauvegarde du modèle Keras
    model.save(os.path.join(OUTPUT_DIR, 'final_model.h5'))
    print(f"\n✅ Modèle Keras sauvegardé: {OUTPUT_DIR}/final_model.h5")
    
    # 9. Export TensorFlow.js
    export_to_tfjs(model)
    
    print("\n" + "="*60)
    print("✅ ENTRAÎNEMENT TERMINÉ")
    print("="*60)
    print(f"Fin: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"\nAccuracy finale: {results[1]*100:.2f}%")
    print(f"Top-3 Accuracy:  {results[2]*100:.2f}%")
    print("\n📁 Fichiers générés:")
    print(f"   - {OUTPUT_DIR}/best_model_finetuned.h5")
    print(f"   - {OUTPUT_DIR}/final_model.h5")
    print(f"   - {OUTPUT_DIR}/training_history.png")
    print(f"   - {TFJS_DIR}/model.json")
    print(f"   - {TFJS_DIR}/class_mapping.json")
    print(f"   - {OUTPUT_DIR}/output_classes.js")
    
    print("\n🔄 PROCHAINES ÉTAPES:")
    print("   1. Copie les fichiers model.json + .bin vers SneackScan/assets/model/")
    print("   2. Met à jour OUTPUT_CLASSES dans CameraClassifier.js")
    print("   3. Teste l'application avec le nouveau modèle")

if __name__ == "__main__":
    # Configuration GPU (optionnel)
    physical_devices = tf.config.list_physical_devices('GPU')
    if physical_devices:
        print(f"🎮 GPU détecté: {physical_devices[0].name}")
        tf.config.experimental.set_memory_growth(physical_devices[0], True)
    else:
        print("💻 Entraînement sur CPU")
    
    main()