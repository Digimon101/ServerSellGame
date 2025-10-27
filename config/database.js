const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

// --- Configuration ---
const DB_PATH = path.join(__dirname, '..', 'Data.db');
const DB_CONFIG = {
    filename: DB_PATH,
    driver: sqlite3.Database
};

// --- Database Connection Function ---
const openDb = async () => {
    try {
        const db = await sqlite.open(DB_CONFIG);
        
        // Enable optimizations
        await db.run('PRAGMA journal_mode = WAL;');
        await db.run('PRAGMA foreign_keys = ON;');
        await db.run('PRAGMA busy_timeout = 5000;'); // 5 second timeout
        
        return db;
    } catch (err) {
        console.error("❌ Database Connection Error:", err.message);
        throw err;
    }
};

// --- Initialize Database Schema ---
const initializeSchema = async () => {
    let db;
    try {
        db = await openDb();
        console.log(`✅ Connected to database: ${DB_PATH}`);
        console.log("⏳ Initializing schema...");

        await db.exec(`
            -- 1. User Table
            CREATE TABLE IF NOT EXISTS User (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                type INTEGER DEFAULT 0,
                image TEXT,
                wallet REAL DEFAULT 0.00 NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 2. Genres Table
            CREATE TABLE IF NOT EXISTS Genres (
                GenreID INTEGER PRIMARY KEY AUTOINCREMENT,
                GenreName VARCHAR(50) NOT NULL UNIQUE
            );

            -- 3. Games Table
            CREATE TABLE IF NOT EXISTS Games (
                GameID INTEGER PRIMARY KEY AUTOINCREMENT,
                Title VARCHAR(255) NOT NULL,
                ReleaseDate DATE,
                Price REAL DEFAULT 0.00,
                Description TEXT,
                ImageUrl VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 4. GamesGenres Table (Many-to-Many)
            CREATE TABLE IF NOT EXISTS GamesGenres (
                GameID INTEGER NOT NULL,
                GenreID INTEGER NOT NULL,
                PRIMARY KEY (GameID, GenreID),
                FOREIGN KEY (GameID) REFERENCES Games(GameID) ON DELETE CASCADE,
                FOREIGN KEY (GenreID) REFERENCES Genres(GenreID) ON DELETE CASCADE
            );

            -- 5. GamePurchases Table
            CREATE TABLE IF NOT EXISTS GamePurchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_id INTEGER NOT NULL,
                purchase_price REAL NOT NULL,
                purchase_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
                FOREIGN KEY (game_id) REFERENCES Games(GameID) ON DELETE CASCADE
            );

            -- 6. TopupHistory Table
            CREATE TABLE IF NOT EXISTS TopupHistory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                payment_method VARCHAR(50),
                status VARCHAR(20) NOT NULL DEFAULT 'Completed',
                FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
            );

            -- 7. CartItems Table
            CREATE TABLE IF NOT EXISTS CartItems (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1,
                added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
                FOREIGN KEY (game_id) REFERENCES Games(GameID) ON DELETE CASCADE,
                UNIQUE (user_id, game_id)
            );

            -- 8. Coupons Table
            CREATE TABLE IF NOT EXISTS Coupons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
                discount_value REAL NOT NULL,
                expiry_date DATETIME,
                is_active INTEGER DEFAULT 1 NOT NULL,
                max_uses INTEGER,
                uses_count INTEGER DEFAULT 0 NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 9. CouponUsage Table
            CREATE TABLE IF NOT EXISTS CouponUsage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                coupon_id INTEGER NOT NULL,
                used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
                FOREIGN KEY (coupon_id) REFERENCES Coupons(id) ON DELETE CASCADE,
                UNIQUE (user_id, coupon_id)
            );

            -- 10. Promotions Table
            CREATE TABLE IF NOT EXISTS Promotions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                discount_percentage REAL NOT NULL CHECK(discount_percentage > 0 AND discount_percentage <= 100),
                start_date DATETIME,
                end_date DATETIME,
                is_active INTEGER DEFAULT 1 NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES Games(GameID) ON DELETE CASCADE
            );

            -- Indexes for Performance
            CREATE INDEX IF NOT EXISTS idx_user_email ON User(email);
            CREATE INDEX IF NOT EXISTS idx_user_type ON User(type);
            
            CREATE INDEX IF NOT EXISTS idx_games_title ON Games(Title);
            CREATE INDEX IF NOT EXISTS idx_games_price ON Games(Price);
            
            CREATE INDEX IF NOT EXISTS idx_gamesgenres_game ON GamesGenres(GameID);
            CREATE INDEX IF NOT EXISTS idx_gamesgenres_genre ON GamesGenres(GenreID);
            
            CREATE INDEX IF NOT EXISTS idx_gamepurchases_user ON GamePurchases(user_id);
            CREATE INDEX IF NOT EXISTS idx_gamepurchases_game ON GamePurchases(game_id);
            CREATE INDEX IF NOT EXISTS idx_gamepurchases_date ON GamePurchases(purchase_date);
            
            CREATE INDEX IF NOT EXISTS idx_cartitems_user ON CartItems(user_id);
            CREATE INDEX IF NOT EXISTS idx_cartitems_game ON CartItems(game_id);
            
            CREATE INDEX IF NOT EXISTS idx_promotions_game ON Promotions(game_id);
            CREATE INDEX IF NOT EXISTS idx_promotions_active ON Promotions(is_active, start_date, end_date);
            
            CREATE INDEX IF NOT EXISTS idx_coupons_code ON Coupons(code);
            CREATE INDEX IF NOT EXISTS idx_coupons_active ON Coupons(is_active);
            
            CREATE INDEX IF NOT EXISTS idx_couponusage_user_coupon ON CouponUsage(user_id, coupon_id);
            
            CREATE INDEX IF NOT EXISTS idx_topuphistory_user ON TopupHistory(user_id);
            CREATE INDEX IF NOT EXISTS idx_topuphistory_date ON TopupHistory(transaction_date);
        `);

        console.log("✅ Schema initialized successfully");

        // Seed default genres
        await seedDefaultGenres(db);
        
        console.log("✅ Database initialization complete");

    } catch (error) {
        console.error("❌ Schema Initialization Error:", error.message);
        throw error;
    } finally {
        if (db) {
            await db.close();
            console.log("🔒 Database connection closed");
        }
    }
};

