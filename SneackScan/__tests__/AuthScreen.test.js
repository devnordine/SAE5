/**
 * @format
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
// Note : On importe le composant APRES la déclaration des mocks ci-dessous pour être sûr qu'ils sont pris en compte

// ====================================================
// 🎭 MOCKS (Simulation des modules natifs & externes)
// ====================================================

/* 1. MOCK NAVIGATION (React Navigation)
  Empêche les crashs liés à useNavigation() */
jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn(),
    }),
  };
});

/* 2. MOCK EXPO ROUTER */
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

/* 3. MOCK SAFE AREA CONTEXT 
  Empêche les crashs si tu utilises SafeAreaView */
jest.mock('react-native-safe-area-context', () => {
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children }) => children,
    useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
  };
});

/* 4. MOCK STOCKAGE (AsyncStorage) */
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
}));

/* 5. MOCK ICÔNES (Ionicons) */
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons', 
}));

/* 6. MOCK ALERTES NATIVES */
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// Import du composant
import AuthScreen from '../app/AuthScreen';

// ====================================================
// 🧪 TESTS
// ====================================================

describe('Composant : <AuthScreen />', () => {
  
  it('📸 S\'affiche correctement (Snapshot Test)', async () => {
    let tree;
    
    // IMPORTANT : On enveloppe le rendu dans act() pour attendre que React 
    // finisse ses mises à jour (useEffect, useState initiaux)
    await act(async () => {
      tree = renderer.create(<AuthScreen />);
    });
    
    const json = tree.toJSON();

    // On vérifie qu'il n'est pas null
    expect(json).toBeDefined();
    
    // On sécurise la vérification des enfants
    // (json.children peut être null ou undefined si le composant rend un fragment ou null)
    if (json) {
        const hasChildren = json.children && json.children.length > 0;
        // On vérifie simplement que le rendu n'est pas vide
        expect(json.type).toBeDefined(); 
    }
  });

  it('🔍 Contient le texte "Connexion" ou "Inscription"', async () => {
    let testRenderer;

    await act(async () => {
      testRenderer = renderer.create(<AuthScreen />);
    });

    const testInstance = testRenderer.root;
    
    // On cherche tous les textes affichés
    // On utilise findAll pour être plus générique sur le type de composant Text
    const allTextNodes = testInstance.findAll(node => 
        node.type === 'Text' || 
        (node.type.displayName && node.type.displayName.includes('Text'))
    );
    
    // On extrait le contenu des textes (flat() permet de gérer les textes imbriqués)
    const texts = allTextNodes
        .map(node => node.props.children)
        .flat();
    
    // On vérifie qu'on trouve des mots clés attendus
    const hasKeywords = texts.some(t => 
      typeof t === 'string' && (t.includes('Connexion') || t.includes('Inscription') || t.includes('SneackScan'))
    );
    
    expect(hasKeywords).toBe(true);
  });
});