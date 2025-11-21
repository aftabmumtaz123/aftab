const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    imageUrl: { type: String, required: true },
    liveLink: { type: String, default: "" },
    repoLink: { type: String, default: "" },
    tags: [String], // Array of tech stack tags
    clicks: { type: Number, default: 0 }
});

module.exports = mongoose.model('Project', projectSchema);
