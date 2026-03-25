const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Database configuration
let db;
if (process.env.NODE_ENV === 'production') {
    // PostgreSQL pour Render
    const { Pool } = require('pg');
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
} else {
    // SQLite pour le développement local
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, 'database', 'alumni.db');
    
    // Créer le répertoire s'il n'existe pas
    if (!require('fs').existsSync(path.dirname(dbPath))) {
        require('fs').mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
}

const app = express();
// Use CUSTOM_PORT if set, otherwise PORT, otherwise 4000
const PORT = process.env.CUSTOM_PORT || process.env.PORT || 4000;

// Debug: Log the PORT value
console.log('🔍 PORT environment variable:', process.env.PORT);
console.log('🔍 CUSTOM_PORT environment variable:', process.env.CUSTOM_PORT);
console.log('🔍 Using PORT:', PORT);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for development
}));
// Configuration CORS dynamique
const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
        ? [process.env.RENDER_EXTERNAL_URL || 'https://bemtech-alumni.onrender.com']
        : ['http://localhost:4000', 'http://127.0.0.1:4000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 
};


app.options('*', cors(corsOptions));


app.use(cors(corsOptions));

// Middleware pour logger les requêtes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    if (req.method === 'POST' || req.method === 'PUT') {
        console.log('Request body:', req.body);
    }
    next();
});
app.use(express.json());

// Rediriger les anciennes URLs *.html vers leur version "propre"
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    const htmlPathMatch = req.path.match(/^\/([A-Za-z0-9_-]+)\.html$/);
    if (!htmlPathMatch) {
        return next();
    }

    const page = htmlPathMatch[1];
    if (page.toLowerCase() === 'index') {
        return res.redirect(301, '/');
    }

    return res.redirect(301, `/${page}`);
});

// Serve static files from page directory
app.use(express.static(__dirname));

// Serve photos from parent directories
app.use('/2022', express.static(path.join(__dirname, '..', '2022')));
app.use('/2023', express.static(path.join(__dirname, '..', '2023')));
app.use('/2024', express.static(path.join(__dirname, '..', '2024')));
app.use('/2025', express.static(path.join(__dirname, '..', '2025')));
// Servir les fichiers du dossier img qui est dans le répertoire parent
app.use('/img', express.static(path.join(__dirname, '..', 'img')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Auth rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // limit each IP to 5 auth requests per windowMs
});

