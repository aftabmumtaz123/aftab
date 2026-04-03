const mongoose = require('mongoose');

const MessageLogSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    toPhone: {
        type: String,
        required: true
    },
    person: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Person'
    },
    text: {
        type: String,
        required: true
    },
    type: {
        type: String, // 'PaymentConfirmation', 'DueReminder', 'Announcement', etc
        default: 'Template'
    },
    status: {
        type: String,
        enum: ['Sent', 'Failed'],
        required: true
    },
    errorMessage: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('MessageLog', MessageLogSchema);
