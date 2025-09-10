# BemTech Alumni - Système Professionnel

## Installation

```bash
npm install
mkdir database
npm start
```

## Utilisation

1. **Démarrer le serveur**: `npm start`
2. **Ouvrir**: http://localhost:3000
3. **S'inscrire**: Utiliser le formulaire ou modal d'inscription
4. **Se connecter**: Avec email/mot de passe créés

## Fonctionnalités

- ✅ **Backend Node.js/Express**
- ✅ **Base de données SQLite**
- ✅ **Authentification JWT**
- ✅ **Hachage bcrypt**
- ✅ **API REST sécurisée**
- ✅ **Validation des données**
- ✅ **Rate limiting**
- ✅ **Pas de comptes demo**

## API Endpoints

- `POST /api/register` - Inscription
- `POST /api/login` - Connexion  
- `POST /api/verify-token` - Vérification token
- `GET /api/profile` - Profil utilisateur

## Sécurité

- Mots de passe hachés avec bcrypt
- Tokens JWT sécurisés
- Validation côté serveur
- Protection CORS et Helmet
- Rate limiting sur auth

Système 100% professionnel sans localStorage ni comptes demo.
