import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { useFocusEffect } from 'expo-router';

const { width } = Dimensions.get('window');
const API_URL = 'http://51.38.186.253:3000'; 

export default function AdminScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total_scans: 0,
    total_achats: 0,
    confiance_moyenne: 0,
    taux_conversion: 0,
  });
  const [evolutionData, setEvolutionData] = useState<any>(null);
  const [activityData, setActivityData] = useState<any>(null);
  const [modelsData, setModelsData] = useState<any>(null);
  const [funnelData, setFunnelData] = useState<any>(null);

  useFocusEffect(
    React.useCallback(() => {
      loadUserAndFetch();
    }, [])
  );

  const loadUserAndFetch = async () => {
    try {
      const stored = await AsyncStorage.getItem('user');
      const user = stored ? JSON.parse(stored) : null;
      if (!user?.id) throw new Error('Utilisateur non trouvé');
      if (user.role !== 'admin') {
        setError("Accès réservé aux administrateurs.");
        return;
      }
      await Promise.all([
        fetchStats(user.id),
        fetchEvolution(user.id),
        fetchActivity(user.id),
        fetchModels(user.id),
        fetchFunnel(user.id)
      ]);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erreur lors du chargement.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadUserAndFetch();
  };

  const fetchStats = async (userId: number) => {
    const response = await fetch(`${API_URL}/admin/stats/funnel`, {
      headers: { 'x-user-id': String(userId) },
    });
    if (!response.ok) throw new Error('Accès admin refusé');
    const data = await response.json();
    
    const scans = Number.parseInt(data.total_scans) || 0;
    const clicks = Number.parseInt(data.total_clicks) || 0;
    
    setStats({
      total_scans: scans,
      total_achats: clicks,
      confiance_moyenne: 0,
      taux_conversion: scans > 0 
        ? Number(((clicks / scans) * 100).toFixed(2))
        : 0,
    });
  };

  const fetchEvolution = async (userId: number) => {
    try {
      const response = await fetch(`${API_URL}/admin/stats/evolution`, {
        headers: { 'x-user-id': String(userId) },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.length === 0) return;

      const avgScore =
        data.reduce((s: number, d: any) => s + Number.parseFloat(d.score_moyen || 0), 0) /
        data.length;

      setStats(prev => ({
        ...prev,
        confiance_moyenne: Number(avgScore.toFixed(1)),
      }));

      setEvolutionData({
        labels: data.map((d: any) => new Date(d.jour).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })),
        datasets: [
          { data: data.map((d: any) => Number.parseFloat(d.nb_scans)), color: (o=1)=>`rgba(30,144,255,${o})`, strokeWidth: 2 },
          { data: data.map((d: any) => Number.parseFloat(d.score_moyen)), color: (o=1)=>`rgba(46,213,115,${o})`, strokeWidth: 2 },
        ],
        legend: ['Scans', 'Score IA (%)'],
      });
    } catch (e) { console.error('Erreur evolution:', e); }
  };

   const fetchActivity = async (userId: number) => {
    try {
      const response = await fetch(`${API_URL}/admin/stats/activity`, {
        headers: { 'x-user-id': String(userId) },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.length === 0) return;

      
      const step = Math.ceil(data.length / 12);
      const labels = data.map((d: any, i: number) => (i % step === 0 ? `${d.heure}h` : ''));

      setActivityData({
        labels,
        datasets: [{ data: data.map((d: any) => Number.parseFloat(d.nb_scans)) }],
        barCount: data.length, 
      });
    } catch (e) { console.error('Erreur activity:', e); }
  };

  const fetchModels = async (userId: number) => {
    try {
      const response = await fetch(`${API_URL}/admin/stats/models`, {
        headers: { 'x-user-id': String(userId) },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.length === 0) return;

      const colors = ['#1e90ff', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6'];
      setModelsData(
        data.map((item: any, index: number) => ({
          
          name: (item.modele_detecter || 'N/A').replace(/_/g, ' '),
          population: Number(item.nb_scans),
          color: colors[index % colors.length],
          legendFontColor: '#fff',
          legendFontSize: 12,
        }))
      );
    } catch (e) { console.error('Erreur models:', e); }
  };

  const fetchFunnel = async (userId: number) => {
    try {
      const response = await fetch(`${API_URL}/admin/stats/funnel`, {
        headers: { 'x-user-id': String(userId) },
      });
      if (!response.ok) return;
      const data = await response.json();
      
      const scans = Number.parseInt(data.total_scans) || 0;
      const clicks = Number.parseInt(data.total_clicks) || 0;
      const taux = scans > 0 ? ((clicks / scans) * 100).toFixed(1) : 0;
      
      setFunnelData({ scans, clicks, taux });
    } catch (e) { console.error('Erreur funnel:', e); }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e90ff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: '#ff4d4f' }]}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1e90ff" />
      }
    >
      <Text style={styles.title}>Dashboard Admin</Text>
      
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total_scans}</Text>
          <Text style={styles.statLabel}>Total Scans</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total_achats}</Text>
          <Text style={styles.statLabel}>Clics Achat</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.confiance_moyenne}%</Text>
          <Text style={styles.statLabel}>Confiance Moy.</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.taux_conversion}%</Text>
          <Text style={styles.statLabel}>Taux Conversion</Text>
        </View>
      </View>

      {evolutionData && (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartTitle}>Évolution IA + Score Moyen (30j)</Text>
          <LineChart
            data={evolutionData}
            width={width - 48}
            height={220}
            chartConfig={{
              backgroundColor: '#1a1a1a',
              backgroundGradientFrom: '#1a1a1a',
              backgroundGradientTo: '#1a1a1a',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            }}
            bezier
            style={{ borderRadius: 12 }}
          />
        </View>
      )}

      {activityData && (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartTitle}>Activité par Heure</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={activityData}
              width={Math.max(width - 48, activityData.barCount * 36)} 
              height={220}
              yAxisLabel=""
              yAxisSuffix=""
              chartConfig={{
                backgroundColor: '#1a1a1a',
                backgroundGradientFrom: '#1a1a1a',
                backgroundGradientTo: '#1a1a1a',
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(134, 65, 244, ${opacity})`,
                labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              style={{ borderRadius: 12 }}
            />
          </ScrollView>
        </View>
      )}

      {modelsData && (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartTitle}>Distribution des paires</Text>
          <PieChart
            data={modelsData}
            width={width - 60}           
            height={200}
            chartConfig={{
              color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="0"              // pas de marge à gauche
            hasLegend={true}
            style={{ borderRadius: 12 }}
          />
        </View>
      )}

      {funnelData && (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.chartTitle}>Entonnoir de Conversion</Text>
          <View style={styles.funnelContainer}>
            <View style={[styles.funnelStep, { width: '100%', backgroundColor: '#1e90ff' }]}>
              <Text style={styles.funnelText}>Scans: {funnelData.scans}</Text>
            </View>
            <View style={[styles.funnelStep, { width: `${funnelData.taux}%`, backgroundColor: '#2ecc71' }]}>
              <Text style={styles.funnelText}>Clics: {funnelData.clicks}</Text>
            </View>
            <Text style={styles.conversionRate}>Taux: {funnelData.taux}%</Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginVertical: 20,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    width: (width - 48) / 2,
    marginBottom: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1e90ff',
  },
  statLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  chartPlaceholder: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    minHeight: 200,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  funnelContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  funnelStep: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    minWidth: 140,          
    borderRadius: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  funnelText: {
    color: '#fff',
    fontSize: 18,          
    fontWeight: 'bold',
  },
  conversionRate: {
    color: '#2ecc71',
    fontSize: 22,           
    fontWeight: 'bold',
    marginTop: 10,
  },
});