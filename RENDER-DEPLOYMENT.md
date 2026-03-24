# 🚀 Guide de Déploiement sur Render

## 📋 Prérequis

1. **Compte Render** : Créez un compte sur [render.com](https://render.com)
2. **GitHub** : Avoir un repository GitHub avec votre code
3. **Code modifié** : Votre projet est maintenant configuré pour Render

## 🔧 Structure du projet

```
├── page/
│   ├── server.js           # Serveur principal (configuré pour Render)
│   ├── package.json        # Dépendances (pg ajouté)
│   ├── *.html             # Pages HTML
│   ├── database/          # SQLite (local uniquement)
│   └── ...                # Autres fichiers
├── render.yaml            # Configuration Render
├── Procfile              # Commande de démarrage
└── .gitignore           # Fichiers ignorés
```

## 📝 Étapes de déploiement

### 1. Pousser le code sur GitHub

```bash
git add .
git commit -m "Configuration pour Render"
git push origin main
```

### 2. Créer les services Render

#### Option A : Avec render.yaml (recommandé)
1. Connectez-vous à Render
2. Allez dans "Dashboard" → "New" → "Web Service"
3. Connectez votre repository GitHub
4. Render détectera automatiquement `render.yaml`

#### Option B : Manuellement
1. **Service Web** :
   - Name : `bemtech-alumni`
   - Environment : `Node`
   - Build Command : `npm install`
   - Start Command : `node page/server.js`
   - Instance Type : `Free`

2. **Base de données** :
   - Name : `bemtech-db`
   - Database : `PostgreSQL`
   - Instance Type : `Free`

### 3. Variables d'environnement

Dans votre service web, ajoutez ces variables :

```
NODE_ENV=production
JWT_SECRET=votre_cle_secrete
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://user:password@host:port/database
```

**Note** : `DATABASE_URL` sera automatiquement ajoutée par Render

### 4. Configuration CORS

Mettez à jour l'URL de votre application dans `server.js` :

```javascript
origin: process.env.RENDER_EXTERNAL_URL || 'https://votre-app.onrender.com'
```

## 🔄 Migration des données

### Depuis SQLite vers PostgreSQL

1. **Exporter les données SQLite** :
```bash
sqlite3 page/database/alumni.db .dump > data.sql
```

2. **Importer dans PostgreSQL** :
```bash
psql $DATABASE_URL < data.sql
```

### Ou créer un compte admin manuellement

Le serveur créera automatiquement un compte admin :
- Email : admin@bemtech.com
- Mot de passe : admin123

## 🌐 Accès à votre application

Une fois déployé :
- **Application** : `https://votre-app.onrender.com`
- **Admin** : `https://votre-app.onrender.com/admin.html`
- **API** : `https://votre-app.onrender.com/api/`

## 🐛 Dépannage

### Problèmes courants

1. **Erreur 502** : Vérifiez que le serveur écoute sur le bon port (10000)
2. **Base de données** : Assurez-vous que `DATABASE_URL` est configurée
3. **CORS** : Vérifiez les origines autorisées
4. **Build failed** : Check les logs dans Render Dashboard

### Logs utiles

```bash
# Voir les logs de l'application
render logs votre-app

# Vérifier la connexion à la base de données
curl https://votre-app.onrender.com/api/profile
```

## 📈 Monitoring

- **Dashboard Render** : Surveillez l'utilisation des ressources
- **Logs** : Consultez les erreurs en temps réel
- **Metrics** : Suivez les performances de l'application

## 💡 Conseils

1. **Free tier** : Limité à 750h/mois, l'application s'endort après 15min d'inactivité
2. **Domain personnalisé** : Possible avec un plan payant
3. **SSL** : Automatiquement configuré par Render
4. **Backups** : Configurez les backups de la base de données

## 🚀 Prochaines étapes

1. Testez toutes les fonctionnalités
2. Configurez les emails (optionnel)
3. Ajoutez votre domaine personnalisé
4. Surveillez les performances

---

**🎉 Félicitations !** Votre application BemTech Alumni est maintenant en ligne sur Render !