// Database setup
async function initializeDatabase() {
    if (process.env.NODE_ENV === 'production') {
        // PostgreSQL initialization
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    nom VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    promo VARCHAR(255) NOT NULL,
                    linkedin TEXT,
                    motivation TEXT,
                    role VARCHAR(50) DEFAULT 'member',
                    last_login TIMESTAMP,
                    login_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS user_activity (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    ip_address TEXT,
                    user_agent TEXT
                );
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS bureau_requests (
                    id SERIAL PRIMARY KEY,
                    nom VARCHAR(255) NOT NULL,
                    prenom VARCHAR(255) NOT NULL,
                    promotion VARCHAR(255) NOT NULL,
                    bureau VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    telephone TEXT,
                    motivation TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS projects (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    objective TEXT NOT NULL,
                    description TEXT,
                    author VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'en_attente',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS project_participants (
                    id SERIAL PRIMARY KEY,
                    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    phone TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS organized_events (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    date TEXT NOT NULL,
                    location VARCHAR(255) NOT NULL,
                    organizer VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'planned',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            await db.query(`
                CREATE TABLE IF NOT EXISTS membership_requests (
                    id SERIAL PRIMARY KEY,
                    nom VARCHAR(255) NOT NULL,
                    prenom VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    promo VARCHAR(255) NOT NULL,
                    linkedin TEXT,
                    motivation TEXT,
                    status VARCHAR(50) DEFAULT 'pending',
                    access_token VARCHAR(255) UNIQUE,
                    token_expires_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            
            console.log('Base de données PostgreSQL initialisée');
        } catch (error) {
            console.error('Erreur PostgreSQL:', error);
            throw error;
        }
    } else {
        // SQLite initialization (code existant)
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run(`CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nom TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    promo TEXT NOT NULL,
                    linkedin TEXT,
                    motivation TEXT,
                    role TEXT DEFAULT 'member',
                    last_login DATETIME,
                    login_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, (err) => {
                    if (err) return reject(err);
                    
                    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                        ip_address TEXT,
                        user_agent TEXT,
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                    )`, (err) => {
                        if (err) return reject(err);
                        
                        db.run(`CREATE TABLE IF NOT EXISTS bureau_requests (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            nom TEXT NOT NULL,
                            prenom TEXT NOT NULL,
                            promotion TEXT NOT NULL,
                            bureau TEXT NOT NULL,
                            email TEXT NOT NULL,
                            telephone TEXT,
                            motivation TEXT,
                            status TEXT DEFAULT 'pending',
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )`, (err) => {
                            if (err) return reject(err);
                            
                            db.run(`CREATE TABLE IF NOT EXISTS projects (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                title TEXT NOT NULL,
                                objective TEXT NOT NULL,
                                description TEXT,
                                author TEXT NOT NULL,
                                email TEXT NOT NULL,
                                status TEXT DEFAULT 'en_attente',
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                            )`, (err) => {
                                if (err) return reject(err);
                                
                                db.run(`CREATE TABLE IF NOT EXISTS project_participants (
                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    project_id INTEGER NOT NULL,
                                    name TEXT NOT NULL,
                                    email TEXT NOT NULL,
                                    phone TEXT,
                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                                )`, (err) => {
                                    if (err) return reject(err);
                                    
                                    db.run(`CREATE TABLE IF NOT EXISTS organized_events (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        title TEXT NOT NULL,
                                        description TEXT NOT NULL,
                                        date TEXT NOT NULL,
                                        location TEXT NOT NULL,
                                        organizer TEXT NOT NULL,
                                        status TEXT DEFAULT 'planned',
                                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                    )`, (err) => {
                                        if (err) return reject(err);
                                        
                                        db.run(`CREATE TABLE IF NOT EXISTS membership_requests (
                                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                                            nom TEXT NOT NULL,
                                            prenom TEXT NOT NULL,
                                            email TEXT NOT NULL,
                                            promo TEXT NOT NULL,
                                            linkedin TEXT,
                                            motivation TEXT,
                                            status TEXT DEFAULT 'pending',
                                            access_token TEXT UNIQUE,
                                            token_expires_at DATETIME,
                                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                        )`, (err) => {
                                            if (err) return reject(err);
                                            console.log('Base de données SQLite initialisée');
                                            resolve();
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }
}

// Démarrer le serveur une fois la base de données initialisée
if (process.env.NODE_ENV === 'production') {
    // PostgreSQL initialization
    initializeDatabase().then(() => {
        console.log('Base de données initialisée avec succès');
        startServer();
    }).catch(err => {
        console.error('Erreur lors de l\'initialisation de la base de données:', err);
        process.exit(1);
    });
} else {
    // SQLite initialization
    initializeDatabase((err) => {
        if (err) {
            console.error('Erreur lors de l\'initialisation de la base de données:', err);
            process.exit(1);
        }
        console.log('Base de données initialisée avec succès');
        startServer();
    });
}

function startServer() {
    // Créer un compte administrateur par défaut
    const adminEmail = 'admin@bemtech.com';
    const adminPassword = 'admin123';
    
    if (process.env.NODE_ENV === 'production') {
        // PostgreSQL
        db.query('SELECT id FROM users WHERE email = $1', [adminEmail], async (err, res) => {
            if (err) {
                console.error('Erreur lors de la vérification de l\'admin:', err);
                return;
            }
            
            if (res.rows.length === 0) {
                // Créer le compte admin s'il n'existe pas
                const bcrypt = require('bcryptjs');
                const hashedPassword = await bcrypt.hash(adminPassword, 12);
                
                db.query(
                    'INSERT INTO users (nom, email, password, promo, role) VALUES ($1, $2, $3, $4, $5)',
                    ['Administrateur', adminEmail, hashedPassword, 'Admin', 'admin'],
                    function(err) {
                        if (err) {
                            console.error('Erreur lors de la création de l\'admin:', err);
                        } else {
                            console.log('🔐 Compte administrateur créé:');
                            console.log('   Email: admin@bemtech.com');
                            console.log('   Mot de passe: admin123');
                            console.log('   URL: https://bemtech.onrender.com/admin.html');
                        }
                    }
                );
            }
        });
    } else {
        // SQLite
        db.get('SELECT id FROM users WHERE email = ?', [adminEmail], async (err, row) => {
            if (err) {
                console.error('Erreur lors de la vérification de l\'admin:', err);
                return;
            }
            
            if (!row) {
                // Créer le compte admin s'il n'existe pas
                const bcrypt = require('bcryptjs');
                const hashedPassword = await bcrypt.hash(adminPassword, 12);
                
                db.run(
                    'INSERT INTO users (nom, email, password, promo, role) VALUES (?, ?, ?, ?, ?)',
                    ['Administrateur', adminEmail, hashedPassword, 'Admin', 'admin'],
                    function(err) {
                        if (err) {
                            console.error('Erreur lors de la création de l\'admin:', err);
                        } else {
                            console.log('🔐 Compte administrateur créé:');
                            console.log('   Email: admin@bemtech.com');
                            console.log('   Mot de passe: admin123');
                            console.log('   URL: https://bemtech.onrender.com/admin.html');
                        }
                    }
                );
            }
        });
    }
    
    // Démarrer le serveur Express
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Serveur BemTech Alumni démarré sur http://0.0.0.0:${PORT}`);
        if (process.env.NODE_ENV === 'production') {
            console.log(`🌐 Production: https://bemtech.onrender.com`);
            console.log(`🔐 Admin: https://bemtech.onrender.com/admin.html`);
        } else {
            console.log(`🌐 Local: http://localhost:${PORT}`);
            console.log(`🔐 Admin: http://localhost:${PORT}/admin.html`);
        }
        console.log(`🔒 Mode: ${process.env.NODE_ENV || 'development'}`);
    });
}

// JWT middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token d\'accès requis' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token invalide' });
        }
        req.user = user;
        next();
    });
};

// Validation middleware
const validateRegistration = [
    body('nom').trim().isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
    body('promo').trim().isLength({ min: 4 }).withMessage('Promotion invalide')
];

