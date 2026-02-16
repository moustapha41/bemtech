#!/bin/bash

# Script de déploiement rapide pour VPS
echo "🚀 Déploiement rapide BemTech Alumni"
echo "===================================="

# Variables à modifier
VPS_IP="4.251.192.76"
VPS_USER="alumni"  # ou votre utilisateur
DOMAIN="bemtech.francecentral.cloudapp.azure.com"  # optionnel

echo "📋 Ce script va :"
echo "1. Transférer les fichiers vers le VPS"
echo "2. Installer les dépendances"
echo "3. Configurer et démarrer l'application"
echo ""

read -p "Voulez-vous continuer ? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Vérifier la connexion SSH
echo "🔍 Test de connexion SSH..."
ssh -o ConnectTimeout=5 $VPS_USER@$VPS_IP "echo 'Connexion OK'" || {
    echo "❌ Impossible de se connecter au VPS"
    echo "Vérifiez l'IP et les credentials SSH"
    exit 1
}

# Créer le répertoire sur le VPS avec privilèges root
echo "📁 Création du répertoire sur le VPS..."
ssh $VPS_USER@$VPS_IP "sudo mkdir -p /var/www/bemtech-alumni && sudo chown -R $VPS_USER:$VPS_USER /var/www/bemtech-alumni"

# Transférer les fichiers (exclure node_modules et .git)
echo "📤 Transfert des fichiers..."
rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '*.log' \
    ./ $VPS_USER@$VPS_IP:/var/www/bemtech-alumni/

# Exécuter les commandes d'installation sur le VPS
echo "📦 Installation sur le VPS..."
ssh $VPS_USER@$VPS_IP << 'EOF'
# Passer en mode root et exécuter les commandes d'installation
sudo bash << 'ROOTEOF'

cd /var/www/bemtech-alumni

# Mise à jour système
apt update

# Installation Node.js si pas présent
if ! command -v node &> /dev/null; then
    echo "Installation de Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Installation PM2 si pas présent
if ! command -v pm2 &> /dev/null; then
    echo "Installation de PM2..."
    npm install -g pm2
fi

# Installation des dépendances
echo "Installation des dépendances..."
npm install --production

# Copier le fichier d'environnement
cp .env.production .env

# Créer le répertoire de la base de données
mkdir -p database

# Arrêter l'ancienne instance si elle existe
pm2 delete bemtech-alumni 2>/dev/null || true

# Démarrer l'application
echo "Démarrage de l'application..."
pm2 start server.js --name "bemtech-alumni"

# Configuration du démarrage automatique
pm2 startup ubuntu -u alumni --hp /home/alumni
pm2 save

ROOTEOF

echo "✅ Application déployée avec succès !"
echo "🌐 Accès : http://$(curl -s ifconfig.me):4000"
echo "👤 Admin : admin@bemtech.com / admin123"
EOF

echo ""
echo "🎉 Déploiement terminé !"
echo "📋 Prochaines étapes recommandées :"
echo "1. Configurez un nom de domaine"
echo "2. Installez un certificat SSL"
echo "3. Configurez Nginx comme reverse proxy"
echo "4. Changez le mot de passe admin par défaut"
