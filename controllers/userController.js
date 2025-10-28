const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const database = require("../config/database"); // ใช้ database helper

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

// --- Register Function ---
exports.register = async (req, res) => {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ message: "กรอกข้อมูลให้ครบ" });
    }

    try {
        const result = await database.executeTransaction(async (db) => {
            // ตรวจสอบว่า email ซ้ำหรือไม่
            const existingUser = await db.get('SELECT id FROM User WHERE email = ?', [email]);
            if (existingUser) {
                throw new Error("อีเมลนี้ถูกใช้งานแล้ว");
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Insert new user
            const sql = `INSERT INTO User (name, email, password) VALUES (?, ?, ?)`;
            return await db.run(sql, [name, email, hashedPassword]);
        });
        
        res.status(201).json({ 
            message: "✅ สมัครสำเร็จ", 
            userId: result.lastID 
        });
        
    } catch (err) {
        console.error("❌ Register Error:", err.message);
        
        if (err.message === "อีเมลนี้ถูกใช้งานแล้ว") {
            return res.status(409).json({ message: err.message });
        }
        
        res.status(500).json({ 
            message: "สมัครไม่สำเร็จ", 
            error: err.message 
        });
    }
};

// --- Login Function ---
exports.login = async (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ message: "กรอกอีเมลและรหัสผ่าน" });
    }

    try {
        const user = await database.executeQuery(async (db) => {
            return await db.get('SELECT * FROM User WHERE email = ?', [email]);
        });
        
        if (!user) {
            return res.status(404).json({ message: "ไม่พบบัญชีนี้" });
        }
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ message: "รหัสผ่านไม่ถูกต้อง" });
        }
        
        res.json({ 
            message: "✅ เข้าสู่ระบบสำเร็จ", 
            user: { 
                id: user.id, 
                name: user.name, 
                email: user.email, 
                type: user.type, 
                image: user.image || null,
                wallet: user.wallet || 0
            } 
        });
        
    } catch (err) {
        console.error("❌ Login Error:", err.message);
        res.status(500).json({ 
            message: "เกิดข้อผิดพลาด", 
            error: err.message 
        });
    }
};

