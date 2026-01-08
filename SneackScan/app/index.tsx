import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, StatusBar, ScrollView, RefreshControl, Image, Dimensions, Share } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';


import CameraScreen from './CameraScreen';
import HistoryScreen from './HistoryScreen';
import AdminScreen from './AdminScreen';

const Tab = createBottomTabNavigator();
const API_URL = 'http://51.38.186.253:3000';
const { width } = Dimensions.get('window');


function HomeContent() {
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  
  const [dashboardData, setDashboardData] = useState<{
    totalScans: number;
    recentActivity: any[];
  }>({ totalScans: 0, recentActivity: [] });

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
        const sorted = history.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setDashboardData({
          totalScans: history.length,
          recentActivity: sorted.slice(0, 3) 
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

  const handleShare = async (item: any) => {
    try {
      const name = item.shoe_name ? item.shoe_name.replace(/_/g, ' ') : 'Inconnu';
      const imageUrl = item.image_url 
        ? (item.image_url.startsWith('http') ? item.image_url : `${API_URL}${item.image_url}`)
        : null;

      const message = `👟 J'ai scanné cette paire avec SneackScan !\n\n` +
        `Modèle : ${name}\n` +
        `Confiance IA : ${item.confidence ? (Number(item.confidence) * 100).toFixed(0) : 0}%\n` +
        (item.prix_trouver ? `💰 Prix trouvé : ${item.prix_trouver} €\n` : '') +
        (item.boutique_nom ? `🏪 Boutique : ${item.boutique_nom}\n` : '') +
        (item.lien_achat ? `🔗 Lien : ${item.lien_achat}` : '');

      await Share.share({ message, url: imageUrl || undefined, title: "Résultat SneackScan" });
    } catch (error) {
      console.error("Erreur partage:", error);
    }
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
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.username}>{userName} 👋</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color="#ff4500" />
          </TouchableOpacity>
        </View>

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

        <Text style={styles.sectionTitle}>VOTRE COLLECTION</Text>
        
        <View style={styles.statsCard}>
          <View>
            <Text style={styles.statsCount}>{dashboardData.totalScans}</Text>
            <Text style={styles.statsLabel}>Scans Réalisés</Text>
          </View>
          <MaterialCommunityIcons name="shoe-sneaker" size={50} color="#1e90ff" style={{opacity:0.8}} />
        </View>

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
                <View style={{alignItems: 'flex-end'}}>
                  <Text style={styles.dateText}>{dateStr}</Text>
                  <TouchableOpacity onPress={() => handleShare(item)} style={{marginTop: 8, padding: 4}}>
                    <Ionicons name="share-social-outline" size={22} color="#1e90ff" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

//Ici la partie du menu

export default function Index() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      checkAdmin();
    }, [])
  );

  const checkAdmin = async () => {
    try {
      const userJson = await AsyncStorage.getItem('user');
      if (!userJson) {
        setLoading(false);
        return;
      }

      const user = JSON.parse(userJson);
      console.log('👤 User data:', user);

      // Vérif admin
      if (user.role === 'admin') {
        console.log(' Admin détecté via role local');
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      
      const response = await fetch(`${API_URL}/admin/check/${user.id}`);
      const data = await response.json();
      console.log(' API Admin Check:', data);

      if (data.isAdmin === true) {
        console.log(' Admin confirmé par API');
        setIsAdmin(true);
        await AsyncStorage.setItem('user', JSON.stringify({ ...user, role: 'admin' }));
      }
    } catch (error) {
      console.error(' Erreur vérification admin:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1e90ff',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#121212',
          borderTopColor: '#333',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
        },
      }}
    >
      <Tab.Screen
        name="home"
        component={HomeContent} 
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      
      <Tab.Screen
        name="camera"
        component={CameraScreen}
        options={{
          title: 'Scanner',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="camera-iris" size={size} color={color} />
          ),
        }}
      />
      
      <Tab.Screen
        name="history"
        component={HistoryScreen}
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />

      {isAdmin && (
        <Tab.Screen
          name="admin"
          component={AdminScreen}
          options={{
            title: 'Admin',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      )}
    </Tab.Navigator>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  scrollContent: { padding: 20 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginTop: 60,
    marginBottom: 40 
  },
  greeting: { color: '#888', fontSize: 16 },
  username: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  logoutBtn: { padding: 12, backgroundColor: 'rgba(255,69,0,0.1)', borderRadius: 14 },
  scanCard: {
    backgroundColor: '#1e1e1e', borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 35,
    borderWidth: 1, borderColor: '#333', elevation: 5, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity:0.3, shadowRadius:5,
  },
  scanIconBg: { width: 60, height: 60, backgroundColor: '#1e90ff', borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  scanTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  scanSubtitle: { color: '#888', fontSize: 14, marginTop: 2 },
  sectionTitle: { color: '#666', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  statsCard: {
    backgroundColor: '#1a1a1a', borderRadius: 20, padding: 25, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: '#1e90ff', marginBottom: 30, marginTop: 15
  },
  statsLabel: { color: '#aaa', fontSize: 14, marginTop: 5 },
  statsCount: { color: '#fff', fontSize: 42, fontWeight: 'bold' },
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