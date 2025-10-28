const multer = require('multer');
const path = require('path');
const database = require('../config/database');

// --- Multer Configuration for Game Images ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/gamepic/');
    },
    filename: (req, file, cb) => {
        cb(null, 'game-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ----------------------------------------------------------------------
// Get All Genres
// ----------------------------------------------------------------------
const getGenres = async (req, res) => {
    try {
        const genres = await database.executeQuery(async (db) => {
            return await db.all('SELECT GenreID, GenreName FROM Genres ORDER BY GenreName ASC');
        });

        res.status(200).json(genres || []);
    } catch (error) {
        console.error('❌ Error fetching genres:', error.message);
        res.status(500).json({ error: 'Server failed to retrieve genres.' });
    }
};

// ----------------------------------------------------------------------
// Get All Games (with Promotions)
// ----------------------------------------------------------------------
const getGames = async (req, res) => {
    try {
        const games = await database.executeQuery(async (db) => {
            const gamesSql = `
                SELECT
                    g.GameID, g.Title, g.ReleaseDate, g.Price, g.Description, g.ImageUrl,
                    p.discount_percentage AS DiscountPercentage,
                    p.start_date AS PromotionStartDate,
                    p.end_date AS PromotionEndDate
                FROM Games g
                LEFT JOIN Promotions p ON g.GameID = p.game_id
                    AND p.is_active = 1
                    AND (p.start_date IS NULL OR p.start_date <= DATE('now'))
                    AND (p.end_date IS NULL OR p.end_date >= DATE('now'))
                ORDER BY g.GameID DESC
            `;
            return await db.all(gamesSql);
        });

        const processedGames = (games || []).map(game => ({
            ...game,
            ImageUrl: game.ImageUrl ? 
                (game.ImageUrl.startsWith('/') ? game.ImageUrl : `/gamepic/${path.basename(game.ImageUrl)}`) 
                : null
        }));

        res.status(200).json(processedGames);
    } catch (error) {
        console.error('❌ Error fetching games:', error.message);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์ในการดึงข้อมูล' });
    }
};

// ----------------------------------------------------------------------
// Get Game Details
// ----------------------------------------------------------------------
const getGameDetails = async (req, res) => {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Game ID ไม่ถูกต้อง' });
    }

    try {
        const result = await database.executeQuery(async (db) => {
            const gameSql = `
                SELECT
                    g.GameID, g.Title, g.ReleaseDate, g.Price, g.Description, g.ImageUrl,
                    p.id AS PromotionID, p.discount_percentage AS DiscountPercentage,
                    p.start_date AS PromotionStartDate, p.end_date AS PromotionEndDate
                FROM Games g
                LEFT JOIN Promotions p ON g.GameID = p.game_id AND p.is_active = 1
                    AND (p.start_date IS NULL OR p.start_date <= DATE('now'))
                    AND (p.end_date IS NULL OR p.end_date >= DATE('now'))
                WHERE g.GameID = ?
            `;
            const game = await db.get(gameSql, gameId);

            if (!game) {
                throw new Error('ไม่พบเกม');
            }

            const genresSql = 'SELECT GenreID FROM GamesGenres WHERE GameID = ?';
            const selectedGenres = await db.all(genresSql, gameId);
            const selectedGenreIDs = selectedGenres.map(g => g.GenreID);

            return {
                ...game,
                SelectedGenreIDs: selectedGenreIDs
            };
        });

        res.status(200).json(result);
    } catch (error) {
        console.error(`❌ Error fetching game ${gameId}:`, error.message);
        
        if (error.message === 'ไม่พบเกม') {
            return res.status(404).json({ error: error.message });
        }
        
        res.status(500).json({ error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
    }
};

// ----------------------------------------------------------------------
// Add New Game
// ----------------------------------------------------------------------
const addGame = async (req, res) => {
    const { Title, Price, Description, SelectedGenreIDs } = req.body;
    const file = req.file;
    const ReleaseDate = new Date().toISOString().split('T')[0];

    if (!Title || !Price || !Description || !SelectedGenreIDs || !file) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลและอัปโหลดรูปภาพให้ครบถ้วน' });
    }

    const priceValue = parseFloat(Price);
    if (isNaN(priceValue) || priceValue < 0) {
        return res.status(400).json({ error: 'ราคาต้องเป็นตัวเลขที่ถูกต้อง' });
    }

    let parsedGenreIDs;
    try {
        parsedGenreIDs = JSON.parse(SelectedGenreIDs);
        if (!Array.isArray(parsedGenreIDs) || parsedGenreIDs.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกหมวดหมู่อย่างน้อย 1 ประเภท' });
        }
    } catch (e) {
        return res.status(400).json({ error: 'รูปแบบของ SelectedGenreIDs ไม่ถูกต้อง' });
    }

    const ImageUrl = `/gamepic/${file.filename}`;

    try {
        const gameId = await database.executeTransaction(async (db) => {
            const result = await db.run(
                `INSERT INTO Games (Title, ReleaseDate, Price, Description, ImageUrl)
                 VALUES (?, ?, ?, ?, ?)`,
                [Title, ReleaseDate, priceValue, Description, ImageUrl]
            );

            const newGameId = result.lastID;

            const stmt = await db.prepare('INSERT INTO GamesGenres (GameID, GenreID) VALUES (?, ?)');
            for (const genreId of parsedGenreIDs) {
                await stmt.run(newGameId, genreId);
            }
            await stmt.finalize();

            return newGameId;
        });

        console.log(`✅ เพิ่มเกมใหม่สำเร็จ: GameID: ${gameId}, Title: ${Title}`);

        res.status(201).json({
            message: 'เพิ่มเกมเข้าฐานข้อมูลเรียบร้อยแล้ว',
            gameId: gameId,
            data: { Title, ReleaseDate, Price: priceValue, Description, ImageUrl }
        });
    } catch (error) {
        console.error('❌ Error adding game:', error.message);
        res.status(500).json({ error: `เกิดข้อผิดพลาด: ${error.message}` });
    }
};

// ----------------------------------------------------------------------
// Update Game
// ----------------------------------------------------------------------
const updateGame = async (req, res) => {
    const gameId = parseInt(req.params.id);
    const {
        Title, Price, Description, SelectedGenreIDs,
        discountPercentage, promotionStartDate, promotionEndDate
    } = req.body;
    const file = req.file;

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Game ID ไม่ถูกต้อง' });
    }
    if (!Title || !Price || !Description || !SelectedGenreIDs) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลหลักให้ครบถ้วน' });
    }

    let parsedGenreIDs;
    try {
        parsedGenreIDs = JSON.parse(SelectedGenreIDs);
        if (!Array.isArray(parsedGenreIDs)) throw new Error();
    } catch (e) {
        return res.status(400).json({ error: 'รูปแบบหมวดหมู่เกมไม่ถูกต้อง' });
    }

    const priceValue = parseFloat(Price);
    if (isNaN(priceValue) || priceValue < 0) {
        return res.status(400).json({ error: 'ราคาต้องเป็นตัวเลขที่ถูกต้อง' });
    }

    const discountPercentValue = discountPercentage ? parseFloat(discountPercentage) : null;
    if (discountPercentValue !== null) {
        if (isNaN(discountPercentValue) || discountPercentValue <= 0 || discountPercentValue > 100) {
            return res.status(400).json({ error: 'เปอร์เซ็นต์ส่วนลดต้องอยู่ระหว่าง 0 ถึง 100' });
        }
        if (promotionStartDate && isNaN(Date.parse(promotionStartDate))) {
            return res.status(400).json({ error: 'รูปแบบวันที่เริ่มโปรโมชั่นไม่ถูกต้อง' });
        }
        if (promotionEndDate && isNaN(Date.parse(promotionEndDate))) {
            return res.status(400).json({ error: 'รูปแบบวันที่สิ้นสุดโปรโมชั่นไม่ถูกต้อง' });
        }
        if (promotionStartDate && promotionEndDate && new Date(promotionEndDate) < new Date(promotionStartDate)) {
            return res.status(400).json({ error: 'วันที่สิ้นสุดต้องไม่มาก่อนวันที่เริ่ม' });
        }
    }

    let finalImageUrl = req.body.OriginalImageUrl || null;
    if (file) {
        finalImageUrl = `/gamepic/${file.filename}`;
    }

    try {
        await database.executeTransaction(async (db) => {
            await db.run(
                `UPDATE Games SET Title = ?, Price = ?, Description = ?, ImageUrl = ? WHERE GameID = ?`,
                [Title, priceValue, Description, finalImageUrl, gameId]
            );

            await db.run('DELETE FROM GamesGenres WHERE GameID = ?', gameId);
            const genreStmt = await db.prepare('INSERT INTO GamesGenres (GameID, GenreID) VALUES (?, ?)');
            for (const genreId of parsedGenreIDs) {
                await genreStmt.run(gameId, genreId);
            }
            await genreStmt.finalize();

            await db.run('UPDATE Promotions SET is_active = 0 WHERE game_id = ? AND is_active = 1', gameId);

            if (discountPercentValue !== null && discountPercentValue > 0) {
                await db.run(
                    `INSERT INTO Promotions (game_id, discount_percentage, start_date, end_date, is_active)
                     VALUES (?, ?, ?, ?, 1)`,
                    [gameId, discountPercentValue, promotionStartDate || null, promotionEndDate || null]
                );
                console.log(`✅ Set new promotion for GameID ${gameId}: ${discountPercentValue}%`);
            } else {
                console.log(`ℹ️ No new promotion set for GameID ${gameId}`);
            }
        });

        console.log(`✅ อัปเดตเกมสำเร็จ: GameID: ${gameId}`);
        res.status(200).json({ message: 'อัปเดตเกมและโปรโมชั่นเรียบร้อยแล้ว', gameId: gameId });
    } catch (error) {
        console.error('❌ Error updating game:', error.message);
        res.status(500).json({ error: `เกิดข้อผิดพลาด: ${error.message}` });
    }
};

