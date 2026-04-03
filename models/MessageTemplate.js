const mongoose = require('mongoose');

const messageTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        required: true,
        enum: ['PaymentConfirmation', 'DueReminder', 'WeeklyReminder', 'Custom']
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true
    },
    mediaUrl: {
        type: String, // Add image/media URL option
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

messageTemplateSchema.index({ type: 1, owner: 1 }, { unique: true });

module.exports = mongoose.model('MessageTemplate', messageTemplateSchema);
