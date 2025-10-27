const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

// --- Database Path ---
const DB_PATH = path.join(__dirname, '../data.db');

// --- Multer Configuration ---
const uploadDir = path.join(__dirname, "../uploads/profile");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `profile_${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });
exports.upload = upload;

// --- Database Connection Function ---
const openDb = async () => {
    return sqlite.open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
};

// --- Authentication Functions ---
// Note: These functions are kept as placeholders from the old code.
// For full consistency, they should also be refactored to use async/await and openDb().
exports.register = (req, res) => {
    const db = require("../config/database"); // Old DB driver
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "กรอกข้อมูลให้ครบ" });
    bcrypt.hash(password, 10).then(hashedPassword => {
        const sql = `INSERT INTO User (name, email, password) VALUES (?, ?, ?)`;
        db.run(sql, [name, email, hashedPassword], function (err) {
            if (err) return res.status(500).json({ message: "สมัครไม่สำเร็จ", error: err.message });
            res.json({ message: "✅ สมัครสำเร็จ", userId: this.lastID });
        });
    });
};
exports.login = (req, res) => {
    const db = require("../config/database"); // Old DB driver
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "กรอกอีเมลและรหัสผ่าน" });
    const sql = `SELECT * FROM User WHERE email = ?`;
    db.get(sql, [email], async (err, user) => {
        if (err) return res.status(500).json({ message: "เกิดข้อผิดพลาด", error: err.message });
        if (!user) return res.status(404).json({ message: "ไม่พบบัญชีนี้" });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });
        res.json({ message: "✅ เข้าสู่ระบบสำเร็จ", user: { id: user.id, name: user.name, email: user.email, type: user.type, image: user.image || null } });
    });
};
exports.updateProfile = async (req, res) => {
    const userId = req.params.id;
    const { name, email } = req.body;

    // ตรวจสอบว่ามีข้อมูลส่งมาหรือไม่
    if (!name && !email && !req.file) {
        return res.status(400).json({ message: "No data provided for update." });
    }

    let db;
    try {
        db = await openDb();
        
        const fieldsToUpdate = [];
        const params = [];

        // เพิ่ม field ที่ต้องการอัปเดตลงใน Array
        if (name) {
            fieldsToUpdate.push("name = ?");
            params.push(name);
        }
        if (email) {
            fieldsToUpdate.push("email = ?");
            params.push(email);
        }
        // ถ้ามีการอัปโหลดไฟล์ใหม่
        if (req.file) {
            // สร้าง path ที่จะเก็บใน DB (เช่น /uploads/profile/profile_12345.jpg)
            const imagePath = path.join('/profile', req.file.filename).replace(/\\/g, "/");
            fieldsToUpdate.push("image = ?");
            params.push(imagePath);
        }

        if (fieldsToUpdate.length === 0) {
            return res.status(200).json({ message: "No fields to update." });
        }
        
        // เพิ่ม user ID เข้าไปเป็น parameter สุดท้ายสำหรับ WHERE clause
        params.push(userId);

        // สร้าง SQL Query แบบ Dynamic
        const sql = `UPDATE User SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;

        const result = await db.run(sql, params);

        if (result.changes === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }

        // ส่งข้อมูลที่อัปเดตแล้วกลับไป (รวมถึง path รูปใหม่)
        res.json({ 
            message: "✅ Profile updated successfully!",
            updatedData: {
                name,
                email,
                image: req.file ? path.join('/uploads/profile', req.file.filename).replace(/\\/g, "/") : undefined
            }
        });

    } catch (err) {
        console.error("❌ Error updating profile:", err.message);
        res.status(500).json({ message: "Server error during profile update", error: err.message });
    }
};


// --- Get Wallet Info ---
exports.getWallet = async (req, res) => {
    const userId = req.params.id;
    try {
        const db = await openDb();
        const user = await db.get('SELECT id, name, COALESCE(wallet, 0) AS wallet FROM User WHERE id = ?', userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// --- Add Funds to Wallet ---
exports.addFunds = async (req, res) => {
    const userId = req.params.id;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "จำนวนเงินไม่ถูกต้อง" });
    }
    let db;
    try {
        db = await openDb();
        await db.run("BEGIN TRANSACTION");

        const result = await db.run('UPDATE User SET wallet = COALESCE(wallet, 0) + ? WHERE id = ?', [amount, userId]);
        if (result.changes === 0) {
            await db.run("ROLLBACK");
            return res.status(404).json({ message: "User not found" });
        }

        await db.run('INSERT INTO TopupHistory (user_id, amount, payment_method, status) VALUES (?, ?, ?, ?)', [userId, amount, 'Credit Card', 'Completed']);
        
        await db.run("COMMIT");
        res.json({ message: `เติมเงิน ${amount} บาท สำเร็จ` });
    } catch (err) {
        if (db) await db.run("ROLLBACK");
        res.status(500).json({ message: "Failed to add funds", error: err.message });
    }
};

