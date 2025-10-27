const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const multer = require('multer');
const path = require('path');

// กำหนดเส้นทางไปยังไฟล์ฐานข้อมูล
const DB_PATH = './data.db';

// --- Multer Configuration สำหรับ Game Images ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // กำหนดโฟลเดอร์ที่จะบันทึกไฟล์ (ต้องมีโฟลเดอร์นี้อยู่จริง)
        cb(null, 'uploads/gamepic/');
    },
    filename: (req, file, cb) => {
        // สร้างชื่อไฟล์ที่ไม่ซ้ำกัน: game-<timestamp>-<originalname>
        cb(null, 'game-' + Date.now() + path.extname(file.originalname));
    }
});

// สร้าง instance ของ multer และกำหนดข้อจำกัด
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // จำกัดขนาดไฟล์ไม่เกิน 5MB
});
// ----------------------------------------------


// ฟังก์ชันสำหรับเปิดการเชื่อมต่อฐานข้อมูล
const openDb = async () => {
    return sqlite.open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
};

// ----------------------------------------------------------------------
// Controller สำหรับดึงรายการหมวดหมู่ทั้งหมด
// ----------------------------------------------------------------------
const getGenres = async (req, res) => {
    try {
        const db = await openDb();
        // ดึง GenreID และ GenreName ทั้งหมดจากตาราง Genres
        const genres = await db.all('SELECT GenreID, GenreName FROM Genres ORDER BY GenreName ASC');

        if (!genres || genres.length === 0) {
            // ถ้าไม่พบหมวดหมู่ ให้ส่ง Array ว่างกลับไป (200 OK)
            return res.status(200).json([]);
        }

        res.status(200).json(genres);

    } catch (error) {
        console.error('❌ Error fetching genres:', error.message);
        res.status(500).json({ error: 'Server failed to retrieve genres.' });
    }
};

// ----------------------------------------------------------------------
// Controller สำหรับดึงข้อมูลเกมทั้งหมด (สำหรับหน้า Home)
// ----------------------------------------------------------------------
const getGames = async (req, res) => {
    try {
        const db = await openDb();
        // [MODIFIED] Query to LEFT JOIN with active promotions
        const gamesSql = `
            SELECT
                g.GameID, g.Title, g.ReleaseDate, g.Price, g.Description, g.ImageUrl,
                p.discount_percentage AS DiscountPercentage, -- Alias column name
                p.start_date AS PromotionStartDate,
                p.end_date AS PromotionEndDate
            FROM Games g
            LEFT JOIN Promotions p ON g.GameID = p.game_id
                                  AND p.is_active = 1
                                  AND (p.start_date IS NULL OR p.start_date <= DATE('now'))
                                  AND (p.end_date IS NULL OR p.end_date >= DATE('now'))
            ORDER BY g.GameID DESC
        `;
        const games = await db.all(gamesSql); // Fetch games with potential promotion

        if (!games || games.length === 0) {
            return res.status(200).json([]);
        }

        // Process ImageUrl before sending
        const processedGames = games.map(game => ({
            ...game,
            // Ensure ImageUrl is a relative path starting with / or null
            ImageUrl: game.ImageUrl ? (game.ImageUrl.startsWith('/') ? game.ImageUrl : `/gamepic/${path.basename(game.ImageUrl)}`) : null
        }));

        res.status(200).json(processedGames);

    } catch (error) {
        console.error('❌ ข้อผิดพลาดในการดึงข้อมูลเกมพร้อมโปรโมชั่น:', error.message);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์ในการดึงข้อมูล' });
    }
};

// ----------------------------------------------------------------------
// Controller สำหรับดึงข้อมูลเกมเดี่ยวและหมวดหมู่ที่ถูกเลือก (สำหรับหน้า Edit)
// ----------------------------------------------------------------------
const getGameDetails = async (req, res) => {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Game ID ไม่ถูกต้อง' });
    }

    try {
        const db = await openDb();

        // 1. Get core game data and JOIN with active promotion
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
            return res.status(404).json({ error: 'ไม่พบเกม' });
        }

        // 2. Get selected genres
        const genresSql = 'SELECT GenreID FROM GamesGenres WHERE GameID = ?';
        const selectedGenres = await db.all(genresSql, gameId);
        const selectedGenreIDs = selectedGenres.map(g => g.GenreID);

        // 3. Combine and send response
        res.status(200).json({
            ...game, // Includes promotion fields if found, otherwise they are null
            SelectedGenreIDs: selectedGenreIDs
        });

    } catch (error) {
        console.error(`❌ Error fetching game ${gameId} details:`, error.message);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์ในการดึงรายละเอียดเกม' });
    }
};