// ----------------------------------------------------------------------
// Delete Game
// ----------------------------------------------------------------------
const deleteGame = async (req, res) => {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Game ID ไม่ถูกต้อง' });
    }

    try {
        await database.executeTransaction(async (db) => {
            await db.run('DELETE FROM GamesGenres WHERE GameID = ?', gameId);
            const result = await db.run('DELETE FROM Games WHERE GameID = ?', gameId);

            if (result.changes === 0) {
                throw new Error('ไม่พบเกมที่ต้องการลบ');
            }
        });

        console.log(`✅ ลบเกมสำเร็จ: GameID: ${gameId}`);
        res.status(200).json({ message: `ลบเกม ID ${gameId} เรียบร้อยแล้ว` });
    } catch (error) {
        console.error('❌ Error deleting game:', error.message);
        
        if (error.message === 'ไม่พบเกมที่ต้องการลบ') {
            return res.status(404).json({ error: error.message });
        }
        
        res.status(500).json({ error: `เกิดข้อผิดพลาด: ${error.message}` });
    }
};

// ----------------------------------------------------------------------
// Search Games
// ----------------------------------------------------------------------
const searchGames = async (req, res) => {
    const query = req.query.query || '';
    const trimmedQuery = query.trim();
    
    if (trimmedQuery.length < 1) {
        return res.status(200).json([]);
    }

    try {
        const games = await database.executeQuery(async (db) => {
            const searchQuery = `%${trimmedQuery}%`;
            return await db.all(
                `SELECT GameID, Title, Price, ImageUrl
                 FROM Games
                 WHERE Title LIKE ?
                 LIMIT 10`,
                searchQuery
            );
        });

        res.status(200).json(games || []);
    } catch (error) {
        console.error('❌ Error searching games:', error.message);
        res.status(500).json({ error: 'Server failed to perform search.' });
    }
};

