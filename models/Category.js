const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['expense', 'income'],
        required: true
    },
    color: {
        type: String,
        default: '#6b7280' // Default gray
    },
    icon: {
        type: String,
        default: 'fa-tag' // FontAwesome icon class
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Category', categorySchema);
