const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['Cash', 'Bank', 'Mobile Wallet', 'Credit Card', 'Investment', 'Other'],
        default: 'Cash'
    },
    balance: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'PKR'
    },
    color: {
        type: String,
        default: '#3b82f6' // Default blue
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Wallet', walletSchema);