// ----------------------------------------------------------------------
// Search Games with Genres Filter
// ----------------------------------------------------------------------
const searchGamesWithGenres = async (req, res) => {
    const query = req.query.query || '';
    const genresParam = req.query.genres || '';
    
    const trimmedQuery = query.trim();
    const genreIds = genresParam 
        ? genresParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
        : [];

    try {
        const games = await database.executeQuery(async (db) => {
            if (genreIds.length > 0) {
                const placeholders = genreIds.map(() => '?').join(',');
                
                let sql = `
                    SELECT DISTINCT g.GameID, g.Title, g.Price, g.Description, g.ImageUrl, g.ReleaseDate
                    FROM Games g
                    INNER JOIN GamesGenres gg ON g.GameID = gg.GameID
                    WHERE gg.GenreID IN (${placeholders})
                `;
                
                let params = [...genreIds];

                if (trimmedQuery.length > 0) {
                    sql += ` AND g.Title LIKE ?`;
                    params.push(`%${trimmedQuery}%`);
                }

                sql += ` ORDER BY g.GameID DESC LIMIT 50`;

                return await db.all(sql, params);

            } else if (trimmedQuery.length > 0) {
                return await db.all(
                    `SELECT GameID, Title, Price, Description, ImageUrl, ReleaseDate
                     FROM Games
                     WHERE Title LIKE ?
                     ORDER BY GameID DESC
                     LIMIT 50`,
                    `%${trimmedQuery}%`
                );
            } else {
                return await db.all(
                    `SELECT GameID, Title, Price, Description, ImageUrl, ReleaseDate
                     FROM Games
                     ORDER BY GameID DESC
                     LIMIT 50`
                );
            }
        });

        res.status(200).json(games || []);
    } catch (error) {
        console.error('❌ Error searching games with genres:', error.message);
        res.status(500).json({ error: 'Server failed to perform search.' });
    }
};