// ----------------------------------------------------------------------
// Controller สำหรับการเพิ่มเกมใหม่ (POST /games)
// ----------------------------------------------------------------------
const addGame = async (req, res) => {
    const { Title, Price, Description, SelectedGenreIDs } = req.body;
    const file = req.file;
    const ReleaseDate = new Date().toISOString().split('T')[0];

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!Title || !Price || !Description || !SelectedGenreIDs || !file) {
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลและอัปโหลดรูปภาพให้ครบถ้วน' });
    }

    const priceValue = parseFloat(Price);
    if (isNaN(priceValue) || priceValue < 0) {
        return res.status(400).json({ error: 'ราคา (Price) ต้องเป็นตัวเลขที่ถูกต้อง' });
    }

    let parsedGenreIDs;
    try {
        // SelectedGenreIDs มาเป็น JSON string ผ่าน FormData, ต้อง Parse กลับ
        parsedGenreIDs = JSON.parse(SelectedGenreIDs);
        if (!Array.isArray(parsedGenreIDs) || parsedGenreIDs.length === 0) {
            return res.status(400).json({ error: 'กรุณาเลือกหมวดหมู่อย่างน้อย 1 ประเภท' });
        }
    } catch (e) {
        return res.status(400).json({ error: 'รูปแบบของ SelectedGenreIDs ไม่ถูกต้อง' });
    }

    const ImageUrl = `/gamepic/${file.filename}`;

    let db;
    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');

        // 1. บันทึกข้อมูลหลักเข้าตาราง Games
        const result = await db.run(
            `INSERT INTO Games (Title, ReleaseDate, Price, Description, ImageUrl)
             VALUES (?, ?, ?, ?, ?)`,
            [Title, ReleaseDate, priceValue, Description, ImageUrl]
        );
        const gameId = result.lastID;

        // 2. บันทึกความสัมพันธ์เข้าตาราง GamesGenres (Iterative Insert)
        const stmt = await db.prepare('INSERT INTO GamesGenres (GameID, GenreID) VALUES (?, ?)');
        for (const genreId of parsedGenreIDs) {
            await stmt.run(gameId, genreId);
        }
        await stmt.finalize(); // ปิด statement

        await db.run('COMMIT'); // Commit Transaction

        console.log(`✅ เพิ่มเกมใหม่สำเร็จ: GameID: ${gameId}, Title: ${Title}, Path: ${ImageUrl}`);

        res.status(201).json({
            message: 'เพิ่มเกมเข้าฐานข้อมูลเรียบร้อยแล้ว และบันทึกรูปภาพแล้ว',
            gameId: gameId,
            data: { Title, ReleaseDate, Price: priceValue, Description, ImageUrl }
        });

    } catch (error) {
        if (db) {
            await db.run('ROLLBACK'); // Rollback หากมีข้อผิดพลาด
        }
        console.error('❌ ข้อผิดพลาดในการเพิ่มเกม:', error.message);
        res.status(500).json({ error: `เกิดข้อผิดพลาดของเซิร์ฟเวอร์ในการบันทึกข้อมูลเกม: ${error.message}` });
    }
};


