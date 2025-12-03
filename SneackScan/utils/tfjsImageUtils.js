import * as tf from '@tensorflow/tfjs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as FileSystem from 'expo-file-system/legacy';

export async function uriToTensor(uri) {
  // Lecture du fichier image en base64
  const imgB64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  
  // Conversion du base64 en tableau d’octets
  const imgBuffer = tf.util.encodeString(imgB64, 'base64').buffer;
  const raw = new Uint8Array(imgBuffer);

  // Décodage JPEG → TensorFlow tensor
  const imageTensor = decodeJpeg(raw);

  // Redimensionnement
  const resized = tf.image
    .resizeBilinear(imageTensor, [224, 224])
    // .div(255)  <-- 🛑 LIGNE SUPPRIMÉE ! On laisse les valeurs entre 0 et 255
    .expandDims(0); // Ajoute la dimension du batch [1, 224, 224, 3]

  return resized;
}