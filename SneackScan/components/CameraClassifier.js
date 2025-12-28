import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO, decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as FileSystem from 'expo-file-system'; // Assurez-vous d'avoir fait: npx expo install expo-file-system
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 🔗 ADRESSE DE VOTRE SERVEUR VPS
const API_URL = 'http://51.38.186.253:3000';

// Chargement des fichiers du modèle
const modelJson = require('../assets/model/model.json');
const modelWeights1 = require('../assets/model/group1-shard1of3.bin');
const modelWeights2 = require('../assets/model/group1-shard2of3.bin');
const modelWeights3 = require('../assets/model/group1-shard3of3.bin');

const OUTPUT_CLASSES = {
  0: "Adidas_Spezial",
  1: "Asics_Gel-Kayano",
  2: "New_Balance_2002R",
  3: "Nike_Dunk_Low"
};

export default function CameraClassifier() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState(null);
  
  // États UI
  const [flashMode, setFlashMode] = useState('off');
  const [scanResult, setScanResult] = useState(null); 
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    (async () => {
      await tf.ready();
      console.log("TF Ready");
      try {
        const loadedModel = await tf.loadGraphModel(
          bundleResourceIO(modelJson, [modelWeights1, modelWeights2, modelWeights3])
        );
        setModel(loadedModel);
        console.log("Model Loaded");
      } catch (err) {
        console.error("Error loading model", err);
      }
    })();
  }, []);

  // --- FONCTION D'ANALYSE CENTRALE ---
  const analyzeBase64 = async (base64Data, uriForDisplay) => {
    if (!model) {
      Alert.alert("Patience", "Le modèle IA est en cours de chargement...");
      return;
    }
    
    setIsProcessing(true);

    try {
      // 1. Conversion Base64 -> Tensor
      const imgBuffer = tf.util.encodeString(base64Data, 'base64').buffer;
      const raw = new Uint8Array(imgBuffer);
      const imageTensor = decodeJpeg(raw);
      const resized = tf.image.resizeBilinear(imageTensor, [224, 224]);
      const normalized = resized.div(255.0).expandDims(0); 
      
      // 2. Prédiction
      const prediction = await model.predict(normalized);
      const data = await prediction.data();
      
      let maxProb = 0;
      let maxIndex = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] > maxProb) {
          maxProb = data[i];
          maxIndex = i;
        }
      }

      const shoeName = OUTPUT_CLASSES[maxIndex] || "Inconnu";
      console.log(`IA Prediction: ${shoeName} (${(maxProb * 100).toFixed(1)}%)`);

      // 3. Envoi au serveur
      await uploadScan(uriForDisplay, shoeName, maxProb);

    } catch (error) {
      console.error(error);
      Alert.alert("Erreur Analyse", "Impossible d'analyser l'image.");
      setIsProcessing(false);
    }
  };

  // CAS 1 : Caméra (On récupère le Base64 directement = PLUS RAPIDE)
  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true, // ✅ On demande le base64 directement à la caméra
        skipProcessing: true,
      });
      
      // Pas besoin de FileSystem ici, on a déjà le base64
      await analyzeBase64(photo.base64, photo.uri);
      
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Problème avec la caméra");
    }
  };

  // CAS 2 : Galerie (On lit le fichier = Correction du BUG FileSystem)
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        
        // 🛠 CORRECTION ICI : On utilise la string 'base64' au lieu de l'enum
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64', 
        });
        
        await analyzeBase64(base64, uri);
      }
    } catch (error) {
      console.error("Erreur galerie:", error);
      Alert.alert("Erreur", "Impossible de lire l'image de la galerie");
    }
  };

  const uploadScan = async (uri, shoeName, confidence) => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      const user = userJson ? JSON.parse(userJson) : {};
      const userId = user.id ?? user.user_id ?? 1;

      const formData = new FormData();
      formData.append('photo', {
        uri: uri,
        type: 'image/jpeg',
        name: 'scan.jpg',
      });
      formData.append('userId', userId);
      formData.append('shoeName', shoeName);
      formData.append('confidence', confidence);

      const response = await fetch(`${API_URL}/scan`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const result = await response.json();
      
      if (result.success) {
        setScanResult({
          shoeName: shoeName,
          confidence: confidence,
          imageUrl: uri, 
          marketData: result.marketData
        });
        setModalVisible(true);
      } else {
        Alert.alert("Info", "Scan enregistré mais pas de données prix.");
      }

    } catch (e) {
      console.error("Upload error:", e);
      Alert.alert("Erreur Serveur", "Vérifiez votre connexion internet");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleFlash = () => {
    setFlashMode(prev => prev === 'off' ? 'on' : 'off');
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{color:'white', marginBottom:20}}>Permission caméra requise</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btnPermission}>
            <Text style={styles.btnText}>Donner permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 🛠 CORRECTION STRUCTURE : CameraView ne contient plus d'enfants
  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      
      {/* 1. LA CAMÉRA EN FOND */}
      <CameraView 
        style={StyleSheet.absoluteFill} // Prend tout l'écran
        ref={cameraRef} 
        facing="back"
        flash={flashMode}
      />

      {/* 2. L'INTERFACE PAR DESSUS (En Absolute) */}
      <View style={styles.overlayContainer}>
        
        {/* HAUT : Retour & Flash */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={toggleFlash} style={styles.iconButton}>
            <Ionicons 
              name={flashMode === 'on' ? "flash" : "flash-off"} 
              size={28} 
              color={flashMode === 'on' ? "#FFD700" : "#fff"} 
            />
          </TouchableOpacity>
        </View>

        {/* BAS : Galerie & Scan */}
        <View style={styles.bottomBar}>
          {/* Galerie */}
          <TouchableOpacity onPress={pickImage} style={styles.galleryButton} disabled={isProcessing}>
            <Ionicons name="images-outline" size={30} color="#fff" />
          </TouchableOpacity>

          {/* Bouton Scan */}
          {isProcessing ? (
            <ActivityIndicator size="large" color="#1e90ff" style={styles.loader} />
          ) : (
            <TouchableOpacity onPress={takePicture} style={styles.scanBtn}>
              <View style={styles.scanInner} />
            </TouchableOpacity>
          )}

          {/* Espace vide pour équilibrer */}
          <View style={{ width: 50 }} /> 
        </View>
      </View>

      {/* ================= MODAL RÉSULTAT ================= */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            
            <Image source={{ uri: scanResult?.imageUrl }} style={styles.modalImage} />
            
            <Text style={styles.modalTitle}>
              {scanResult?.shoeName?.replace(/_/g, ' ')}
            </Text>
            
            <View style={styles.confBadge}>
                <Text style={styles.modalConf}>
                Confiance IA : {Math.round(scanResult?.confidence * 100)}%
                </Text>
            </View>

            {/* PRIX */}
            {scanResult?.marketData?.prix > 0 ? (
              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>Meilleure offre trouvée :</Text>
                <Text style={styles.priceValue}>{scanResult.marketData.prix} €</Text>
                <Text style={styles.shopName}>sur {scanResult.marketData.boutique}</Text>
                
                {scanResult.marketData.lien ? (
                    <TouchableOpacity 
                    style={styles.buyBtn}
                    onPress={() => Linking.openURL(scanResult.marketData.lien)}
                    >
                    <Text style={styles.buyBtnText}>ACHETER MAINTENANT</Text>
                    <Ionicons name="cart" size={20} color="white" style={{marginLeft:8}} />
                    </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <Text style={styles.noPrice}>Prix non disponible pour l'instant</Text>
            )}

            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => {
                setModalVisible(false);
                setScanResult(null);
              }}
            >
              <Text style={styles.closeBtnText}>Fermer</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  btnPermission: { backgroundColor: '#1e90ff', padding: 15, borderRadius: 10 },
  btnText: { color: 'white', fontWeight: 'bold' },
  
  // Nouveau conteneur pour l'interface qui flotte au-dessus de la caméra
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between', // Pousse topBar en haut et bottomBar en bas
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconButton: { padding: 10, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 25 },
  
  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  galleryButton: { padding: 15, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 30 },
  
  scanBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' },
  scanInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  loader: { marginBottom: 20 },
  
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
  modalContent: { width: '85%', backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  modalImage: { width: 220, height: 220, borderRadius: 15, marginBottom: 15, borderWidth:1, borderColor:'#333' },
  modalTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 5 },
  confBadge: { backgroundColor: '#333', paddingHorizontal: 10, paddingVertical:5, borderRadius: 8, marginBottom: 20 },
  modalConf: { color: '#1e90ff', fontSize: 14, fontWeight: 'bold' },
  priceBox: { width: '100%', backgroundColor: '#252525', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#4caf50' },
  priceLabel: { color: '#aaa', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  priceValue: { color: '#4caf50', fontSize: 32, fontWeight: 'bold', marginVertical: 5 },
  shopName: { color: '#fff', fontSize: 16, marginBottom: 15, fontWeight: '500' },
  buyBtn: { backgroundColor: '#4caf50', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  buyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  noPrice: { color: '#888', fontStyle: 'italic', marginVertical: 20 },
  closeBtn: { padding: 10 },
  closeBtnText: { color: '#aaa', fontSize: 16, textDecorationLine: 'underline' }
});