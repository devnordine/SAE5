const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Connexion BDD
const pool = new Pool({
  user: 'sneackuser',
  host: 'db', 
  database: 'sneackscan_db',
  password: 'sneackpassword',
  port: 5432,
});

// Ta liste de modèles
const sneakersMapping = [
  { raw: "adidas_forum_low", name: "Adidas Forum Low", brand: "Adidas" },
  { raw: "adidas_spezial", name: "Adidas Spezial", brand: "Adidas" },
  { raw: "asics_gel-kayano", name: "Asics Gel-Kayano", brand: "Asics" },
  { raw: "asics_gel-nyc", name: "Asics Gel-NYC", brand: "Asics" },
  { raw: "jordan_4", name: "Air Jordan 4", brand: "Jordan" },
  { raw: "new_balance_2002r", name: "New Balance 2002R", brand: "New Balance" },
  { raw: "new_balance_530", name: "New Balance 530", brand: "New Balance" },
  { raw: "new_balance_550", name: "New Balance 550", brand: "New Balance" },
  { raw: "nike_dunk_low", name: "Nike Dunk Low", brand: "Nike" },
  { raw: "nike_p6000", name: "Nike P-6000", brand: "Nike" }
];

const boutiques = ["StockX", "GOAT", "Wethenew", "Nike", "Foot Locker"];

// Chemin vers les fichiers du modèle (Adaptez si votre dossier est différent)
const MODEL_DIR = path.join(__dirname, 'assets/model');

