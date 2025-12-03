// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// On ajoute l'extension 'bin' pour les poids du modèle TensorFlow
config.resolver.assetExts.push('bin');

module.exports = config;