const validateLogin = [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('password').notEmpty().withMessage('Mot de passe requis')
];

const validateBureauRequest = [
    body('nom').trim().isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères'),
    body('prenom').trim().isLength({ min: 2 }).withMessage('Le prénom doit contenir au moins 2 caractères'),
    body('promotion').trim().isLength({ min: 2 }).withMessage('La promotion est requise'),
    body('bureau').isIn(['Dakar', 'Abidjan', 'Paris', 'Lille', 'Toronto', 'San Diego']).withMessage('Bureau invalide'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('telephone').optional().custom((value) => {
        if (!value || value.trim() === '') {
            return true; // Skip validation for empty values
        }
        // Basic phone validation - allow numbers, spaces, +, -, (, )
        const phoneRegex = /^[\d\s\+\-\(\)]+$/;
        if (!phoneRegex.test(value)) {
            throw new Error('Numéro de téléphone invalide');
        }
        return true;
    }),
    body('motivation').optional().isLength({ max: 500 }).withMessage('La motivation ne peut pas dépasser 500 caractères')
];

const validateProject = [
    body('title').trim().isLength({ min: 3 }).withMessage('Le titre doit contenir au moins 3 caractères'),
    body('objective').trim().isLength({ min: 10 }).withMessage('L\'objectif doit contenir au moins 10 caractères'),
    body('author').trim().isLength({ min: 2 }).withMessage('Le nom de l\'auteur doit contenir au moins 2 caractères'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('phone').trim().isLength({ min: 8 }).withMessage('Numéro de téléphone invalide')
];

const validateParticipant = [
    body('name').trim().isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('phone').trim().isLength({ min: 8 }).withMessage('Numéro de téléphone invalide')
];

const validateEventOrganization = [
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('eventType').trim().isLength({ min: 2 }).withMessage('Le type d\'événement est requis'),
    body('location').trim().isLength({ min: 2 }).withMessage('Le lieu est requis'),
    body('description').trim().isLength({ min: 10 }).withMessage('La description doit contenir au moins 10 caractères')
];

const validateMembershipRequest = [
    body('nom').trim().isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('promo').trim().isLength({ min: 4 }).withMessage('Promotion invalide'),
    body('linkedin').optional({ checkFalsy: true }).isURL().withMessage('URL LinkedIn invalide'),
    body('motivation').optional().isLength({ max: 500 }).withMessage('La motivation ne peut pas dépasser 500 caractères')
];


// URLs propres: /admin, /give, /reunion, etc.
const cleanRouteToFile = {
    access: 'access',
    admin: 'admin',
    after: 'after',
    contact: 'contact',
    reseau: 'reseau',
    projet: 'projet',
    qui: 'Qui',
    FAQ: 'FAQ',
    evenements_etudiants: 'evenements_etudiants',
    opportunite: 'opportunite',
    mentorat: 'mentorat',
    calendrier: 'calendrier',
    actualite: 'actualite',
    retrouvaille: 'retrouvaille',
    reunion: 'reunion',
    journee: 'journee',
    weekend: 'weekend',
    don_annuel: 'don_annuel',
    conseil: 'conseil',
    galerie: 'Galerie',
    give: 'give',
    vie_school: 'vie_school'
};

// Rediriger /xxx.html -> /xxx pour les pages connues
app.get('/:page.html', (req, res, next) => {
    const pageParam = String(req.params.page || '').toLowerCase();
    if (pageParam === 'index') {
        return res.redirect(301, '/');
    }

    const cleanRoute = Object.keys(cleanRouteToFile).find(
        (route) => route.toLowerCase() === pageParam
    );

    if (!cleanRoute) {
        return next();
    }

    return res.redirect(301, `/${cleanRoute}`);
});

Object.entries(cleanRouteToFile).forEach(([route, fileName]) => {
    app.get(`/${route}`, (req, res) => {
        res.sendFile(path.join(__dirname, `${fileName}.html`));
    });
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/access.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'access.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Sub-pages routes
app.get('/reseau.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reseau.html'));
});

app.get('/projet.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'projet.html'));
});

app.get('/qui.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Qui.html'));
});

app.get('/FAQ.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'FAQ.html'));
});

app.get('/opportunite.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'opportunite.html'));
});

app.get('/mentorat.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'mentorat.html'));
});

app.get('/calendrier.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'calendrier.html'));
});

app.get('/actualite.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'actualite.html'));
});

app.get('/retrouvaille.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'retrouvaille.html'));
});

app.get('/reunion.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reunion.html'));
});

app.get('/journee.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'journee.html'));
});

app.get('/weekend.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'weekend.html'));
});

app.get('/don_annuel.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'don_annuel.html'));
});

app.get('/conseil.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'conseil.html'));
});

app.get('/galerie.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'Galerie.html'));
});

