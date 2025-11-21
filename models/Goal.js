const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    targetAmount: {
        type: Number,
        required: true,
        min: 0
    },
    currentAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    deadline: {
        type: Date
    },
    color: {
        type: String,
        default: '#10b981' // Default green
    },
    status: {
        type: String,
        enum: ['In Progress', 'Completed', 'Paused'],
        default: 'In Progress'
    },
    notes: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Goal', goalSchema);
