import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, ScrollView, RefreshControl, Image } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// L'adresse de ton VPS
const API_URL = 'http://51.38.186.253:3000';

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  
  const [dashboardData, setDashboardData] = useState<{
    totalScans: number;
    recentActivity: any[];
  }>({
    totalScans: 0,
    recentActivity: [] 
  });

  const loadData = useCallback(async () => {
    try {
      // 1. Vérif User
      const userJson = await AsyncStorage.getItem('user');
      if (!userJson) {
        router.replace('/AuthScreen');
        return;
      }
      const user = JSON.parse(userJson);
      setUserName(user.prenom || 'Sneakerhead');
      
      const userId = user.id ?? user.user_id ?? 1;

      // 2. Appel API vers l'historique
      const response = await fetch(`${API_URL}/history/${userId}`);
      const data = await response.json();

      if (Array.isArray(data)) {
        // Tri par date décroissante
        const sortedData = data.sort((a: any, b: any) => {
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        setDashboardData({
          totalScans: data.length, 
          recentActivity: sortedData.slice(0, 3) 
        });
      } else {
        setDashboardData({ totalScans: 0, recentActivity: [] });
      }

    } catch (e) {
      console.log("Erreur chargement dashboard:", e);
      setDashboardData({ totalScans: 0, recentActivity: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user');
    router.replace('/AuthScreen');
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      <ScrollView 
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e90ff" />}
      >
        
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.username}>{userName} 👋</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color="#ff4500" />
          </TouchableOpacity>
        </View>

        {/* Titre App */}
        <View style={styles.titleContainer}>
          <Text style={styles.title}>SNEACKSCAN</Text>
          <Text style={styles.subtitle}>Ta collection commence ici.</Text>
        </View>

        {/* Actions Principales */}
        <View style={styles.actions}>
          <Link href="/CameraScreen" asChild>
            <TouchableOpacity style={styles.bigButton}>
              <View style={styles.iconCircle}>
                <Ionicons name="scan" size={32} color="#fff" />
              </View>
              <View>
                <Text style={styles.buttonTitle}>Scanner</Text>
                <Text style={styles.buttonSub}>Identifier une paire</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.5)" style={{marginLeft: 'auto'}}/>
            </TouchableOpacity>
          </Link>
          
          {/* Bouton Historique (Bientôt) */}
          {/* Placeholder pour le bouton historique */}
        <TouchableOpacity
          style={[styles.bigButton, {backgroundColor: '#333', marginTop: 20}]}
          onPress={() => router.push('/HistoryScreen' as any)}
        >
          <Ionicons name="time" size={40} color="#fff" />
          <Text style={[styles.buttonText, {color:'#fff'}]}>Historique</Text>
        </TouchableOpacity>
      
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>TABLEAU DE BORD</Text>
        
        <View style={styles.statsCard}>
          <View>
            <Text style={styles.statsLabel}>Paires identifiées</Text>
            <Text style={styles.statsCount}>{dashboardData.totalScans}</Text>
          </View>
          <MaterialCommunityIcons name="shoe-sneaker" size={55} color="#1e90ff" />
        </View>

        {/* Derniers Scans */}
        <Text style={styles.sectionTitle}>DERNIERS SCANS</Text>

        {dashboardData.recentActivity.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Aucun scan pour le moment.</Text>
          </View>
        ) : (
          dashboardData.recentActivity.map((scan: any, index: number) => {
            const imageUrl = scan.image_url.startsWith('http') 
              ? scan.image_url 
              : `${API_URL}${scan.image_url}`;
            
            const shoeLabel = scan.shoe_name ? scan.shoe_name.replace(/_/g, ' ') : 'Inconnu';

            return (
              <View key={index} style={styles.activityItem}>
                <Image 
                  source={{ uri: imageUrl }} 
                  style={styles.miniImage} 
                  resizeMode="cover"
                />
                
                <View style={{flex: 1, marginLeft: 15}}>
                  <Text style={styles.activityText}>
                    Modèle : <Text style={styles.bold}>{shoeLabel.toUpperCase()}</Text>
                  </Text>
                  <Text style={styles.activityDate}>
                     {scan.date ? new Date(scan.date).toLocaleDateString('fr-FR') : ''}
                  </Text>
                </View>

                <View style={{alignItems: 'flex-end'}}>
                   <Text style={styles.confidenceBadge}>{Math.round(scan.confidence * 100)}%</Text>
                   <Text style={{fontSize: 10, color: '#666', marginTop: 2}}>Fiabilité</Text>
                </View>
              </View>
            );
          })
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 20, paddingTop: 10 },
  center: { justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 },
  greeting: { color: '#888', fontSize: 16 },
  username: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  logoutBtn: { padding: 10, backgroundColor: 'rgba(255,69,0,0.1)', borderRadius: 12 },
  
  titleContainer: { marginBottom: 30 },
  title: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: 2 },
  subtitle: { fontSize: 16, color: '#1e90ff', letterSpacing: 0.5 },
  
  actions: { marginBottom: 30 },
  bigButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e90ff', borderRadius: 20, padding: 20, marginBottom: 15,
    elevation: 8, shadowColor: '#1e90ff', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: {width:0, height:4}
  },
  iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  
  buttonTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  buttonSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  // 👇 C'était le style manquant pour le bouton historique !
  buttonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },

  sectionTitle: { color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 10 },
  
  statsCard: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: '#1e90ff', marginBottom: 20
  },
  statsLabel: { color: '#aaa', fontSize: 14, marginBottom: 5 },
  statsCount: { color: '#fff', fontSize: 36, fontWeight: 'bold' },

  activityItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#333'
  },
  miniImage: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#333' },
  activityText: { color: '#ddd', fontSize: 14 },
  bold: { fontWeight: 'bold', color: '#fff' },
  activityDate: { color: '#666', fontSize: 12, marginTop: 4 },
  confidenceBadge: { backgroundColor: 'rgba(30, 144, 255, 0.2)', color: '#1e90ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 14, fontWeight: 'bold', overflow: 'hidden', textAlign: 'center' },
  
  emptyState: { padding: 20, alignItems: 'center', marginTop: 10 },
  emptyText: { color: '#444', fontStyle: 'italic' }
});