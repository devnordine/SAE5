import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, Modal, Linking, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker'; // Correction MediaType ici
import * as tf from '@tensorflow/tfjs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { loadModelFromDB } from '../utils/ModelHandler';

// ⚠️ Assurez-vous que cette IP est bien celle de votre VPS ou de votre machine locale
const API_URL = 'http://51.38.186.253:3000';

const OUTPUT_CLASSES = {
  0: "adidas_forum_low",
  1: "adidas_spezial",
  2: "asics_gel-kayano",
  3: "asics_gel-nyc",
  4: "jordan_4",
  5: "new_balance_2002r",
  6: "new_balance_530",
  7: "new_balance_550",
  8: "nike_dunk_low",
  9: "nike_p6000",
};

export default function CameraClassifier() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  
  // États
  const [isProcessing, setIsProcessing] = useState(false);
  const [model, setModel] = useState(null);
  const [flashMode, setFlashMode] = useState('off');
  
  // Résultats et Modale
  const [scanResult, setScanResult] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  
  // Logique Active Learning (< 60%)
  const [isManualInputMode, setIsManualInputMode] = useState(false);
  const [manualShoeName, setManualShoeName] = useState('');
  const [currentPrediction, setCurrentPrediction] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);

  const [currentUserId, setCurrentUserId] = useState(null);

