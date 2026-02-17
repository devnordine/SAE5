const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const axios = require('axios');
const { google } = require('googleapis');

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

// ==========================================
// ☁️ CONFIGURATION GOOGLE DRIVE (VERSION INTELLIGENTE)
// ==========================================

// Remplace par l'ID de ton dossier parent "DATASET_SNEAKSCAN"
const DRIVE_PARENT_FOLDER_ID = 'TON_ID_DE_DOSSIER_ICI'; 

const auth = new google.auth.GoogleAuth({
  keyFile: './google-drive-key.json',
  scopes: ['https://www.googleapis.com/auth/drive'], // Scope un peu plus large pour gérer les dossiers
});
const drive = google.drive({ version: 'v3', auth });

// Fonction 1 : Chercher ou Créer le dossier de la paire
async function getOrCreateFolder(folderName, parentId) {
  try {
    // On cherche si un dossier avec ce nom existe déjà dans le parent
    // Note : On échappe les guillemets simples dans le nom pour éviter les bugs
    const safeName = folderName.replace(/'/g, "\\'");
    const query = `mimeType='application/vnd.google-apps.folder' and name='${safeName}' and '${parentId}' in parents and trashed=false`;
    
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (res.data.files.length > 0) {
      // Le dossier existe, on retourne son ID
      return res.data.files[0].id;
    } else {
      // Le dossier n'existe pas, on le crée
      console.log(`📂 Création du dossier Drive pour : ${folderName}`);
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      };
      const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
      });
      return file.data.id;
    }
  } catch (err) {
    console.error("Erreur gestion dossier Drive:", err);
    throw err;
  }
}

// Fonction 2 : Upload l'image dans le bon sous-dossier
async function uploadToDrive(filePath, fileName, shoeName) {
  try {
    // Étape A : Récupérer l'ID du sous-dossier (ex: ID du dossier "Nike Dunk Low")
    const folderId = await getOrCreateFolder(shoeName, DRIVE_PARENT_FOLDER_ID);
    
    // Étape B : Upload l'image dedans
    const fileMetadata = {
      name: fileName,
      parents: [folderId], // <--- On met l'ID du sous-dossier ici !
    };
    
    const media = {
      mimeType: 'image/jpeg',
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });
    
    return response.data.id;
  } catch (error) {
    console.error('Erreur Upload Drive:', error);
    throw error;
  }
}

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

// ROUTE HISTORY : Renvoie du texte (via JOIN) pour que le frontend comprenne
app.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const query = `
        SELECT 
            h.id, h.confidence, h.image_url, h.lien_achat, h.boutique_nom, h.prix_trouver, h.scan_date,
            s.model_name AS shoe_name 
        FROM history h
        LEFT JOIN sneakers s ON h.sneaker_id = s.id
        WHERE h.user_id = $1 
        ORDER BY h.scan_date DESC
    `;
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
      console.log(`🚀 Confiance ${score} (>0.6). Envoi Drive...`);
      const cleanName = shoe_name.replace(/\s+/g, '_').toLowerCase();
      const driveFileName = `${cleanName}_${Date.now()}.jpg`;

      try {
        const driveId = await uploadToDrive(file.path, driveFileName, shoe_name);
        fs.unlink(file.path, (e) => { if(e) console.error(e); });
        storedImageUrl = `drive:${driveId}`;
      } catch (driveErr) {
        console.error("Échec upload Drive, conservation locale:", driveErr);
      }
    } else {
      console.log(`⚠️ Confiance ${score} (<0.6). Mise en attente locale.`);
    }

    // --- CORRECTION ICI : on utilise 'date' au lieu de 'scan_date' ---
    await pool.query(
      `INSERT INTO history (user_id, shoe_name, confidence, image_url, boutique_nom, prix_trouver, status, date) 
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
            console.log(`👨‍⚖️ Validation : Déplacement vers Drive/${corrected_name}...`);

            const cleanName = corrected_name.replace(/\s+/g, '_').toLowerCase();
            const driveFileName = `${cleanName}_validated_${Date.now()}.jpg`;

            // Ici aussi, on utilise le nom corrigé pour trouver/créer le bon dossier
            const driveId = await uploadToDrive(localFilePath, driveFileName, corrected_name);

            fs.unlinkSync(localFilePath);
            
            await pool.query(
                `UPDATE history SET status = 'validé', shoe_name = $1, image_url = $2 WHERE id = $3`,
                [corrected_name, `drive:${driveId}`, history_id]
            );

            res.json({ success: true, message: "Validé et classé sur Drive" });
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



const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Serveur Hybrid (EdgeAI + 3NF) lancé sur le port ${PORT}`));

module.exports = app;