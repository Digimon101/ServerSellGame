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
// CORS Configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body Parser with limits
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request Logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// --- STATIC FILE SERVING ---
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/profile', express.static(path.join(uploadsPath, 'profile')));
app.use('/gamepic', express.static(path.join(uploadsPath, 'gamepic')));

// --- HEALTH CHECK ROUTE ---
app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- ROUTES ---

// === User/Profile/Wallet Routes ===
app.post("/register", asyncHandler(userController.register));
app.post("/login", asyncHandler(userController.login));
app.put("/update-profile/:id", userController.upload.single("image"), asyncHandler(userController.updateProfile));
app.get("/wallet/:id", asyncHandler(userController.getWallet));
app.put("/wallet/:id", asyncHandler(userController.addFunds));
app.get("/wallet/history/:id", asyncHandler(userController.getTopupHistory));
app.get("/wallet/purchase-history/:id", asyncHandler(userController.getPurchaseHistory));
app.get("/users", asyncHandler(userController.getAllUsers));
app.delete("/users/:id", asyncHandler(userController.deleteUser));
app.get("/users/details/:id", asyncHandler(userController.getUserDetailsForAdmin));
app.get("/wallet/topup-history/:id", asyncHandler(userController.getTopupHistory));
app.get("/wallet/purchase-history/:id", asyncHandler(userController.getPurchaseHistory));
// === Game Routes ===
app.get("/games/top-sellers", asyncHandler(gameController.getTopSellers));
app.get("/games/search", asyncHandler(gameController.searchGames));
app.get("/genres", asyncHandler(gameController.getGenres));
app.get("/games", asyncHandler(gameController.getGames));
app.get("/games/:id", asyncHandler(gameController.getGameDetails));
app.post("/games", gameController.upload.single('gameImage'), asyncHandler(gameController.addGame));
app.put("/games/:id", gameController.upload.single('gameImage'), asyncHandler(gameController.updateGame));
app.delete("/games/:id", asyncHandler(gameController.deleteGame));
app.get("/games/purchased/:userId", asyncHandler(gameController.getPurchasedGames));
app.post("/games/purchase", asyncHandler(gameController.purchaseGame));
app.get("/users/:userId/library", asyncHandler(gameController.getUserLibrary));

// === Cart Routes ===
app.post('/cart', asyncHandler(cartController.addToCart));
app.get('/cart/:userId', asyncHandler(cartController.getCart));
app.put('/cart/:itemId', asyncHandler(cartController.updateCartItem));
app.delete('/cart/:itemId', asyncHandler(cartController.removeCartItem));
app.post('/cart/apply-coupon', asyncHandler(cartController.applyCoupon));
app.post('/checkout', asyncHandler(cartController.checkout));

// === Coupon Management Routes ===
app.post('/coupons', asyncHandler(couponController.createCoupon));
app.get('/coupons', asyncHandler(couponController.listCoupons));
app.put('/coupons/:id/status', asyncHandler(couponController.toggleCouponStatus));

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

// --- ASYNC ERROR HANDLER WRAPPER ---
// This catches errors from async route handlers
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// --- 404 HANDLER ---
app.use((req, res) => {
    res.status(404).json({ 
        error: "Route not found",
        path: req.path,
        method: req.method
    });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error("❌ Error Handler Caught:", err);
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            error: "Validation Error",
            message: err.message 
        });
    }
    
    if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({ 
            error: "Database Constraint Error",
            message: "Duplicate or invalid data" 
        });
    }
    
    // Default error response
    res.status(err.status || 500).json({ 
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

        // Set server timeout (important for long-running requests)
        server.timeout = 30000; // 30 seconds

        // Graceful Shutdown Handler
        const gracefulShutdown = async (signal) => {
            console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
            
            server.close(async () => {
                console.log("🔒 HTTP server closed");
                
                try {
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

        // Handle uncaught exceptions - LOG BUT DON'T CRASH IMMEDIATELY
        process.on('uncaughtException', (err) => {
            console.error("💥 Uncaught Exception:", err);
            console.error("Stack:", err.stack);
            // Don't call gracefulShutdown immediately - let it try to recover
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error("💥 Unhandled Rejection at:", promise);
            console.error("Reason:", reason);
            // Don't call gracefulShutdown immediately - let it try to recover
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
