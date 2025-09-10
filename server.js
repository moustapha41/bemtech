const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Allow inline scripts for development
}));
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

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
const dbPath = process.env.DB_PATH || './database/alumni.db';
const db = new sqlite3.Database(dbPath);

// Initialize database
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table pour les demandes d'adhésion aux bureaux
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
    )`);
    
    // Table pour les projets
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_email TEXT NOT NULL,
        author_phone TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table pour les participants aux projets
    db.run(`CREATE TABLE IF NOT EXISTS project_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        participant_name TEXT NOT NULL,
        participant_email TEXT NOT NULL,
        participant_phone TEXT NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects (id),
        UNIQUE(project_id, participant_email)
    )`);
    
    // Table pour les événements organisés par les utilisateurs
    db.run(`CREATE TABLE IF NOT EXISTS organized_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organizer_email TEXT NOT NULL,
        event_type TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Table pour les demandes d'adhésion à la communauté
    db.run(`CREATE TABLE IF NOT EXISTS membership_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        email TEXT NOT NULL,
        promo TEXT NOT NULL,
        linkedin TEXT,
        motivation TEXT,
        status TEXT DEFAULT 'pending',
        access_token TEXT,
        token_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Créer un compte administrateur par défaut
    const adminEmail = 'admin@bemtech.com';
    const adminPassword = 'admin123';
    
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
                        console.log('   URL: http://localhost:4000/admin.html');
                    }
                }
            );
        }
    });
    
});

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
                        { expiresIn: process.env.JWT_EXPIRES_IN }
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
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Login endpoint
app.post('/api/login', authLimiter, validateLogin, (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                error: 'Données invalides', 
                details: errors.array() 
            });
        }

        const { email, password } = req.body;

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

            // Generate JWT token
            const token = jwt.sign(
                { 
                    id: user.id, 
                    email: user.email,
                    nom: user.nom,
                    role: user.role
                },
                process.env.JWT_SECRET,
                { expiresIn: process.env.JWT_EXPIRES_IN }
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
                    role: user.role
                }
            });
        });
    } catch (error) {
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
app.post('/api/verify-token', (req, res) => {
    const { token } = req.body;
    
    if (!token) {
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
            'INSERT INTO projects (title, objective, author_name, author_email, author_phone) VALUES (?, ?, ?, ?, ?)',
            [title, objective, author, email, phone],
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
            p.author_name,
            p.author_email,
            p.author_phone,
            p.created_at,
            COUNT(pp.id) as participant_count
        FROM projects p
        LEFT JOIN project_participants pp ON p.id = pp.project_id
        WHERE p.status = 'active'
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
                'SELECT participant_name, participant_email, participant_phone, joined_at FROM project_participants WHERE project_id = ?',
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
                            name: p.participant_name,
                            email: p.participant_email,
                            phone: p.participant_phone,
                            joinedDate: new Date(p.joined_at).toLocaleDateString('fr-FR')
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

// Join a project
app.post('/api/projects/:id/join', limiter, [
    body('name').trim().isLength({ min: 2 }).withMessage('Le nom doit contenir au moins 2 caractères'),
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

        const { id } = req.params;
        const { name, email, phone } = req.body;

        // Check if project exists
        db.get('SELECT id FROM projects WHERE id = ? AND status = "active"', [id], (err, project) => {
            if (err) {
                console.error('Check project error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            if (!project) {
                return res.status(404).json({ error: 'Projet non trouvé' });
            }

            // Check if user already joined this project
            db.get('SELECT id FROM project_participants WHERE project_id = ? AND participant_email = ?', 
                [id, email], (err, participant) => {
                if (err) {
                    console.error('Check participant error:', err);
                    return res.status(500).json({ error: 'Erreur de base de données' });
                }

                if (participant) {
                    return res.status(409).json({ error: 'Vous avez déjà rejoint ce projet' });
                }

                // Add participant to project
                db.run(
                    'INSERT INTO project_participants (project_id, participant_name, participant_email, participant_phone) VALUES (?, ?, ?, ?)',
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
            'INSERT INTO organized_events (organizer_email, event_type, location, description) VALUES (?, ?, ?, ?)',
            [email, eventType, location, description],
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
            db.run(
                `INSERT INTO membership_requests 
                (nom, email, promo, linkedin, motivation) 
                VALUES (?, ?, ?, ?, ?)`,
                [nom, email, promo, linkedin || '', motivation || ''],
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

                const accessLink = `http://localhost:4000/access.html?token=${accessToken}`;
                
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
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get user activities with last login simulation (since we don't have actual login tracking yet)
    db.all(
        `SELECT 
            id, nom, email, promo, created_at,
            datetime('now', '-' || (id * 7 + 3) || ' minutes') as last_login,
            (id * 2 + 5) as total_logins
         FROM users 
         ORDER BY last_login DESC 
         LIMIT 20`,
        [],
        (err, activities) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Erreur de base de données' });
            }

            // Calculate stats based on simulated data
            const stats = {
                online: activities.filter(a => new Date(a.last_login) > fiveMinutesAgo).length,
                recent: activities.filter(a => new Date(a.last_login) > new Date(now.getTime() - 60 * 60 * 1000)).length,
                today: activities.filter(a => new Date(a.last_login) > oneDayAgo).length,
                week: activities.filter(a => new Date(a.last_login) > oneWeekAgo).length
            };

            res.json({ 
                stats,
                activities
            });
        }
    );
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
    db.close((err) => {
        if (err) {
            console.error('Erreur lors de la fermeture de la base de données:', err.message);
        } else {
            console.log('Base de données fermée.');
        }
        process.exit(0);
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur BemTech Alumni démarré sur http://localhost:${PORT}`);
    console.log(`📊 Base de données: ${dbPath}`);
    console.log(`🔒 Mode: ${process.env.NODE_ENV}`);
    console.log(`📧 Email configuré: ${process.env.EMAIL_USER ? '✅' : '❌'}`);
});

module.exports = app;
