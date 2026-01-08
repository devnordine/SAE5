import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView 
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const API_URL = 'http://51.38.186.253:3000';

export default function AuthScreen() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');

  const handleAuth = async () => {
    if (!username || !password || (!isLogin && (!email || !prenom))) {
      Alert.alert("Erreur", "Veuillez remplir tous les champs obligatoires.");
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? '/login' : '/register';
    const payload = isLogin 
      ? { username, password }
      : { username, email, password, nom, prenom };

    try {
      console.log(`📡 Tentative vers : ${API_URL}${endpoint}`);
      
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('📦 Réponse serveur:', data);

      if (response.ok && data.success) {
        // Vérification admin
        let userRole = 'user';
        try {
          const checkRes = await fetch(`${API_URL}/admin/check/${data.id}`);
          const check = await checkRes.json();
          console.log(' Admin check:', check);
          if (check.isAdmin === true) {
            userRole = 'admin';
            console.log('Utilisateur est ADMIN');
          }
        } catch (e) {
          console.log('Admin non checker:', e);
        }

        // Sauvegarde utilisateur
        const userData = {
          id: data.id,
          username: username,
          prenom: data.prenom || prenom,
          role: userRole
        };

        await AsyncStorage.setItem('user', JSON.stringify(userData));
        console.log('💾 User sauvegardé:', userData);
        
        Alert.alert(
          "Succès", 
          isLogin ? "Connexion réussie !" : "Compte créé avec succès !",
          [{
            text: "OK",
            onPress: () => {
              console.log('🚀 Redirection vers index (qui affiche les tabs)');
              router.replace('/');
            }
          }]
        );
      } else {
        Alert.alert("Erreur", data.message || data.error || "Une erreur est survenue.");
      }

    } catch (error: any) {
      console.error("❌ Erreur Auth:", error);
      Alert.alert(
        "Erreur Réseau", 
        "Impossible de joindre le serveur. Vérifiez votre connexion."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.logoContainer}>
          <Ionicons name="scan-circle-outline" size={100} color="#1e90ff" />
          <Text style={styles.title}>SneackScan</Text>
          <Text style={styles.subtitle}>
            {isLogin ? "Connectez-vous pour continuer" : "Créez votre compte"}
          </Text>
        </View>

        <View style={styles.form}>
          {!isLogin && (
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1, marginRight: 5 }]}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.icon} />
                <TextInput 
                  placeholder="Prénom" 
                  placeholderTextColor="#666" 
                  style={styles.input} 
                  value={prenom} 
                  onChangeText={setPrenom} 
                />
              </View>
              <View style={[styles.inputContainer, { flex: 1, marginLeft: 5 }]}>
                <Ionicons name="person-outline" size={20} color="#666" style={styles.icon} />
                <TextInput 
                  placeholder="Nom" 
                  placeholderTextColor="#666" 
                  style={styles.input} 
                  value={nom} 
                  onChangeText={setNom} 
                />
              </View>
            </View>
          )}

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#666" style={styles.icon} />
              <TextInput 
                placeholder="Email" 
                placeholderTextColor="#666" 
                style={styles.input} 
                value={email} 
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Ionicons name="person-circle-outline" size={20} color="#666" style={styles.icon} />
            <TextInput 
              placeholder="Nom d'utilisateur" 
              placeholderTextColor="#666" 
              style={styles.input} 
              value={username} 
              onChangeText={setUsername}
              autoCapitalize="none" 
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.icon} />
            <TextInput 
              placeholder="Mot de passe" 
              placeholderTextColor="#666" 
              style={styles.input} 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{isLogin ? "Se connecter" : "S'inscrire"}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchButton}>
            <Text style={styles.switchText}>
              {isLogin ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  scrollContainer: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginTop: 10 },
  subtitle: { fontSize: 16, color: '#888', marginTop: 5 },
  form: { width: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1a1a1a', 
    borderRadius: 12, 
    marginBottom: 15, 
    paddingHorizontal: 15,
    height: 55,
    borderWidth: 1,
    borderColor: '#333'
  },
  icon: { marginRight: 10 },
  input: { flex: 1, color: '#fff', fontSize: 16 },
  button: { 
    backgroundColor: '#1e90ff', 
    padding: 18, 
    borderRadius: 12, 
    alignItems: 'center', 
    marginTop: 10,
    shadowColor: '#1e90ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  switchButton: { marginTop: 20, alignItems: 'center' },
  switchText: { color: '#1e90ff', fontSize: 14 }
});