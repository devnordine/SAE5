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
app.use('/uploads', express.static('uploads'));

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
// Met false si tu veux utiliser la vraie API RapidAPI (attention aux quotas)
const USE_TEST_MODE = true; 

const pool = new Pool({
  user: 'sneackuser',
  host: 'db', 
  database: 'sneackscan_db',
  password: 'sneackpassword',
  port: 5432,
});



// ==========================================
// 🏗️ INITIALISATION DES TABLES (Architecture Pro 3NF)
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

    // 2. Table HISTORY (Mise à jour avec le statut)
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
        scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'en attente' CHECK (status IN ('validé', 'en attente', 'refuser'))
      );
    `);
    
    // Si la table existait déjà sans la colonne status, on l'ajoute manuellement (Migration simple)
    try {
        await pool.query(`ALTER TABLE history ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'en attente' CHECK (status IN ('validé', 'en attente', 'refuser'));`);
    } catch (e) { /* Ignore si déjà présent */ }

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

    // 4. NOUVELLE TABLE : AI MODELS
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_models (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        file_data BYTEA NOT NULL,
        version VARCHAR(50) DEFAULT '1.0',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Migration rôle users si nécessaire
    try {
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';`);
    } catch (e) { /* Ignore */ }

    console.log("✅ Tables synchronisées (Users, History, Stats, AI Models).");
  } catch (err) {
    console.error("❌ Erreur initDB :", err);
  }
};

initDB();

// Config Multer pour les images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => { cb(null, Date.now() + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });



// Middleware Admin
const verifyAdmin = async (req, res, next) => {
    const userId = req.headers['x-user-id']; 
    if (!userId) return res.status(401).json({ error: "Non autorisé" });
    try {
        const result = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
        if (result.rows.length > 0 && result.rows[0].role === 'admin') next();
        else res.status(403).json({ error: "Accès refusé" });
    } catch (e) { res.status(500).json({ error: "Erreur serveur" }); }
};

// ==========================================
// 🔄 HELPER FUNCTIONS (Logique Métier)
// ==========================================

// Traduit un nom (ex: "Nike Air") en ID de base de données
async function getSneakerIdFromName(name) {
    if (!name) return null;
    // Vérifie si existe
    let res = await pool.query('SELECT id FROM sneakers WHERE model_name = $1', [name]);
    if (res.rows.length > 0) return res.rows[0].id;
    // Sinon crée
    res = await pool.query('INSERT INTO sneakers (model_name) VALUES ($1) RETURNING id', [name]);
    return res.rows[0].id;
}

