import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView, Alert } from 'react-native';
import { Camera } from 'expo-camera';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-react-native';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { uriToTensor } from '../utils/tfjsImageUtils';

export default function CameraClassifier() {
  const [hasPermission, setHasPermission] = useState(null);
  const [model, setModel] = useState(null);
  const [isTfReady, setIsTfReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preds, setPreds] = useState([]);
  const [lastPhoto, setLastPhoto] = useState(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');

      await tf.ready();
      try {
        await tf.setBackend('rn-webgl');
      } catch (e) {
        console.warn('Erreur backend TFJS', e);
      }
      setIsTfReady(true);

      try {
        const loadedModel = await mobilenet.load();
        setModel(loadedModel);
      } catch (err) {
        console.error('Erreur de chargement du modèle MobileNet', err);
        Alert.alert('Erreur', 'Impossible de charger MobileNet.');
      }
    })();
  }, []);

  const takeAndPredict = async () => {
    if (!cameraRef.current || !model || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setLastPhoto(photo.uri);

      const tensor = await uriToTensor(photo.uri);
      const predictions = await model.classify(tensor);
      setPreds(predictions);
      tf.dispose(tensor);
    } catch (e) {
      console.warn(e);
      Alert.alert('Erreur', 'Problème pendant la classification.');
    } finally {
      setBusy(false);
    }
  };

  if (hasPermission === null) return <View style={styles.center}><Text>Demande d’autorisation...</Text></View>;
  if (hasPermission === false) return <View style={styles.center}><Text>Accès caméra refusé.</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.cameraWrap}>
        <Camera style={styles.camera} ref={cameraRef} ratio="16:9" />
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.button, (busy || !model) && {opacity:0.6}]} onPress={takeAndPredict} disabled={busy || !model}>
          <Text style={styles.btnText}>{busy ? 'Analyse...' : 'Scanner la chaussure'}</Text>
        </TouchableOpacity>

        {!isTfReady && <Text style={{marginTop:8}}>Initialisation TensorFlow...</Text>}
        {!model && <Text style={{marginTop:8}}>Chargement du modèle...</Text>}
        {busy && <ActivityIndicator style={{marginTop:8}} />}

        {lastPhoto && <Image source={{uri:lastPhoto}} style={{width:200,height:120,marginTop:12,borderRadius:8}} />}

        <ScrollView style={{marginTop:12, maxHeight:220}}>
          <Text style={{fontWeight:'700', marginLeft:8}}>Résultats :</Text>
          {preds.length===0 && <Text style={{marginLeft:8}}>Pas encore de prédiction.</Text>}
          {preds.map((p,i)=>(
            <View key={i} style={styles.predRow}>
              <Text style={styles.predText}>{i+1}. {p.className}</Text>
              <Text style={styles.predConf}>{(p.probability*100).toFixed(1)}%</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1},
  cameraWrap:{flex:1, margin:12, borderRadius:12, overflow:'hidden', backgroundColor:'#000'},
  camera:{flex:1},
  controls:{paddingHorizontal:12,paddingBottom:20},
  button:{backgroundColor:'#1e90ff',padding:12,borderRadius:8,alignItems:'center'},
  btnText:{color:'#fff',fontWeight:'700'},
  center:{flex:1,justifyContent:'center',alignItems:'center'},
  predRow:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:12,paddingVertical:6},
  predText:{fontSize:16},
  predConf:{fontSize:16,fontWeight:'700'}
});