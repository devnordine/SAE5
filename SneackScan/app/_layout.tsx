// app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

export default function Layout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#1e90ff' }, headerTintColor: '#fff' }}>
        <Stack.Screen name="index" options={{ title: 'Accueil' }} />
        <Stack.Screen name="CameraScreen" options={{ title: 'Scanner une chaussure' }} />
      </Stack>
      <StatusBar style="light" />
    </View>
  );
}