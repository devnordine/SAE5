const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const axios = require('axios'); 

const app = express();
app.use(cors());
app.use(express.json());
// Dossier public pour les images
app.use('/uploads', express.static('uploads'));

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================

// 👇 MODE TEST : Mettez 'true' pour économiser vos requêtes API
const USE_TEST_MODE = true; 

// Configuration de la Base de Données
const pool = new Pool({
  user: 'sneackuser',
  host: 'db', 
  database: 'sneackscan_db',
  password: 'sneackpassword',
  port: 5432,
});

// ==========================================
// 🏗️ INITIALISATION DES TABLES
// ==========================================
const initDB = async () => {
  try {
    // 1. Table USERS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        nom VARCHAR(100),
        prenom VARCHAR(100),
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Table HISTORY
    await pool.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        shoe_name VARCHAR(100),
        confidence FLOAT,
        image_url TEXT,
        lien_achat TEXT,
        boutique_nom VARCHAR(100),
        prix_trouver DECIMAL(10, 2),
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Table STATS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stats (
        id_stats SERIAL PRIMARY KEY,
        id_users INTEGER REFERENCES users(id) ON DELETE CASCADE,
        modele_detecter VARCHAR(100),
        prix_afficher DECIMAL(10, 2),
        a_cliquer_achat BOOLEAN DEFAULT FALSE,
        score_confiance FLOAT,
        date_heure TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migration rôle si nécessaire
    try {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';`);
    } catch (e) { /* Ignore */ }

    console.log("✅ Tables synchronisées (Admin + Stats Graphiques activés).");
  } catch (err) {
    console.error("❌ Erreur initDB :", err);
  }
};

initDB();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// ==========================================
// 🛡️ MIDDLEWARE : VÉRIFICATION ADMIN
// ==========================================
const verifyAdmin = async (req, res, next) => {
    const userId = req.headers['x-user-id']; 
    if (!userId) return res.status(401).json({ error: "Non autorisé" });

    try {
        const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (result.rows.length > 0 && result.rows[0].role === 'admin') {
            next(); 
        } else {
            res.status(403).json({ error: "Accès refusé : Admin uniquement" });
        }
    } catch (e) {
        res.status(500).json({ error: "Erreur serveur vérification admin" });
    }
};

// ==========================================
// 🧠 MOTEUR DE PRIX
// ==========================================
async function fetchSneakerPrice(shoeName) {
  if (USE_TEST_MODE) {
    console.log(`⚠️ MODE TEST : Prix simulé pour ${shoeName}`);
    await new Promise(resolve => setTimeout(resolve, 600)); 
    const fakePrice = Math.floor(Math.random() * (250 - 110 + 1) + 110);
    return { boutique: "Mode Test (StockX)", prix: fakePrice, lien: "https://stockx.com" };
  }

  try {
    const options = {
      method: 'GET',
      url: 'https://sneaker-database-stockx.p.rapidapi.com/getproducts',
      params: { keywords: shoeName, limit: '1' },
      headers: {
        'X-RapidAPI-Key': 'VOTRE_CLE_RAPIDAPI_ICI', // ⚠️ Mettez votre clé ici
        'X-RapidAPI-Host': 'sneaker-database-stockx.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    
    if (response.data && response.data.length > 0) {
      const product = response.data[0];
      const competitors = [
        { name: 'StockX', price: product.lowestResellPrice?.stockX, link: product.resellLinks?.stockX },
        { name: 'GOAT', price: product.lowestResellPrice?.goat, link: product.resellLinks?.goat },
        { name: 'FlightClub', price: product.lowestResellPrice?.flightClub, link: product.resellLinks?.flightClub }
      ];

      let bestOffer = null;
      for (const shop of competitors) {
        if (shop.price && shop.price > 0) {
          if (!bestOffer || shop.price < bestOffer.price) {
            bestOffer = shop;
          }
        }
      }

      if (bestOffer) return { boutique: bestOffer.name, prix: bestOffer.price, lien: bestOffer.link || "" };
      if (product.retailPrice) return { boutique: "Retail (Estimé)", prix: product.retailPrice, lien: "" };
    }
    return { boutique: "Non trouvé", prix: 0, lien: "" };

  } catch (error) {
    return { boutique: "Indisponible", prix: 0, lien: "" };
  }
}

// ==========================================
// 📊 NOUVELLES ROUTES GRAPHIQUES (Admin)
// ==========================================

// 1. Entonnoir (Total Scans vs Clics Achat)
app.get('/admin/stats/funnel', verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                COUNT(*) as total_scans,
                COUNT(CASE WHEN a_cliquer_achat = true THEN 1 END) as total_clicks
            FROM stats
        `;
        const result = await pool.query(query);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Camembert (Top 5 des modèles scannés)
app.get('/admin/stats/models', verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                modele_detecter,
                COUNT(*) as nb_scans
            FROM stats
            WHERE modele_detecter IS NOT NULL
            GROUP BY modele_detecter
            ORDER BY nb_scans DESC
            LIMIT 5
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Graphique en barres (Activité par heure)
app.get('/admin/stats/activity', verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                EXTRACT(HOUR FROM date_heure)::INTEGER as heure,
                COUNT(*) as nb_scans
            FROM stats
            GROUP BY heure
            ORDER BY heure ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Courbe d'évolution (Confiance IA sur 30 jours)
app.get('/admin/stats/evolution', verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                DATE(date_heure) as jour,
                COUNT(*) as nb_scans,
                AVG(score_confiance) * 100 as score_moyen
            FROM stats
            WHERE date_heure >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(date_heure)
            ORDER BY jour ASC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==========================================
// 🚀 ROUTES STANDARDS
// ==========================================

app.post('/register', async (req, res) => {
  try {
    const { username, email, nom, prenom, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, email, nom, prenom, password, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [username, email, nom, prenom, hash, 'user']
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (match) return res.json({ success: true, id: user.id, prenom: user.prenom, role: user.role });
    }
    res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/scan', upload.single('photo'), async (req, res) => {
  try {
    const { userId, shoeName, confidence } = req.body;
    const imageUrl = `/uploads/${req.file.filename}`;
    const marketData = await fetchSneakerPrice(shoeName);
    
    const result = await pool.query(
      `INSERT INTO history 
      (user_id, shoe_name, confidence, image_url, lien_achat, boutique_nom, prix_trouver) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id`,
      [userId, shoeName, confidence, imageUrl, marketData.lien, marketData.boutique, marketData.prix]
    );

    res.json({ success: true, id: result.rows[0].id, imageUrl, marketData });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// Sauvegarde des stats quand l'utilisateur fait une action
app.post('/stats', async (req, res) => {
  try {
    const { id_users, modele_detecter, prix_afficher, a_cliquer_achat, score_confiance } = req.body;
    const result = await pool.query(
      `INSERT INTO stats (id_users, modele_detecter, prix_afficher, a_cliquer_achat, score_confiance) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id_stats`,
      [id_users, modele_detecter, prix_afficher, a_cliquer_achat, score_confiance]
    );
    res.json({ success: true, id_stats: result.rows[0].id_stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query('SELECT * FROM history WHERE user_id = $1 ORDER BY date DESC', [userId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/check/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (result.rows.length > 0 && result.rows[0].role === 'admin') {
            res.json({ isAdmin: true });
        } else {
            res.json({ isAdmin: false });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin/users', verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email, role, created_at FROM users ORDER BY id DESC');
        res.json(result.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/debug/scan', upload.single('photo'), async (req, res) => {
  try {
    const { source } = req.body;
    const imageUrl = `/uploads/${req.file.filename}`;
    
    console.log(`📸 Image ${source} reçue`);
    console.log(`   Fichier: ${req.file.filename}`);
    console.log(`   Taille: ${req.file.size} bytes`);
    
    res.json({ 
      success: true, 
      imageUrl,
      source,
      message: `Image sauvegardée pour debug`
    });
  } catch (e) { 
    res.status(500).json({ error: e.message }); 
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Serveur lancé sur le port ${PORT}`));