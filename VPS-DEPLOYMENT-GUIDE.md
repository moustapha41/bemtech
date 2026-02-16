# 🚀 Guide de Déploiement VPS - BemTech Alumni

## Prérequis
- Un VPS Ubuntu 20.04+ ou Debian 11+
- Accès SSH root ou sudo
- Un nom de domaine (optionnel mais recommandé)

## 📋 Étapes de Déploiement

### 1. Connexion à votre VPS
```bash
ssh root@votre-ip-vps
# ou
ssh votre-utilisateur@votre-ip-vps
```

### 2. Installation automatique
Copiez le script `vps-deploy.sh` sur votre VPS et exécutez :
```bash
chmod +x vps-deploy.sh
./vps-deploy.sh
```

### 3. Transfert de votre projet
**Option A: Via Git (Recommandé)**
```bash
cd /var/www/bemtech-alumni
git clone https://github.com/votre-username/bemtech-alumni.git .
```

**Option B: Via SCP depuis votre machine locale**
```bash
# Depuis votre machine locale
scp -r /home/moustapha/Téléchargements/12/* root@votre-ip-vps:/var/www/bemtech-alumni/
```

**Option C: Via rsync (Plus efficace)**
```bash
# Depuis votre machine locale
rsync -avz --exclude 'node_modules' --exclude '.git' /home/moustapha/Téléchargements/12/ root@votre-ip-vps:/var/www/bemtech-alumni/
```

### 4. Configuration de l'environnement
```bash
cd /var/www/bemtech-alumni

# Copier le fichier d'environnement de production
cp .env.production .env

# Éditer avec vos vraies valeurs
nano .env
```

**Modifiez ces valeurs importantes :**
- `JWT_SECRET`: Générez une clé forte (32+ caractères)
- `EMAIL_USER`: Votre email Gmail
- `EMAIL_PASS`: Mot de passe d'application Gmail

### 5. Installation des dépendances
```bash
npm install --production
```

### 6. Démarrage avec PM2
```bash
# Démarrer l'application
pm2 start server.js --name "bemtech-alumni"

# Configurer le démarrage automatique
pm2 startup
pm2 save

# Vérifier le statut
pm2 status
pm2 logs bemtech-alumni
```

### 7. Configuration Nginx

**Installer et configurer Nginx :**
```bash
# Copier la configuration
sudo cp nginx-config /etc/nginx/sites-available/bemtech-alumni

# Modifier avec votre domaine
sudo nano /etc/nginx/sites-available/bemtech-alumni

# Activer le site
sudo ln -s /etc/nginx/sites-available/bemtech-alumni /etc/nginx/sites-enabled/

# Tester la configuration
sudo nginx -t

# Redémarrer Nginx
sudo systemctl restart nginx
```

### 8. Configuration du Firewall
```bash
# Autoriser SSH, HTTP et HTTPS
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 9. SSL avec Let's Encrypt (Optionnel mais recommandé)
```bash
# Installer Certbot
sudo apt install certbot python3-certbot-nginx

# Obtenir le certificat SSL
sudo certbot --nginx -d votre-domaine.com -d www.votre-domaine.com

# Tester le renouvellement automatique
sudo certbot renew --dry-run
```

## 🔧 Commandes Utiles

### Gestion PM2
```bash
pm2 restart bemtech-alumni    # Redémarrer
pm2 stop bemtech-alumni       # Arrêter
pm2 delete bemtech-alumni     # Supprimer
pm2 logs bemtech-alumni       # Voir les logs
pm2 monit                     # Monitoring
```

### Gestion Nginx
```bash
sudo systemctl status nginx   # Statut
sudo systemctl restart nginx  # Redémarrer
sudo nginx -t                 # Tester la config
```

### Logs
```bash
# Logs de l'application
pm2 logs bemtech-alumni

# Logs Nginx
sudo tail -f /var/log/nginx/bemtech-alumni.access.log
sudo tail -f /var/log/nginx/bemtech-alumni.error.log

# Logs système
sudo journalctl -u nginx -f
```

## 🔒 Sécurité Production

### 1. Changer les mots de passe par défaut
- Admin: `admin@bemtech.com` / `admin123` → À changer !

### 2. Sauvegardes automatiques
```bash
# Script de sauvegarde (à créer)
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/www/bemtech-alumni/database/alumni.db /backup/alumni_$DATE.db
```

### 3. Monitoring
```bash
# Installer htop pour monitoring
sudo apt install htop

# Surveiller les ressources
htop
```

## 🌐 Accès à votre site

- **Avec domaine :** https://votre-domaine.com
- **Avec IP :** http://votre-ip-vps:4000 (temporaire)
- **Admin :** https://votre-domaine.com/admin.html

## 🆘 Dépannage

### L'application ne démarre pas
```bash
pm2 logs bemtech-alumni
# Vérifier les erreurs dans les logs
```

### Nginx ne fonctionne pas
```bash
sudo nginx -t
sudo systemctl status nginx
```

### Base de données corrompue
```bash
cd /var/www/bemtech-alumni
rm database/alumni.db
pm2 restart bemtech-alumni
# La DB sera recréée automatiquement
```

### Mise à jour de l'application
```bash
cd /var/www/bemtech-alumni
git pull origin main
npm install --production
pm2 restart bemtech-alumni
```
