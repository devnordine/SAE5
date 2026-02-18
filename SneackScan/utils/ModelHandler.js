import { documentDirectory, getInfoAsync, makeDirectoryAsync, downloadAsync, deleteAsync } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';

const API_URL = 'http://51.38.186.253:3000'; 
const MODEL_DIR = documentDirectory + 'model/';
const MODEL_JSON = 'model.json';

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

    // ====================================================
    // 🔄 VÉRIFICATION DE MISE À JOUR (AUTO-UPDATE)
    // ====================================================
    let forceDownload = false;
    try {
      const versionRes = await fetch(`${API_URL}/api/model-version`);
      const versionData = await versionRes.json();
      const remoteVersion = versionData.version;
      const localVersion = await AsyncStorage.getItem('local_model_version');

      // Si le serveur a une version différente (plus récente) que celle en cache
      if (remoteVersion && remoteVersion !== localVersion) {
        console.log("✨ Nouvelle version IA détectée ! Nettoyage en cours...");
        if (setLoadingStatus) setLoadingStatus('Mise à jour de l\'IA...');
        
        // On supprime l'ancien dossier pour faire place nette
        const dirInfo = await getInfoAsync(MODEL_DIR);
        if (dirInfo.exists) {
            await deleteAsync(MODEL_DIR);
        }
        
        // On mémorise la nouvelle version
        await AsyncStorage.setItem('local_model_version', remoteVersion);
        forceDownload = true; 
      }
    } catch (updateErr) {
      console.log("⚠️ Impossible de vérifier la version, on utilise le cache local.");
    }
    // ====================================================

    // 1. Créer le dossier local si inexistant
    const dirInfo = await getInfoAsync(MODEL_DIR);
    if (!dirInfo.exists) {
      await makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    }

    // 2. Télécharger les fichiers manquants (ou tout télécharger si mise à jour)
    for (const file of MODEL_FILES) {
      const fileUri = MODEL_DIR + file;
      const fileInfo = await getInfoAsync(fileUri);

      if (!fileInfo.exists || forceDownload) {
        if (setLoadingStatus) setLoadingStatus(`Téléchargement de ${file}...`);
        console.log(`⬇️ Téléchargement : ${file}`);
        
        const downloadRes = await downloadAsync(`${API_URL}/api/model/${file}`, fileUri);
        
        if (downloadRes.status !== 200) {
          throw new Error(`Échec téléchargement ${file}`);
        }
      }
    }

    if (setLoadingStatus) setLoadingStatus('Chargement du modèle en mémoire...');
    console.log("🚀 Chargement du modèle TensorFlow...");
    
    const model = await tf.loadGraphModel('file://' + MODEL_DIR + MODEL_JSON);
    
    console.log("✅ Modèle chargé avec succès !");
    return model;

  } catch (error) {
    console.error("❌ Erreur chargement modèle :", error);
    console.log("⚠️ Tentative de chargement du modèle de secours (Assets)...");
    
    const modelJson = require('../assets/model/model.json');
    const modelWeights1 = require('../assets/model/group1-shard1of3.bin');
    const modelWeights2 = require('../assets/model/group1-shard2of3.bin');
    const modelWeights3 = require('../assets/model/group1-shard3of3.bin');
    
    return await tf.loadGraphModel(bundleResourceIO(modelJson, [modelWeights1, modelWeights2, modelWeights3]));
  }
};