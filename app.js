require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const { checkUser } = require('./middleware/authMiddleware');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(checkUser); // Apply auth middleware globally to check user status

// Global variables middleware
app.use((req, res, next) => {
    res.locals.path = req.path;
    next();
});

// View Engine
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/userLayout'); // Default layout

// Import Routes
const indexRoutes = require('./routes/index');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const financeRoutes = require('./routes/finance');
const blogRoutes = require('./routes/blog');

// Use Routes
app.use('/', indexRoutes);
app.use('/admin', adminRoutes);
app.use('/auth', authRoutes);
app.use('/admin/finance', financeRoutes);
app.use('/', blogRoutes); // Blog routes handle both /blog and /admin/blog

const PORT = process.env.PORT || 3000;

// Database Connection
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
        });
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        // Do not exit process, allow server to run for offline mode
    }
};

// Connect to DB but don't block server startup
connectDB();

// Handle MongoDB errors after initial connection
mongoose.connection.on('error', err => {
    console.error('MongoDB Runtime Error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB Disconnected');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