const seed = async () => {
  try {
    console.log("🌱 Démarrage du script de reset total...");

    // =============================================
    // 1. SUPPRESSION & CRÉATION DES TABLES
    // =============================================
    console.log("🏗️  Création de l'architecture de la BDD...");
    
    // On supprime tout pour repartir propre (Ordre important pour les clés étrangères)
    await pool.query('DROP TABLE IF EXISTS stats CASCADE');
    await pool.query('DROP TABLE IF EXISTS history CASCADE');
    await pool.query('DROP TABLE IF EXISTS ai_models CASCADE'); // <--- AJOUT
    await pool.query('DROP TABLE IF EXISTS sneakers CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

    // 1.1 Table USERS
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        nom VARCHAR(100),
        prenom VARCHAR(100),
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1.2 Table SNEAKERS
    await pool.query(`
      CREATE TABLE sneakers (
        id SERIAL PRIMARY KEY,
        model_name VARCHAR(150) UNIQUE NOT NULL,
        brand VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1.3 Table HISTORY (Modifiée avec status)
    await pool.query(`
      CREATE TABLE history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        sneaker_id INTEGER REFERENCES sneakers(id) ON DELETE SET NULL,
        confidence FLOAT,
        image_url TEXT,
        lien_achat TEXT,
        boutique_nom VARCHAR(100),
        prix_trouver DECIMAL(10, 2),
        scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'en attente' CHECK (status IN ('validé', 'en attente', 'refuser'))
      )
    `);

    // 1.4 Table STATS
    await pool.query(`
      CREATE TABLE stats (
        id_stats SERIAL PRIMARY KEY,
        id_users INTEGER REFERENCES users(id) ON DELETE CASCADE,
        id_sneakers INTEGER REFERENCES sneakers(id) ON DELETE CASCADE,
        prix_afficher DECIMAL(10, 2),
        a_cliquer_achat BOOLEAN DEFAULT FALSE,
        score_confiance FLOAT,
        date_heure TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1.5 Table AI_MODELS (Nouvelle table)
    await pool.query(`
      CREATE TABLE ai_models (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        file_data BYTEA NOT NULL,
        version VARCHAR(50) DEFAULT '1.0',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Tables créées avec succès.");

    // =============================================
    // 2. REMPLISSAGE DES DONNÉES UTILISATEURS / SNEAKERS
    // =============================================

    // Création Admin
    const hashKaiss = await bcrypt.hash('kaissdev', 10);
    const adminRes = await pool.query(
      `INSERT INTO users (username, email, nom, prenom, password, role) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      ['kaiss', 'kaiss@sneackscan.com', 'Bouchatrouch', 'Kaiss', hashKaiss, 'admin']
    );
    const adminId = adminRes.rows[0].id;
    console.log("👑 Admin créé : kaiss / kaissdev");

    // Création Users lambda
    const userIds = [adminId];
    for (let i = 1; i <= 10; i++) {
      const hash = await bcrypt.hash('password', 10);
      const res = await pool.query(
        `INSERT INTO users (username, email, nom, prenom, password, role) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [`user${i}`, `user${i}@test.com`, `Nom${i}`, `Prenom${i}`, hash, 'user']
      );
      userIds.push(res.rows[0].id);
    }

    // Création Catalogue Sneakers
    const sneakerMap = {}; 
    for (const item of sneakersMapping) {
      const res = await pool.query(
        `INSERT INTO sneakers (model_name, brand) VALUES ($1, $2) RETURNING id`,
        [item.name, item.brand]
      );
      sneakerMap[item.name] = res.rows[0].id;
    }
    console.log("👟 Catalogue initialisé.");

    // =============================================
    // 3. UPLOAD DES FICHIERS DU MODÈLE IA
    // =============================================
    console.log("🤖 Importation des fichiers du modèle IA...");
    const modelFiles = [
        'model.json',
        'group1-shard1of3.bin',
        'group1-shard2of3.bin',
        'group1-shard3of3.bin'
    ];

    if (fs.existsSync(MODEL_DIR)) {
        for (const file of modelFiles) {
            const filePath = path.join(MODEL_DIR, file);
            if (fs.existsSync(filePath)) {
                const fileData = fs.readFileSync(filePath);
                await pool.query(
                    `INSERT INTO ai_models (filename, file_data) VALUES ($1, $2)`,
                    [file, fileData]
                );
                console.log(`   📄 Fichier ajouté : ${file}`);
            } else {
                console.warn(`   ⚠️ Fichier manquant : ${file} (Vérifiez le dossier assets/model)`);
            }
        }
    } else {
        console.warn(`   ❌ Dossier modèle introuvable à : ${MODEL_DIR}`);
    }


    // =============================================
    // 4. GÉNÉRATION HISTORY & STATS
    // =============================================
    console.log("🎲 Génération de 300 scans...");
    
    for (let i = 0; i < 300; i++) {
      const randomUser = userIds[Math.floor(Math.random() * userIds.length)];
      const randomSneakerObj = sneakersMapping[Math.floor(Math.random() * sneakersMapping.length)];
      const sneakerId = sneakerMap[randomSneakerObj.name];
      const randomBoutique = boutiques[Math.floor(Math.random() * boutiques.length)];
      
      const prix = Math.floor(Math.random() * (400 - 100) + 100);
      const conf = (Math.random() * (0.99 - 0.75) + 0.75).toFixed(2);
      
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 30));
      date.setHours(Math.floor(Math.random() * 14) + 8); 
      
      const aAchete = Math.random() < 0.2; 
      
      // Génération aléatoire d'un statut
      const statuts = ['validé', 'en attente', 'refuser'];
      // Poids : plus de chance d'avoir 'validé' ou 'en attente'
      const randomStatus = statuts[Math.floor(Math.random() * statuts.length)];

      await pool.query(
        `INSERT INTO history (user_id, sneaker_id, confidence, image_url, boutique_nom, prix_trouver, scan_date, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [randomUser, sneakerId, conf, '/uploads/placeholder.jpg', randomBoutique, prix, date, randomStatus]
      );

      await pool.query(
        `INSERT INTO stats (id_users, id_sneakers, prix_afficher, a_cliquer_achat, score_confiance, date_heure) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUser, sneakerId, prix, aAchete, conf, date]
      );
    }

    console.log("✅ TERMINÉ ! La base de données est à jour (Modèles + Status).");
    process.exit(0);

  } catch (e) {
    console.error("❌ Erreur :", e);
    process.exit(1);
  }
};

seed();