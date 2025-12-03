import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';
import { uriToTensor } from '../utils/tfjsImageUtils';
import { Ionicons } from '@expo/vector-icons';

// Liste des classes (Ordre strict de l'entraînement)
const CLASS_LABELS = [
  'adidas_spezial',
  'asics_gel-kayano',
  'new_balance_2002r',
  'new_balance_550', 
  'nike_dunk_low'
];

export default function CameraClassifier() {
  const [permission, requestPermission] = useCameraPermissions();
  const [model, setModel] = useState(null);
  const [isTfReady, setIsTfReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [imageUri, setImageUri] = useState(null);
  
  const cameraRef = useRef(null);

  // 1. Initialisation
  useEffect(() => {
    (async () => {
      // Préparation TensorFlow
      await tf.ready();
      setIsTfReady(true);
      
      // Chargement Modèle
      try {
        console.log("Chargement du modèle...");
        const modelJson = require('../assets/model/model.json');
        const modelWeights = [
          require('../assets/model/group1-shard1of3.bin'),
          require('../assets/model/group1-shard2of3.bin'),
          require('../assets/model/group1-shard3of3.bin')
        ];
        const loadedModel = await tf.loadGraphModel(bundleResourceIO(modelJson, modelWeights));
        setModel(loadedModel);
        console.log("✅ Modèle chargé !");
      } catch (err) {
        console.error(err);
        Alert.alert('Erreur', 'Impossible de charger le modèle IA.');
      }
    })();
  }, []);

  // 2. Traitement et Analyse de l'image
  const processImage = async (uri) => {
    if (!model || busy) return;
    setBusy(true);
    setPrediction(null);
    setImageUri(uri);

    try {
      // Conversion forcée en JPEG 224x224 (Standard MobileNet)
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 224, height: 224 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Conversion en Tenseur
      const tensor = await uriToTensor(manipResult.uri);
      
      // Prédiction
      const outputTensor = model.predict(tensor);
      const probabilities = await outputTensor.data();
      
      // Recherche du meilleur résultat
      const maxProb = Math.max(...probabilities);
      const maxIndex = probabilities.indexOf(maxProb);
      
      // Seuil de confiance (60%)
      if (maxProb < 0.60) {
        Alert.alert("🤔 Pas sûr...", `J'hésite... (${(maxProb*100).toFixed(0)}%). Essayez une autre photo.`);
        setPrediction(null);
      } else {
        setPrediction({
          className: CLASS_LABELS[maxIndex],
          probability: maxProb
        });
      }
      
      // Nettoyage
      tf.dispose([tensor, outputTensor]);

    } catch (e) {
      console.warn(e);
      Alert.alert('Erreur', "L'analyse de l'image a échoué.");
    } finally {
      setBusy(false);
    }
  };

  // 3. Prendre une photo (Bouton Central)
  const takePhoto = async () => {
    // Vérification de sécurité
    if (!cameraRef.current) {
      Alert.alert("Erreur", "Caméra introuvable. Redémarrez l'app.");
      return;
    }

    try {
      console.log("📸 Prise de photo...");
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.5, 
        skipProcessing: true 
      });
      console.log("Photo prise :", photo.uri);
      await processImage(photo.uri);
    } catch (e) { 
      console.error("Erreur Caméra :", e);
      Alert.alert("Erreur Caméra", "Impossible de prendre la photo. (Êtes-vous sur simulateur iOS ? La caméra ne marche pas dessus).");
    }
  };

  // 4. Ouvrir la Galerie (Bouton Gauche)
  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // ✅ CORRECTION ICI : Liste simple, plus d'objet complexe
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled) {
        await processImage(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Erreur Galerie :", e);
      Alert.alert("Erreur", "Impossible d'ouvrir la galerie.");
    }
  };

  // 5. Gestion Permissions
  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{marginBottom:20, color:'#fff', fontSize:16}}>{"L'accès à la caméra est requis"}</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btnPrimary}>
           <Text style={styles.btnText}>Autoriser la caméra</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 6. Rendu Interface
  return (
    <View style={styles.container}>
      {/* Zone Caméra */}
      <View style={styles.cameraWrap}>
        <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="back" />
        {/* Calque sombre par dessus */}
        <View style={styles.overlay} pointerEvents="none" />
        {/* Image figée si photo prise */}
        {imageUri && (
          <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFillObject} />
        )}
      </View>

      {/* Zone Contrôles */}
      <View style={styles.controls}>
        
        {/* Carte de Résultat */}
        {prediction ? (
           <View style={styles.resultCard}>
              <Text style={styles.label}>👟 Modèle détecté</Text>
              <Text style={styles.shoeName}>{prediction.className.replace(/_/g, ' ').toUpperCase()}</Text>
              <Text style={styles.conf}>{Math.round(prediction.probability * 100)}% de fiabilité</Text>
              
              <TouchableOpacity onPress={() => {setImageUri(null); setPrediction(null);}} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={24} color="#666" />
              </TouchableOpacity>
           </View>
        ) : (
           <Text style={styles.hint}>Cadrez bien la chaussure...</Text>
        )}

        {/* Boutons */}
        <View style={styles.btnRow}>
          {/* Galerie */}
          <TouchableOpacity style={styles.btnSecondary} onPress={pickFromGallery} disabled={busy || !model}>
             <Ionicons name="images-outline" size={28} color="#fff" />
          </TouchableOpacity>

          {/* SCAN (Gros Bouton) */}
          <TouchableOpacity style={styles.btnScan} onPress={takePhoto} disabled={busy || !model}>
             {busy ? <ActivityIndicator color="#fff" size="large" /> : <Ionicons name="scan-outline" size={32} color="#fff" />}
          </TouchableOpacity>

          {/* Reset */}
          <TouchableOpacity style={styles.btnSecondary} onPress={() => {setImageUri(null); setPrediction(null);}} disabled={!imageUri}>
             <Ionicons name="refresh-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {!isTfReady && <Text style={styles.miniInfo}>{"Chargement de l'intelligence artificielle..."}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent:'center', alignItems:'center', backgroundColor:'#121212' },
  cameraWrap: { flex: 1, overflow: 'hidden', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.1)' },
  controls: { height: 240, justifyContent: 'flex-end', padding: 20, backgroundColor: '#121212' },
  btnRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 20 },
  btnScan: { width: 80, height: 80, backgroundColor: '#1e90ff', borderRadius: 40, justifyContent: 'center', alignItems: 'center', elevation: 10, borderWidth: 4, borderColor: 'rgba(255,255,255,0.2)' },
  btnSecondary: { width: 50, height: 50, backgroundColor: '#333', borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  btnPrimary: { backgroundColor: '#1e90ff', padding: 15, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: 'bold' },
  resultCard: { position: 'absolute', top: -50, left: 20, right: 20, backgroundColor: '#fff', padding: 15, borderRadius: 15, alignItems: 'center', elevation: 5 },
  label: { fontSize: 12, color: '#888', textTransform: 'uppercase' },
  shoeName: { fontSize: 20, fontWeight: '900', color: '#000', marginVertical: 5 },
  conf: { fontSize: 14, color: '#1e90ff', fontWeight: 'bold' },
  closeBtn: { position: 'absolute', top: 10, right: 10 },
  hint: { color: '#666', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' },
  miniInfo: { color: '#444', textAlign: 'center', fontSize: 10, marginBottom: 5 }
});