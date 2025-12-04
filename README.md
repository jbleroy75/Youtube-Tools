# 🎵 YouTube Tools

Outil web simple optimisé pour iPhone Pro Max pour télécharger et résumer des vidéos YouTube.

## ✨ Fonctionnalités

- **🎧 Audio MP3** - Télécharge l'audio en MP3 320kbps pour écouter hors-ligne
- **🎬 Vidéo HD** - Télécharge la vidéo en meilleure qualité (MP4)
- **💪 Playlist Gym** - Télécharge une playlist entière en MP3
- **📝 Résumé** - Génère un résumé en bullet points de la vidéo

## 🚀 Installation

### Prérequis

1. **Node.js 18+** - [nodejs.org](https://nodejs.org)
2. **yt-dlp** - Outil de téléchargement YouTube

```bash
# Installer yt-dlp sur macOS
brew install yt-dlp

# Ou avec pip
pip install yt-dlp
```

### Setup

```bash
# Aller dans le dossier
cd youtube-tools

# Installer les dépendances
npm install

# (Optionnel) Configurer la clé OpenAI pour les résumés
cp .env.example .env
# Édite .env et ajoute ta clé OPENAI_API_KEY

# Lancer le serveur
npm start
```

## 📱 Accès depuis iPhone

1. Lance le serveur sur ton Mac
2. Note l'adresse IP de ton Mac (Préférences Système > Réseau)
3. Sur ton iPhone, ouvre Safari et va sur `http://<IP-DU-MAC>:3000`
4. Ajoute à l'écran d'accueil pour une expérience app native !

### Trouver ton IP

```bash
ipconfig getifaddr en0
```

## 🔑 Configuration OpenAI (optionnel)

Pour la fonctionnalité de résumé automatique, tu as besoin d'une clé API OpenAI.

1. Va sur [platform.openai.com](https://platform.openai.com)
2. Crée une clé API
3. Ajoute-la dans le fichier `.env`:

```
OPENAI_API_KEY=sk-...
```

Sans clé, le résumé affichera les sous-titres bruts de la vidéo.

## 📁 Structure

```
youtube-tools/
├── server.js          # Backend Express
├── public/
│   └── index.html     # Frontend (SPA)
├── downloads/         # Fichiers téléchargés
├── package.json
├── .env.example
└── README.md
```

## ⚠️ Notes importantes

- Les fichiers téléchargés sont automatiquement supprimés après 24h
- Le téléchargement peut prendre quelques minutes selon la taille
- Utilise cet outil uniquement pour du contenu que tu as le droit de télécharger
- L'outil est conçu pour un usage personnel local

## 🛠️ Dépannage

### "yt-dlp n'est pas installé"
```bash
brew install yt-dlp
# ou
pip install yt-dlp
```

### "Échec du téléchargement"
- Vérifie que l'URL est valide
- Certaines vidéos peuvent être protégées
- Met à jour yt-dlp: `brew upgrade yt-dlp`

### Le résumé ne fonctionne pas
- Vérifie ta clé OpenAI dans `.env`
- Certaines vidéos n'ont pas de sous-titres disponibles
