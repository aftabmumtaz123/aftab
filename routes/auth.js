const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Middleware to check DB connection for auth routes
router.use((req, res, next) => {
    if (req.method === 'GET' && require('mongoose').connection.readyState !== 1) {
        return res.render('offline', { layout: false });
    }
    next();
});

// Create Token
const maxAge = 3 * 24 * 60 * 60; // 3 days
const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: maxAge
    });
};

// Login Page
router.get('/login', (req, res) => {
    res.render('admin/login', { title: 'Admin Login', layout: false });
});

// Login Post
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Check DB connection first
        if (require('mongoose').connection.readyState !== 1) {
            throw Error('Database disconnected');
        }

        const user = await User.findOne({ username });
        if (user) {
            const auth = await user.comparePassword(password);
            if (auth) {
                const token = createToken(user._id);
                res.cookie('jwt', token, { httpOnly: true, maxAge: maxAge * 1000 });
                return res.status(200).json({ user: user._id });
            }
            throw Error('incorrect password');
        }
        throw Error('incorrect username');
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// Logout
router.get('/logout', (req, res) => {
    res.cookie('jwt', '', { maxAge: 1 });
    res.redirect('/');
});


module.exports = router;
