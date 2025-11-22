const express = require('express');
const router = express.Router();
const BlogPost = require('../models/BlogPost');
const { requireAuth } = require('../middleware/authMiddleware');

// Middleware to check DB connection for all blog routes
router.use((req, res, next) => {
    if (req.method === 'GET' && require('mongoose').connection.readyState !== 1) {
        // For public blog pages, we might want to show offline page if DB is down
        return res.render('offline', { layout: false });
    }
    next();
});

// --- Public Routes ---

// Blog Home (List)
router.get('/', async (req, res) => {
    try {
        const posts = await BlogPost.find({ status: 'Published' }).sort({ publishedAt: -1 });
        res.render('blog/index', {
            title: 'Blog',
            posts,
            layout: 'layouts/userLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Single Post View
router.get('/post/:slug', async (req, res) => {
    try {
        const post = await BlogPost.findOne({ slug: req.params.slug, status: 'Published' });
        if (!post) return res.status(404).send('Post not found');

        // Increment views
        post.views++;
        await post.save();

        res.render('blog/show', {
            title: post.title,
            post,
            layout: 'layouts/userLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Admin Routes ---

// List Posts
router.get('/admin/blog', requireAuth, async (req, res) => {
    try {
        const posts = await BlogPost.find().sort({ createdAt: -1 });
        res.render('admin/blog/list', {
            title: 'Manage Blog',
            posts,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Add Post Form
router.get('/admin/blog/add', requireAuth, (req, res) => {
    res.render('admin/blog/form', {
        title: 'Add New Post',
        post: {}, // Empty post for add mode
        layout: 'layouts/adminLayout'
    });
});

// Create Post
router.post('/admin/blog/add', requireAuth, async (req, res) => {
    try {
        const { title, summary, content, coverImage, tags, status } = req.body;
        const tagsArray = tags ? tags.split(',').map(t => t.trim()) : [];

        const post = new BlogPost({
            title,
            summary,
            content,
            coverImage,
            tags: tagsArray,
            status,
            publishedAt: status === 'Published' ? new Date() : null
        });

        await post.save();
        res.redirect('/admin/blog');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Edit Post Form
router.get('/admin/blog/edit/:id', requireAuth, async (req, res) => {
    try {
        const post = await BlogPost.findById(req.params.id);
        res.render('admin/blog/form', {
            title: 'Edit Post',
            post,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Update Post
router.post('/admin/blog/edit/:id', requireAuth, async (req, res) => {
    try {
        const { title, summary, content, coverImage, tags, status } = req.body;
        const tagsArray = tags ? tags.split(',').map(t => t.trim()) : [];

        const post = await BlogPost.findById(req.params.id);
        post.title = title;
        post.summary = summary;
        post.content = content;
        post.coverImage = coverImage;
        post.tags = tagsArray;

        // Update publishedAt if status changes to Published
        if (status === 'Published' && post.status !== 'Published') {
            post.publishedAt = new Date();
        }
        post.status = status;

        await post.save();
        res.redirect('/admin/blog');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Delete Post
router.get('/admin/blog/delete/:id', requireAuth, async (req, res) => {
    try {
        await BlogPost.findByIdAndDelete(req.params.id);
        res.redirect('/admin/blog');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
