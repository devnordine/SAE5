import { Stack } from "expo-router";
import { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions, StatusBar } from "react-native";

const { height, width } = Dimensions.get('window');

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  
  // Animations Splash Screen
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Apparition Logo
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
    ]).start();

    // 2. Scan Laser
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 0, useNativeDriver: true })
      ])
    ).start();

    // 3. Fin du chargement
    setTimeout(() => {
      setAppIsReady(true);
    }, 2500);
  }, []);

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-height * 0.2, height * 0.2]
  });

  const lineOpacity = scanLineAnim.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 1, 1, 0]
  });

  if (!appIsReady) {
    return (
      <View style={styles.splashContainer}>
        {/* On cache la barre de statut pendant le chargement */}
        <StatusBar hidden /> 
        
        <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
          <Text style={styles.logoText}>SNEACKSCAN</Text>
          <Text style={styles.subText}>{"L'IA au bout des pieds"}</Text>
        </Animated.View>

        <Animated.View style={[styles.scanLine, { transform: [{ translateY }], opacity: lineOpacity }]} />
      </View>
    );
  }

  return (
    // 👇 LA CORRECTION EST ICI : screenOptions={{ headerShown: false }}
    // Cela enlève la barre blanche sur TOUTES les pages (Auth, History, etc.)
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="AuthScreen" />
      <Stack.Screen name="CameraScreen" />
      <Stack.Screen name="HistoryScreen" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  splashContainer: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
  logoText: { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: 4, textAlign: 'center', textShadowColor: 'rgba(30, 144, 255, 0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20 },
  subText: { marginTop: 15, fontSize: 14, color: '#1e90ff', textAlign: 'center', letterSpacing: 6, textTransform: 'uppercase', fontWeight: '600' },
  scanLine: { position: 'absolute', width: width * 0.8, height: 2, backgroundColor: '#1e90ff', shadowColor: '#1e90ff', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 15, elevation: 10 }
});