// ----------------------------------------------------------------------
// Controller สำหรับการอัปเดตเกม (PUT /games/:id)
// ----------------------------------------------------------------------
const updateGame = async (req, res) => {
    const gameId = parseInt(req.params.id);
    // [MODIFIED] Destructure promotion fields from body
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

    // --- Validation for Game Data ---
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

    // --- Validation for Promotion Data (if provided) ---
    const discountPercentValue = discountPercentage ? parseFloat(discountPercentage) : null;
    if (discountPercentValue !== null) {
        if (isNaN(discountPercentValue) || discountPercentValue <= 0 || discountPercentValue > 100) {
            return res.status(400).json({ error: 'เปอร์เซ็นต์ส่วนลดต้องอยู่ระหว่าง 0 ถึง 100' });
        }
        // Basic date validation (could be more robust)
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


    // Determine final ImageUrl
    let finalImageUrl = req.body.OriginalImageUrl || null; // Start with original or null
    if (file) {
        finalImageUrl = `/gamepic/${file.filename}`; // Use new file path if uploaded
    }

    let db;
    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');

        // 1. Update core game data
        await db.run(
            `UPDATE Games SET Title = ?, Price = ?, Description = ?, ImageUrl = ? WHERE GameID = ?`,
            [Title, priceValue, Description, finalImageUrl, gameId]
        );

        // 2. Update game genres (delete old, insert new)
        await db.run('DELETE FROM GamesGenres WHERE GameID = ?', gameId);
        const genreStmt = await db.prepare('INSERT INTO GamesGenres (GameID, GenreID) VALUES (?, ?)');
        for (const genreId of parsedGenreIDs) {
            await genreStmt.run(gameId, genreId);
        }
        await genreStmt.finalize();

        // --- [NEW] Promotion Handling ---
        // 3. Deactivate any currently active promotions for this game
        await db.run('UPDATE Promotions SET is_active = 0 WHERE game_id = ? AND is_active = 1', gameId);

        // 4. Insert new promotion if discount percentage is valid
        if (discountPercentValue !== null && discountPercentValue > 0) {
            await db.run(
                `INSERT INTO Promotions (game_id, discount_percentage, start_date, end_date, is_active)
                 VALUES (?, ?, ?, ?, 1)`,
                [
                    gameId,
                    discountPercentValue,
                    promotionStartDate || null, // Store as NULL if empty
                    promotionEndDate || null    // Store as NULL if empty
                ]
            );
            console.log(`✅ Set new promotion for GameID ${gameId}: ${discountPercentValue}%`);
        } else {
             console.log(`ℹ️ No new promotion set (or discount was 0) for GameID ${gameId}. Existing promotions deactivated.`);
        }
        // --- End Promotion Handling ---

        await db.run('COMMIT');

        console.log(`✅ อัปเดตเกมสำเร็จ: GameID: ${gameId}`);
        res.status(200).json({ message: 'อัปเดตเกมและโปรโมชั่นเรียบร้อยแล้ว', gameId: gameId });

    } catch (error) {
        if (db) await db.run('ROLLBACK');
        console.error('❌ ข้อผิดพลาดในการอัปเดตเกม/โปรโมชั่น:', error.message);
        res.status(500).json({ error: `เกิดข้อผิดพลาด: ${error.message}` });
    }
};


// ----------------------------------------------------------------------
// Controller สำหรับการลบเกม (DELETE /games/:id)
// ----------------------------------------------------------------------
const deleteGame = async (req, res) => {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Game ID ไม่ถูกต้อง' });
    }

    let db;
    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');

        // 1. ลบความสัมพันธ์ใน GamesGenres ก่อน (หรือปล่อยให้ Foreign Key Constraint ON DELETE CASCADE จัดการ)
        // เพื่อความชัวร์ใน SQLite เราจะลบเอง
        await db.run('DELETE FROM GamesGenres WHERE GameID = ?', gameId);

        // 2. ลบข้อมูลหลักใน Games
        const result = await db.run('DELETE FROM Games WHERE GameID = ?', gameId);

        if (result.changes === 0) {
            await db.run('ROLLBACK');
            return res.status(404).json({ error: 'ไม่พบเกมที่ต้องการลบ' });
        }

        await db.run('COMMIT');

        console.log(`✅ ลบเกมสำเร็จ: GameID: ${gameId}`);
        res.status(200).json({ message: `ลบเกม ID ${gameId} เรียบร้อยแล้ว` });

    } catch (error) {
        if (db) await db.run('ROLLBACK');
        console.error('❌ ข้อผิดพลาดในการลบเกม:', error.message);
        res.status(500).json({ error: `เกิดข้อผิดพลาดของเซิร์ฟเวอร์ในการลบ: ${error.message}` });
    }
};