// ----------------------------------------------------------------------
// Get Game Genres
// ----------------------------------------------------------------------
const getGameGenres = async (req, res) => {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Invalid Game ID' });
    }

    try {
        const genres = await database.executeQuery(async (db) => {
            return await db.all(
                `SELECT g.GenreID, g.GenreName
                 FROM Genres g
                 INNER JOIN GamesGenres gg ON g.GenreID = gg.GenreID
                 WHERE gg.GameID = ?
                 ORDER BY g.GenreName ASC`,
                gameId
            );
        });

        res.status(200).json(genres || []);
    } catch (error) {
        console.error(`❌ Error fetching genres for game ${gameId}:`, error.message);
        res.status(500).json({ error: 'Server failed to retrieve game genres.' });
    }
};

// ----------------------------------------------------------------------
// Get Top Sellers
// ----------------------------------------------------------------------
const getTopSellers = async (req, res) => {
    try {
        const topGames = await database.executeQuery(async (db) => {
            const topSellersSql = `
                SELECT
                    g.GameID, g.Title, g.ReleaseDate, g.Price, g.Description, g.ImageUrl,
                    p.discount_percentage AS DiscountPercentage,
                    p.start_date AS PromotionStartDate,
                    p.end_date AS PromotionEndDate,
                    COUNT(gp.id) as purchase_count
                FROM Games g
                JOIN GamePurchases gp ON g.GameID = gp.game_id
                LEFT JOIN Promotions p ON g.GameID = p.game_id
                    AND p.is_active = 1
                    AND (p.start_date IS NULL OR p.start_date <= DATE('now'))
                    AND (p.end_date IS NULL OR p.end_date >= DATE('now'))
                GROUP BY g.GameID
                ORDER BY purchase_count DESC
                LIMIT 5
            `;
            return await db.all(topSellersSql);
        });

        const processedGames = (topGames || []).map(game => ({
            ...game,
            ImageUrl: game.ImageUrl ? 
                (game.ImageUrl.startsWith('/') ? game.ImageUrl : `/gamepic/${path.basename(game.ImageUrl)}`) 
                : null
        }));

        res.status(200).json(processedGames);
    } catch (error) {
        console.error('❌ Error fetching top sellers:', error.message);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเกมขายดี' });
    }
};

