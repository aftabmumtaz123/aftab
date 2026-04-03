require('dotenv').config();
const mongoose = require('mongoose');
const MessageTemplate = require('../models/MessageTemplate');

const seedTemplates = [
    {
        name: 'Default Payment Confirmation',
        type: 'PaymentConfirmation',
        text: 'Hello {{name}} ✅,\n\nPayment received successfully.\nAmount: Rs {{amount}}\nThank you! 🙌'
    },
    {
        name: 'Default Due Reminder',
        type: 'DueReminder',
        text: 'Hello {{name}} ⚠️,\n\nReminder: You still owe Rs {{amount}}.\nDue Date: {{dueDate}}\nPlease clear your payment.'
    },
    {
        name: 'Default Weekly Reminder',
        type: 'WeeklyReminder',
        text: 'Hello {{name}} ⚠️,\n\nWeekly Reminder: You still owe Rs {{amount}}.\nDue Date: {{dueDate}}\nPlease clear your payment soon!'
    }
];

const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected.');

        for (const template of seedTemplates) {
            const exists = await MessageTemplate.findOne({ type: template.type });
            if (!exists) {
                await MessageTemplate.create(template);
                console.log(`Seeded: ${template.name}`);
            } else {
                console.log(`Template already exists: ${template.name}`);
            }
        }

        console.log('Database seeded successfully.');
        process.exit();
    } catch (err) {
        console.error('Error seeding db:', err);
        process.exit(1);
    }
};

seedDB();
