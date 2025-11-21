const mongoose = require('mongoose');

const experienceSchema = new mongoose.Schema({
    company: { type: String, required: true },
    role: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date }, // Null means "Present"
    description: { type: String },
    current: { type: Boolean, default: false }
});

module.exports = mongoose.model('Experience', experienceSchema);
