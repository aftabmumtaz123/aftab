const mongoose = require('mongoose');

const heroSectionSchema = new mongoose.Schema({
    title: { type: String, default: "Hello, I'm..." },
    subtitle: { type: String, default: "Full Stack Developer" },
    description: { type: String, default: "I build things for the web." },
    backgroundImage: { type: String, default: "" },
    resumeLink: { type: String, default: "" }
});

module.exports = mongoose.model('HeroSection', heroSectionSchema);