// 1. Chargement du modèle TensorFlow (Dynamique via VPS)
  useEffect(() => {
    (async () => {
      try {
        // On appelle ta super fonction qui gère le téléchargement et le cache !
        const loadedModel = await loadModelFromDB();
        setModel(loadedModel);
        console.log("✅ Modèle chargé et prêt dans la caméra !");
      } catch (err) {
        console.error("Error loading model", err);
        Alert.alert("Erreur", "Impossible de charger le modèle IA.");
      }
    })();
  }, []);

  // 2. Analyse de l'image
  const analyzeBase64 = async (base64Data, uriForDisplay) => {
    if (!model) {
      Alert.alert("Patience", "Le modèle IA est en cours de chargement...");
      return;
    }
    setIsProcessing(true);
    try {
      const imgBuffer = tf.util.encodeString(base64Data, 'base64').buffer;
      const raw = new Uint8Array(imgBuffer);
      const imageTensor = decodeJpeg(raw);
      const resized = tf.image.resizeBilinear(imageTensor, [224, 224]).expandDims(0);
      const prediction = await model.predict(resized);
      const data = await prediction.data();

      let maxProb = 0, maxIndex = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] > maxProb) { maxProb = data[i]; maxIndex = i; }
      }

      const shoeName = OUTPUT_CLASSES[maxIndex] || "Inconnu";
      console.log(`IA Prediction: ${shoeName} (${(maxProb * 100).toFixed(1)}%)`);

      if (maxProb < 0.60) {
        // Confiance Faible : Mode Manuel
        setCapturedImage(uriForDisplay);
        setCurrentPrediction({ score: maxProb, rawName: shoeName });
        setManualShoeName(shoeName);
        setIsManualInputMode(true);
        setModalVisible(true);
        setIsProcessing(false);
      } else {
        // Confiance Forte : Envoi Direct
        await uploadScan(uriForDisplay, shoeName, maxProb);
      }

    } catch (error) {
      console.error(error);
      Alert.alert("Erreur Analyse", "Impossible d'analyser l'image.");
      setIsProcessing(false);
    }
  };

  // 3. Prendre la photo
  const takePicture = async () => {
    if (!cameraRef.current || isProcessing) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: true,
      });

      // Crop carré
      const width = photo.width;
      const height = photo.height;
      const size = Math.min(width, height);
      const originX = (width - size) / 2;
      const originY = (height - size) / 2;

      const normalized = await manipulateAsync(
        photo.uri,
        [
          { crop: { originX, originY, width: size, height: size } },
          { resize: { width: 224, height: 224 } }
        ],
        { compress: 0.8, format: SaveFormat.JPEG, base64: true }
      );

      if (!normalized.base64) throw new Error('Conversion JPEG échouée');
      await analyzeBase64(normalized.base64, normalized.uri);
    } catch (error) {
      console.error("Erreur Caméra:", error);
      Alert.alert("Erreur", "Problème lors de la capture");
      setIsProcessing(false);
    }
  };

  // 4. Galerie (CORRIGÉ ICI)
  const pickImage = async () => {
    if (isProcessing) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, 
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const manipulated = await manipulateAsync(
        asset.uri,
        [],
        { compress: 0.9, format: SaveFormat.JPEG, base64: true }
      );
      if (!manipulated.base64) throw new Error('Conversion JPEG échouée');
      await analyzeBase64(manipulated.base64, manipulated.uri);
    } catch (error) {
      console.error('Erreur galerie:', error);
      Alert.alert('Erreur', "Impossible de lire l'image");
      setIsProcessing(false);
    }
  };

  // 5. Envoi au serveur
  const uploadScan = async (uri, shoeName, confidence) => {
    try {
      setIsProcessing(true);
      const userJson = await AsyncStorage.getItem('user');
      const user = userJson ? JSON.parse(userJson) : {};
      const userId = user.id || user.user_id;

      if (!userId) {
        Alert.alert("Erreur", "Veuillez vous reconnecter.");
        setIsProcessing(false);
        return;
      }
      setCurrentUserId(userId);

      const formData = new FormData();
      formData.append('image', { uri, type: 'image/jpeg', name: 'scan.jpg' });
      formData.append('user_id', userId);
      formData.append('shoe_name', shoeName);
      formData.append('confidence', confidence.toString());
      formData.append('boutique_nom', 'Recherche...'); 
      formData.append('prix_trouver', '0'); 

      console.log(`🚀 Envoi du scan : ${shoeName} (${confidence})`);

      const response = await fetch(`${API_URL}/api/scan-result`, {
        method: 'POST',
        body: formData,
        headers: {
            'Content-Type': 'multipart/form-data',
        },
      });

      // C'est ici que ça plante si le serveur renvoie du HTML (404/500)
      const textResponse = await response.text(); 
      try {
          const result = JSON.parse(textResponse);
          console.log("📩 Réponse serveur :", result);

          if (result.success) {
            setScanResult({
              shoeName: shoeName,
              confidence: confidence,
              imageUrl: uri,
              marketData: result.marketData || { prix: 0, boutique: "Inconnu", lien: null }
            });
            setIsManualInputMode(false);
            setModalVisible(true);
          } else {
            Alert.alert("Erreur Backend", result.error || "Problème inconnu");
          }
      } catch (jsonError) {
          console.error("Erreur JSON. Réponse brute du serveur :", textResponse);
          Alert.alert("Erreur Serveur", "Le serveur a renvoyé une erreur (Voir logs).");
      }

    } catch (e) {
      console.error("Upload error:", e);
      Alert.alert("Erreur Réseau", "Impossible de joindre le serveur.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualShoeName.trim()) {
        Alert.alert("Attention", "Veuillez entrer un nom.");
        return;
    }
    await uploadScan(capturedImage, manualShoeName, currentPrediction.score);
  };

  const toggleFlash = () => setFlashMode(prev => (prev === 'off' ? 'on' : 'off'));

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={{ color: 'white', marginBottom: 20 }}>Permission caméra requise</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btnPermission}>
          <Text style={styles.btnText}>Donner permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'black' }}>
      <CameraView style={StyleSheet.absoluteFill} ref={cameraRef} facing="back" flash={flashMode} />

      <View style={styles.overlayContainer}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleFlash} style={styles.iconButton}>
            <Ionicons name={flashMode === 'on' ? 'flash' : 'flash-off'} size={28} color={flashMode === 'on' ? '#FFD700' : '#fff'} />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity onPress={pickImage} style={styles.galleryButton} disabled={isProcessing}>
            <Ionicons name="images-outline" size={30} color="#fff" />
          </TouchableOpacity>

          {isProcessing ? (
            <ActivityIndicator size="large" color="#1e90ff" style={styles.loader} />
          ) : (
            <TouchableOpacity onPress={takePicture} style={styles.scanBtn}>
              <View style={styles.scanInner} />
            </TouchableOpacity>
          )}

          <View style={{width: 50}} /> 
        </View>
      </View>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            
            <Image 
                source={{ uri: isManualInputMode ? capturedImage : scanResult?.imageUrl }} 
                style={styles.modalImage} 
            />

            {isManualInputMode ? (
                <>
                    <Text style={styles.modalTitle}>L IA a un doute 🤔</Text>
                    <View style={styles.confBadge}>
                        <Text style={[styles.modalConf, {color: 'orange'}]}>
                            Confiance faible : {Math.round(currentPrediction?.score * 100)}%
                        </Text>
                    </View>
                    <Text style={{color:'#ccc', marginBottom:10}}>Aidez-nous à identifier cette paire :</Text>
                    <TextInput
                        style={styles.inputField}
                        placeholder="Ex: Nike Dunk Low Panda"
                        placeholderTextColor="#666"
                        value={manualShoeName}
                        onChangeText={setManualShoeName}
                    />
                    <TouchableOpacity style={styles.buyBtn} onPress={handleManualSubmit}>
                        <Text style={styles.buyBtnText}>VALIDER ET ENVOYER</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.closeBtn} onPress={() => { setModalVisible(false); setIsManualInputMode(false); }}>
                        <Text style={styles.closeBtnText}>Annuler</Text>
                    </TouchableOpacity>
                </>
            ) : (
                <>
                    <Text style={styles.modalTitle}>{scanResult?.shoeName?.replace(/_/g, ' ')}</Text>
                    <View style={styles.confBadge}>
                    <Text style={styles.modalConf}>Confiance IA : {Math.round(scanResult?.confidence * 100)}%</Text>
                    </View>
                    {scanResult?.marketData?.prix > 0 ? (
                    <View style={styles.priceBox}>
                        <Text style={styles.priceLabel}>Meilleure offre trouvée :</Text>
                        <Text style={styles.priceValue}>{scanResult.marketData.prix} €</Text>
                        <Text style={styles.shopName}>sur {scanResult.marketData.boutique}</Text>
                        {scanResult.marketData.lien && (
                        <TouchableOpacity style={styles.buyBtn} onPress={() => Linking.openURL(scanResult.marketData.lien)}>
                            <Text style={styles.buyBtnText}>ACHETER MAINTENANT</Text>
                            <Ionicons name="cart" size={20} color="white" style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                        )}
                    </View>
                    ) : (
                    <Text style={styles.noPrice}>Scan enregistré sur le Drive.</Text>
                    )}
                    <TouchableOpacity style={styles.closeBtn} onPress={() => { setModalVisible(false); setScanResult(null); }}>
                    <Text style={styles.closeBtnText}>Fermer</Text>
                    </TouchableOpacity>
                </>
            )}
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
  overlayContainer: { flex: 1, justifyContent: 'space-between', paddingVertical: 50, paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: { padding: 10, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 25 },
  bottomBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  galleryButton: { padding: 15, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 30 },
  scanBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' },
  scanInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  loader: { marginBottom: 20 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.85)' },
  modalContent: { width: '85%', backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  modalImage: { width: 220, height: 220, borderRadius: 15, marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginBottom: 5 },
  confBadge: { backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 20 },
  modalConf: { color: '#1e90ff', fontSize: 14, fontWeight: 'bold' },
  priceBox: { width: '100%', backgroundColor: '#252525', padding: 15, borderRadius: 15, alignItems: 'center', marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#4caf50' },
  priceLabel: { color: '#aaa', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  priceValue: { color: '#4caf50', fontSize: 32, fontWeight: 'bold', marginVertical: 5 },
  shopName: { color: '#fff', fontSize: 16, marginBottom: 15, fontWeight: '500' },
  buyBtn: { backgroundColor: '#4caf50', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  buyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  noPrice: { color: '#888', fontStyle: 'italic', marginVertical: 20 },
  closeBtn: { padding: 10 },
  closeBtnText: { color: '#aaa', fontSize: 16, textDecorationLine: 'underline' },
  inputField: { width: '100%', height: 50, backgroundColor: '#333', borderRadius: 10, color: 'white', paddingHorizontal: 15, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#555' }
});