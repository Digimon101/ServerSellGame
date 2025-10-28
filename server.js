const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");

// Import Controllers
const userController = require("./controllers/userController");
const gameController = require("./controllers/gameController");
const cartController = require("./controllers/cartController");
const couponController = require("./controllers/couponController");

// Import Database Config
const database = require('./config/database');

// Initialize Express App
const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARE ---
// CORS Configuration (Important for Render.com)
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*', // Set your frontend URL in environment variables
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body Parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request Logging (for debugging on Render)
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// --- STATIC FILE SERVING ---
// Ensure uploads directory exists on Render
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/profile', express.static(path.join(uploadsPath, 'profile')));
app.use('/gamepic', express.static(path.join(uploadsPath, 'gamepic')));

// --- HEALTH CHECK ROUTE (Important for Render) ---
app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- ROUTES ---

// === User/Profile/Wallet Routes ===
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

// === Game Routes ===
app.get("/games/top-sellers", gameController.getTopSellers);
app.get("/games/search", gameController.searchGames);
app.get("/genres", gameController.getGenres);
app.get("/games", gameController.getGames);
app.get("/games/:id", gameController.getGameDetails);
app.post("/games", gameController.upload.single('gameImage'), gameController.addGame);
app.put("/games/:id", gameController.upload.single('gameImage'), gameController.updateGame);
app.delete("/games/:id", gameController.deleteGame);
app.get("/games/purchased/:userId", gameController.getPurchasedGames);
app.post("/games/purchase", gameController.purchaseGame);
app.get("/users/:userId/library", gameController.getUserLibrary);

// === Cart Routes ===
app.post('/cart', cartController.addToCart);
app.get('/cart/:userId', cartController.getCart);
app.put('/cart/:itemId', cartController.updateCartItem);
app.delete('/cart/:itemId', cartController.removeCartItem);
app.post('/cart/apply-coupon', cartController.applyCoupon);
app.post('/checkout', cartController.checkout);

// === Coupon Management Routes ===
app.post('/coupons', couponController.createCoupon);
app.get('/coupons', couponController.listCoupons);
app.put('/coupons/:id/status', couponController.toggleCouponStatus);

// === Default Route ===
app.get("/", (req, res) => {
    res.json({ 
        message: "🚀 Game Store API is running",
        version: "1.0.0",
        endpoints: {
            health: "/health",
            users: "/users",
            games: "/games",
            cart: "/cart",
            coupons: "/coupons"
        }
    });
});

// --- 404 HANDLER ---
app.use((req, res) => {
    res.status(404).json({ 
        error: "Route not found",
        path: req.path,
        method: req.method
    });
});

// --- ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error("❌ Server Error:", err.stack);
    res.status(500).json({ 
        error: "Internal Server Error",
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
});

// --- START SERVER FUNCTION ---
async function startServer() {
    try {
        console.log("🔧 Environment:", process.env.NODE_ENV || 'development');
        console.log("🔧 Port:", PORT);
        console.log("⏳ Initializing database schema...");
        
        // Initialize Database Schema
        await database.initializeSchema();
        console.log("✅ Database schema initialized successfully");
        
        // Start Express Server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server is running on port ${PORT}`);
            console.log(`🌐 Local: http://localhost:${PORT}`);
            if (process.env.RENDER_EXTERNAL_URL) {
                console.log(`🌐 Render: ${process.env.RENDER_EXTERNAL_URL}`);
            }
        });

        // Graceful Shutdown Handler (Important for Render)
        const gracefulShutdown = async (signal) => {
            console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
            
            server.close(async () => {
                console.log("🔒 HTTP server closed");
                
                // Add any cleanup logic here (close DB connections, etc.)
                try {
                    // If you have any persistent connections, close them here
                    console.log("✅ Cleanup completed");
                    process.exit(0);
                } catch (err) {
                    console.error("❌ Error during cleanup:", err);
                    process.exit(1);
                }
            });

            // Force shutdown after 10 seconds
            setTimeout(() => {
                console.error("⚠️  Forced shutdown after timeout");
                process.exit(1);
            }, 10000);
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (err) => {
            console.error("💥 Uncaught Exception:", err);
            gracefulShutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
            gracefulShutdown('unhandledRejection');
        });

    } catch (err) {
        console.error("💀 Failed to start server:", err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

// --- START THE SERVER ---
startServer();

// Export app for testing
module.exports = app;
