import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  // Cette fonction s'exécute à chaque fois qu'on revient sur l'écran
  useFocusEffect(
    useCallback(() => {
      checkLogin();
    }, [])
  );

  const checkLogin = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (!userJson) {
        // Pas connecté ? Hop, direction connexion
        router.replace('/AuthScreen');
      } else {
        const user = JSON.parse(userJson);
        setUserName(user.prenom || 'Sneakerhead');
        setLoading(false);
      }
    } catch (e) {
      router.replace('/AuthScreen');
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user');
    router.replace('/AuthScreen');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      {/* En-tête */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Bonjour, {userName} 👋</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Ionicons name="log-out-outline" size={24} color="#ff4500" />
        </TouchableOpacity>
      </View>

      {/* Contenu Central */}
      <View style={styles.content}>
        <Text style={styles.title}>SNEACKSCAN</Text>
        <Text style={styles.subtitle}>Prêt à identifier une paire ?</Text>

        {/* Le fameux bouton pour aller à la caméra */}
        <Link href="/CameraScreen" asChild>
          <TouchableOpacity style={styles.bigButton}>
            <Ionicons name="scan-circle" size={60} color="#fff" />
            <Text style={styles.buttonText}>Ouvrir le Scanner</Text>
          </TouchableOpacity>
        </Link>
        
        {/* Placeholder pour le bouton historique futur */}
        <TouchableOpacity style={[styles.bigButton, {backgroundColor: '#333', marginTop: 20}]}>
            <Ionicons name="time" size={40} color="#888" />
            <Text style={[styles.buttonText, {color:'#888'}]}>Historique (Bientôt)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 },
  greeting: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255,69,0,0.1)', borderRadius: 10 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: 2, marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#1e90ff', marginBottom: 50, letterSpacing: 1 },
  
  bigButton: {
    width: '100%',
    height: 120,
    backgroundColor: '#1e90ff',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    elevation: 5,
    shadowColor: '#1e90ff', shadowOffset: {width:0, height:4}, shadowOpacity:0.4, shadowRadius:5,
  },
  buttonText: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginLeft: 15 }
});