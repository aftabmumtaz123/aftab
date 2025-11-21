const mongoose = require('mongoose');
const slugify = require('slugify');

const blogPostSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    summary: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    coverImage: {
        type: String, // URL to image
        default: 'https://images.unsplash.com/photo-1499750310159-5b600aaf0378?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80'
    },
    tags: [{
        type: String,
        trim: true
    }],
    status: {
        type: String,
        enum: ['Draft', 'Published'],
        default: 'Draft'
    },
    views: {
        type: Number,
        default: 0
    },
    publishedAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-validate hook to create slug from title
blogPostSchema.pre('validate', function (next) {
    if (this.title) {
        this.slug = slugify(this.title, { lower: true, strict: true });
    }
    next();
});

module.exports = mongoose.model('BlogPost', blogPostSchema);
