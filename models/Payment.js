const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    person: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Person',
        required: true
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet'
    },
    type: {
        type: String,
        enum: ['send', 'receive'], // 'send' = You gave money, 'receive' = You got money
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    date: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Pending', 'Completed', 'Partial', 'Overdue'],
        default: 'Pending'
    },
    paidAmount: {
        type: Number,
        default: 0
    },
    method: {
        type: String,
        enum: ['Cash', 'Bank', 'JazzCash', 'EasyPaisa', 'Other'],
        default: 'Cash'
    },
    notes: {
        type: String
    },
    attachments: [{
        type: String
    }],
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

paymentSchema.virtual('amountDue').get(function () {
    return this.amount - (this.paidAmount || 0);
});

module.exports = mongoose.model('Payment', paymentSchema);
