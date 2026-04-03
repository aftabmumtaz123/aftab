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
                    console.log('DB disconnected, skipping auth check');
                    res.locals.user = null;
                    next();
                    return;
                }

                try {
                    let user = await User.findById(decodedToken.id);
                    if (!user || !user.isActive) {
                        res.clearCookie('jwt');
                        return res.redirect('/auth/login');
                    }
                    req.user = user;
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

const requireAdmin = async (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).send('Access denied. Admin privileges required.');
};

// Check current user (for public views)
const checkUser = (req, res, next) => {
    const token = req.cookies.jwt;
    if (token) {
        jwt.verify(token, process.env.JWT_SECRET, async (err, decodedToken) => {
            if (err) {
                console.log(err.message);
                res.locals.user = null;
                next();
            } else {
                if (require('mongoose').connection.readyState !== 1) {
                    res.locals.user = null;
                    next();
                    return;
                }

                try {
                    let user = await User.findById(decodedToken.id);
                    req.user = user;
                    res.locals.user = user;
                    next();
                } catch (dbErr) {
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

module.exports = { requireAuth, requireAdmin, checkUser };
