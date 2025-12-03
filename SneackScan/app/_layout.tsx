import { Stack } from "expo-router";
import { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated, Dimensions, Easing, StatusBar } from "react-native";
import { useFonts } from 'expo-font';

const { height, width } = Dimensions.get('window');

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  
  // ANIMATIONS
  const fadeAnim = useRef(new Animated.Value(0)).current;  // Opacité
  const scaleAnim = useRef(new Animated.Value(0.5)).current; // Zoom
  const scanLineAnim = useRef(new Animated.Value(0)).current; // Position de la ligne laser

  useEffect(() => {
    // 1. Séquence d'apparition du logo
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Boucle infinie de la ligne de scan (Laser)
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 1500, // Vitesse du scan
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, { // Reset instantané invisible
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        })
      ])
    ).start();

    // 3. Fin du chargement après 2.5 secondes
    setTimeout(() => {
      setAppIsReady(true);
    }, 2500);
  }, []);

  // Calcul du mouvement de la ligne laser (de haut en bas)
  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-height * 0.2, height * 0.2] // Scan juste autour du logo
  });

  // Calcul de l'opacité de la ligne (elle disparaît aux bords)
  const lineOpacity = scanLineAnim.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 1, 1, 0]
  });

  if (!appIsReady) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar hidden />
        
        {/* Conteneur Logo avec Animation */}
        <Animated.View style={{ 
            opacity: fadeAnim, 
            transform: [{ scale: scaleAnim }],
            alignItems: 'center'
        }}>
          <Text style={styles.logoText}>SNEACKSCAN</Text>
          <Text style={styles.subText}>{"L'IA au bout des pieds"}</Text>
        </Animated.View>

        {/* Ligne Laser de Scan */}
        <Animated.View 
          style={[
            styles.scanLine, 
            { 
              transform: [{ translateY }],
              opacity: lineOpacity
            }
          ]} 
        />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="CameraScreen" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#050505', // Noir très profond
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 4,
    textAlign: 'center',
    // Effet Néon (Glow)
    textShadowColor: 'rgba(30, 144, 255, 0.8)', // Bleu électrique
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subText: {
    marginTop: 15,
    fontSize: 14,
    color: '#1e90ff',
    textAlign: 'center',
    letterSpacing: 6, // Très espacé pour faire "Tech"
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  scanLine: {
    position: 'absolute',
    width: width * 0.8, // 80% de la largeur
    height: 2,
    backgroundColor: '#1e90ff', // Couleur du laser
    // Effet de lumière autour du laser
    shadowColor: '#1e90ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 15,
    elevation: 10, // Pour Android
  }
});