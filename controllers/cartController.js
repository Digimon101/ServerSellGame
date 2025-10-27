const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');

// --- Database Path ---
const DB_PATH = path.join(__dirname, '../data.db');

// --- Database Connection Function ---
const openDb = async () => {
    return sqlite.open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
};

// --- Calculate Discount Function (Helper) ---
const calculateDiscount = (totalPrice, coupon) => {
    if (!coupon) return 0;
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
        discountAmount = (totalPrice * coupon.discount_value) / 100;
    } else if (coupon.discount_type === 'fixed') {
        discountAmount = coupon.discount_value;
        if (discountAmount > totalPrice) {
            discountAmount = totalPrice;
        }
    }
    return parseFloat(discountAmount.toFixed(2)); 
};

// --- Add Item to Cart ---
exports.addToCart = async (req, res) => {
    const { userId, gameId, quantity = 1 } = req.body;

    if (!userId || !gameId || quantity <= 0) {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง (userId, gameId, quantity > 0)' });
    }

    let db;
    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');

        const owned = await db.get('SELECT id FROM GamePurchases WHERE user_id = ? AND game_id = ?', [userId, gameId]);
        if (owned) {
            await db.run('ROLLBACK');
            return res.status(409).json({ message: 'คุณเป็นเจ้าของเกมนี้แล้ว ไม่สามารถเพิ่มลงตะกร้าได้' });
        }

        const game = await db.get('SELECT GameID FROM Games WHERE GameID = ?', gameId);
        if (!game) {
            await db.run('ROLLBACK');
            return res.status(404).json({ message: 'ไม่พบเกมที่ต้องการเพิ่ม' });
        }

        const existingItem = await db.get('SELECT id, quantity FROM CartItems WHERE user_id = ? AND game_id = ?', [userId, gameId]);

        if (existingItem) {
             await db.run('ROLLBACK');
             return res.status(409).json({ message: 'เกมนี้อยู่ในตะกร้าแล้ว' });
        } else {
            await db.run('INSERT INTO CartItems (user_id, game_id, quantity) VALUES (?, ?, ?)', [userId, gameId, 1]);
        }

        await db.run('COMMIT');
        res.status(200).json({ message: 'เพิ่มเกมลงในตะกร้าสำเร็จ' });

    } catch (error) {
        if (db) await db.run('ROLLBACK');
        console.error("❌ Error adding to cart:", error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเพิ่มสินค้าลงตะกร้า', error: error.message });
    }
};

// --- Get Cart Contents ---
exports.getCart = async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    try {
        const db = await openDb();
        const sql = `
            SELECT 
                ci.id AS CartItemID, 
                g.GameID, 
                g.Title, 
                g.Price, 
                g.ImageUrl, 
                ci.quantity 
            FROM CartItems AS ci
            JOIN Games AS g ON ci.game_id = g.GameID
            WHERE ci.user_id = ?
            ORDER BY ci.added_date DESC 
        `;
        const items = await db.all(sql, [userId]);
        
        const processedItems = items.map(item => ({
            ...item,
            ImageUrl: item.ImageUrl ? (item.ImageUrl.startsWith('/') ? item.ImageUrl : `/gamepic/${path.basename(item.ImageUrl)}`) : null 
        }));

        res.json(processedItems);

    } catch (error) {
        console.error("❌ Error fetching cart:", error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลตะกร้า', error: error.message });
    }
};

// --- Update Cart Item Quantity ---
exports.updateCartItem = async (req, res) => {
    const { userId, quantity } = req.body;
    const cartItemId = req.params.itemId;

    if (!userId || !cartItemId || quantity === undefined || quantity < 0) { 
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง (userId, itemId, quantity >= 0)' });
    }
     if (quantity > 1) {
         return res.status(400).json({ message: 'ไม่สามารถเพิ่มจำนวนเกมในตะกร้าได้' });
     }

    try {
        const db = await openDb();
        if (quantity === 0) {
            await db.run('DELETE FROM CartItems WHERE id = ? AND user_id = ?', [cartItemId, userId]);
            res.json({ message: 'ลบสินค้าออกจากตะกร้าสำเร็จ' });
        } else {
            const result = await db.run('UPDATE CartItems SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, cartItemId, userId]);
            if (result.changes === 0) {
                return res.status(404).json({ message: 'ไม่พบสินค้าในตะกร้า หรือไม่มีสิทธิ์แก้ไข' });
            }
            res.json({ message: 'อัปเดตจำนวนสินค้าสำเร็จ' });
        }
    } catch (error) {
        console.error("❌ Error updating cart item:", error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการอัปเดตสินค้า', error: error.message });
    }
};

// --- Remove Item from Cart ---
exports.removeCartItem = async (req, res) => {
    const { userId } = req.body; 
    const cartItemId = req.params.itemId;

    if (!userId || !cartItemId) {
        return res.status(400).json({ message: 'ข้อมูลไม่ถูกต้อง (userId, itemId)' });
    }

    try {
        const db = await openDb();
        const result = await db.run('DELETE FROM CartItems WHERE id = ? AND user_id = ?', [cartItemId, userId]);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'ไม่พบสินค้าในตะกร้า หรือไม่มีสิทธิ์ลบ' });
        }
        res.json({ message: 'ลบสินค้าออกจากตะกร้าสำเร็จ' });
    } catch (error) {
        console.error("❌ Error removing cart item:", error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบสินค้า', error: error.message });
    }
};

