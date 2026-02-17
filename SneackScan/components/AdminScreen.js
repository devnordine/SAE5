import React, { useState, useEffect } from 'react';
import { 
  View, Text, Image, StyleSheet, TouchableOpacity, 
  ActivityIndicator, TextInput, Alert, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const API_URL = 'http://51.38.186.253:3000'; // Ton IP VPS
const { width } = Dimensions.get('window');

export default function AdminScreen() {
  const router = useRouter();
  const [pendingScans, setPendingScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
    fetchPendingScans();
  }, []);

  // Charger les données
  const fetchPendingScans = async () => {
    try {
      const response = await fetch(`${API_URL}/api/admin/pending`);
      const data = await response.json();
      setPendingScans(data);
      if (data.length > 0) setEditedName(data[0].shoe_name);
      setLoading(false);
    } catch (error) {
      console.error(error);
      Alert.alert("Erreur", "Impossible de charger les scans.");
      setLoading(false);
    }
  };

  // Action : Valider (Green)
  const handleValidate = async () => {
    const currentItem = pendingScans[currentIndex];
    try {
      await fetch(`${API_URL}/api/admin/validate-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            history_id: currentItem.id, 
            corrected_name: editedName // On envoie le nom modifié
        }),
      });
      nextCard();
    } catch (error) {
      Alert.alert("Erreur", "Validation échouée");
    }
  };

  // Action : Refuser (Red)
  const handleReject = async () => {
    const currentItem = pendingScans[currentIndex];
    try {
      await fetch(`${API_URL}/api/admin/reject-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_id: currentItem.id }),
      });
      nextCard();
    } catch (error) {
      Alert.alert("Erreur", "Rejet échoué");
    }
  };

  // Passer à la carte suivante
  const nextCard = () => {
    if (currentIndex < pendingScans.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setEditedName(pendingScans[nextIndex].shoe_name);
    } else {
      Alert.alert("Terminé !", "Plus aucun scan en attente.");
      router.back();
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#00ff00" /></View>;
  if (pendingScans.length === 0) return (
    <View style={styles.center}>
        <Text style={{color:'white'}}>Aucun scan à valider ✅</Text>
        <TouchableOpacity onPress={() => router.back()} style={{marginTop:20}}>
            <Text style={{color:'#1e90ff'}}>Retour</Text>
        </TouchableOpacity>
    </View>
  );

  const item = pendingScans[currentIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={30} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Review ({pendingScans.length - currentIndex})</Text>
        <View style={{width:30}} />
      </View>

      {/* La Carte Tinder */}
      <View style={styles.card}>
        <Image 
            source={{ uri: `${API_URL}${item.image_url}` }} 
            style={styles.image} 
            resizeMode="cover"
        />
        
        <View style={styles.infoBox}>
            <Text style={styles.label}>Utilisateur #{item.user_id} a proposé :</Text>
            <TextInput 
                style={styles.nameInput}
                value={editedName}
                onChangeText={setEditedName}
            />
            <Text style={styles.conf}>Confiance IA : {(item.confidence * 100).toFixed(1)}%</Text>
        </View>
      </View>

      {/* Boutons Actions */}
      <View style={styles.buttonsContainer}>
        <TouchableOpacity style={[styles.btn, styles.rejectBtn]} onPress={handleReject}>
            <Ionicons name="close" size={40} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.validateBtn]} onPress={handleValidate}>
            <Ionicons name="checkmark" size={40} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  center: { flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 30 },
  title: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  card: { flex: 1, backgroundColor: '#1E1E1E', borderRadius: 20, overflow: 'hidden', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  image: { width: '100%', height: '70%' },
  infoBox: { padding: 15, flex: 1, justifyContent: 'center' },
  label: { color: '#888', fontSize: 12, marginBottom: 5 },
  nameInput: { color: 'white', fontSize: 24, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#555', paddingBottom: 5 },
  conf: { color: '#555', marginTop: 10, fontSize: 12 },
  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 20 },
  btn: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  rejectBtn: { backgroundColor: '#ff4444' },
  validateBtn: { backgroundColor: '#00C851' },
});