// ----------------------------------------------------------------------
// Controller for searching games
// ----------------------------------------------------------------------
const searchGames = async (req, res) => {
    const query = req.query.query || '';
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 1) {
        return res.status(200).json([]);
    }

    try {
        const db = await openDb();
        const searchQuery = `%${trimmedQuery}%`;

        // ค้นหาจาก Title และจำกัดผลลัพธ์ไม่เกิน 10 รายการ
        const games = await db.all(
            `SELECT GameID, Title, Price, ImageUrl
             FROM Games
             WHERE Title LIKE ?
             LIMIT 10`,
            searchQuery
        );

        res.status(200).json(games);

    } catch (error) {
        console.error('❌ Error searching games:', error.message);
        res.status(500).json({ error: 'Server failed to perform search.' });
    }
};

// ----------------------------------------------------------------------
// [NEW] Controller สำหรับการซื้อเกม
// ----------------------------------------------------------------------
const purchaseGame = async (req, res) => {
    const { userId, gameId } = req.body;

    // --- 1. Validation ---
    if (!userId || !gameId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID และ Game ID' });
    }

    let db;
    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');

        // --- 2. ดึงข้อมูลที่จำเป็น: ยอดเงินคงเหลือและราคาเกม ---
        const user = await db.get('SELECT wallet FROM User WHERE id = ?', userId);
        const game = await db.get('SELECT Price FROM Games WHERE GameID = ?', gameId);

        if (!user) {
            await db.run('ROLLBACK');
            return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
        }
        if (!game) {
            await db.run('ROLLBACK');
            return res.status(404).json({ message: 'ไม่พบเกม' });
        }

        const userWallet = user.wallet || 0;
        const gamePrice = game.Price;

        // --- 3. ตรวจสอบว่าเคยซื้อเกมนี้ไปแล้วหรือยัง ---
        const existingPurchase = await db.get(
            'SELECT id FROM GamePurchases WHERE user_id = ? AND game_id = ?',
            [userId, gameId]
        );

        if (existingPurchase) {
            await db.run('ROLLBACK');
            return res.status(409).json({ message: 'คุณมีเกมนี้อยู่ในคลังแล้ว' });
        }

        // --- 4. ตรวจสอบว่ามีเงินพอหรือไม่ ---
        if (userWallet < gamePrice) {
            await db.run('ROLLBACK');
            return res.status(402).json({ message: 'ยอดเงินใน Wallet ไม่เพียงพอ' });
        }

        // --- 5. หักเงินออกจาก Wallet ของผู้ใช้ ---
        await db.run(
            'UPDATE User SET wallet = wallet - ? WHERE id = ?',
            [gamePrice, userId]
        );

        // --- 6. บันทึกประวัติการซื้อลงในตาราง GamePurchases ---
        const purchaseDate = new Date().toISOString();
        await db.run(
            `INSERT INTO GamePurchases (user_id, game_id, purchase_date, purchase_price)
             VALUES (?, ?, ?, ?)`,
            [userId, gameId, purchaseDate, gamePrice]
        );

        // --- 7. Commit Transaction ---
        await db.run('COMMIT');

        console.log(`✅ การซื้อสำเร็จ: UserID: ${userId} ซื้อ GameID: ${gameId} ในราคา ${gamePrice}`);
        res.status(200).json({
            message: 'การซื้อเกมสำเร็จ!',
            newBalance: userWallet - gamePrice
        });

    } catch (error) {
        if (db) {
            await db.run('ROLLBACK'); // Rollback หากมีข้อผิดพลาด
        }
        console.error('❌ ข้อผิดพลาดในการซื้อเกม:', error.message);
        res.status(500).json({ message: `เกิดข้อผิดพลาดของเซิร์ฟเวอร์: ${error.message}` });
    }
};

// --- [NEW] Controller for getting user's purchased games ---
const getPurchasedGames = async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    try {
        const db = await openDb();
        const purchases = await db.all(
            'SELECT game_id FROM GamePurchases WHERE user_id = ?',
            [userId]
        );

        // แปลงผลลัพธ์จาก [{ game_id: 1 }, { game_id: 5 }] ให้เป็น [1, 5]
        const purchasedIds = purchases.map(p => p.game_id);

        res.status(200).json({ purchasedIds });

    } catch (error) {
        console.error('❌ Error fetching purchased games:', error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลเกมที่ซื้อแล้ว' });
    }
};