// ----------------------------------------------------------------------
// Purchase Game
// ----------------------------------------------------------------------
const purchaseGame = async (req, res) => {
    const { userId, gameId } = req.body;

    if (!userId || !gameId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID และ Game ID' });
    }

    try {
        const result = await database.executeTransaction(async (db) => {
            const user = await db.get('SELECT wallet FROM User WHERE id = ?', userId);
            const game = await db.get('SELECT Price FROM Games WHERE GameID = ?', gameId);

            if (!user) throw new Error('ไม่พบผู้ใช้');
            if (!game) throw new Error('ไม่พบเกม');

            const userWallet = user.wallet || 0;
            const gamePrice = game.Price;

            const existingPurchase = await db.get(
                'SELECT id FROM GamePurchases WHERE user_id = ? AND game_id = ?',
                [userId, gameId]
            );

            if (existingPurchase) {
                throw new Error('คุณมีเกมนี้อยู่ในคลังแล้ว');
            }

            if (userWallet < gamePrice) {
                throw new Error('ยอดเงินใน Wallet ไม่เพียงพอ');
            }

            await db.run('UPDATE User SET wallet = wallet - ? WHERE id = ?', [gamePrice, userId]);

            const purchaseDate = new Date().toISOString();
            await db.run(
                `INSERT INTO GamePurchases (user_id, game_id, purchase_date, purchase_price)
                 VALUES (?, ?, ?, ?)`,
                [userId, gameId, purchaseDate, gamePrice]
            );

            return { newBalance: userWallet - gamePrice };
        });

        console.log(`✅ การซื้อสำเร็จ: UserID: ${userId} ซื้อ GameID: ${gameId}`);
        res.status(200).json({
            message: 'การซื้อเกมสำเร็จ!',
            newBalance: result.newBalance
        });
    } catch (error) {
        console.error('❌ Error purchasing game:', error.message);
        
        if (error.message === 'ไม่พบผู้ใช้') {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === 'ไม่พบเกม') {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === 'คุณมีเกมนี้อยู่ในคลังแล้ว') {
            return res.status(409).json({ message: error.message });
        }
        if (error.message === 'ยอดเงินใน Wallet ไม่เพียงพอ') {
            return res.status(402).json({ message: error.message });
        }
        
        res.status(500).json({ message: `เกิดข้อผิดพลาด: ${error.message}` });
    }
};

// ----------------------------------------------------------------------
// Get Purchased Games
// ----------------------------------------------------------------------
const getPurchasedGames = async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    try {
        const purchases = await database.executeQuery(async (db) => {
            return await db.all(
                'SELECT game_id FROM GamePurchases WHERE user_id = ?',
                [userId]
            );
        });

        const purchasedIds = (purchases || []).map(p => p.game_id);

        res.status(200).json({ purchasedIds });
    } catch (error) {
        console.error('❌ Error fetching purchased games:', error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเกมที่ซื้อแล้ว' });
    }
};

// ----------------------------------------------------------------------
// Get User Library
// ----------------------------------------------------------------------
const getUserLibrary = async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    try {
        const userGames = await database.executeQuery(async (db) => {
            const sql = `
                SELECT
                    g.GameID,
                    g.Title,
                    g.ImageUrl
                FROM GamePurchases AS gp
                JOIN Games AS g ON gp.game_id = g.GameID
                WHERE gp.user_id = ?
                ORDER BY gp.purchase_date DESC
            `;
            return await db.all(sql, [userId]);
        });

        const processedGames = (userGames || []).map(game => {
            if (game.ImageUrl) {
                const filename = path.basename(game.ImageUrl);
                return { ...game, ImageUrl: `/gamepic/${filename}` };
            }
            return game;
        });

        res.status(200).json(processedGames);
    } catch (error) {
        console.error('❌ Error fetching user library:', error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคลังเกม' });
    }
};

// ----------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------
module.exports = {
    searchGames,
    searchGamesWithGenres,
    getGameGenres,
    getGames,
    addGame,
    getGenres,
    getTopSellers,
    getGameDetails,
    updateGame,
    deleteGame,
    purchaseGame,
    getPurchasedGames,
    getUserLibrary,
    upload
};