// --- Update Profile ---
exports.updateProfile = async (req, res) => {
    const userId = req.params.id;
    const { name, email } = req.body;

    if (!name && !email && !req.file) {
        return res.status(400).json({ message: "No data provided for update." });
    }

    try {
        const result = await database.executeQuery(async (db) => {
            const fieldsToUpdate = [];
            const params = [];

            if (name) {
                fieldsToUpdate.push("name = ?");
                params.push(name);
            }
            if (email) {
                fieldsToUpdate.push("email = ?");
                params.push(email);
            }
            if (req.file) {
                const imagePath = path.join('/profile', req.file.filename).replace(/\\/g, "/");
                fieldsToUpdate.push("image = ?");
                params.push(imagePath);
            }

            if (fieldsToUpdate.length === 0) {
                return { changes: 0 };
            }
            
            params.push(userId);
            const sql = `UPDATE User SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
            return await db.run(sql, params);
        });

        if (result.changes === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }

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
        const user = await database.executeQuery(async (db) => {
            return await db.get('SELECT id, name, COALESCE(wallet, 0) AS wallet FROM User WHERE id = ?', [userId]);
        });
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        res.json(user);
    } catch (err) {
        console.error("❌ Error fetching wallet:", err.message);
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

    try {
        await database.executeTransaction(async (db) => {
            // Update wallet
            const result = await db.run(
                'UPDATE User SET wallet = COALESCE(wallet, 0) + ? WHERE id = ?', 
                [amount, userId]
            );
            
            if (result.changes === 0) {
                throw new Error("User not found");
            }

            // Insert topup history
            await db.run(
                'INSERT INTO TopupHistory (user_id, amount, payment_method, status) VALUES (?, ?, ?, ?)', 
                [userId, amount, 'Credit Card', 'Completed']
            );
        });
        
        res.json({ message: `เติมเงิน ${amount} บาท สำเร็จ` });
    } catch (err) {
        console.error("❌ Error adding funds:", err.message);
        
        if (err.message === "User not found") {
            return res.status(404).json({ message: err.message });
        }
        
        res.status(500).json({ message: "Failed to add funds", error: err.message });
    }
};

// --- Get Top-up History ---
exports.getTopupHistory = async (req, res) => {
    const userId = req.params.id;
    
    try {
        const rows = await database.executeQuery(async (db) => {
            return await db.all(
                'SELECT * FROM TopupHistory WHERE user_id = ? ORDER BY transaction_date DESC', 
                [userId]
            );
        });
        
        res.json(rows);
    } catch (err) {
        console.error("❌ Error fetching topup history:", err.message);
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
        const rows = await database.executeQuery(async (db) => {
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
            return await db.all(sql, [userId]);
        });
        
        res.json(rows);
    } catch (err) {
        console.error("❌ Error fetching purchase history:", err.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', error: err.message });
    }
};

// --- Get All Users ---
exports.getAllUsers = async (req, res) => {
    const adminId = req.query.adminId || 0;

    try {
        const users = await database.executeQuery(async (db) => {
            return await db.all(
                'SELECT id, name, email, type, image FROM User WHERE id != ? ORDER BY id DESC',
                [adminId]
            );
        });
        
        res.json(users);
    } catch (err) {
        console.error("❌ Error fetching all users:", err.message);
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้", error: err.message });
    }
};

// --- Delete a User ---
exports.deleteUser = async (req, res) => {
    const userIdToDelete = req.params.id;
    
    if (!userIdToDelete) {
        return res.status(400).json({ message: "กรุณาระบุ User ID ที่ต้องการลบ" });
    }

    try {
        await database.executeTransaction(async (db) => {
            // Delete related data (CASCADE should handle this, but being explicit)
            await db.run('DELETE FROM GamePurchases WHERE user_id = ?', [userIdToDelete]);
            await db.run('DELETE FROM TopupHistory WHERE user_id = ?', [userIdToDelete]);
            await db.run('DELETE FROM CartItems WHERE user_id = ?', [userIdToDelete]);
            await db.run('DELETE FROM CouponUsage WHERE user_id = ?', [userIdToDelete]);
            
            // Delete user
            const result = await db.run('DELETE FROM User WHERE id = ?', [userIdToDelete]);

            if (result.changes === 0) {
                throw new Error("ไม่พบผู้ใช้ที่ต้องการลบ");
            }
        });
        
        res.json({ message: `ลบผู้ใช้ ID ${userIdToDelete} สำเร็จ` });

    } catch (err) {
        console.error("❌ Error deleting user:", err.message);
        
        if (err.message === "ไม่พบผู้ใช้ที่ต้องการลบ") {
            return res.status(404).json({ message: err.message });
        }
        
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการลบผู้ใช้", error: err.message });
    }
};

// --- Get User Details for Admin ---
exports.getUserDetailsForAdmin = async (req, res) => {
    const userId = req.params.id;
    
    if (!userId) {
        return res.status(400).json({ message: "กรุณาระบุ User ID" });
    }

    try {
        const data = await database.executeQuery(async (db) => {
            // Get user info
            const user = await db.get(
                'SELECT id, name, email, type, image, wallet FROM User WHERE id = ?', 
                [userId]
            );
            
            if (!user) {
                throw new Error("ไม่พบผู้ใช้");
            }

            // Get purchase history
            const purchaseSql = `
                SELECT g.Title, g.ImageUrl, gp.purchase_date, gp.purchase_price
                FROM GamePurchases AS gp
                JOIN Games AS g ON gp.game_id = g.GameID
                WHERE gp.user_id = ? 
                ORDER BY gp.purchase_date DESC
            `;
            const purchaseHistory = await db.all(purchaseSql, [userId]);

            // Get top-up history
            const topupSql = `
                SELECT amount, transaction_date, payment_method, status
                FROM TopupHistory
                WHERE user_id = ? 
                ORDER BY transaction_date DESC
            `;
            const topupHistory = await db.all(topupSql, [userId]);

            return { user, purchaseHistory, topupHistory };
        });
        
        res.json(data);

    } catch (err) {
        console.error("❌ Error fetching user details for admin:", err.message);
        
        if (err.message === "ไม่พบผู้ใช้") {
            return res.status(404).json({ message: err.message });
        }
        
        res.status(500).json({ message: "เกิดข้อผิดพลาดในการดึงข้อมูลรายละเอียดผู้ใช้", error: err.message });
    }
};