// --- Seed Default Genres ---
const seedDefaultGenres = async (db) => {
    try {
        const genres = [
            'Action', 'Adventure', 'Role-Playing (RPG)', 'Strategy', 
            'Simulation', 'Sports', 'Puzzle', 'Racing', 
            'Horror', 'Platformer', 'Fighting', 'Survival',
            'Sandbox', 'MOBA', 'Battle Royale', 'FPS'
        ];

        const stmt = await db.prepare('INSERT OR IGNORE INTO Genres (GenreName) VALUES (?)');
        
        for (const genre of genres) {
            await stmt.run(genre);
        }
        
        await stmt.finalize();
        console.log("🌱 Default genres seeded");
    } catch (error) {
        console.error("❌ Error seeding genres:", error.message);
    }
};

// --- Helper: Execute with Auto-Close ---
const executeQuery = async (callback) => {
    let db;
    try {
        db = await openDb();
        return await callback(db);
    } catch (error) {
        console.error("❌ Query Execution Error:", error.message);
        throw error;
    } finally {
        if (db) {
            await db.close();
        }
    }
};

// --- Helper: Execute Transaction ---
const executeTransaction = async (callback) => {
    let db;
    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');
        
        const result = await callback(db);
        
        await db.run('COMMIT');
        return result;
    } catch (error) {
        if (db) {
            await db.run('ROLLBACK');
        }
        console.error("❌ Transaction Error:", error.message);
        throw error;
    } finally {
        if (db) {
            await db.close();
        }
    }
};

// --- Export Functions ---
module.exports = {
    openDb,              // Manual connection management
    initializeSchema,    // Initialize DB schema
    executeQuery,        // Auto-close query execution
    executeTransaction   // Auto-close transaction execution
};

// --- Usage Examples ---

/*
// 1. Server Startup (server.js):
const database = require('./config/database');

database.initializeSchema()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error("💀 Failed to initialize database");
        process.exit(1);
    });

// 2. Simple Query (Using executeQuery):
const database = require('../config/database');

exports.getCart = async (req, res) => {
    const userId = req.params.userId;
    
    try {
        const items = await database.executeQuery(async (db) => {
            return await db.all(`
                SELECT c.*, g.Title, g.Price, g.ImageUrl 
                FROM CartItems c
                JOIN Games g ON c.game_id = g.GameID
                WHERE c.user_id = ?
            `, [userId]);
        });
        
        res.json(items);
    } catch (error) {
        console.error("❌ Error fetching cart:", error.message);
        res.status(500).json({ message: 'Error fetching cart' });
    }
};

// 3. Transaction (Using executeTransaction):
exports.addToCart = async (req, res) => {
    const { userId, gameId, quantity = 1 } = req.body;
    
    try {
        await database.executeTransaction(async (db) => {
            // Check if game exists
            const game = await db.get('SELECT * FROM Games WHERE GameID = ?', [gameId]);
            if (!game) throw new Error('Game not found');
            
            // Check if already in cart
            const existing = await db.get(
                'SELECT * FROM CartItems WHERE user_id = ? AND game_id = ?',
                [userId, gameId]
            );
            
            if (existing) {
                await db.run(
                    'UPDATE CartItems SET quantity = quantity + ? WHERE id = ?',
                    [quantity, existing.id]
                );
            } else {
                await db.run(
                    'INSERT INTO CartItems (user_id, game_id, quantity) VALUES (?, ?, ?)',
                    [userId, gameId, quantity]
                );
            }
        });
        
        res.status(200).json({ message: 'Added to cart successfully' });
    } catch (error) {
        console.error("❌ Error adding to cart:", error.message);
        res.status(500).json({ message: error.message });
    }
};

// 4. Manual Connection (For complex scenarios):
const database = require('../config/database');

exports.complexOperation = async (req, res) => {
    let db;
    try {
        db = await database.openDb();
        
        // Multiple operations
        const data1 = await db.all('SELECT ...');
        const data2 = await db.all('SELECT ...');
        
        res.json({ data1, data2 });
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ message: 'Error' });
    } finally {
        if (db) await db.close();
    }
};
*/