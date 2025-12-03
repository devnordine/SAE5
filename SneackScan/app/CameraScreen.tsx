// app/CameraScreen.tsx
import React from 'react';
import { View, StyleSheet, StatusBar } from 'react-native'; // On utilise View simple
import CameraClassifier from '../components/CameraClassifier';

export default function CameraScreen() {
  return (
    <View style={styles.container}>
      {/* On rend la barre d'état blanche pour aller avec le thème sombre */}
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <CameraClassifier />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
});