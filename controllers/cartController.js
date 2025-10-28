const path = require('path');
const database = require('../config/database');

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

    try {
        await database.executeTransaction(async (db) => {
            // Check if user already owns the game
            const owned = await db.get(
                'SELECT id FROM GamePurchases WHERE user_id = ? AND game_id = ?', 
                [userId, gameId]
            );
            if (owned) {
                throw new Error('คุณเป็นเจ้าของเกมนี้แล้ว ไม่สามารถเพิ่มลงตะกร้าได้');
            }

            // Check if game exists
            const game = await db.get('SELECT GameID FROM Games WHERE GameID = ?', gameId);
            if (!game) {
                throw new Error('ไม่พบเกมที่ต้องการเพิ่ม');
            }

            // Check if already in cart
            const existingItem = await db.get(
                'SELECT id, quantity FROM CartItems WHERE user_id = ? AND game_id = ?', 
                [userId, gameId]
            );

            if (existingItem) {
                throw new Error('เกมนี้อยู่ในตะกร้าแล้ว');
            }

            // Add to cart
            await db.run(
                'INSERT INTO CartItems (user_id, game_id, quantity) VALUES (?, ?, ?)', 
                [userId, gameId, 1]
            );
        });

        res.status(200).json({ message: 'เพิ่มเกมลงในตะกร้าสำเร็จ' });

    } catch (error) {
        console.error("❌ Error adding to cart:", error.message);
        
        if (error.message === 'คุณเป็นเจ้าของเกมนี้แล้ว ไม่สามารถเพิ่มลงตะกร้าได้') {
            return res.status(409).json({ message: error.message });
        }
        if (error.message === 'ไม่พบเกมที่ต้องการเพิ่ม') {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === 'เกมนี้อยู่ในตะกร้าแล้ว') {
            return res.status(409).json({ message: error.message });
        }
        
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
        const items = await database.executeQuery(async (db) => {
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
            return await db.all(sql, [userId]);
        });
        
        const processedItems = (items || []).map(item => ({
            ...item,
            ImageUrl: item.ImageUrl ? 
                (item.ImageUrl.startsWith('/') ? item.ImageUrl : `/gamepic/${path.basename(item.ImageUrl)}`) 
                : null 
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
        await database.executeQuery(async (db) => {
            if (quantity === 0) {
                await db.run('DELETE FROM CartItems WHERE id = ? AND user_id = ?', [cartItemId, userId]);
            } else {
                const result = await db.run(
                    'UPDATE CartItems SET quantity = ? WHERE id = ? AND user_id = ?', 
                    [quantity, cartItemId, userId]
                );
                if (result.changes === 0) {
                    throw new Error('ไม่พบสินค้าในตะกร้า หรือไม่มีสิทธิ์แก้ไข');
                }
            }
        });

        res.json({ message: quantity === 0 ? 'ลบสินค้าออกจากตะกร้าสำเร็จ' : 'อัปเดตจำนวนสินค้าสำเร็จ' });

    } catch (error) {
        console.error("❌ Error updating cart item:", error.message);
        
        if (error.message === 'ไม่พบสินค้าในตะกร้า หรือไม่มีสิทธิ์แก้ไข') {
            return res.status(404).json({ message: error.message });
        }
        
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
        await database.executeQuery(async (db) => {
            const result = await db.run(
                'DELETE FROM CartItems WHERE id = ? AND user_id = ?', 
                [cartItemId, userId]
            );
            if (result.changes === 0) {
                throw new Error('ไม่พบสินค้าในตะกร้า หรือไม่มีสิทธิ์ลบ');
            }
        });

        res.json({ message: 'ลบสินค้าออกจากตะกร้าสำเร็จ' });

    } catch (error) {
        console.error("❌ Error removing cart item:", error.message);
        
        if (error.message === 'ไม่พบสินค้าในตะกร้า หรือไม่มีสิทธิ์ลบ') {
            return res.status(404).json({ message: error.message });
        }
        
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
        const result = await database.executeQuery(async (db) => {
            const upperCaseCode = couponCode.toUpperCase();

            // Get coupon
            const coupon = await db.get(
                'SELECT * FROM Coupons WHERE code = ? AND is_active = 1',
                upperCaseCode
            );
            
            if (!coupon) {
                throw new Error('ไม่พบคูปอง หรือคูปองไม่สามารถใช้งานได้');
            }
            
            if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
                throw new Error('คูปองหมดอายุแล้ว');
            }

            if (coupon.max_uses !== null && coupon.max_uses <= 0) {
                throw new Error('คูปองนี้ถูกใช้งานหมดแล้ว');
            }

            // Check if user already used this coupon
            const usage = await db.get(
                'SELECT id FROM CouponUsage WHERE user_id = ? AND coupon_id = ?', 
                [userId, coupon.id]
            );
            if (usage) {
                throw new Error('คุณใช้คูปองนี้ไปแล้ว');
            }

            // Get cart items
            const cartItemsSql = `
                SELECT g.Price 
                FROM CartItems ci 
                JOIN Games g ON ci.game_id = g.GameID 
                WHERE ci.user_id = ?
            `;
            const itemsInCart = await db.all(cartItemsSql, userId);
            
            if (itemsInCart.length === 0) {
                throw new Error('ตะกร้าสินค้าว่างเปล่า');
            }
            
            const totalPrice = itemsInCart.reduce((sum, item) => sum + item.Price, 0); 
            const discountAmount = calculateDiscount(totalPrice, coupon);
            const finalPrice = totalPrice - discountAmount;

            return {
                couponCode: coupon.code,
                discountAmount: discountAmount,
                originalPrice: totalPrice,
                finalPrice: finalPrice,
                couponDetails: { 
                    type: coupon.discount_type, 
                    value: coupon.discount_value,
                    remaining: coupon.max_uses 
                }
            };
        });

        res.json({
            message: 'ใช้คูปองสำเร็จ',
            ...result
        });

    } catch (error) {
        console.error("❌ Error applying coupon:", error.message);
        
        if (error.message === 'ไม่พบคูปอง หรือคูปองไม่สามารถใช้งานได้') {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === 'คูปองหมดอายุแล้ว' || 
            error.message === 'คูปองนี้ถูกใช้งานหมดแล้ว' ||
            error.message === 'ตะกร้าสินค้าว่างเปล่า') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'คุณใช้คูปองนี้ไปแล้ว') {
            return res.status(409).json({ message: error.message });
        }
        
        res.status(500).json({ message: 'เกิดข้อผิดพลาดในการใช้คูปอง', error: error.message });
    }
};