// Récupère le prix (Mock ou API)
async function fetchSneakerPrice(shoeName) {
  if (USE_TEST_MODE) {
    await new Promise(resolve => setTimeout(resolve, 500)); 
    const fakePrice = Math.floor(Math.random() * (300 - 100 + 1) + 100);
    return { boutique: "Mode Test (StockX)", prix: fakePrice, lien: "https://stockx.com" };
  }

  try {
    const options = {
      method: 'GET',
      url: 'https://sneaker-database-stockx.p.rapidapi.com/getproducts',
      params: { keywords: shoeName, limit: '1' },
      headers: {
        'X-RapidAPI-Key': '32f6e2ba00msh2a4a01101d815afp145df6jsn3dc64d379e11', 
        'X-RapidAPI-Host': 'sneaker-database-stockx.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    if (response.data && response.data.length > 0) {
      const product = response.data[0];
      return { 
          boutique: "StockX", 
          prix: product.lowestResellPrice?.stockX || 0, 
          lien: product.resellLinks?.stockX || "" 
      };
    }
    return { boutique: "Non trouvé", prix: 0, lien: "" };

  } catch (error) {
    return { boutique: "Indisponible", prix: 0, lien: "" };
  }
}

// ==========================================
// 📊 ROUTES ADMIN (Mises à jour avec JOIN)
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
// ICI on fait un JOIN pour récupérer le nom du modèle via l'ID
app.get('/admin/stats/models', verifyAdmin, async (req, res) => {
    try {
        const query = `
            SELECT 
                s.model_name as modele_detecter,
                COUNT(st.id_stats) as nb_scans
            FROM stats st
            JOIN sneakers s ON st.id_sneakers = s.id
            GROUP BY s.model_name
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

app.get('/admin/users', verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, email, role, created_at FROM users ORDER BY id DESC');
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

// --- Route pour télécharger les fichiers du modèle (JSON & BIN) ---
app.get('/api/model/:filename', async (req, res) => {
  const { filename } = req.params;
  try {
    // On cherche le fichier dans la BDD
    const result = await pool.query('SELECT file_data FROM ai_models WHERE filename = $1', [filename]);
    
    if (result.rows.length > 0) {
      const fileData = result.rows[0].file_data;
      
      // On dit au navigateur/téléphone quel type de fichier c'est
      if (filename.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }
      
      res.send(fileData);
    } else {
      res.status(404).send('Fichier introuvable dans la BDD');
    }
  } catch (err) {
    console.error("Erreur téléchargement modèle:", err);
    res.status(500).send('Erreur serveur');
  }
});

// --- Route pour vérifier la version du modèle ---
app.get('/api/model-version', async (req, res) => {
  try {
    // On prend la date de création du model.json
    const result = await pool.query(
      "SELECT created_at FROM ai_models WHERE filename = 'model.json'"
    );
    if (result.rows.length > 0) {
      res.json({ version: result.rows[0].created_at });
    } else {
      res.json({ version: null });
    }
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ==========================================
// 🚀 ROUTES UTILISATEURS (Compatibles Frontend)
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

// ROUTE SCAN : Reçoit du texte, mais enregistre un ID
app.post('/scan', upload.single('photo'), async (req, res) => {
  try {
    const { userId, shoeName, confidence } = req.body;
    const imageUrl = `/uploads/${req.file.filename}`;
    
    // 1. Récupérer infos marché
    const marketData = await fetchSneakerPrice(shoeName);
    
    // 2. Transformer le nom en ID (Architecture Normalisée)
    const sneakerId = await getSneakerIdFromName(shoeName);

    // 3. Sauvegarder
    const result = await pool.query(
      `INSERT INTO history 
      (user_id, sneaker_id, confidence, image_url, lien_achat, boutique_nom, prix_trouver) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING id`,
      [userId, sneakerId, confidence, imageUrl, marketData.lien, marketData.boutique, marketData.prix]
    );

    res.json({ success: true, id: result.rows[0].id, imageUrl, marketData });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ROUTE STATS : Reçoit du texte, mais enregistre un ID
app.post('/stats', async (req, res) => {
  try {
    const { id_users, modele_detecter, prix_afficher, a_cliquer_achat, score_confiance } = req.body;
    
    // Transformer le nom en ID
    const idSneaker = await getSneakerIdFromName(modele_detecter);

    const result = await pool.query(
      `INSERT INTO stats (id_users, id_sneakers, prix_afficher, a_cliquer_achat, score_confiance) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id_stats`,
      [id_users, idSneaker, prix_afficher, a_cliquer_achat, score_confiance]
    );
    res.json({ success: true, id_stats: result.rows[0].id_stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ROUTE HISTORY : Corrigée pour exclure les scans refusés
app.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const query = `
        SELECT 
            id, confidence, image_url, lien_achat, boutique_nom, prix_trouver, scan_date, shoe_name, status
        FROM history
        WHERE user_id = $1 AND status != 'refuser'
        ORDER BY scan_date DESC
    `;
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (e) { 
    console.error("Erreur History:", e);
    res.status(500).json({ error: e.message }); 
  }
});



// ==========================================
// 👟 ROUTES SCAN & VALIDATION
// ==========================================

// Route SCAN RESULT (Corrigée pour la colonne 'date')
app.post('/api/scan-result', upload.single('image'), async (req, res) => {
  const file = req.file; 
  const { user_id, shoe_name, confidence, boutique_nom, prix_trouver } = req.body;

  if (!file) return res.status(400).json({ error: 'Aucune image reçue' });

  const score = parseFloat(confidence);
  const isHighConfidence = score >= 0.60;
  
  let status = isHighConfidence ? 'validé' : 'en attente';
  let storedImageUrl = `/uploads/${file.filename}`;

  try {
    if (isHighConfidence) {
      console.log(`🚀 Confiance ${score} (>0.6). Sauvegarde dans le dataset local...`);
      const cleanName = shoe_name.replace(/\s+/g, '_').toLowerCase();
      const datasetDir = path.join(__dirname, 'uploads', 'dataset', cleanName);
      
      if (!fs.existsSync(datasetDir)) fs.mkdirSync(datasetDir, { recursive: true });

      const newFileName = `${cleanName}_${Date.now()}.jpg`;
      const newFilePath = path.join(datasetDir, newFileName);
      
      fs.renameSync(file.path, newFilePath);
      storedImageUrl = `/uploads/dataset/${cleanName}/${newFileName}`;
    } else {
      console.log(`⚠️ Confiance ${score} (<0.6). Mise en attente locale.`);
    }

    // --- CORRECTION ICI : on utilise 'date' au lieu de 'scan_date' ---
    await pool.query(
      `INSERT INTO history (user_id, shoe_name, confidence, image_url, boutique_nom, prix_trouver, status, scan_date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [user_id || 1, shoe_name, score, storedImageUrl, boutique_nom, prix_trouver, status]
    );

    res.json({ 
      success: true, 
      status: status,
      marketData: { prix: prix_trouver || 0, boutique: boutique_nom || "Inconnu", lien: null }
    });

  } catch (err) {
    console.error("Erreur traitement scan:", err);
    res.status(500).json({ error: "Erreur interne serveur" });
  }
});

app.post('/api/admin/validate-scan', async (req, res) => {
  const { history_id, corrected_name } = req.body;

  try {
    const result = await pool.query('SELECT * FROM history WHERE id = $1', [history_id]);
    if (result.rows.length === 0) return res.status(404).send("Scan introuvable");
    const scan = result.rows[0];

    // On vérifie que c'est une image locale
    if (scan.status === 'en attente' && scan.image_url.startsWith('/uploads/')) {
        const localFilePath = path.join(__dirname, scan.image_url);

if (fs.existsSync(localFilePath)) {
            const cleanName = corrected_name.replace(/\s+/g, '_').toLowerCase();
            const datasetDir = path.join(__dirname, 'uploads', 'dataset', cleanName);
            
            if (!fs.existsSync(datasetDir)) fs.mkdirSync(datasetDir, { recursive: true });

            const newFileName = `${cleanName}_${Date.now()}.jpg`;
            const newFilePath = path.join(datasetDir, newFileName);

            console.log(`👨‍⚖️ Validation : Déplacement vers le dataset local -> ${newFilePath}`);
            
            // On déplace l'image
            fs.renameSync(localFilePath, newFilePath);
            
            // On met à jour la BDD
            const newDbUrl = `/uploads/dataset/${cleanName}/${newFileName}`;
            await pool.query(
                `UPDATE history SET status = 'validé', shoe_name = $1, image_url = $2 WHERE id = $3`,
                [corrected_name, newDbUrl, history_id]
            );

            res.json({ success: true, message: "Validé et classé dans le dataset du VPS" });
        } else {
            res.status(404).send("Fichier introuvable");
        }
    } else {
        res.status(400).send("Scan non valide pour upload");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Erreur");
  }
});

// ==========================================
// 👮 ROUTES ADMIN (TINDER STYLE)
// ==========================================

// 1. Récupérer tous les scans en attente
app.get('/api/admin/pending', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM history WHERE status = 'en attente' ORDER BY scan_date DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération pending" });
  }
});

