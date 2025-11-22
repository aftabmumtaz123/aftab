const mongoose = require('mongoose');

const skillSchema = new mongoose.Schema({
    name: { type: String, required: true },
    level: { type: Number, required: true, min: 0, max: 100 }, // Percentage
    icon: { type: String, default: "" } // FontAwesome class or Image URL
}, { timestamps: true });

module.exports = mongoose.model('Skill', skillSchema);
