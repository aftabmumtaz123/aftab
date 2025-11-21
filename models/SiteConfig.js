const mongoose = require('mongoose');

const siteConfigSchema = new mongoose.Schema({
    homeTitle: { type: String, default: "My Portfolio" },
    homeSubtitle: { type: String, default: "Welcome to my creative space" },
    aboutText: { type: String, default: "I am a developer..." },
    aboutImage: { type: String, default: "" }, // URL from Cloudinary
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    github: { type: String, default: "" },
    twitter: { type: String, default: "" },
    instagram: { type: String, default: "" },
    views: { type: Number, default: 0 }
});

module.exports = mongoose.model('SiteConfig', siteConfigSchema);
