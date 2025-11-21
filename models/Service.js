const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    icon: { type: String, default: "" } // Could be a class name or image URL
});

module.exports = mongoose.model('Service', serviceSchema);
