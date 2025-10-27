const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
// นำเข้า Controllers
const userController = require("./controllers/userController");
const gameController = require("./controllers/gameController");
const cartController = require("./controllers/cartController");
const couponController = require("./controllers/couponController");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

// --- STATIC FILE SERVING ---
app.use('/profile', express.static(path.join(__dirname, 'uploads/profile')));
app.use('/gamepic', express.static(path.join(__dirname, 'uploads/gamepic')));

// --- USER/PROFILE/WALLET ROUTES ---
// ... (existing user routes)
app.post("/register", userController.register);
app.post("/login", userController.login);
app.put("/update-profile/:id", userController.upload.single("image"), userController.updateProfile);
app.get("/wallet/:id", userController.getWallet);
app.put("/wallet/:id", userController.addFunds);
app.get("/wallet/history/:id", userController.getTopupHistory);
app.get("/wallet/purchase-history/:id", userController.getPurchaseHistory);
app.get("/users", userController.getAllUsers);
app.delete("/users/:id", userController.deleteUser);
app.get("/users/details/:id", userController.getUserDetailsForAdmin);


// --- GAME ROUTES ---
app.get("/games/top-sellers", gameController.getTopSellers);
app.get("/games/search", gameController.searchGames);
// app.get('/games/:id/genres', gameController.getGameGenres); // Assuming getGameGenres exists
app.get("/genres", gameController.getGenres);
app.get("/games", gameController.getGames);
app.get("/games/:id", gameController.getGameDetails);
app.post("/games", gameController.upload.single('gameImage'), gameController.addGame);
app.put("/games/:id", gameController.upload.single('gameImage'), gameController.updateGame);
app.delete("/games/:id", gameController.deleteGame);
app.get("/games/purchased/:userId", gameController.getPurchasedGames);
app.post("/games/purchase", gameController.purchaseGame); // Direct purchase
app.get("/users/:userId/library", gameController.getUserLibrary);


// --- CART ROUTES ---
app.post('/cart', cartController.addToCart);
app.get('/cart/:userId', cartController.getCart);
app.put('/cart/:itemId', cartController.updateCartItem);
app.delete('/cart/:itemId', cartController.removeCartItem);
app.post('/cart/apply-coupon', cartController.applyCoupon); // <-- [FIX] Added this route
app.post('/checkout', cartController.checkout);

// --- COUPON MANAGEMENT ROUTES (For Admin) ---
app.post('/coupons', couponController.createCoupon);
app.get('/coupons', couponController.listCoupons);
app.put('/coupons/:id/status', couponController.toggleCouponStatus);


// --- DEFAULT ROUTE ---
app.get("/", (req, res) => res.send("🚀 Server is running"));

app.listen(PORT, () => console.log(`✅ Server started at http://localhost:${PORT}`));

