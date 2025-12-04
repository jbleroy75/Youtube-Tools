FROM node:20-slim

# Installer yt-dlp et ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les fichiers
COPY package*.json ./
RUN npm install --production

COPY . .

# Créer le dossier downloads
RUN mkdir -p downloads

# Port
EXPOSE 3000

# Mettre à jour le chemin yt-dlp pour Linux
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

CMD ["node", "server.js"]
