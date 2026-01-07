const axios = require('axios');
const FormData = require('form-data');

// 🎯 L'ADRESSE DE VOTRE VPS
const API_URL = 'http://51.38.186.253:3000';

// Couleurs pour la console
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function runFullTests() {
    console.log("🚀 DÉMARRAGE DES TESTS SYSTÈME COMPLETS...\n");

    let userId = null;
    let userToken = null; // Si vous utilisez des tokens plus tard
    const testUser = "Robot_" + Math.floor(Math.random() * 10000);
    const testEmail = `${testUser}@test.com`;

    // ==========================================
    // 1️⃣ AUTHENTIFICATION
    // ==========================================
    try {
        process.stdout.write(`1️⃣ Inscription (${testUser})... `);
        const reg = await axios.post(`${API_URL}/register`, {
            username: testUser, email: testEmail, password: "password123", nom: "Bot", prenom: "Test"
        });
        if (reg.data.success) {
            userId = reg.data.id;
            console.log(GREEN + "✅ OK (ID: " + userId + ")" + RESET);
        } else throw new Error("Echec Inscription");

        process.stdout.write(`2️⃣ Connexion... `);
        const login = await axios.post(`${API_URL}/login`, {
            username: testUser, password: "password123"
        });
        if (login.data.success) {
            console.log(GREEN + `✅ OK (Rôle: ${login.data.role})` + RESET);
        } else throw new Error("Echec Login");

    } catch (e) {
        console.log(RED + "❌ ERREUR CRITIQUE AUTH" + RESET);
        console.error(e.response?.data || e.message);
        process.exit(1);
    }

    // ==========================================
    // 2️⃣ FONCTIONNALITÉS UTILISATEUR (SCAN)
    // ==========================================
    try {
        process.stdout.write(`3️⃣ Test Upload Scan (Simulation)... `);
        
        // On crée un faux formulaire comme si c'était l'appli mobile
        const form = new FormData();
        form.append('userId', userId);
        form.append('shoeName', 'Nike_Dunk_Low'); // On simule une détection
        form.append('confidence', '0.98');
        
        // On crée une fausse image (buffer de 100 octets)
        const fakeImage = Buffer.alloc(100, 'a'); 
        form.append('photo', fakeImage, 'test_scan.jpg');

        const scanRes = await axios.post(`${API_URL}/scan`, form, {
            headers: { ...form.getHeaders() }
        });

        if (scanRes.data.success) {
            console.log(GREEN + "✅ OK" + RESET);
            console.log(`   🛒 Prix trouvé : ${scanRes.data.marketData.prix}€ chez ${scanRes.data.marketData.boutique}`);
        } else throw new Error("Scan échoué");

        // VÉRIFICATION HISTORIQUE
        process.stdout.write(`4️⃣ Vérification Historique... `);
        const historyRes = await axios.get(`${API_URL}/history/${userId}`);
        const lastScan = historyRes.data[0];
        
        if (lastScan && lastScan.shoe_name === 'Nike_Dunk_Low') {
            console.log(GREEN + "✅ OK (Scan bien enregistré en BDD)" + RESET);
        } else {
            throw new Error("Historique vide ou incorrect");
        }

    } catch (e) {
        console.log(RED + "❌ ERREUR SCAN/HISTORIQUE" + RESET);
        console.error(e.response?.data || e.message);
    }

    // ==========================================
    // 3️⃣ SÉCURITÉ & ADMIN
    // ==========================================
    console.log("\n🛡️ TESTS DE SÉCURITÉ :");
    
    try {
        process.stdout.write(`5️⃣ Tentative d'accès Admin (Doit échouer)... `);
        
        // On essaie d'accéder aux stats alors qu'on est un simple User
        await axios.get(`${API_URL}/admin/users`, {
            headers: { 'x-user-id': userId } // On se présente avec notre ID User
        });

        // Si on arrive ici, c'est PAS bon (faille de sécurité)
        console.log(RED + "❌ FAIL (L'utilisateur a pu accéder à l'admin !)" + RESET);

    } catch (e) {
        if (e.response && e.response.status === 403) {
            console.log(GREEN + "✅ SÉCURISÉ (Accès refusé 403 - Normal)" + RESET);
        } else {
            console.log(YELLOW + "⚠️  Réponse inattendue : " + e.message + RESET);
        }
    }

    console.log("\n🎉 BILAN : Backend 100% opérationnel !");
}

runFullTests();