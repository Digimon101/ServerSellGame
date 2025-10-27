-- CREATE TABLE IF NOT EXISTS User (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT NOT NULL,
--   email TEXT UNIQUE NOT NULL,
--   password TEXT NOT NULL,
--   type INTEGER DEFAULT 0
-- );
-- UPDATE User
-- SET type = 1
-- WHERE email = 'Admin@gmail.com';
-- ALTER TABLE User ADD COLUMN image TEXT DEFAULT 'default-avatar.png';


-- CREATE TABLE Genres (
--     GenreID INTEGER PRIMARY KEY,          -- SQLite ใช้ INTEGER PRIMARY KEY เพื่อให้ AUTOINCREMENT
--     GenreName VARCHAR(50) NOT NULL UNIQUE
-- );

-- CREATE TABLE Games (
--     GameID INTEGER PRIMARY KEY,
--     Title VARCHAR(255) NOT NULL,
--     ReleaseDate DATE,
--     Price DECIMAL(10, 2) DEFAULT 0.00
-- );

-- CREATE TABLE GamesGenres (
--     GameID INT,
--     GenreID INT,
--     PRIMARY KEY (GameID, GenreID),  -- กำหนดคู่ของทั้งสองคอลัมน์เป็นคีย์หลักรวม (Composite Primary Key)
    
--     -- เชื่อมโยงกับตาราง Games
--     FOREIGN KEY (GameID) REFERENCES Games(GameID) ON DELETE CASCADE,
    
--     -- เชื่อมโยงกับตาราง Genres
--     FOREIGN KEY (GenreID) REFERENCES Genres(GenreID) ON DELETE CASCADE
-- );



-- INSERT INTO Genres (GenreName) VALUES ('Action');
-- INSERT INTO Genres (GenreName) VALUES ('Adventure');
-- INSERT INTO Genres (GenreName) VALUES ('Role-Playing (RPG)');
-- INSERT INTO Genres (GenreName) VALUES ('Strategy');
-- INSERT INTO Genres (GenreName) VALUES ('Simulation');
-- INSERT INTO Genres (GenreName) VALUES ('Sports');
-- INSERT INTO Genres (GenreName) VALUES ('Puzzle');
-- INSERT INTO Genres (GenreName) VALUES ('Racing');
-- INSERT INTO Genres (GenreName) VALUES ('Horror');
-- INSERT INTO Genres (GenreName) VALUES ('Platformer');

-- INSERT INTO Games (Title, ReleaseDate, Price) VALUES
-- ('Cosmic Conquest', '2024-05-10', 1199.00)


-- INSERT INTO GamesGenres (GameID, GenreID) VALUES
-- (1, 4),
-- (1, 3),
-- (1, 1),  
-- (1, 5),  
-- (1, 9);  

-- ALTER TABLE Games 
-- ADD COLUMN ImageUrl VARCHAR(255);


-- ALTER TABLE Games 
-- ADD COLUMN Description TEXT;