// Registration endpoint
app.post('/api/register', authLimiter, validateRegistration, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array() 
            });
        }

        const { nom, email, password, promo, linkedin, motivation } = req.body;

        // Check if user already exists
        if (process.env.NODE_ENV === 'production') {
            // PostgreSQL version
            db.query('SELECT id FROM users WHERE email = $1', [email], async (err, res) => {
                if (err) {
                    return res.status(500).json({ error: 'Erreur de base de données' });
                }

                if (res.rows.length > 0) {
                    return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà' });
                }

                // Hash password
                const saltRounds = 12;
                const hashedPassword = await bcrypt.hash(password, saltRounds);

                // Insert user
                db.query(
                    'INSERT INTO users (nom, email, password, promo, linkedin, motivation) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                    [nom, email, hashedPassword, promo, linkedin || '', motivation || ''],
                    (err, res) => {
                        if (err) {
                            return res.status(500).json({ error: 'Erreur lors de la création du compte' });
                        }

                        // Generate JWT token
                        const token = jwt.sign(
                            { 
                                id: res.rows[0].id, 
                                email: email,
                                nom: nom,
                                role: 'member'
                            },
                            process.env.JWT_SECRET,
                            { expiresIn: '7d' }
                        );

                        console.log(`✅ Nouveau compte créé: ${nom} (${email}) - Promo ${promo}`);
                        res.status(201).json({
                            success: true,
                            message: 'Compte créé avec succès',
                            token: token,
                            user: {
                                id: res.rows[0].id,
                                nom: nom,
                                email: email,
                                promo: promo,
                                role: 'member'
                            }
                        });
                    }
                );
            });
        } else {
            // SQLite version
            db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
                if (err) {
                    return res.status(500).json({ error: 'Erreur de base de données' });
                }

                if (row) {
                    return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà' });
                }

                // Hash password
                const saltRounds = 12;
                const hashedPassword = await bcrypt.hash(password, saltRounds);

                // Insert user
                db.run(
                    'INSERT INTO users (nom, email, password, promo, linkedin, motivation) VALUES (?, ?, ?, ?, ?, ?)',
                    [nom, email, hashedPassword, promo, linkedin || '', motivation || ''],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Erreur lors de la création du compte' });
                        }

                        // Generate JWT token
                        const token = jwt.sign(
                            { 
                                id: this.lastID, 
                                email: email,
                                nom: nom,
                                role: 'member'
                            },
                            process.env.JWT_SECRET,
                            { expiresIn: '7d' }
                        );

                        console.log(`✅ Nouveau compte créé: ${nom} (${email}) - Promo ${promo}`);
                        res.status(201).json({
                            success: true,
                            message: 'Compte créé avec succès',
                            token: token,
                            user: {
                                id: this.lastID,
                                nom: nom,
                                email: email,
                                promo: promo,
                                role: 'member'
                            }
                        });
                    }
                );
            });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Login endpoint
app.post('/api/login', authLimiter, validateLogin, (req, res) => {
    console.log('🔐 Login attempt for email:', req.body.email);
    
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ Validation errors:', errors.array());
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array() 
            });
        }

        const { email, password } = req.body;
        console.log('🔍 Looking for user with email:', email);

        if (process.env.NODE_ENV === 'production') {
            // PostgreSQL version
            db.query('SELECT * FROM users WHERE email = $1', [email], async (err, result) => {
                if (err) {
                    console.error('❌ Database error (PostgreSQL):', err);
                    return res.status(500).json({ error: 'Erreur de base de données' });
                }

                console.log('📊 Query result:', result.rows);
                const user = result.rows[0];

                if (!user) {
                    console.log('❌ User not found');
                    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
                }

                console.log('✅ User found, verifying password...');
                
                // Verify password
                const isValidPassword = await bcrypt.compare(password, user.password);
                if (!isValidPassword) {
                    console.log('❌ Invalid password');
                    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
                }

                console.log('✅ Password valid, generating token...');

                // Get IP and user agent
                const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                const userAgent = req.headers['user-agent'] || '';
                
                // Update user's last login and increment login count
                const now = new Date().toISOString();
                
                // Generate JWT token
                try {
                    const token = jwt.sign(
                        { 
                            id: user.id, 
                            email: user.email,
                            nom: user.nom,
                            role: user.role
                        },
                        process.env.JWT_SECRET,
                        { expiresIn: '7d' }
                    );

                    console.log('✅ Token generated successfully');
                    
                    // Update user login info (simplified)
                    db.query('UPDATE users SET last_login = $1, login_count = login_count + 1 WHERE id = $2', [now, user.id], (err) => {
                        if (err) {
                            console.error('⚠️ Error updating login info:', err);
                        }
                    });

                    res.json({
                        success: true,
                        message: 'Connexion réussie',
                        token: token,
                        user: {
                            id: user.id,
                            nom: user.nom,
                            email: user.email,
                            promo: user.promo,
                            role: user.role,
                            last_login: now,
                            login_count: (user.login_count || 0) + 1
                        }
                    });
                } catch (jwtError) {
                    console.error('❌ JWT generation error:', jwtError);
                    return res.status(500).json({ error: 'Erreur lors de la génération du token' });
                }
            });
        } else {
            // SQLite version (keep existing code)
            db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
                if (err) {
                    return res.status(500).json({ error: 'Erreur de base de données' });
                }

                if (!user) {
                    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
                }

                // Verify password
                const isValidPassword = await bcrypt.compare(password, user.password);
                if (!isValidPassword) {
                    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
                }

                // Get IP and user agent
                const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
                const userAgent = req.headers['user-agent'] || '';
                
                // Update user's last login and increment login count
                const now = new Date().toISOString();
                
                db.serialize(() => {
                    // Update user's last login and increment login count
                    db.run(
                        'UPDATE users SET last_login = ?, login_count = login_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        [now, user.id],
                        (err) => {
                            if (err) {
                                console.error('Error updating user login info:', err);
                            }
                            
                            // Log the login activity
                            db.run(
                                'INSERT INTO user_activity (user_id, login_time, ip_address, user_agent) VALUES (?, ?, ?, ?)',
                                [user.id, now, ip, userAgent],
                                (err) => {
                                    if (err) {
                                        console.error('Error logging user activity:', err);
                                    }
                                    
                                    // Generate JWT token
                                    const token = jwt.sign(
                                        { 
                                            id: user.id, 
                                            email: user.email,
                                            nom: user.nom,
                                            role: user.role
                                        },
                                        process.env.JWT_SECRET,
                                        { expiresIn: '7d' }
                                    );

                                    res.json({
                                        success: true,
                                        message: 'Connexion réussie',
                                        token: token,
                                        user: {
                                            id: user.id,
                                            nom: user.nom,
                                            email: user.email,
                                            promo: user.promo,
                                            role: user.role,
                                            last_login: now,
                                            login_count: (user.login_count || 0) + 1
                                        }
                                    });
                                }
                            );
                        }
                    );
                });
            });
        }
    } catch (error) {
        console.error('❌ Login endpoint error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Profile endpoint (protected)
app.get('/api/profile', authenticateToken, (req, res) => {
    db.get('SELECT id, nom, email, promo, linkedin, motivation, role, created_at FROM users WHERE id = ?', 
        [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur de base de données' });
        }

        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.json({ user });
    });
});

// Verify token endpoint
app.post('/api/verify-token', express.json(), (req, res) => {
    console.log('Verify token request body:', req.body);
    const token = req.body?.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        console.error('No token provided');
        return res.status(400).json({ error: 'Token requis' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token invalide' });
        }

        res.json({ 
            valid: true, 
            user: {
                id: decoded.id,
                nom: decoded.nom,
                email: decoded.email,
                role: decoded.role
            }
        });
    });
});