// --- Get Top-up History ---
exports.getTopupHistory = async (req, res) => {
    const userId = req.params.id;
    try {
        const db = await openDb();
        const rows = await db.all('SELECT * FROM TopupHistory WHERE user_id = ? ORDER BY transaction_date DESC', [userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', error: err.message });
    }
};

// --- Get Game Purchase History ---
exports.getPurchaseHistory = async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }
    
    try {
        const db = await openDb();
        const sql = `
            SELECT
                g.Title,
                g.ImageUrl,
                gp.purchase_date,
                gp.purchase_price
            FROM GamePurchases AS gp
            JOIN Games AS g ON gp.game_id = g.GameID
            WHERE gp.user_id = ? 
            ORDER BY gp.purchase_date DESC
        `;
        const rows = await db.all(sql, [userId]);
        res.json(rows);
    } catch (err) {
        console.error("❌ Error fetching purchase history:", err.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', error: err.message });
    }
};

exports.getAllUsers = async (req, res) => {
    // Optional: Get admin ID from query to exclude them from the list
    const adminId = req.query.adminId || 0;

    try {
        const db = await openDb();
        // Select all users except the admin who is currently viewing the page
        const users = await db.all(
            'SELECT id, name, email, type, image FROM User WHERE id != ? ORDER BY id DESC',
            [adminId]
        );
        res.json(users);
    } catch (err) {
        console.error("❌ Error fetching all users:", err.message);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้", error: err.message });
    }
};

// --- [NEW] Delete a User (for Admin) ---
exports.deleteUser = async (req, res) => {
    const userIdToDelete = req.params.id;
    if (!userIdToDelete) {
        return res.status(400).json({ message: "กรุณาระบุ User ID ที่ต้องการลบ" });
    }

    let db;
    try {
        db = await openDb();
        await db.run("BEGIN TRANSACTION");

        // It's good practice to delete related data first.
        // For example, delete from GamePurchases and TopupHistory.
        await db.run('DELETE FROM GamePurchases WHERE user_id = ?', userIdToDelete);
        await db.run('DELETE FROM TopupHistory WHERE user_id = ?', userIdToDelete);
        
        // Finally, delete the user from the User table
        const result = await db.run('DELETE FROM User WHERE id = ?', userIdToDelete);

        if (result.changes === 0) {
            await db.run("ROLLBACK");
            return res.status(404).json({ message: "ไม่พบผู้ใช้ที่ต้องการลบ" });
        }

        await db.run("COMMIT");
        res.json({ message: `ลบผู้ใช้ ID ${userIdToDelete} สำเร็จ` });

    } catch (err) {
        if (db) await db.run("ROLLBACK");
        console.error("❌ Error deleting user:", err.message);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบผู้ใช้", error: err.message });
    }
};

exports.getUserDetailsForAdmin = async (req, res) => {
    const userId = req.params.id;
    if (!userId) {
        return res.status(400).json({ message: "กรุณาระบุ User ID" });
    }

    try {
        const db = await openDb();

        // 1. Get basic user info
        const user = await db.get('SELECT id, name, email, type, image, wallet FROM User WHERE id = ?', userId);
        if (!user) {
            return res.status(404).json({ message: "ไม่พบผู้ใช้" });
        }

        // 2. Get purchase history
        const purchaseSql = `
            SELECT g.Title, g.ImageUrl, gp.purchase_date, gp.purchase_price
            FROM GamePurchases AS gp
            JOIN Games AS g ON gp.game_id = g.GameID
            WHERE gp.user_id = ? ORDER BY gp.purchase_date DESC
        `;
        const purchaseHistory = await db.all(purchaseSql, userId);

        // 3. Get top-up history
        const topupSql = `
            SELECT amount, transaction_date, payment_method, status
            FROM TopupHistory
            WHERE user_id = ? ORDER BY transaction_date DESC
        `;
        const topupHistory = await db.all(topupSql, userId);

        // 4. Combine and send response
        res.json({
            user,
            purchaseHistory,
            topupHistory
        });

    } catch (err) {
        console.error("❌ Error fetching user details for admin:", err.message);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลรายละเอียดผู้ใช้", error: err.message });
    }
};