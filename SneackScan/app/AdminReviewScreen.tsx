import React, { useState, useEffect } from 'react';
import { 
  View, Text, Image, StyleSheet, TouchableOpacity, 
  ActivityIndicator, TextInput, Alert, Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

// ⚠️ Assure-toi que l'IP correspond à ton serveur
const API_URL = 'http://51.38.186.253:3000'; 

export default function AdminReviewScreen() {
  const router = useRouter();
  const [pendingScans, setPendingScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editedName, setEditedName] = useState('');

  useEffect(() => {
    fetchPendingScans();
  }, []);

  // 1. Charger les données
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

  // 2. Action : Valider (Vert)
  const handleValidate = async () => {
    const currentItem = pendingScans[currentIndex];
    try {
      await fetch(`${API_URL}/api/admin/validate-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            history_id: currentItem.id, 
            corrected_name: editedName // On envoie le nom corrigé par l'admin
        }),
      });
      nextCard();
    } catch (error) {
      Alert.alert("Erreur", "Validation échouée");
    }
  };

  // 3. Action : Refuser (Rouge)
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

  // 4. Passer à la carte suivante
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

  if (loading) return <View style={styles.center}><ActivityIndicator color="#1e90ff" size="large" /></View>;
  
  if (pendingScans.length === 0) return (
    <View style={styles.center}>
        <Ionicons name="checkmark-circle-outline" size={80} color="#00C851" />
        <Text style={{color:'white', marginTop: 20, fontSize: 18}}>Tout est à jour !</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={{color:'white', fontWeight: 'bold'}}>Retour Accueil</Text>
        </TouchableOpacity>
    </View>
  );

  const item = pendingScans[currentIndex];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.title}>Review ({pendingScans.length - currentIndex} restants)</Text>
        <View style={{width: 40}} />
      </View>

      {/* Carte Centrale */}
      <View style={styles.card}>
        <Image 
            source={{ uri: `${API_URL}${item.image_url}` }} 
            style={styles.image} 
            resizeMode="contain"
        />
        
        <View style={styles.infoBox}>
            <Text style={styles.label}>IA a proposé :</Text>
            <TextInput 
                style={styles.nameInput}
                value={editedName}
                onChangeText={setEditedName}
                placeholderTextColor="#666"
            />
            <View style={styles.confBadge}>
                <Text style={styles.confText}>
                    Confiance : {(item.confidence * 100).toFixed(1)}%
                </Text>
            </View>
        </View>
      </View>

      {/* Boutons d'action */}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 },
  iconBtn: { padding: 10, backgroundColor: '#333', borderRadius: 20 },
  title: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  card: { flex: 1, backgroundColor: '#1E1E1E', borderRadius: 20, overflow: 'hidden', marginBottom: 30, borderWidth: 1, borderColor: '#333' },
  image: { width: '100%', height: '60%', backgroundColor: '#000' },
  infoBox: { padding: 20, flex: 1, justifyContent: 'center' },
  label: { color: '#888', fontSize: 12, marginBottom: 5, textTransform: 'uppercase' },
  nameInput: { color: 'white', fontSize: 22, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#1e90ff', paddingBottom: 5, marginBottom: 15 },
  confBadge: { backgroundColor: '#333', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  confText: { color: '#aaa', fontSize: 12 },
  buttonsContainer: { flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 30 },
  btn: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', shadowColor: "#000", shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  rejectBtn: { backgroundColor: '#ff4444' },
  validateBtn: { backgroundColor: '#00C851' },
  backButton: { marginTop: 30, backgroundColor: '#333', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 }
});