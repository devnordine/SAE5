# SAE5 — SneackScan (Scan de baskets & prix en temps réel)

**SneackScan** est un projet réalisé dans le cadre de la **SAE5**.  
L’objectif est de **scanner des paires de baskets** et d’afficher leur **prix en temps réel** (ex: StockX), tout en conservant un **historique** et des **statistiques** côté backend.

Le projet comprend :
- une **application mobile** (Expo / React Native) dans `SneackScan/`
- un **backend Node.js / Express** (API sur le **port 3000**)
- une **base de données PostgreSQL**
- une exécution facilitée via **Docker** (backend + db)

---

## Sommaire
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Technologies](#technologies)
- [Lancer le projet](#lancer-le-projet)
  - [1) Backend + PostgreSQL (Docker)](#1-backend--postgresql-docker)
  - [2) Application mobile (Expo)](#2-application-mobile-expo)
- [Configuration / Variables d’environnement](#configuration--variables-denvironnement)
- [API — Routes principales](#api--routes-principales)
  - [Auth](#auth)
  - [Scan / Historique / Stats](#scan--historique--stats)
  - [Admin / Modèle IA / Dataset](#admin--modèle-ia--dataset)
- [Notes importantes](#notes-importantes)
- [Auteurs](#auteurs)
- [Licence](#licence)

---

## Fonctionnalités

### Côté utilisateur
- Création de compte / connexion
- Envoi d’un **scan** (image) au backend
- Récupération des informations du marché (prix + boutique + lien)
- Stockage et consultation de l’**historique** des scans

### Côté admin
- Accès à des **statistiques** (entonnoir scans→clics, top modèles, activité par heure, évolution de confiance)
- Gestion des scans en attente (validation / rejet)
- Gestion du **modèle IA** (upload en base + vérification de version)
- Export du dataset validé (pour entraînement Kaggle / Colab)

---

## Architecture

- **Mobile (Expo / React Native)** : scan + UI + appels API
- **API (Express)** : routes REST, logique métier, upload d’images (multer), récupération de prix (RapidAPI ou mode test)
- **PostgreSQL** : persistance (users, history, stats, ai_models, etc.)
- **Docker** : exécution reproductible des services (API + db)

---

## Technologies

- **Frontend mobile** : Expo, React Native
- **Backend** : Node.js, Express
- **Base de données** : PostgreSQL (`pg`)
- **Upload fichiers** : Multer
- **Sécurité** : bcrypt (hash mots de passe)
- **HTTP externe** : axios
- **Infra** : Docker / Docker Compose

---

## Lancer le projet

### Pré-requis
- Node.js (LTS) + npm
- Docker + Docker Compose
- (Optionnel) Expo Go sur smartphone

---

### 1) Backend + PostgreSQL (Docker)

> Le backend écoute sur **PORT = 3000** (dans `server.js`).

Démarrage (depuis le dossier où se trouve votre `docker-compose.yml`) :
```bash
docker compose up --build
```

Ensuite l’API est accessible sur :
- `http://localhost:3000`

> Si vous testez depuis un **téléphone**, `localhost` ne marche pas : utilisez l’**IP** de votre machine (ex: `http://192.168.1.20:3000`).

---

### 2) Application mobile (Expo)

```bash
cd SneackScan
npm install
npx expo start
```

---

## Configuration / Variables d’environnement

### Backend
Dans `server.js`, la connexion PostgreSQL est configurée avec :
- host: `db`
- database: `sneackscan_db`
- user: `sneackuser`
- password: `sneackpassword`
- port: `5432`

Le backend utilise un flag :
- `USE_TEST_MODE = true`  
  - si `true` : prix “mock” aléatoire (mode test)
  - si `false` : appel API RapidAPI (attention quotas / clé)

> Recommandation : mettre ces valeurs dans un `.env` + `process.env` (plus propre), surtout la clé RapidAPI.

### Mobile
Prévoir une URL d’API (exemple) :
- `EXPO_PUBLIC_API_URL=http://<IP_PC>:3000`

---

## API — Routes principales

> Base URL : `http://localhost:3000` (ou IP de la machine sur mobile)

### Auth

#### `POST /register`
Crée un utilisateur.
- body JSON : `username`, `email`, `nom`, `prenom`, `password`

#### `POST /login`
Connexion utilisateur.
- body JSON : `username`, `password`
- réponse : `id`, `prenom`, `role` si OK

---

### Scan / Historique / Stats

#### `POST /scan`
Upload d’une image + infos de scan (champ fichier `photo`).
- multipart/form-data :
  - `photo` (file)
  - `userId`
  - `shoeName`
  - `confidence`
- réponse : `marketData` (boutique, prix, lien) + `imageUrl`

#### `GET /history/:userId`
Retourne l’historique (en excluant les scans `refuser`).

#### `POST /stats`
Enregistre une stat de scan (click achat, confiance, prix affiché, etc.)
- body JSON : `id_users`, `modele_detecter`, `prix_afficher`, `a_cliquer_achat`, `score_confiance`

---

### Admin / Modèle IA / Dataset

#### `GET /admin/stats/funnel` (admin)
Total scans vs clics achat

#### `GET /admin/stats/models` (admin)
Top 5 modèles scannés

#### `GET /admin/stats/activity` (admin)
Activité par heure

#### `GET /admin/stats/evolution` (admin)
Évolution sur 30 jours

#### `GET /admin/users` (admin)
Liste des utilisateurs

#### `GET /admin/check/:userId`
Vérifie si un utilisateur est admin

> Certaines routes admin utilisent un header : `x-user-id` (voir middleware `verifyAdmin`).

---

#### `GET /api/model/:filename`
Télécharge un fichier du modèle IA stocké en base (ex: `model.json`, `.bin`)

#### `GET /api/model-version`
Retourne la “version” basée sur `created_at` de `model.json`

#### `POST /api/admin/update-model`
Upload des fichiers du modèle (JSON/BIN) en base (multer memoryStorage).

---

#### `POST /api/scan-result`
Upload d’un scan (champ fichier `image`) + enregistrement en `history`, avec statut :
- `validé` si confiance >= 0.60 (et classement dans `uploads/dataset/...`)
- sinon `en attente`

#### `GET /api/admin/pending`
Liste des scans en attente

#### `POST /api/admin/validate-scan`
Valide un scan en attente + correction du nom + déplacement dans dataset

#### `POST /api/admin/reject-scan`
Rejette un scan (status `refuser`) + suppression éventuelle du fichier local

#### `GET /api/admin/export-dataset`
Exporte le dataset validé (shoe_name + image_url) pour entraînement.

---

## Notes importantes

- Les images sont servies via :
  - `GET /uploads/...` (dossier statique)
- Éviter de commit le dossier `.expo/` (spécifique machine)
- La clé RapidAPI est actuellement en dur : à sécuriser via variables d’environnement

---

## Auteurs
- À compléter (membres du groupe)

---

## Licence
Projet pédagogique (SAE5). Licence à préciser.
