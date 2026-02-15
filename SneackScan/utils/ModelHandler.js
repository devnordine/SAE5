import { documentDirectory, getInfoAsync, makeDirectoryAsync, downloadAsync } from 'expo-file-system';
import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';

// ⚠️ REMPLACEZ PAR L'IP DE VOTRE PC (ex: 192.168.1.15)
// Si vous êtes sur émulateur Android, utilisez 10.0.2.2
const API_URL = 'http://51.38.186.253:3000'; 

// On utilise directement la constante importée
const MODEL_DIR = documentDirectory + 'model/';
const MODEL_JSON = 'model.json';

// Liste exacte des fichiers dans la BDD
const MODEL_FILES = [
  'model.json',
  'group1-shard1of3.bin',
  'group1-shard2of3.bin',
  'group1-shard3of3.bin'
];

export const loadModelFromDB = async (setLoadingStatus) => {
  try {
    await tf.ready();
    console.log("🧠 TensorFlow prêt.");

    // 1. Créer le dossier local si inexistant
    const dirInfo = await getInfoAsync(MODEL_DIR);
    if (!dirInfo.exists) {
      console.log("📂 Création du dossier modèle...");
      await makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    }

    // 2. Télécharger les fichiers manquants
    for (const file of MODEL_FILES) {
      const fileUri = MODEL_DIR + file;
      const fileInfo = await getInfoAsync(fileUri);

      if (!fileInfo.exists) {
        if (setLoadingStatus) setLoadingStatus(`Téléchargement de ${file}...`);
        console.log(`⬇️ Téléchargement : ${file}`);
        
        const downloadRes = await downloadAsync(
          `${API_URL}/api/model/${file}`,
          fileUri
        );
        
        if (downloadRes.status !== 200) {
          throw new Error(`Échec téléchargement ${file} (Status ${downloadRes.status})`);
        }
      }
    }

    // 3. Charger le modèle depuis le stockage du téléphone
    if (setLoadingStatus) setLoadingStatus('Chargement du modèle en mémoire...');
    console.log("🚀 Chargement du modèle TensorFlow...");
    
    // Chargement via l'URI locale
    const model = await tf.loadGraphModel('file://' + MODEL_DIR + MODEL_JSON);
    
    console.log("✅ Modèle chargé avec succès !");
    return model;

  } catch (error) {
    console.error("❌ Erreur chargement modèle :", error);
    
    // Mode Secours : Si le serveur est éteint ou inaccessible
    console.log("⚠️ Tentative de chargement du modèle de secours (Assets)...");
    
    // Assurez-vous que ces chemins existent bien dans votre projet
    const modelJson = require('../assets/model/model.json');
    const modelWeights1 = require('../assets/model/group1-shard1of3.bin');
    const modelWeights2 = require('../assets/model/group1-shard2of3.bin');
    const modelWeights3 = require('../assets/model/group1-shard3of3.bin');
    
    return await tf.loadGraphModel(bundleResourceIO(modelJson, [modelWeights1, modelWeights2, modelWeights3]));
  }
};