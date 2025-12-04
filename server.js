const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Chemin vers ffmpeg (npm sur Mac, système sur Linux)
let ffmpegPath;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch {
  ffmpegPath = '/usr/bin/ffmpeg'; // Linux/Docker
}

const app = express();
const PORT = process.env.PORT || 3000;

// Chemin vers yt-dlp (s'adapte selon l'environnement)
const YTDLP = process.env.YTDLP_PATH || (process.platform === 'darwin' 
  ? '/Library/Frameworks/Python.framework/Versions/3.12/bin/yt-dlp' 
  : '/usr/local/bin/yt-dlp');

// Options ffmpeg pour yt-dlp
const FFMPEG_OPTS = `--ffmpeg-location "${ffmpegPath}"`;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Créer le dossier downloads s'il n'existe pas
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Vérifier si yt-dlp est installé
function checkYtDlp() {
  try {
    execSync(`${YTDLP} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Extraire l'ID de la vidéo YouTube
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Extraire l'ID de la playlist
function extractPlaylistId(url) {
  const match = url.match(/[?&]list=([^&]+)/);
  return match ? match[1] : null;
}

// Route: Infos sur la vidéo
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requise' });
  }

  try {
    const result = execSync(`${YTDLP} --dump-json --no-download "${url}"`, {
      encoding: 'utf-8',
      timeout: 30000
    });
    const info = JSON.parse(result);
    res.json({
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      channel: info.channel,
      description: info.description?.substring(0, 500)
    });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de récupérer les infos' });
  }
});

// Route: Télécharger l'audio
app.post('/api/download/audio', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requise' });
  }

  const jobId = uuidv4();
  const outputTemplate = path.join(downloadsDir, `${jobId}-%(title)s.%(ext)s`);

  try {
    // Télécharger en MP3 320kbps avec métadonnées et pochette
    execSync(`${YTDLP} ${FFMPEG_OPTS} -x --audio-format mp3 --audio-quality 0 --embed-thumbnail --embed-metadata --parse-metadata "%(channel)s:%(artist)s" --parse-metadata "%(title)s:%(title)s" -o "${outputTemplate}" "${url}"`, {
      timeout: 300000 // 5 minutes max
    });

    // Trouver le fichier téléchargé
    const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith(jobId));
    if (files.length === 0) {
      throw new Error('Fichier non trouvé');
    }

    const filename = files[0];
    res.json({
      success: true,
      filename,
      downloadUrl: `/downloads/${encodeURIComponent(filename)}`
    });
  } catch (error) {
    console.error('Erreur téléchargement audio:', error.message);
    res.status(500).json({ error: 'Échec du téléchargement' });
  }
});

// Route: Télécharger la vidéo
app.post('/api/download/video', async (req, res) => {
  const { url, quality = 'best' } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requise' });
  }

  const jobId = uuidv4();
  const outputTemplate = path.join(downloadsDir, `${jobId}-%(title)s.%(ext)s`);

  try {
    // Télécharger la meilleure qualité avec métadonnées
    execSync(`${YTDLP} ${FFMPEG_OPTS} -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --embed-thumbnail --embed-metadata -o "${outputTemplate}" "${url}"`, {
      timeout: 600000 // 10 minutes max
    });

    const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith(jobId));
    if (files.length === 0) {
      throw new Error('Fichier non trouvé');
    }

    const filename = files[0];
    res.json({
      success: true,
      filename,
      downloadUrl: `/downloads/${encodeURIComponent(filename)}`
    });
  } catch (error) {
    console.error('Erreur téléchargement vidéo:', error.message);
    res.status(500).json({ error: 'Échec du téléchargement' });
  }
});

// Route: Télécharger une playlist (audio) avec progression SSE
app.get('/api/download/playlist', async (req, res) => {
  const url = req.query.url;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requise' });
  }

  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    return res.status(400).json({ error: 'URL de playlist invalide' });
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const jobId = uuidv4();
  const playlistDir = path.join(downloadsDir, `playlist-${jobId}`);
  fs.mkdirSync(playlistDir, { recursive: true });

  const outputTemplate = path.join(playlistDir, '%(playlist_index)s-%(title)s.%(ext)s');

  sendEvent({ type: 'start', message: 'Récupération de la playlist...' });

  try {
    // Utiliser spawn pour avoir la sortie en temps réel
    const ytdlp = spawn(YTDLP, [
      '--ffmpeg-location', ffmpegPath,
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--embed-thumbnail',           // Ajouter la pochette/miniature
      '--embed-metadata',            // Ajouter les métadonnées
      '--parse-metadata', '%(channel)s:%(artist)s',  // Artiste = chaîne YouTube
      '--parse-metadata', '%(title)s:%(title)s',     // Titre
      '--yes-playlist',
      '--newline', // Important pour avoir une ligne par update
      '-o', outputTemplate,
      url
    ]);

    let currentTrack = 0;
    let totalTracks = 0;
    let currentTitle = '';

    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Détecter le nombre total de vidéos
      const playlistMatch = output.match(/Downloading (?:item |video )?(\d+) of (\d+)/i);
      if (playlistMatch) {
        currentTrack = parseInt(playlistMatch[1]);
        totalTracks = parseInt(playlistMatch[2]);
        sendEvent({ 
          type: 'progress', 
          current: currentTrack, 
          total: totalTracks,
          message: `Téléchargement ${currentTrack}/${totalTracks}...`
        });
      }

      // Détecter le titre
      const titleMatch = output.match(/\[download\] Destination: .*?(\d+-.*?)\.(mp3|webm|m4a)/);
      if (titleMatch) {
        currentTitle = titleMatch[1];
        sendEvent({ 
          type: 'downloading', 
          title: currentTitle,
          current: currentTrack,
          total: totalTracks
        });
      }

      // Détecter la progression du téléchargement individuel
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        sendEvent({ 
          type: 'file_progress', 
          percent: parseFloat(progressMatch[1]),
          current: currentTrack,
          total: totalTracks
        });
      }

      // Détecter la conversion
      if (output.includes('[ExtractAudio]') || output.includes('Post-process')) {
        sendEvent({ 
          type: 'converting', 
          current: currentTrack,
          total: totalTracks,
          message: `Conversion MP3 ${currentTrack}/${totalTracks}...`
        });
      }
    });

    ytdlp.stderr.on('data', (data) => {
      console.log('yt-dlp stderr:', data.toString());
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        const files = fs.readdirSync(playlistDir).filter(f => f.endsWith('.mp3'));
        sendEvent({ 
          type: 'complete', 
          success: true,
          count: files.length,
          folder: `playlist-${jobId}`,
          files: files.map(f => ({
            name: f,
            downloadUrl: `/downloads/playlist-${jobId}/${encodeURIComponent(f)}`
          }))
        });
      } else {
        sendEvent({ type: 'error', message: 'Échec du téléchargement' });
      }
      res.end();
    });

    ytdlp.on('error', (err) => {
      sendEvent({ type: 'error', message: err.message });
      res.end();
    });

    // Gérer la déconnexion du client
    req.on('close', () => {
      ytdlp.kill();
    });

  } catch (error) {
    console.error('Erreur téléchargement playlist:', error.message);
    sendEvent({ type: 'error', message: 'Échec du téléchargement de la playlist' });
    res.end();
  }
});

// Route: Résumé de la vidéo
app.post('/api/summary', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requise' });
  }

  try {
    // Récupérer les sous-titres
    const tempDir = path.join(downloadsDir, 'temp-' + uuidv4());
    fs.mkdirSync(tempDir, { recursive: true });

    let subtitles = '';
    
    try {
      // Essayer de récupérer les sous-titres auto-générés ou manuels
      execSync(`${YTDLP} --write-auto-sub --sub-lang fr,en --skip-download -o "${tempDir}/subs" "${url}"`, {
        timeout: 60000
      });
      
      // Lire les sous-titres
      const subFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.vtt') || f.endsWith('.srt'));
      if (subFiles.length > 0) {
        subtitles = fs.readFileSync(path.join(tempDir, subFiles[0]), 'utf-8');
        // Nettoyer les sous-titres (enlever timestamps et formatage)
        subtitles = subtitles
          .replace(/WEBVTT[\s\S]*?\n\n/g, '')
          .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '')
          .replace(/<[^>]*>/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    } catch (e) {
      console.log('Pas de sous-titres disponibles');
    }

    // Récupérer aussi la description
    let description = '';
    try {
      const info = execSync(`${YTDLP} --dump-json --no-download "${url}"`, {
        encoding: 'utf-8',
        timeout: 30000
      });
      const videoInfo = JSON.parse(info);
      description = videoInfo.description || '';
    } catch (e) {
      console.log('Impossible de récupérer la description');
    }

    // Nettoyer le dossier temp
    fs.rmSync(tempDir, { recursive: true, force: true });

    if (!subtitles && !description) {
      return res.status(400).json({ 
        error: 'Aucun contenu disponible pour le résumé (pas de sous-titres ni description)' 
      });
    }

    // Si pas de clé OpenAI, retourner le texte brut
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        summary: null,
        rawContent: subtitles || description,
        message: 'Clé OpenAI non configurée - voici le contenu brut de la vidéo'
      });
    }

    // Appeler OpenAI pour générer le résumé
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const content = subtitles || description;
    const truncatedContent = content.substring(0, 15000); // Limiter la taille

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant qui résume des vidéos YouTube de manière concise et utile.
Génère un résumé en bullet points (•) des points clés à retenir.
Format attendu:
- Titre/sujet principal
- 5-10 bullet points des idées principales
- Une conclusion en 1 phrase

Réponds en français.`
        },
        {
          role: 'user',
          content: `Voici le contenu de la vidéo à résumer:\n\n${truncatedContent}`
        }
      ],
      max_tokens: 1000
    });

    res.json({
      summary: completion.choices[0].message.content,
      rawContent: null
    });

  } catch (error) {
    console.error('Erreur résumé:', error.message);
    res.status(500).json({ error: 'Échec de la génération du résumé' });
  }
});

// Route: Nettoyer les anciens téléchargements (plus de 24h)
app.post('/api/cleanup', (req, res) => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 heures

  let deleted = 0;
  const items = fs.readdirSync(downloadsDir);
  
  items.forEach(item => {
    const itemPath = path.join(downloadsDir, item);
    const stats = fs.statSync(itemPath);
    
    if (now - stats.mtimeMs > maxAge) {
      if (stats.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(itemPath);
      }
      deleted++;
    }
  });

  res.json({ deleted, message: `${deleted} fichier(s) supprimé(s)` });
});

// Vérification au démarrage
if (!checkYtDlp()) {
  console.error('⚠️  yt-dlp n\'est pas installé!');
  console.error('   Installe-le avec: brew install yt-dlp');
  console.error('   Ou: pip install yt-dlp');
}

app.listen(PORT, () => {
  console.log(`🎵 YouTube Tools démarré sur http://localhost:${PORT}`);
  console.log(`📱 Accède depuis ton iPhone: http://<ton-ip>:${PORT}`);
});