// Bureau membership request endpoint
app.post('/api/join-bureau', limiter, validateBureauRequest, (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array(),
                message: errors.array()[0].msg
            });
        }

        const { nom, prenom, promotion, bureau, email, telephone, motivation } = req.body;

        // Check if user already has a pending request for this bureau
        db.get('SELECT id FROM bureau_requests WHERE email = ? AND bureau = ? AND status = ?', 
            [email, bureau, 'pending'], (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            if (row) {
                return res.status(409).json({ 
                    error: 'Une demande est déjà en cours pour ce bureau avec cet email' 
                });
            }

            // Insert bureau request
            db.run(
                `INSERT INTO bureau_requests 
                (nom, prenom, promotion, bureau, email, telephone, motivation) 
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [nom, prenom, promotion, bureau, email, telephone || '', motivation || ''],
                function(err) {
                    if (err) {
                        console.error('Insert error:', err);
                        return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la demande' });
                    }

                    console.log(`✅ Nouvelle demande bureau: ${prenom} ${nom} (${email}) - Bureau ${bureau}`);
                    
                    // Send confirmation email (optional)
                    // sendConfirmationEmail(email, prenom, nom, bureau);
                    
                    res.status(201).json({
                        success: true,
                        message: 'Demande d\'adhésion envoyée avec succès',
                        requestId: this.lastID
                    });
                }
            );
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get bureau requests (admin only)
app.get('/api/bureau-requests', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { status, bureau } = req.query;
    let query = 'SELECT * FROM bureau_requests';
    let params = [];

    if (status || bureau) {
        query += ' WHERE';
        const conditions = [];
        
        if (status) {
            conditions.push(' status = ?');
            params.push(status);
        }
        
        if (bureau) {
            conditions.push(' bureau = ?');
            params.push(bureau);
        }
        
        query += conditions.join(' AND');
    }

    query += ' ORDER BY created_at DESC';

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Erreur de base de données' });
        }

        res.json({ requests: rows });
    });
});

// Update bureau request status (admin only)
app.put('/api/bureau-requests/:id', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Statut invalide' });
    }

    db.run(
        'UPDATE bureau_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id],
        function(err) {
            if (err) {
                console.error('Update error:', err);
                return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Demande non trouvée' });
            }

            console.log(`📝 Demande bureau ${id} mise à jour: ${status}`);
            res.json({ success: true, message: 'Statut mis à jour avec succès' });
        }
    );
});

// Project endpoints

// Create a new project
app.post('/api/projects', limiter, [
    body('title').trim().isLength({ min: 3 }).withMessage('Le titre doit contenir au moins 3 caractères'),
    body('objective').trim().isLength({ min: 10 }).withMessage('L\'objectif doit contenir au moins 10 caractères'),
    body('author').trim().isLength({ min: 2 }).withMessage('Le nom de l\'auteur doit contenir au moins 2 caractères'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('phone').trim().isLength({ min: 8 }).withMessage('Numéro de téléphone invalide')
], (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array() 
            });
        }

        const { title, objective, author, email, phone } = req.body;

        db.run(
            'INSERT INTO projects (title, objective, author, email, status) VALUES (?, ?, ?, ?, ?)',
            [title, objective, author, email, 'en_attente'],
            function(err) {
                if (err) {
                    console.error('Insert project error:', err);
                    return res.status(500).json({ error: 'Erreur lors de la création du projet' });
                }

                console.log(`✅ Nouveau projet créé: ${title} par ${author} (${email})`);
                res.status(201).json({
                    success: true,
                    message: 'Projet créé avec succès',
                    project: {
                        id: this.lastID,
                        title,
                        objective,
                        author,
                        email,
                        phone,
                        dateCreated: new Date().toLocaleDateString('fr-FR'),
                        participants: []
                    }
                });
            }
        );
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get all projects with participants
app.get('/api/projects', (req, res) => {
    const query = `
        SELECT 
            p.id,
            p.title,
            p.objective,
            p.author as author_name,
            p.email as author_email,
            p.created_at,
            COUNT(pp.id) as participant_count
        FROM projects p
        LEFT JOIN project_participants pp ON p.id = pp.project_id
        WHERE p.status = 'en_attente' OR p.status = 'active'
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `;

    db.all(query, [], (err, projects) => {
        if (err) {
            console.error('Get projects error:', err);
            return res.status(500).json({ error: 'Erreur lors de la récupération des projets' });
        }

        // Get participants for each project
        const projectsWithParticipants = [];
        let completed = 0;

        if (projects.length === 0) {
            return res.json({ projects: [] });
        }

        projects.forEach(project => {
            db.all(
                'SELECT name, email, phone, created_at FROM project_participants WHERE project_id = ?',
                [project.id],
                (err, participants) => {
                    if (err) {
                        console.error('Get participants error:', err);
                        participants = [];
                    }

                    projectsWithParticipants.push({
                        id: project.id,
                        title: project.title,
                        objective: project.objective,
                        author: project.author_name,
                        email: project.author_email,
                        phone: project.author_phone,
                        dateCreated: new Date(project.created_at).toLocaleDateString('fr-FR'),
                        participants: participants.map(p => ({
                            name: p.name,
                            email: p.email,
                            phone: p.phone,
                            joinedDate: new Date(p.created_at).toLocaleDateString('fr-FR')
                        }))
                    });

                    completed++;
                    if (completed === projects.length) {
                        // Sort by creation date (newest first)
                        projectsWithParticipants.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
                        res.json({ projects: projectsWithParticipants });
                    }
                }
            );
        });
    });
});

// Configure express.json avec une limite de taille augmentée
const jsonParser = express.json({ limit: '10mb' });

// Join a project
app.post('/api/projects/:id/join', [
    jsonParser,
    limiter,
    body('name').trim().isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères'),
    body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
    body('phone').trim().isLength({ min: 8 }).withMessage('Numéro de téléphone invalide')
], (req, res) => {
    console.log('=== DÉBUT TRAITEMENT /api/projects/:id/join ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Params:', JSON.stringify(req.params, null, 2));
    console.log('Join project request received:', {
        params: req.params,
        body: req.body,
        headers: req.headers
    });
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array() 
            });
        }

        const { id } = req.params;
        const { name, email, phone } = req.body;

        console.log('Vérification de l\'existence du projet avec ID:', id);
        // Check if project exists
        db.get('SELECT id FROM projects WHERE id = ? AND status = "active"', [id], (err, project) => {
            if (err) {
                console.error('Check project error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            if (!project) {
                return res.status(404).json({ error: 'Projet non trouvé' });
            }

            console.log('Vérification si le participant existe déjà pour le projet:', { project_id: id, email });
            db.get('SELECT id FROM project_participants WHERE project_id = ? AND email = ?', 
                [id, email], (err, participant) => {
                if (err) {
                    console.error('Check participant error:', err);
                    return res.status(500).json({ error: 'Erreur de base de données' });
                }

                if (participant) {
                    return res.status(409).json({ error: 'Vous avez déjà rejoint ce projet' });
                }

                // Add participant to project
                console.log('Tentative d\'ajout du participant:', { project_id: id, name, email, phone });
                db.run(
                    'INSERT INTO project_participants (project_id, name, email, phone, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                    [id, name, email, phone],
                    function(err) {
                        if (err) {
                            console.error('Insert participant error:', err);
                            return res.status(500).json({ error: 'Erreur lors de l\'inscription au projet' });
                        }

                        console.log(`✅ Nouveau participant: ${name} (${email}) a rejoint le projet ${id}`);
                        res.status(201).json({
                            success: true,
                            message: 'Vous avez rejoint le projet avec succès',
                            participant: {
                                name,
                                email,
                                phone,
                                joinedDate: new Date().toLocaleDateString('fr-FR')
                            }
                        });
                    }
                );
            });
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Organize event endpoint
app.post('/api/organize-event', limiter, validateEventOrganization, (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array(),
                message: errors.array()[0].msg
            });
        }

        const { email, eventType, location, description } = req.body;

        // Insert event organization request
        db.run(
            'INSERT INTO organized_events (title, description, date, location, organizer, status) VALUES (?, ?, ?, ?, ?, ?)',
            [eventType, description, new Date().toISOString().split('T')[0], location, email, 'pending'],
            function(err) {
                if (err) {
                    console.error('Insert event error:', err);
                    return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la demande d\'événement' });
                }

                console.log(`✅ Nouvelle demande d'organisation d'événement: ${eventType} à ${location} par ${email}`);
                res.status(201).json({
                    success: true,
                    message: 'Demande d\'organisation d\'événement envoyée avec succès',
                    eventId: this.lastID
                });
            }
        );
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get organized events (admin only)
app.get('/api/organized-events', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { status } = req.query;
    let query = 'SELECT * FROM organized_events';
    let params = [];

    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Erreur de base de données' });
        }

        res.json({ events: rows });
    });
});

// Submit membership request endpoint
app.post('/api/membership-request', limiter, validateMembershipRequest, (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array(),
                message: errors.array()[0].msg
            });
        }

        const { nom, email, promo, linkedin, motivation } = req.body;

        // Check if user already has a pending request
        db.get('SELECT id FROM membership_requests WHERE email = ? AND status = ?', 
            [email, 'pending'], (err, row) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            if (row) {
                return res.status(409).json({ 
                    error: 'Une demande d\'adhésion est déjà en cours pour cet email' 
                });
            }

            // Insert membership request
            // Extraire le prénom du nom complet
            const prenom = nom.split(' ')[0] || '';
            db.run(
                `INSERT INTO membership_requests 
                (nom, prenom, email, promo, linkedin, motivation) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [nom, prenom, email, promo, linkedin || '', motivation || ''],
                function(err) {
                    if (err) {
                        console.error('Insert error:', err);
                        return res.status(500).json({ error: 'Erreur lors de l\'enregistrement de la demande' });
                    }

                    console.log(`✅ Nouvelle demande d'adhésion: ${nom} (${email}) - Promo ${promo}`);
                    
                    res.status(201).json({
                        success: true,
                        message: 'Nous avons reçu votre demande avec succès. Nous vous contacterons sous un délai de trois semaines au maximum.',
                        requestId: this.lastID
                    });
                }
            );
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Get membership requests (admin only)
app.get('/api/membership-requests', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { status } = req.query;
    let query = 'SELECT * FROM membership_requests';
    let params = [];

    if (status) {
        query += ' WHERE status = ?';
        params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Erreur de base de données' });
        }

        res.json({ requests: rows });
    });
});

