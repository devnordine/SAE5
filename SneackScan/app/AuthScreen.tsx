import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 👇 REMPLACEZ PAR L'IP DE VOTRE VPS ! (Gardez le http:// et :3000)
// Exemple : const API_URL = 'http://192.168.1.35:3000';
const API_URL = 'http://51.38.186.253:3000'; 

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // Formulaire
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');

  // Vérification connexion automatique
  useEffect(() => {
    checkLogin();
  }, []);

  const checkLogin = async () => {
    const user = await AsyncStorage.getItem('user');
    if (user) router.replace('/CameraScreen');
  };

  const handleAuth = async () => {
    if (!username || !password) {
      Alert.alert("Erreur", "Pseudo et mot de passe obligatoires.");
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? '/login' : '/register';
    
    const payload = isLogin 
      ? { username, password }
      : { username, password, email, nom, prenom };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        const userData = { 
          id: data.id, 
          prenom: data.prenom || prenom || username 
        };
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        Alert.alert("Succès", `Bienvenue ${userData.prenom} !`);
        router.replace('/');
      } else {
        Alert.alert("Erreur", data.message || "Problème serveur");
      }
    } catch (error) {
      Alert.alert("Erreur Réseau", "Impossible de joindre le VPS. Vérifiez l'IP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>SNEACKSCAN</Text>
      <Text style={styles.subtitle}>{isLogin ? 'Connexion' : 'Inscription'}</Text>

      {!isLogin && (
        <>
          <TextInput placeholder="Prénom" placeholderTextColor="#666" style={styles.input} value={prenom} onChangeText={setPrenom} />
          <TextInput placeholder="Nom" placeholderTextColor="#666" style={styles.input} value={nom} onChangeText={setNom} />
          <TextInput placeholder="Email" placeholderTextColor="#666" style={styles.input} autoCapitalize="none" value={email} onChangeText={setEmail} />
        </>
      )}

      <TextInput placeholder="Identifiant" placeholderTextColor="#666" style={styles.input} autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput placeholder="Mot de passe" placeholderTextColor="#666" style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />

      <TouchableOpacity style={styles.btnMain} onPress={handleAuth} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{isLogin ? 'Se connecter' : "S'inscrire"}</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchBtn}>
        <Text style={styles.switchText}>{isLogin ? "Créer un compte" : "J'ai déjà un compte"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#121212', justifyContent: 'center', padding: 20 },
  title: { fontSize: 40, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 10, letterSpacing: 2 },
  subtitle: { fontSize: 18, color: '#1e90ff', textAlign: 'center', marginBottom: 30, textTransform: 'uppercase' },
  input: { backgroundColor: '#222', color: '#fff', borderRadius: 10, padding: 15, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  btnMain: { backgroundColor: '#1e90ff', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#888', fontSize: 14 }
});