// --- Apply Coupon to Cart ---
exports.applyCoupon = async (req, res) => {
    const { userId, couponCode } = req.body;

    if (!userId || !couponCode) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID และ Coupon Code' });
    }

    try {
        const db = await openDb();
        const upperCaseCode = couponCode.toUpperCase();

        const coupon = await db.get(
            'SELECT * FROM Coupons WHERE code = ? AND is_active = 1',
            upperCaseCode
        );
        if (!coupon) return res.status(404).json({ message: 'ไม่พบคูปอง หรือคูปองไม่สามารถใช้งานได้' });
        if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) return res.status(400).json({ message: 'คูปองหมดอายุแล้ว' });

        // ✅ ตรวจสอบ max_uses
        if (coupon.max_uses !== null && coupon.max_uses <= 0) {
            return res.status(400).json({ message: 'คูปองนี้ถูกใช้งานหมดแล้ว' });
        }

        const usage = await db.get('SELECT id FROM CouponUsage WHERE user_id = ? AND coupon_id = ?', [userId, coupon.id]);
        if (usage) return res.status(409).json({ message: 'คุณใช้คูปองนี้ไปแล้ว' });

        const cartItemsSql = `SELECT g.Price FROM CartItems ci JOIN Games g ON ci.game_id = g.GameID WHERE ci.user_id = ?`;
        const itemsInCart = await db.all(cartItemsSql, userId);
        if (itemsInCart.length === 0) return res.status(400).json({ message: 'ตะกร้าสินค้าว่างเปล่า' });
        
        const totalPrice = itemsInCart.reduce((sum, item) => sum + item.Price, 0); 

        const discountAmount = calculateDiscount(totalPrice, coupon);
        const finalPrice = totalPrice - discountAmount;

        res.json({
            message: 'ใช้คูปองสำเร็จ',
            couponCode: coupon.code,
            discountAmount: discountAmount,
            originalPrice: totalPrice,
            finalPrice: finalPrice,
            couponDetails: { 
                type: coupon.discount_type, 
                value: coupon.discount_value,
                remaining: coupon.max_uses 
            }
        });

    } catch (error) {
        console.error("❌ Error applying coupon:", error.message);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการใช้คูปอง', error: error.message });
    }
};

