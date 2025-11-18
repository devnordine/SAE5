// app/CameraScreen.tsx
import React from 'react';
import { SafeAreaView, Text, StyleSheet } from 'react-native';
import CameraClassifier from '../components/CameraClassifier.js';

export default function CameraScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Scanner une sneaker</Text>
      <CameraClassifier />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginVertical: 8 },
});