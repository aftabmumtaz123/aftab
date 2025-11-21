const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String, // Changed from enum to String to support custom categories
        required: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paidAmount: {
        type: Number,
        default: function () { return this.amount; } // Default to full amount if not specified
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet'
    },
    paymentMethod: {
        type: String,
        enum: ['Cash', 'Bank', 'JazzCash', 'EasyPaisa', 'Credit Card', 'Other'],
        default: 'Cash'
    },
    status: {
        type: String,
        enum: ['Paid', 'Pending', 'Partial', 'Overdue'],
        default: 'Paid'
    },
    date: {
        type: Date,
        default: Date.now
    },
    // Recurring Logic
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringFrequency: {
        type: String,
        enum: ['Weekly', 'Monthly', 'Yearly', null],
        default: null
    },
    nextDueDate: {
        type: Date
    },
    notes: {
        type: String
    },
    attachments: [{
        type: String
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Expense', expenseSchema);