// Approve membership request and generate access token (admin only)
app.post('/api/membership-requests/:id/approve', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;
    const crypto = require('crypto');
    const accessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    db.run(
        'UPDATE membership_requests SET status = ?, access_token = ?, token_expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['approved', accessToken, expiresAt.toISOString(), id],
        function(err) {
            if (err) {
                console.error('Update error:', err);
                return res.status(500).json({ error: 'Erreur lors de l\'approbation' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Demande non trouvée' });
            }

            // Get the request details for email
            db.get('SELECT * FROM membership_requests WHERE id = ?', [id], (err, request) => {
                if (err) {
                    console.error('Get request error:', err);
                    return res.status(500).json({ error: 'Erreur lors de la récupération des détails' });
                }

                const accessLink = `${window.location.origin}/access.html?token=${accessToken}`;
                
                console.log(`✅ Demande d'adhésion approuvée: ${request.nom} (${request.email})`);
                console.log(`🔗 Lien d'accès généré: ${accessLink}`);
                
                res.json({ 
                    success: true, 
                    message: 'Demande approuvée avec succès',
                    accessLink: accessLink,
                    request: request
                });
            });
        }
    );
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    db.all(
        'SELECT id, nom, email, promo, linkedin, role, created_at FROM users ORDER BY created_at DESC',
        [],
        (err, users) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            res.json({ users });
        }
    );
});

