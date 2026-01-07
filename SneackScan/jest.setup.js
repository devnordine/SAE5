// Mock d'AsyncStorage (Stockage téléphone)
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
  );
  
  // Mock de la Navigation (Expo Router)
  jest.mock('expo-router', () => ({
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
    }),
  }));
  
  // Mock des Icônes
  jest.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
  }));
  
  // Mock des polices (Font)
  jest.mock('expo-font', () => ({
    isLoaded: jest.fn(() => true),
    loadAsync: jest.fn(() => Promise.resolve()),
  }));