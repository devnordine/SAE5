import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, ScrollView, RefreshControl, Image, Dimensions } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

// 🔗 VOTRE VPS
const API_URL = 'http://51.38.186.253:3000';
const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  
  // États
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  
  const [dashboardData, setDashboardData] = useState<{
    totalScans: number;
    recentActivity: any[];
  }>({ totalScans: 0, recentActivity: [] });

  // --- 1. CHARGEMENT DES DONNÉES ---
  const loadData = useCallback(async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (!userJson) {
        setLoading(false);
        return; 
      }
      
      const user = JSON.parse(userJson);
      setUserName(user.prenom || 'Sneakerhead');
      const userId = user.id || user.user_id || 1;

      const response = await fetch(`${API_URL}/history/${userId}`);
      
      if (!response.ok) throw new Error('Erreur réseau');

      const history = await response.json();

      if (Array.isArray(history)) {
        // Tri par date
        const sorted = history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setDashboardData({
          totalScans: history.length,
          recentActivity: sorted.slice(0, 5) 
        });
      } else {
        setDashboardData({ totalScans: 0, recentActivity: [] });
      }

    } catch (error) {
      setDashboardData({ totalScans: 0, recentActivity: [] });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { loadData(); }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('user');
    router.replace('/AuthScreen');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e90ff" />}
        showsVerticalScrollIndicator={false}
      >
        {/* --- HEADER (Avec marge de sécurité) --- */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.username}>{userName} 👋</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color="#ff4500" />
          </TouchableOpacity>
        </View>

        {/* --- BOUTON SCAN --- */}
        <Link href="/CameraScreen" asChild>
          <TouchableOpacity style={styles.scanCard}>
            <View style={styles.scanIconBg}>
              <Ionicons name="scan" size={32} color="#fff" />
            </View>
            <View>
              <Text style={styles.scanTitle}>Scanner une paire</Text>
              <Text style={styles.scanSubtitle}>Identification instantanée IA</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" style={{marginLeft: 'auto'}} />
          </TouchableOpacity>
        </Link>

        {/* --- STATISTIQUES --- */}
        <Text style={styles.sectionTitle}>VOTRE COLLECTION</Text>
        
        <View style={styles.statsCard}>
          <View>
            <Text style={styles.statsCount}>{dashboardData.totalScans}</Text>
            <Text style={styles.statsLabel}>Scans Réalisés</Text>
          </View>
          <MaterialCommunityIcons name="shoe-sneaker" size={50} color="#1e90ff" style={{opacity:0.8}} />
        </View>

        {/* --- HISTORIQUE --- */}
        <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: 10, marginBottom: 10}}>
            <Text style={styles.sectionTitle}>ACTIVITÉ RÉCENTE</Text>
            <TouchableOpacity onPress={() => router.push('/HistoryScreen')}>
                <Text style={{color:'#1e90ff', fontSize:14, fontWeight:'bold'}}>Voir tout</Text>
            </TouchableOpacity>
        </View>

        {dashboardData.recentActivity.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={40} color="#333" />
            <Text style={styles.emptyText}>Aucun scan pour le moment.</Text>
          </View>
        ) : (
          dashboardData.recentActivity.map((item, index) => {
            const name = item.shoe_name ? item.shoe_name.replace(/_/g, ' ').toUpperCase() : 'MODÈLE INCONNU';
            const conf = item.confidence ? (Number(item.confidence) * 100).toFixed(0) : '0';
            const imgUrl = item.image_url ? `${API_URL}${item.image_url}` : null;
            
            let dateStr = "-";
            try {
                if (item.date) {
                    const d = new Date(item.date);
                    // Format court : "03 déc."
                    dateStr = d.toLocaleDateString('fr-FR', {day:'numeric', month:'short'});
                }
            } catch(e) {}

            return (
              <View key={index} style={styles.activityItem}>
                {imgUrl ? (
                  <Image source={{ uri: imgUrl }} style={styles.miniImage} />
                ) : (
                  <View style={[styles.miniImage, {justifyContent:'center', alignItems:'center'}]}>
                    <Ionicons name="image-outline" size={20} color="#666" />
                  </View>
                )}
                
                <View style={{flex: 1}}>
                  <Text style={styles.activityTitle}>{name}</Text>
                  <Text style={styles.activitySub}>Fiabilité : {conf}%</Text>
                </View>
                <Text style={styles.dateText}>{dateStr}</Text>
              </View>
            );
          })
        )}
        
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  scrollContent: { padding: 20 },

  // --- HEADER CORRIGÉ ---
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginTop: 60, // 👈 C'est ça qui fait descendre tout le contenu sous l'encoche
    marginBottom: 40 
  },
  greeting: { color: '#888', fontSize: 16 },
  username: { color: '#fff', fontSize: 28, fontWeight: 'bold' }, // Un peu plus gros
  logoutBtn: { padding: 12, backgroundColor: 'rgba(255,69,0,0.1)', borderRadius: 14 },

  // Scan Card
  scanCard: {
    backgroundColor: '#1e1e1e', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 35,
    borderWidth: 1, borderColor: '#333', elevation: 5, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:5,
  },
  scanIconBg: { width: 60, height: 60, backgroundColor: '#1e90ff', borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  scanTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  scanSubtitle: { color: '#888', fontSize: 14, marginTop: 2 },

  // Titres
  sectionTitle: { color: '#666', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },

  // Stats Card
  statsCard: {
    backgroundColor: '#1a1a1a', borderRadius: 20, padding: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: '#1e90ff', marginBottom: 30, marginTop: 15
  },
  statsLabel: { color: '#aaa', fontSize: 14, marginTop: 5 },
  statsCount: { color: '#fff', fontSize: 42, fontWeight: 'bold' },

  // Liste Activité
  activityItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 15, borderRadius: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#2a2a2a'
  },
  miniImage: { width: 55, height: 55, borderRadius: 12, backgroundColor: '#333', marginRight: 15 },
  activityTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  activitySub: { color: '#1e90ff', fontSize: 13, marginTop: 4, fontWeight:'600' },
  dateText: { color: '#555', fontSize: 13, fontWeight:'bold' },

  emptyState: { alignItems: 'center', padding: 30, opacity: 0.7 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 10 }
});