// Update user role (admin only)
app.put('/api/users/:id/role', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
    }

    // Prevent admin from demoting themselves
    if (parseInt(id) === req.user.id && role === 'member') {
        return res.status(400).json({ error: 'Vous ne pouvez pas vous rétrograder vous-même' });
    }

    db.run(
        'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [role, id],
        function(err) {
            if (err) {
                console.error('Update user role error:', err);
                return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            console.log(`👑 Utilisateur ${id} mis à jour: rôle ${role}`);
            res.json({ success: true, message: 'Rôle mis à jour avec succès' });
        }
    );
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (parseInt(id) === req.user.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas vous supprimer vous-même' });
    }

    // Prevent deletion of super admin (ID 11)
    if (parseInt(id) === 11) {
        return res.status(400).json({ error: 'Le super administrateur ne peut pas être supprimé' });
    }

    db.run(
        'DELETE FROM users WHERE id = ?',
        [id],
        function(err) {
            if (err) {
                console.error('Delete user error:', err);
                return res.status(500).json({ error: 'Erreur lors de la suppression' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Utilisateur non trouvé' });
            }

            console.log(`🗑️ Utilisateur ${id} supprimé par l'admin ${req.user.id}`);
            res.json({ success: true, message: 'Utilisateur supprimé avec succès' });
        }
    );
});

// Get user activity (admin only)
app.get('/api/user-activity', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Get statistics
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Vérifier si les colonnes existent
    db.all("PRAGMA table_info(users)", [], (err, columns) => {
        if (err) {
            console.error('Erreur lors de la vérification des colonnes:', err);
            return res.status(500).json({ error: 'Erreur de base de données' });
        }

        const columnNames = columns.map(col => col.name);
        const hasLastLogin = columnNames.includes('last_login');
        const hasLoginCount = columnNames.includes('login_count');
        const hasUserActivity = columnNames.includes('user_activity');

        // Construire la requête en fonction des colonnes disponibles
        let query = `
            SELECT 
                u.id, 
                u.nom, 
                u.email, 
                u.promo, 
                u.role,
                ${hasLastLogin ? 'u.last_login' : 'NULL as last_login'},
                ${hasLoginCount ? 'u.login_count' : '0 as login_count'},
                u.created_at,
                (SELECT COUNT(*) FROM user_activity WHERE user_id = u.id) as total_logins,
                (SELECT login_time FROM user_activity WHERE user_id = u.id ORDER BY login_time DESC LIMIT 1) as last_activity
             FROM users u
             ${hasLastLogin ? 'WHERE u.last_login IS NOT NULL' : ''}
             ORDER BY ${hasLastLogin ? 'u.last_login' : 'u.id'} DESC
             LIMIT 100`;

        db.all(query, [], (err, activities) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            // Format activities with proper dates
            const formattedActivities = activities.map(activity => ({
                ...activity,
                last_login: activity.last_activity || activity.last_login || activity.created_at,
                total_logins: activity.login_count || 0
            }));

            // Calculate stats based on available data
            const stats = {
                online: 0,
                recent: 0,
                today: 0,
                week: 0
            };

            if (hasLastLogin) {
                stats.online = activities.filter(a => a.last_login && new Date(a.last_login) > fiveMinutesAgo).length;
                stats.recent = activities.filter(a => a.last_login && new Date(a.last_login) > oneHourAgo).length;
                stats.today = activities.filter(a => a.last_login && new Date(a.last_login) > oneDayAgo).length;
                stats.week = activities.filter(a => a.last_login && new Date(a.last_login) > oneWeekAgo).length;
            } else {
                // Si last_login n'est pas disponible, utiliser created_at comme approximation
                const now = new Date();
                const oneDay = 24 * 60 * 60 * 1000;
                const oneWeek = 7 * oneDay;
                
                activities.forEach(activity => {
                    const createdDate = new Date(activity.created_at);
                    const daysSinceCreation = (now - createdDate) / oneDay;
                    
                    if (daysSinceCreation < 1) stats.today++;
                    if (daysSinceCreation < 7) stats.week++;
                });
                
                // Pour les compteurs en ligne et récents, on ne peut pas faire mieux sans last_login
                stats.online = 0;
                stats.recent = stats.today;
            }

            res.json({ 
                stats,
                activities: formattedActivities,
                _debug: {
                    hasLastLogin,
                    hasLoginCount,
                    hasUserActivity
                }
            });
        });
    });
});

