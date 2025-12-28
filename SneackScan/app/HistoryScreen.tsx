import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, TouchableOpacity, StatusBar, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// 🔗 ADRESSE DE VOTRE SERVEUR VPS
const API_URL = 'http://51.38.186.253:3000';

// Typage mis à jour pour inclure les données prix/boutique
interface HistoryItem {
  id: number;
  user_id: number;
  shoe_name: string;
  confidence: number;
  image_url: string;
  date: string;
  // Nouveaux champs
  lien_achat?: string;
  boutique_nom?: string;
  prix_trouver?: string | number;
}

export default function HistoryScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const userJson = await AsyncStorage.getItem('user');
      if (!userJson) return;
      
      const user = JSON.parse(userJson);
      const userId = user.id ?? user.user_id ?? 1;

      const response = await fetch(`${API_URL}/history/${userId}`);
      const data = await response.json();

      if (Array.isArray(data)) {
        // Tri décroissant (plus récent en haut)
        const sorted = data.sort((a: any, b: any) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        setHistory(sorted);
      }
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => { fetchHistory(); }, [])
  );

  const handleBuy = (url?: string) => {
    if (url) {
      Linking.openURL(url).catch(err => console.error("Erreur lien:", err));
    }
  };

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const imageUrl = item.image_url.startsWith('http') 
      ? item.image_url 
      : `${API_URL}${item.image_url}`;
      
    const name = item.shoe_name ? item.shoe_name.replace(/_/g, ' ') : 'Inconnu';
    
    let dateStr = "Date inconnue";
    try {
        const d = new Date(item.date);
        dateStr = `${d.toLocaleDateString('fr-FR')} • ${d.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'})}`;
    } catch(e) {}

    // On vérifie si on a un prix
    const hasPrice = item.prix_trouver && parseFloat(item.prix_trouver.toString()) > 0;

    return (
      <View style={styles.card}>
        <Image source={{ uri: imageUrl }} style={styles.cardImage} resizeMode="cover" />
        
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={styles.shoeName} numberOfLines={1}>{name.toUpperCase()}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{Math.round(item.confidence * 100)}%</Text>
            </View>
          </View>
          
          {/* Section Prix Dynamique */}
          {hasPrice ? (
            <View style={styles.priceContainer}>
                <View>
                    <Text style={styles.priceLabel}>Meilleur prix :</Text>
                    <Text style={styles.priceValue}>{item.prix_trouver} €</Text>
                    <Text style={styles.shopName}>{item.boutique_nom}</Text>
                </View>
                
                {item.lien_achat && (
                    <TouchableOpacity style={styles.buyButton} onPress={() => handleBuy(item.lien_achat)}>
                        <Text style={styles.buyButtonText}>VOIR</Text>
                        <Ionicons name="arrow-forward" size={16} color="#fff" style={{marginLeft: 5}}/>
                    </TouchableOpacity>
                )}
            </View>
          ) : (
            <Text style={styles.noPrice}>Prix non disponible</Text>
          )}
          
          <View style={styles.cardFooter}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
              <Ionicons name="calendar-outline" size={14} color="#666" style={{marginRight:5}} />
              <Text style={styles.dateText}>{dateStr}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>Historique complet</Text>
        <View style={{width: 40}} /> 
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1e90ff" />
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="file-tray-outline" size={50} color="#333" />
              <Text style={styles.emptyText}>Aucun historique disponible</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 20 
  },
  
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a'
  },
  cardImage: { width: '100%', height: 180 },
  cardContent: { padding: 15 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  shoeName: { color: '#fff', fontSize: 18, fontWeight: '900', flex: 1, marginRight: 10 },
  
  badge: { backgroundColor: '#1e90ff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },

  // Styles Prix
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#252525',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12
  },
  priceLabel: { color: '#aaa', fontSize: 11 },
  priceValue: { color: '#4caf50', fontSize: 18, fontWeight: 'bold' },
  shopName: { color: '#fff', fontSize: 12 },
  
  buyButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  buyButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  
  noPrice: { color: '#666', fontStyle: 'italic', marginBottom: 12, fontSize: 12 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  dateText: { color: '#666', fontSize: 12 },

  empty: { alignItems: 'center', marginTop: 100, opacity: 0.6 },
  emptyText: { color: '#666', marginTop: 15, fontSize: 16 }
});