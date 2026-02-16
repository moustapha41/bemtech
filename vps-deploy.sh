#!/bin/bash

# Script de déploiement automatique pour VPS
# Usage: ./vps-deploy.sh

echo "🚀 Déploiement BemTech Alumni sur VPS"
echo "======================================"

# Mise à jour du système
echo "📦 Mise à jour du système..."
sudo apt update && sudo apt upgrade -y

# Installation de Node.js 18.x
echo "📦 Installation de Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Installation de PM2 (Process Manager)
echo "📦 Installation de PM2..."
sudo npm install -g pm2

# Installation de Nginx
echo "📦 Installation de Nginx..."
sudo apt install -y nginx

# Installation de Git si pas déjà installé
echo "📦 Installation de Git..."
sudo apt install -y git

# Création du répertoire de l'application
echo "📁 Création du répertoire de l'application..."
sudo mkdir -p /var/www/bemtech-alumni
sudo chown -R $USER:$USER /var/www/bemtech-alumni

# Clonage du projet (vous devrez remplacer l'URL)
echo "📥 Clonage du projet..."
cd /var/www/bemtech-alumni
# git clone https://github.com/votre-username/bemtech-alumni.git .

# Installation des dépendances
echo "📦 Installation des dépendances Node.js..."
npm install --production

# Création du répertoire de la base de données
echo "📁 Création du répertoire de la base de données..."
mkdir -p database

# Configuration des permissions
echo "🔒 Configuration des permissions..."
sudo chown -R $USER:$USER /var/www/bemtech-alumni
chmod -R 755 /var/www/bemtech-alumni

echo "✅ Installation terminée!"
echo "📝 Prochaines étapes:"
echo "1. Configurez votre fichier .env"
echo "2. Lancez l'application avec PM2: pm2 start server.js --name bemtech-alumni"
echo "3. Configurez Nginx avec le fichier de configuration fourni"
echo "4. Configurez le firewall et SSL"