// Update organized event status (admin only)
app.put('/api/organized-events/:id', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Statut invalide' });
    }

    db.run(
        'UPDATE organized_events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id],
        function(err) {
            if (err) {
                console.error('Update error:', err);
                return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Événement non trouvé' });
            }

            console.log(`📝 Événement ${id} mis à jour: ${status}`);
            res.json({ success: true, message: 'Statut mis à jour avec succès' });
        }
    );
});

// Update membership request status (admin only)
app.put('/api/membership-requests/:id', authenticateToken, (req, res) => {
    // Check if user has admin role
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Statut invalide' });
    }

    db.run(
        'UPDATE membership_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id],
        function(err) {
            if (err) {
                console.error('Update error:', err);
                return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Demande non trouvée' });
            }

            console.log(`📝 Demande d'adhésion ${id} mise à jour: ${status}`);
            res.json({ success: true, message: 'Statut mis à jour avec succès' });
        }
    );
});

// Verify access token and get request details
app.get('/api/verify-access-token/:token', (req, res) => {
    const { token } = req.params;
    
    db.get(
        'SELECT * FROM membership_requests WHERE access_token = ? AND status = ? AND token_expires_at > datetime(\'now\')',
        [token, 'approved'],
        (err, request) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            if (!request) {
                return res.status(401).json({ error: 'Token invalide ou expiré' });
            }

            res.json({ 
                valid: true,
                request: {
                    id: request.id,
                    nom: request.nom,
                    email: request.email,
                    promo: request.promo,
                    linkedin: request.linkedin,
                    motivation: request.motivation
                }
            });
        }
    );
});

// Après toutes les routes API en GET : sinon app.get('*') intercepte /api/... et casse l’admin
app.get('/review', (req, res) => {
    res.redirect('/');
});

app.get('*', (req, res) => {
    res.redirect('/');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Erreur serveur interne' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint non trouvé' });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nFermeture du serveur...');
    if (process.env.NODE_ENV === 'production') {
        db.end(() => {
            console.log('Base de données PostgreSQL fermée.');
            process.exit(0);
        });
    } else {
        db.close((err) => {
            if (err) {
                console.error('Erreur lors de la fermeture de la base de données:', err.message);
            } else {
                console.log('Base de données SQLite fermée.');
            }
            process.exit(0);
        });
    }
});

// Démarrer le serveur
startServer();

module.exports = app;
