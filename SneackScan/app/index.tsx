// app/index.tsx
import { Link } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>👟 SneakScan</Text>
      <Text style={styles.subtitle}>Reconnaissance de modèles de sneakers</Text>

      <Link href="/CameraScreen" asChild>
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Ouvrir la caméra</Text>
        </TouchableOpacity>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '800', color: '#1e90ff' },
  subtitle: { fontSize: 16, color: '#555', marginVertical: 8, textAlign: 'center' },
  button: { marginTop: 30, backgroundColor: '#1e90ff', paddingVertical: 14, paddingHorizontal: 26, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});