-- INSERT INTO Games (Title, ReleaseDate, Price, Description) VALUES
-- ('Galactic Trader', '2024-03-01', 1200.00, 'เกมจำลองการค้าอวกาศแบบโอเพ่นเวิลด์ บริหารเส้นทางขนส่งและหลบหนีโจรสลัดกาแล็กซี่'),
-- ('Samurai Souls', '2023-11-20', 1550.00, 'แอ็กชัน RPG สุดโหดในญี่ปุ่นโบราณ ผู้เล่นต้องเชี่ยวชาญการต่อสู้ด้วยดาบเพียงเล่มเดียวเพื่อล้างแค้น'),
-- ('Cozy Farm Life', '2024-06-15', 599.50, 'ชีวิตทำฟาร์มแบบผ่อนคลาย ปลูกพืช เลี้ยงสัตว์ และจีบชาวเมืองเพื่อสร้างครอบครัวที่อบอุ่น'),
-- ('Medieval Builder', '2023-08-10', 950.00, 'เกมสร้างเมืองยุคกลางแบบเรียลไทม์ จัดการทรัพยากร วางผังเมือง และปกป้องประชากรจากศัตรูภายนอก'),
-- ('Zombie Outbreak 3', '2025-01-30', 1100.00, 'เกมสยองขวัญเอาชีวิตรอดจากซอมบี้ที่โหดร้ายที่สุด อาวุธมีจำกัด ทางออกมีน้อย ใช้สมองให้มาก!'),
-- ('Grand Prix Racer', '2024-04-05', 890.00, 'สัมผัสความเร็วสุดขีดของการแข่งรถฟอร์มูล่าวันในโหมดอาชีพที่สมจริงและท้าทายทุกสนาม'),
-- ('Dragons Labyrinth', '2023-05-18', 1499.00, 'ดันเจี้ยน RPG สไตล์ Roguelike ที่มีการสุ่มแผนที่และความสามารถของมอนสเตอร์ทุกครั้งที่เล่น'),
-- ('Pixel Dungeon Adventure', '2024-01-01', 350.00, 'เกมผจญภัยกราฟิกพิกเซลสุดคลาสสิก สำรวจเขาวงกตที่เต็มไปด้วยสมบัติและกับดักร้ายกาจ'),
-- ('Submarine Mission', '2024-09-09', 720.00, 'เกมจำลองเรือดำน้ำที่สมจริง ควบคุมโซนาร์ ตอร์ปิโด และดำดิ่งสู่ภารกิจลับใต้ท้องทะเลลึก'),
-- ('The Last City', '2025-02-14', 1300.00, 'แอ็กชันผจญภัยในโลกหลังวันสิ้นโลกที่เต็มไปด้วยอันตราย ความหวังสุดท้ายของมนุษย์อยู่ที่เมืองแห่งเดียว' ),
-- ('Chess Master AI', '2024-10-20', 250.00, 'เกมกระดานหมากรุกที่มีปัญญาประดิษฐ์ระดับสูง ท้าทายผู้เล่นทุกระดับตั้งแต่เริ่มต้นจนถึงผู้เชี่ยวชาญ'),
-- ('Horror Night VR', '2024-12-31', 1050.00, 'เกมสยองขวัญสำหรับ VR ที่จะทำให้คุณหัวใจเต้นไม่เป็นจังหวะในคฤหาสน์ร้างยามค่ำคืน'),
-- ('Neon Platformer', '2024-07-07', 480.00, 'เกม Platformer 2 มิติที่รวดเร็ว สไตล์นีออนสุดล้ำ พร้อมเพลงประกอบอิเล็กทรอนิกส์เร้าใจ'),
-- ('War Commander 2', '2023-10-10', 1600.00, 'เกมวางแผนการรบแบบเรียลไทม์ขนาดใหญ่ ควบคุมกองทัพของคุณและบดขยี้ศัตรูในสมรภูมิโลก'),
-- ('Cooking Star Chef', '2024-04-25', 690.00, 'เกมจำลองการทำอาหารและการจัดการร้านอาหาร เริ่มต้นจากร้านเล็กๆ สู่เชฟระดับโลก');


-- INSERT INTO GamesGenres (GameID, GenreID) VALUES
-- -- GameID 3: Galactic Trader (Simulation, Strategy, Adventure, Action, RPG)
-- (3, 5), (3, 4), (3, 2), (3, 1), (3, 3),

-- -- GameID 4: Samurai Souls (Action, RPG, Adventure, Platformer, Horror)
-- (4, 1), (4, 3), (4, 2), (4, 10), (4, 9),

-- -- GameID 5: Cozy Farm Life (Simulation, RPG, Adventure, Platformer, Sports)
-- (5, 5), (5, 3), (5, 2), (5, 10), (5, 6),

-- -- GameID 6: Medieval Builder (Strategy, Simulation, Action, Adventure, Puzzle)
-- (6, 4), (6, 5), (6, 1), (6, 2), (6, 7),

-- -- GameID 7: Zombie Outbreak 3 (Horror, Action, Adventure, RPG, Platformer)
-- (7, 9), (7, 1), (7, 2), (7, 3), (7, 10),

-- -- GameID 8: Grand Prix Racer (Racing, Sports, Action, Adventure, Simulation)
-- (8, 8), (8, 6), (8, 1), (8, 2), (8, 5),

-- -- GameID 9: Dragon's Labyrinth (RPG, Adventure, Platformer, Action, Puzzle)
-- (9, 3), (9, 2), (9, 10), (9, 1), (9, 7),

