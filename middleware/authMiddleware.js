const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
    const token = req.cookies.jwt;

    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, async (err, decodedToken) => {
            if (err) {
                console.log(err.message);
                res.redirect('/auth/login');
            } else {
                // Check if DB is connected
                if (require('mongoose').connection.readyState !== 1) {
                    console.log('DB disconnected, skipping auth check (allowing offline access if cached)');
                    // If offline, we might want to allow access if it's a GET request (served by SW)
                    // But if it reaches here, it means SW didn't handle it or it's a fresh request.
                    // For now, let's allow it to proceed so the offline page can be rendered if needed
                    // or if the page doesn't strictly need user data.
                    res.locals.user = null;
                    next();
                    return;
                }

                try {
                    let user = await User.findById(decodedToken.id);
                    res.locals.user = user;
                    next();
                } catch (dbErr) {
                    console.error('DB Error in requireAuth:', dbErr.message);
                    res.redirect('/auth/login');
                }
            }
        });
    } else {
        res.redirect('/auth/login');
    }
};

// Check current user (for public views if needed, or just to pass user info)
const checkUser = (req, res, next) => {
    const token = req.cookies.jwt;
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, async (err, decodedToken) => {
            if (err) {
                console.log(err.message);
                res.locals.user = null;
                next();
            } else {
                // Check if DB is connected before querying
                if (require('mongoose').connection.readyState !== 1) {
                    // console.log('DB disconnected, skipping user fetch'); // Optional: uncomment for debug
                    res.locals.user = null;
                    next();
                    return;
                }

                try {
                    let user = await User.findById(decodedToken.id);
                    res.locals.user = user;
                    next();
                } catch (dbErr) {
                    // Suppress connection errors in offline mode
                    if (dbErr.message.includes('buffering timed out') || dbErr.code === 'ENOTFOUND' || dbErr.message.includes('getaddrinfo')) {
                        console.log('Offline mode: DB unreachable (checkUser skipped)');
                    } else {
                        console.error('DB Error in checkUser:', dbErr.message);
                    }
                    res.locals.user = null;
                    next();
                }
            }
        });
    } else {
        res.locals.user = null;
        next();
    }
};

module.exports = { requireAuth, checkUser };