// --- [NEW] Controller for getting a user's game library ---
const getUserLibrary = async (req, res) => {
    const userId = req.params.userId;

    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    try {
        const db = await openDb();
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
        const userGames = await db.all(sql, [userId]);

        // ✅ แก้ path ให้เริ่มต้นด้วย /gamepic/
        const processedGames = userGames.map(game => {
            if (game.ImageUrl) {
                // ดึงชื่อไฟล์ แล้วต่อกับ /gamepic/
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
const searchGamesWithGenres = async (req, res) => {
    const query = req.query.query || '';
    const genresParam = req.query.genres || '';
    
    const trimmedQuery = query.trim();
    const genreIds = genresParam 
        ? genresParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
        : [];

    try {
        const db = await openDb();
        let games = [];

        if (genreIds.length > 0) {
            // ค้นหาเกมที่มี genre ตรงกับที่เลือก
            const placeholders = genreIds.map(() => '?').join(',');
            
            let sql = `
                SELECT DISTINCT g.GameID, g.Title, g.Price, g.Description, g.ImageUrl, g.ReleaseDate
                FROM Games g
                INNER JOIN GamesGenres gg ON g.GameID = gg.GameID
                WHERE gg.GenreID IN (${placeholders})
            `;
            
            let params = [...genreIds];

            // ถ้ามี search query ด้วย ให้เพิ่มเงื่อนไข
            if (trimmedQuery.length > 0) {
                sql += ` AND g.Title LIKE ?`;
                params.push(`%${trimmedQuery}%`);
            }

            sql += ` ORDER BY g.GameID DESC LIMIT 50`;

            games = await db.all(sql, params);

        } else if (trimmedQuery.length > 0) {
            // ค้นหาแบบปกติถ้าไม่มี genre filter
            games = await db.all(
                `SELECT GameID, Title, Price, Description, ImageUrl, ReleaseDate
                 FROM Games
                 WHERE Title LIKE ?
                 ORDER BY GameID DESC
                 LIMIT 50`,
                `%${trimmedQuery}%`
            );
        } else {
            // ถ้าไม่มีทั้ง query และ genre ให้คืนเกมทั้งหมด
            games = await db.all(
                `SELECT GameID, Title, Price, Description, ImageUrl, ReleaseDate
                 FROM Games
                 ORDER BY GameID DESC
                 LIMIT 50`
            );
        }

        res.status(200).json(games);

    } catch (error) {
        console.error('❌ Error searching games with genres:', error.message);
        res.status(500).json({ error: 'Server failed to perform search.' });
    }
};

// ----------------------------------------------------------------------
// Controller สำหรับดึง genres ของเกมเดียว
// ----------------------------------------------------------------------
const getGameGenres = async (req, res) => {
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
        return res.status(400).json({ error: 'Invalid Game ID' });
    }

    try {
        const db = await openDb();
        
        const genres = await db.all(
            `SELECT g.GenreID, g.GenreName
             FROM Genres g
             INNER JOIN GamesGenres gg ON g.GenreID = gg.GenreID
             WHERE gg.GameID = ?
             ORDER BY g.GenreName ASC`,
            gameId
        );

        res.status(200).json(genres);

    } catch (error) {
        console.error(`❌ Error fetching genres for game ${gameId}:`, error.message);
        res.status(500).json({ error: 'Server failed to retrieve game genres.' });
    }
};

const getTopSellers = async (req, res) => {
    try {
        const db = await openDb();
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
        const topGames = await db.all(topSellersSql);

        // Process ImageUrl before sending
        const processedGames = topGames.map(game => ({
            ...game,
            ImageUrl: game.ImageUrl ? (game.ImageUrl.startsWith('/') ? game.ImageUrl : `/gamepic/${path.basename(game.ImageUrl)}`) : null
        }));

        res.status(200).json(processedGames);

    } catch (error) {
        console.error('❌ Error fetching top sellers:', error.message);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลเกมขายดี' });
    }
};


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
    upload // ต้อง Export upload instance เพื่อใช้ใน server.js
};
