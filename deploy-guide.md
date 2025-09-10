# Guide de Déploiement - BemTech Alumni

## Option 1: Railway (Recommandé)

### Étapes:
1. Créer un compte sur [Railway.app](https://railway.app)
2. Connecter votre repository GitHub
3. Railway détectera automatiquement votre app Node.js
4. Configurer les variables d'environnement:
   ```
   PORT=4000
   JWT_SECRET=votre-clé-secrète-production
   JWT_EXPIRES_IN=7d
   NODE_ENV=production
   DB_PATH=./database/alumni.db
   EMAIL_USER=votre-email@gmail.com
   EMAIL_PASS=votre-mot-de-passe-app
   ADMIN_EMAIL=votre-email@gmail.com
   ```
5. Déployer automatiquement

### Commandes pour préparer:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/votre-username/bemtech-alumni.git
git push -u origin main
```

## Option 2: Heroku

### Étapes:
1. Installer Heroku CLI
2. Créer une app Heroku:
   ```bash
   heroku create votre-app-name
   ```
3. Configurer les variables:
   ```bash
   heroku config:set JWT_SECRET=votre-clé-secrète
   heroku config:set NODE_ENV=production
   ```
4. Déployer:
   ```bash
   git push heroku main
   ```

## Option 3: Render

### Étapes:
1. Créer un compte sur [Render.com](https://render.com)
2. Connecter votre repository
3. Choisir "Web Service"
4. Configurer:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Ajouter les variables d'environnement

## Option 4: VPS (DigitalOcean/Linode)

### Étapes:
1. Créer un droplet Ubuntu
2. Installer Node.js et PM2:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```
3. Cloner votre projet
4. Installer les dépendances:
   ```bash
   npm install --production
   ```
5. Démarrer avec PM2:
   ```bash
   pm2 start server.js --name "bemtech-alumni"
   pm2 startup
   pm2 save
   ```
6. Configurer Nginx comme reverse proxy

## Sécurité Production

### Variables d'environnement à changer:
- `JWT_SECRET`: Générer une clé forte
- `NODE_ENV`: Mettre à "production"
- Configurer un vrai service email

### Base de données:
- Pour la production, considérer PostgreSQL ou MySQL
- Sauvegardes automatiques recommandées

## Domaine personnalisé

1. Acheter un domaine (Namecheap, GoDaddy, etc.)
2. Configurer les DNS pour pointer vers votre service
3. Activer HTTPS (automatique sur Railway/Render/Heroku)

## Monitoring

- Utiliser les logs de la plateforme
- Configurer des alertes
- Surveiller les performances