// --- ✅ Checkout (แก้ไขให้ลด max_uses และลบเมื่อหมด) ---
exports.checkout = async (req, res) => {
    const { userId, couponCode } = req.body;
    if (!userId) return res.status(400).json({ message: 'กรุณาระบุ User ID' });

    let db;
    let appliedCoupon = null;
    let discountAmount = 0;

    try {
        db = await openDb();
        await db.run('BEGIN TRANSACTION');

        // 1. Get user wallet & cart items
        const user = await db.get('SELECT wallet FROM User WHERE id = ?', userId);
        if (!user) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'ไม่พบผู้ใช้' }); }

        const cartItemsSql = `SELECT ci.game_id, g.Price FROM CartItems ci JOIN Games g ON ci.game_id = g.GameID WHERE ci.user_id = ?`;
        const itemsToPurchase = await db.all(cartItemsSql, userId);
        if (itemsToPurchase.length === 0) { await db.run('ROLLBACK'); return res.status(400).json({ message: 'ตะกร้าสินค้าว่างเปล่า' }); }

        // 2. Calculate original total
        const originalTotalPrice = itemsToPurchase.reduce((sum, item) => sum + item.Price, 0);
        let finalPrice = originalTotalPrice;

        // 3. ✅ Validate and apply coupon (ลด max_uses และลบถ้าหมด)
        if (couponCode) {
            const upperCaseCode = couponCode.toUpperCase();
            appliedCoupon = await db.get('SELECT * FROM Coupons WHERE code = ? AND is_active = 1', upperCaseCode);
            
            if (!appliedCoupon) throw new Error('คูปองที่ใช้ไม่ถูกต้อง หรือไม่สามารถใช้งานได้');
            if (appliedCoupon.expiry_date && new Date(appliedCoupon.expiry_date) < new Date()) throw new Error('คูปองหมดอายุแล้ว');
            
            // ✅ ตรวจสอบ max_uses
            if (appliedCoupon.max_uses !== null && appliedCoupon.max_uses <= 0) {
                throw new Error('คูปองนี้ถูกใช้งานหมดแล้ว');
            }

            const usage = await db.get('SELECT id FROM CouponUsage WHERE user_id = ? AND coupon_id = ?', [userId, appliedCoupon.id]);
            if (usage) throw new Error('คุณใช้คูปองนี้ไปแล้ว');

            discountAmount = calculateDiscount(originalTotalPrice, appliedCoupon);
            finalPrice = originalTotalPrice - discountAmount;

            // ✅ ลด max_uses หรือลบคูปองถ้าหมด
            if (appliedCoupon.max_uses !== null) {
                const newMaxUses = appliedCoupon.max_uses - 1;
                
                if (newMaxUses <= 0) {
                    // ✅ ลบคูปองออกจากฐานข้อมูล
                    await db.run('DELETE FROM Coupons WHERE id = ?', appliedCoupon.id);
                    console.log(`🗑️ Coupon "${upperCaseCode}" ถูกลบออกจากระบบ (ใช้หมดแล้ว)`);
                } else {
                    // ✅ ลด max_uses ลง 1
                    await db.run('UPDATE Coupons SET max_uses = ? WHERE id = ?', [newMaxUses, appliedCoupon.id]);
                    console.log(`🎟️ Coupon "${upperCaseCode}" เหลือใช้ได้อีก ${newMaxUses} ครั้ง`);
                }
            }
        }

        // 4. Check wallet balance
        const userWallet = user.wallet || 0;
        if (userWallet < finalPrice) { 
            await db.run('ROLLBACK'); 
            return res.status(402).json({ 
                message: `ยอดเงินไม่เพียงพอ ต้องการ ${finalPrice.toFixed(2)} บาท แต่มี ${userWallet.toFixed(2)} บาท` 
            }); 
        }

        // 5. Deduct money
        await db.run('UPDATE User SET wallet = wallet - ? WHERE id = ?', [finalPrice, userId]);

        // 6. Insert into GamePurchases
        const insertPurchaseSql = `INSERT INTO GamePurchases (user_id, game_id, purchase_date, purchase_price) VALUES (?, ?, ?, ?)`;
        const purchaseStmt = await db.prepare(insertPurchaseSql);
        const purchaseDate = new Date().toISOString();
        for (const item of itemsToPurchase) {
            await purchaseStmt.run(userId, item.game_id, purchaseDate, item.Price); 
        }
        await purchaseStmt.finalize();

        // 7. Record coupon usage
        if (appliedCoupon) {
            await db.run('INSERT INTO CouponUsage (user_id, coupon_id) VALUES (?, ?)', [userId, appliedCoupon.id]);
        }

        // 8. Clear cart
        await db.run('DELETE FROM CartItems WHERE user_id = ?', userId);

        // 9. Commit
        await db.run('COMMIT');

        res.json({
            message: 'ดำเนินการสั่งซื้อสำเร็จ!',
            totalItems: itemsToPurchase.length,
            originalPrice: originalTotalPrice,
            discountAmount: discountAmount,
            finalPrice: finalPrice,
            newBalance: userWallet - finalPrice,
            couponUsed: appliedCoupon ? {
                code: appliedCoupon.code,
                type: appliedCoupon.discount_type,
                value: appliedCoupon.discount_value
            } : null
        });

    } catch (error) {
        if (db) await db.run('ROLLBACK');
        console.error("❌ Error during checkout:", error.message);
        res.status(500).json({ 
            message: `เกิดข้อผิดพลาดระหว่างการสั่งซื้อ: ${error.message}`, 
            error: error.message 
        });
    }
};