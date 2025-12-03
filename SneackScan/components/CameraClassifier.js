import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Image, 
  Alert, 
  Animated,
  Share 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';
import { uriToTensor } from '../utils/tfjsImageUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';


const API_URL = 'http://51.38.186.253:3000';

const CLASS_LABELS = [
  'adidas_spezial',
  'asics_gel-kayano',
  'new_balance_2002r',
  'new_balance_550', 
  'nike_dunk_low'
];

export default function CameraClassifier() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [model, setModel] = useState(null);
  const [isTfReady, setIsTfReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  const [flash, setFlash] = useState('off');
  const [frameStatus, setFrameStatus] = useState('neutral');
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cameraRef = useRef(null);

  // 1. Initialisation
  useEffect(() => {
    (async () => {
      await tf.ready();
      setIsTfReady(true);
      try {
        console.log("Chargement du modèle...");
        const modelJson = require('../assets/model/model.json');
        // Liste des fichiers binaires (poids)
        const modelWeights = [
          require('../assets/model/group1-shard1of3.bin'),
          require('../assets/model/group1-shard2of3.bin'),
          require('../assets/model/group1-shard3of3.bin')
        ];
        const loadedModel = await tf.loadGraphModel(bundleResourceIO(modelJson, modelWeights));
        setModel(loadedModel);
        console.log("✅ Modèle chargé !");
      } catch (err) {
        Alert.alert('Erreur', 'Impossible de charger le modèle IA.');
      }
    })();
  }, []);

  // 2. Fonction de Sauvegarde sur le VPS (Backend)
  const saveScanToBackend = async (uri, predictionResult) => {
    try {
      // Récupération de l'utilisateur connecté
      const userJson = await AsyncStorage.getItem('user');
      const user = userJson ? JSON.parse(userJson) : null;
      const userId = user ? user.id : '1'; 

      // Préparation des données pour l'envoi
      const formData = new FormData();
      formData.append('photo', {
        uri: uri,
        name: 'scan_shoe.jpg',
        type: 'image/jpeg',
      });
      formData.append('shoeName', predictionResult.className);
      formData.append('confidence', predictionResult.probability.toString());
      formData.append('userId', userId.toString());

      // Envoi silencieux au serveur
      await fetch(`${API_URL}/scan`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      console.log("✅ Scan sauvegardé sur le VPS !");

    } catch (error) {
      console.log("❌ Erreur sauvegarde VPS (Serveur éteint ?) :", error);
    }
  };

  // 3. Fonction de Partage (Réseaux sociaux)
  const sharePrediction = async () => {
    if (!imageUri || !prediction) return;

    try {
      const nomPaire = prediction.className.replace(/_/g, ' ').toUpperCase();
      const message = `👟 J'ai trouvé une ${nomPaire} !\n🔥 Identifié avec l'appli SneackScan.`;

      await Share.share({
        message: message,
        url: imageUri, // Important pour iOS
        title: 'Résultat SneackScan'
      }, {
        dialogTitle: `Partager ma trouvaille : ${nomPaire}` // Pour Android
      });
    } catch (error) {
      Alert.alert("Oups", "Le partage a échoué.");
    }
  };

  // 4. Traitement de l'image (IA + Logique métier)
  const processImage = async (uri) => {
    if (!model || busy) return;
    setBusy(true);
    setPrediction(null);
    setImageUri(uri);
    setFrameStatus('neutral');

    try {
      // Conversion JPEG obligatoire pour TensorFlow
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      const tensor = await uriToTensor(manipResult.uri);
      const outputTensor = model.predict(tensor);
      const probabilities = await outputTensor.data();
      
      const maxProb = Math.max(...probabilities);
      const maxIndex = probabilities.indexOf(maxProb);
      
      // Seuil de confiance (60%)
      if (maxProb < 0.60) {
        setFrameStatus('error');
        Alert.alert("🤔 Pas sûr...", `J'hésite... (${(maxProb*100).toFixed(0)}%). Essayez une autre photo.`);
        setPrediction(null);
      } else {
        // SUCCÈS !
        setFrameStatus('success');
        triggerPulse();
        
        const resultData = {
          className: CLASS_LABELS[maxIndex],
          probability: maxProb
        };
        
        setPrediction(resultData);
        
        // 🚀 Sauvegarde automatique en arrière-plan
        saveScanToBackend(manipResult.uri, resultData);
      }
      tf.dispose([tensor, outputTensor]);

    } catch (e) {
      console.warn(e);
      Alert.alert('Erreur', "L'analyse a échoué.");
      setFrameStatus('error');
    } finally {
      setBusy(false);
    }
  };

  // --- Fonctions Utilitaires & UI ---

  const triggerPulse = () => {
    Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true })
    ]).start();
  };

  const toggleFlash = () => {
    setFlash(current => (current === 'off' ? 'on' : 'off'));
  };

  const takePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, skipProcessing: true });
      await processImage(photo.uri);
    } catch (e) { 
      Alert.alert("Erreur", "Impossible de prendre la photo.");
    }
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // Correction pour Expo SDK 52+
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (!result.canceled) {
        await processImage(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert("Erreur", "Problème galerie.");
    }
  };

  const getBorderColor = () => {
    if (frameStatus === 'success') return '#00FF00';
    if (frameStatus === 'error') return '#FF4500';
    return 'rgba(255, 255, 255, 0.5)';
  };

  // --- Rendu ---

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{marginBottom:20, color:'#fff'}}>Accès caméra requis</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btnPrimary}>
           <Text style={styles.btnText}>Autoriser</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 👇 NOUVEAU : Bouton Retour Flottant */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
       <Ionicons name="arrow-back" size={28} color="#fff" />
    </TouchableOpacity>
      {/* Caméra */}
      <View style={styles.cameraWrap}>
        <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="back" flash={flash} />
        
        {/* Viseur visuel */}
        <View style={styles.maskContainer} pointerEvents="none">
            <View style={styles.maskRow} />
            <View style={styles.maskCenter}>
                <View style={styles.maskSide} />
                <Animated.View style={[styles.scanFrame, { borderColor: getBorderColor(), transform: [{ scale: pulseAnim }] }]}>
                    <View style={[styles.corner, styles.tl]} />
                    <View style={[styles.corner, styles.tr]} />
                    <View style={[styles.corner, styles.bl]} />
                    <View style={[styles.corner, styles.br]} />
                </Animated.View>
                <View style={styles.maskSide} />
            </View>
            <View style={styles.maskRow} />
        </View>

        {imageUri && <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} />}

        {!imageUri && (
          <TouchableOpacity style={styles.flashBtn} onPress={toggleFlash}>
            <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={24} color={flash === 'on' ? '#FFD700' : '#fff'} />
          </TouchableOpacity>
        )}
      </View>

      {/* Contrôles */}
      <View style={styles.controls}>
        {prediction ? (
           <View style={[styles.resultCard, {borderTopColor: '#00FF00', borderTopWidth: 4}]}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center'}}>
                  <View style={{flex: 1}}>
                    <Text style={styles.label}>👟 Modèle détecté</Text>
                    <Text style={styles.shoeName} numberOfLines={1} adjustsFontSizeToFit>{prediction.className.replace(/_/g, ' ').toUpperCase()}</Text>
                    <Text style={styles.conf}>{Math.round(prediction.probability * 100)}% de fiabilité</Text>
                  </View>
                  
                  <TouchableOpacity onPress={sharePrediction} style={styles.shareBtn}>
                    <Ionicons name="share-social" size={26} color="#fff" />
                  </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => {setImageUri(null); setPrediction(null); setFrameStatus('neutral');}} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={24} color="#666" />
              </TouchableOpacity>
           </View>
        ) : (
           <Text style={styles.hint}>Placez la chaussure dans le cadre</Text>
        )}

        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={pickFromGallery} disabled={busy || !model}>
             <Ionicons name="images-outline" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnScan} onPress={takePhoto} disabled={busy || !model}>
             {busy ? <ActivityIndicator color="#fff" size="large" /> : <Ionicons name="scan-outline" size={32} color="#fff" />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} onPress={() => {setImageUri(null); setPrediction(null); setFrameStatus('neutral');}} disabled={!imageUri}>
             <Ionicons name="refresh-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {!isTfReady && <Text style={styles.miniInfo}>Chargement IA...</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent:'center', alignItems:'center', backgroundColor:'#121212' },
  cameraWrap: { flex: 1, backgroundColor: '#000' },
  maskContainer: { flex: 1, flexDirection: 'column' },
  maskRow: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  maskCenter: { flexDirection: 'row', height: 280 },
  maskSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame: { width: 280, height: 280, borderWidth: 2, borderRadius: 20, backgroundColor: 'transparent', position: 'relative' },
  corner: { position: 'absolute', width: 20, height: 20, borderColor: '#fff', borderWidth: 4 },
  tl: { top: -2, left: -2, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 10 },
  tr: { top: -2, right: -2, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 10 },
  bl: { bottom: -2, left: -2, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 10 },
  br: { bottom: -2, right: -2, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 10 },
  flashBtn: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  controls: { height: 240, justifyContent: 'flex-end', padding: 20, backgroundColor: '#121212' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 20 },
  btnScan: { width: 80, height: 80, backgroundColor: '#1e90ff', borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 10, borderWidth: 4, borderColor: 'rgba(255,255,255,0.2)' },
  btnSecondary: { width: 50, height: 50, backgroundColor: '#333', borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  btnPrimary: { backgroundColor: '#1e90ff', padding: 15, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  resultCard: { position: 'absolute', top: -50, left: 20, right: 20, backgroundColor: '#fff', padding: 15, borderRadius: 15, elevation: 5 },
  label: { fontSize: 12, color: '#888', textTransform: 'uppercase' },
  shoeName: { fontSize: 20, fontWeight: '900', color: '#000', marginVertical: 5 },
  conf: { fontSize: 14, color: '#1e90ff', fontWeight: 'bold' },
  closeBtn: { position: 'absolute', top: 5, right: 5 },
  shareBtn: { width: 44, height: 44, backgroundColor: '#1e90ff', borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 10, elevation: 3 },
  hint: { color: '#bbb', textAlign: 'center', marginBottom: 20, fontStyle: 'italic', fontSize: 16 },
  miniInfo: { color: '#444', textAlign: 'center', fontSize: 10, marginBottom: 5 },
  backBtn: {
    position: 'absolute',
    top: 50, // Ajustez selon l'encoche de l'iPhone
    left: 20,
    zIndex: 100, // Pour passer au-dessus de tout
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
});