// 2. Rejeter un scan (Supprimer l'image ou marquer comme refusé)
app.post('/api/admin/reject-scan', async (req, res) => {
  const { history_id } = req.body;
  try {
    // Option A : On supprime tout (si c'est du spam)
    // Option B : On marque 'refusé' pour garder une trace
    await pool.query("UPDATE history SET status = 'refuser' WHERE id = $1", [history_id]);
    
    // On peut aussi supprimer l'image locale pour gagner de la place
    const fileRes = await pool.query("SELECT image_url FROM history WHERE id = $1", [history_id]);
    if (fileRes.rows.length > 0 && fileRes.rows[0].image_url.startsWith('/uploads/')) {
        const filePath = path.join(__dirname, fileRes.rows[0].image_url);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur rejet" });
  }
});

// ==========================================
// 🧠 ROUTE MISE À JOUR MODÈLE (Depuis Colab)
// ==========================================

// Configuration Multer spéciale pour accepter JSON et BIN sans renommage
const uploadModel = multer({ storage: multer.memoryStorage() });

app.post('/api/admin/update-model', uploadModel.any(), async (req, res) => {
  // Sécurité basique : Tu peux ajouter un check de token ici si tu veux
  // const secret = req.headers['x-api-key'];
  // if (secret !== 'MON_SUPER_SECRET') return res.status(403).send('Interdit');

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Aucun fichier reçu" });
    }

    console.log(`🧠 Réception d'une mise à jour modèle : ${req.files.length} fichiers.`);

    // On boucle sur chaque fichier reçu (model.json, group1-shard1of3.bin, etc.)
    for (const file of req.files) {
      const filename = file.originalname;
      const fileData = file.buffer;

      // On met à jour ou on insère (Upsert)
      await pool.query(
        `INSERT INTO ai_models (filename, file_data, version) 
         VALUES ($1, $2, 'auto-update') 
         ON CONFLICT (filename) 
         DO UPDATE SET file_data = EXCLUDED.file_data, created_at = NOW();`,
        [filename, fileData]
      );
      console.log(`   ✅ Fichier mis à jour : ${filename}`);
    }

    res.json({ success: true, message: "Modèle mis à jour avec succès sur le VPS !" });

  } catch (err) {
    console.error("Erreur update model:", err);
    res.status(500).json({ error: err.message });
  }
});
// ==========================================
// 🤖 ROUTE IA (Pour Kaggle)
// ==========================================
app.get('/api/admin/export-dataset', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT shoe_name, image_url FROM history WHERE status = 'validé' AND image_url LIKE '/uploads/dataset/%'"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erreur lors de l'export" });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Serveur Hybrid (EdgeAI + 3NF) lancé sur le port ${PORT}`));

module.exports = app;