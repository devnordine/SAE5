import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Image, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

type HistoryItem = {
  id: number;
  user_id: number;
  shoe_name: string;
  confidence: number;
  image_url: string;
  date: string;
};

const API_BASE = 'http://51.38.186.253:3000';

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const userJson = await AsyncStorage.getItem('user');
      if (!userJson) {
        setHistory([]);
        setLoading(false);
        return;
      }
      const user = JSON.parse(userJson);
      const userId = user.id ?? user.user_id ?? 1;
      const res = await fetch(`${API_BASE}/history/${userId}`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    loadHistory();
  }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  if (!history || history.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>{"Aucun scan dans l'historique"}.</Text>
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>
    );
  }

  const renderItem = ({ item }: { item: HistoryItem }) => {
    const imageUrl = item.image_url.startsWith('http') ? item.image_url : `${API_BASE}${item.image_url}`;
    const percentage = (item.confidence * 100).toFixed(1);
    const date = new Date(item.date).toLocaleString('fr-FR');
    // Nicely format shoe_name (replace underscores)
    const shoeLabel = item.shoe_name ? item.shoe_name.replace(/_/g, ' ') : 'Chaussure inconnue';

    return (
      <View style={styles.card}>
        <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        <View style={styles.info}>
          <Text style={styles.shoeName}>{shoeLabel}</Text>
          <Text style={styles.confidence}>{percentage}%</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={history}
      keyExtractor={(i) => String(i.id)}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' },
  container: { flex: 1, padding: 20, backgroundColor: '#121212' },
  list: { padding: 20, backgroundColor: '#121212' },
  card: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 3,
  },
  image: { width: 120, height: 120 },
  info: { flex: 1, padding: 12, justifyContent: 'center' },
  shoeName: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  confidence: { color: '#1e90ff', fontWeight: '700', marginBottom: 6 },
  date: { color: '#999' },
  emptyText: { color: '#fff', textAlign: 'center', marginTop: 40 },
});