-- -- GameID 10: Pixel Dungeon Adventure (Platformer, Adventure, Puzzle, RPG, Action)
-- (10, 10), (10, 2), (10, 7), (10, 3), (10, 1),

-- -- GameID 11: Submarine Mission (Simulation, Adventure, Strategy, Action, Sports)
-- (11, 5), (11, 2), (11, 4), (11, 1), (11, 6),

-- -- GameID 12: The Last City (Action, Adventure, Horror, RPG, Platformer)
-- (12, 1), (12, 2), (12, 9), (12, 3), (12, 10),

-- -- GameID 13: Chess Master AI (Puzzle, Strategy, Simulation, Sports, Action)
-- (13, 7), (13, 4), (13, 5), (13, 6), (13, 1),

-- -- GameID 14: Horror Night VR (Horror, Simulation, Adventure, Action, RPG)
-- (14, 9), (14, 5), (14, 2), (14, 1), (14, 3),

-- -- GameID 15: Neon Platformer (Platformer, Action, Racing, Puzzle, Adventure)
-- (15, 10), (15, 1), (15, 8), (15, 7), (15, 2),

-- -- GameID 16: War Commander 2 (Strategy, Action, Simulation, RPG, Sports)
-- (16, 4), (16, 1), (16, 5), (16, 3), (16, 6),

-- -- GameID 17: Cooking Star Chef (Simulation, Puzzle, Adventure, Sports, RPG)
-- (17, 5), (17, 7), (17, 2), (17, 6), (17, 3);



-- ALTER TABLE User
-- ADD COLUMN wallet DECIMAL(10, 2) NOT NULL DEFAULT 0.00;

-- CREATE TABLE GamePurchases (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id INTEGER NOT NULL,
--     game_id INTEGER NOT NULL,
--     purchase_price DECIMAL(10, 2) NOT NULL,
--     purchase_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (user_id) REFERENCES User(id),
--     FOREIGN KEY (game_id) REFERENCES Games(GameID)
-- );

-- CREATE TABLE TopupHistory (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id INTEGER NOT NULL,
--     amount DECIMAL(10, 2) NOT NULL,
--     transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
--     payment_method VARCHAR(50),
--     status VARCHAR(20) NOT NULL DEFAULT 'Completed',
--     FOREIGN KEY (user_id) REFERENCES User(id)
-- );


-- CREATE TABLE CartItems (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id INTEGER NOT NULL,
--     game_id INTEGER NOT NULL,
--     quantity INTEGER NOT NULL DEFAULT 1,
--     added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
--     FOREIGN KEY (game_id) REFERENCES Games(GameID) ON DELETE CASCADE,
--     UNIQUE (user_id, game_id) -- ป้องกันการเพิ่มเกมซ้ำ
-- );

-- CREATE TABLE Coupons (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     code TEXT UNIQUE NOT NULL,
--     discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
--     discount_value REAL NOT NULL,
--     expiry_date DATETIME,
--     is_active INTEGER DEFAULT 1,
--     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- CREATE TABLE CouponUsage (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     user_id INTEGER NOT NULL,
--     coupon_id INTEGER NOT NULL,
--     used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
--     FOREIGN KEY (coupon_id) REFERENCES Coupons(id) ON DELETE CASCADE,
--     UNIQUE (user_id, coupon_id)
-- );


-- ALTER TABLE Coupons ADD COLUMN max_uses INTEGER; 

-- ALTER TABLE Coupons ADD COLUMN uses_count INTEGER DEFAULT 0 NOT NULL;

CREATE TABLE Promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    discount_percentage REAL NOT NULL CHECK(discount_percentage > 0 AND discount_percentage <= 100), -- ต้องมากกว่า 0 และไม่เกิน 100
    start_date DATETIME,
    end_date DATETIME,
    is_active INTEGER DEFAULT 1 NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES Games(GameID) ON DELETE CASCADE -- ลบโปรโมชั่นถ้าเกมถูกลบ
);

-- (Optional) สร้าง Index เพื่อเพิ่มความเร็วในการค้นหาโปรโมชั่นของเกม
CREATE INDEX idx_promotions_game_id ON Promotions(game_id);
CREATE INDEX idx_promotions_active_dates ON Promotions(is_active, start_date, end_date);