// --- Checkout ---
exports.checkout = async (req, res) => {
    const { userId, couponCode } = req.body;
    
    if (!userId) {
        return res.status(400).json({ message: 'กรุณาระบุ User ID' });
    }

    try {
        const result = await database.executeTransaction(async (db) => {
            let appliedCoupon = null;
            let discountAmount = 0;

            // 1. Get user wallet & cart items
            const user = await db.get('SELECT wallet FROM User WHERE id = ?', userId);
            if (!user) {
                throw new Error('ไม่พบผู้ใช้');
            }

            const cartItemsSql = `
                SELECT ci.game_id, g.Price 
                FROM CartItems ci 
                JOIN Games g ON ci.game_id = g.GameID 
                WHERE ci.user_id = ?
            `;
            const itemsToPurchase = await db.all(cartItemsSql, userId);
            
            if (itemsToPurchase.length === 0) {
                throw new Error('ตะกร้าสินค้าว่างเปล่า');
            }

            // 2. Calculate original total
            const originalTotalPrice = itemsToPurchase.reduce((sum, item) => sum + item.Price, 0);
            let finalPrice = originalTotalPrice;

            // 3. Validate and apply coupon
            if (couponCode) {
                const upperCaseCode = couponCode.toUpperCase();
                appliedCoupon = await db.get(
                    'SELECT * FROM Coupons WHERE code = ? AND is_active = 1', 
                    upperCaseCode
                );
                
                if (!appliedCoupon) {
                    throw new Error('คูปองที่ใช้ไม่ถูกต้อง หรือไม่สามารถใช้งานได้');
                }
                
                if (appliedCoupon.expiry_date && new Date(appliedCoupon.expiry_date) < new Date()) {
                    throw new Error('คูปองหมดอายุแล้ว');
                }
                
                if (appliedCoupon.max_uses !== null && appliedCoupon.max_uses <= 0) {
                    throw new Error('คูปองนี้ถูกใช้งานหมดแล้ว');
                }

                const usage = await db.get(
                    'SELECT id FROM CouponUsage WHERE user_id = ? AND coupon_id = ?', 
                    [userId, appliedCoupon.id]
                );
                if (usage) {
                    throw new Error('คุณใช้คูปองนี้ไปแล้ว');
                }

                discountAmount = calculateDiscount(originalTotalPrice, appliedCoupon);
                finalPrice = originalTotalPrice - discountAmount;

                // Update coupon usage count or delete if max_uses reached
                if (appliedCoupon.max_uses !== null) {
                    const newMaxUses = appliedCoupon.max_uses - 1;
                    
                    if (newMaxUses <= 0) {
                        await db.run('DELETE FROM Coupons WHERE id = ?', appliedCoupon.id);
                        console.log(`🗑️ Coupon "${upperCaseCode}" ถูกลบออกจากระบบ (ใช้หมดแล้ว)`);
                    } else {
                        await db.run('UPDATE Coupons SET max_uses = ? WHERE id = ?', [newMaxUses, appliedCoupon.id]);
                        console.log(`🎟️ Coupon "${upperCaseCode}" เหลือใช้ได้อีก ${newMaxUses} ครั้ง`);
                    }
                }
            }

            // 4. Check wallet balance
            const userWallet = user.wallet || 0;
            if (userWallet < finalPrice) { 
                throw new Error(`ยอดเงินไม่เพียงพอ ต้องการ ${finalPrice.toFixed(2)} บาท แต่มี ${userWallet.toFixed(2)} บาท`);
            }

            // 5. Deduct money
            await db.run('UPDATE User SET wallet = wallet - ? WHERE id = ?', [finalPrice, userId]);

            // 6. Insert into GamePurchases
            const insertPurchaseSql = `
                INSERT INTO GamePurchases (user_id, game_id, purchase_date, purchase_price) 
                VALUES (?, ?, ?, ?)
            `;
            const purchaseStmt = await db.prepare(insertPurchaseSql);
            const purchaseDate = new Date().toISOString();
            
            for (const item of itemsToPurchase) {
                await purchaseStmt.run(userId, item.game_id, purchaseDate, item.Price); 
            }
            await purchaseStmt.finalize();

            // 7. Record coupon usage
            if (appliedCoupon) {
                await db.run(
                    'INSERT INTO CouponUsage (user_id, coupon_id) VALUES (?, ?)', 
                    [userId, appliedCoupon.id]
                );
            }

            // 8. Clear cart
            await db.run('DELETE FROM CartItems WHERE user_id = ?', userId);

            return {
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
            };
        });

        res.json({
            message: 'ดำเนินการสั่งซื้อสำเร็จ!',
            ...result
        });

    } catch (error) {
        console.error("❌ Error during checkout:", error.message);
        
        if (error.message === 'ไม่พบผู้ใช้') {
            return res.status(404).json({ message: error.message });
        }
        if (error.message === 'ตะกร้าสินค้าว่างเปล่า' ||
            error.message.includes('ยอดเงินไม่เพียงพอ') ||
            error.message.includes('คูปอง')) {
            return res.status(400).json({ message: error.message });
        }
        
        res.status(500).json({ 
            message: `เกิดข้อผิดพลาดระหว่างการสั่งซื้อ: ${error.message}`, 
            error: error.message 
        });
    }
};

module.exports = exports;
