const database = require('../config/database');

// --- Create a New Coupon ---
exports.createCoupon = async (req, res) => {
    const { code, discount_type, discount_value, expiry_date, max_uses } = req.body;

    // --- Basic Validation ---
    if (!code || !discount_type || discount_value === undefined) {
        return res.status(400).json({ 
            message: 'กรุณากรอกข้อมูล Code, Discount Type, และ Discount Value ให้ครบถ้วน' 
        });
    }
    
    if (!['percentage', 'fixed'].includes(discount_type)) {
        return res.status(400).json({ 
            message: 'Discount Type ต้องเป็น "percentage" หรือ "fixed"' 
        });
    }
    
    if (isNaN(discount_value) || discount_value <= 0) {
        return res.status(400).json({ 
            message: 'Discount Value ต้องเป็นตัวเลขที่มากกว่า 0' 
        });
    }
    
    if (discount_type === 'percentage' && discount_value > 100) {
        return res.status(400).json({ 
            message: 'ส่วนลดแบบ Percentage ต้องไม่เกิน 100' 
        });
    }

    // Validate max_uses if provided
    if (max_uses !== null && max_uses !== undefined) {
        if (isNaN(max_uses) || max_uses < 1 || !Number.isInteger(Number(max_uses))) {
            return res.status(400).json({ 
                message: 'Max Uses ต้องเป็นจำนวนเต็มบวกหรือเว้นว่างไว้' 
            });
        }
    }

    try {
        const result = await database.executeTransaction(async (db) => {
            const upperCaseCode = code.toUpperCase();

            // Check if code already exists
            const existing = await db.get('SELECT id FROM Coupons WHERE code = ?', upperCaseCode);
            if (existing) {
                throw new Error('โค้ดคูปองนี้มีอยู่แล้ว');
            }

            const sql = `
                INSERT INTO Coupons (code, discount_type, discount_value, expiry_date, max_uses)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            const maxUsesValue = max_uses ? Number(max_uses) : null;
            
            const insertResult = await db.run(sql, [
                upperCaseCode, 
                discount_type, 
                discount_value, 
                expiry_date || null,
                maxUsesValue
            ]);

            return {
                lastID: insertResult.lastID,
                code: upperCaseCode,
                discount_type,
                discount_value,
                expiry_date,
                max_uses: maxUsesValue
            };
        });

        res.status(201).json({
            message: 'สร้างคูปองสำเร็จ',
            couponId: result.lastID,
            coupon: {
                id: result.lastID,
                code: result.code,
                discount_type: result.discount_type,
                discount_value: result.discount_value,
                expiry_date: result.expiry_date,
                max_uses: result.max_uses,
                is_active: 1
            }
        });

    } catch (error) {
        console.error("❌ Error creating coupon:", error.message);
        
        if (error.message === 'โค้ดคูปองนี้มีอยู่แล้ว') {
            return res.status(409).json({ message: error.message });
        }
        
        res.status(500).json({ 
            message: 'เกิดข้อผิดพลาดในการสร้างคูปอง', 
            error: error.message 
        });
    }
};

// --- List All Coupons (for Admin) ---
exports.listCoupons = async (req, res) => {
    try {
        const coupons = await database.executeQuery(async (db) => {
            return await db.all('SELECT * FROM Coupons ORDER BY created_at DESC');
        });

        res.json(coupons || []);

    } catch (error) {
        console.error("❌ Error listing coupons:", error.message);
        res.status(500).json({ 
            message: 'เกิดข้อผิดพลาดในการดึงรายการคูปอง', 
            error: error.message 
        });
    }
};

// --- Toggle Coupon Active Status ---
exports.toggleCouponStatus = async (req, res) => {
    const couponId = req.params.id;
    const { is_active } = req.body;

    if (couponId === undefined || is_active === undefined || ![0, 1].includes(Number(is_active))) {
        return res.status(400).json({ 
            message: 'ข้อมูลไม่ถูกต้อง (ต้องการ id และ is_active เป็น 0 หรือ 1)' 
        });
    }

    try {
        await database.executeQuery(async (db) => {
            const result = await db.run(
                'UPDATE Coupons SET is_active = ? WHERE id = ?', 
                [is_active, couponId]
            );

            if (result.changes === 0) {
                throw new Error('ไม่พบคูปองที่ต้องการอัปเดต');
            }
        });

        res.json({ 
            message: `อัปเดตสถานะคูปอง ID ${couponId} เป็น ${is_active == 1 ? 'Active' : 'Inactive'} สำเร็จ` 
        });

    } catch (error) {
        console.error("❌ Error toggling coupon status:", error.message);
        
        if (error.message === 'ไม่พบคูปองที่ต้องการอัปเดต') {
            return res.status(404).json({ message: error.message });
        }
        
        res.status(500).json({ 
            message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะคูปอง', 
            error: error.message 
        });
    }
};

module.exports = exports;
