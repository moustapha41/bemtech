const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Définir le chemin de la base de données (même que dans server.js)
const dbDir = path.join(__dirname, '../database');
const dbPath = path.join(dbDir, 'alumni.db');

// Vérifier si le répertoire de la base de données existe, sinon le créer
if (!fs.existsSync(dbDir)) {
    try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`Répertoire créé: ${dbDir}`);
    } catch (err) {
        console.error('Erreur lors de la création du répertoire:', err);
        process.exit(1);
    }
}

console.log(`Chemin de la base de données: ${dbPath}`);

// Connexion à la base de données
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Erreur de connexion à la base de données:', err);
        process.exit(1);
    }
    console.log('Connecté à la base de données SQLite');
});

// Activer les contraintes de clé étrangère
db.get("PRAGMA foreign_keys = ON");

// Exécution des migrations en série
db.serialize(() => {
    // Vérifier si la table users existe
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", [], (err, row) => {
        if (err) {
            console.error('Erreur lors de la vérification de la table users:', err);
            return closeDb(1);
        }
        
        if (!row) {
            console.error('La table users n\'existe pas dans la base de données');
            return closeDb(1);
        }
        
        // Vérifier les colonnes existantes
        db.all("PRAGMA table_info(users)", [], (err, columns) => {
            if (err) {
                console.error('Erreur lors de la vérification des colonnes:', err);
                return closeDb(1);
            }
            
            const columnNames = columns.map(col => col.name);
            
            // Ajouter last_login si nécessaire
            if (!columnNames.includes('last_login')) {
                db.run(`
                    ALTER TABLE users 
                    ADD COLUMN last_login DATETIME;
                `, (err) => {
                    if (err) {
                        console.error('Erreur lors de l\'ajout de la colonne last_login:', err);
                    } else {
                        console.log('✅ Colonne last_login ajoutée avec succès');
                    }
                    checkAndClose();
                });
            } else {
                console.log('ℹ️ La colonne last_login existe déjà');
                checkAndClose();
            }
            
            // Ajouter login_count si nécessaire
            if (!columnNames.includes('login_count')) {
                db.run(`
                    ALTER TABLE users 
                    ADD COLUMN login_count INTEGER DEFAULT 0;
                `, (err) => {
                    if (err) {
                        console.error('Erreur lors de l\'ajout de la colonne login_count:', err);
                    } else {
                        console.log('✅ Colonne login_count ajoutée avec succès');
                    }
                    checkAndClose();
                });
            } else {
                console.log('ℹ️ La colonne login_count existe déjà');
                checkAndClose();
            }
        });
    });

    // Création de la table user_activity si elle n'existe pas
    db.run(`
        CREATE TABLE IF NOT EXISTS user_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            ip_address TEXT,
            user_agent TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    `, (err) => {
        if (err) {
            console.error('Erreur lors de la création de la table user_activity:', err);
        } else {
            console.log('✅ Table user_activity créée ou déjà existante');
        }
        checkAndClose();
    });
});

let operationsCompleted = 0;
const totalOperations = 3; // Vérification users + ajout last_login + ajout login_count + création user_activity

function checkAndClose() {
    operationsCompleted++;
    if (operationsCompleted >= totalOperations) {
        closeDb(0);
    }
}

function closeDb(exitCode) {
    db.close((err) => {
        if (err) {
            console.error('Erreur lors de la fermeture de la base de données:', err);
            process.exit(1);
        } else {
            console.log('\n✅ Migration terminée avec succès');
            process.exit(exitCode);
        }
    });
}
