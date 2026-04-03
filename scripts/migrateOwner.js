/**
 * Migration script: Backfill existing records with the admin user's owner ID.
 * Also upgrades the first user to admin role.
 * Run: node scripts/migrateOwner.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Person = require('../models/Person');
const Income = require('../models/Income');
const Expense = require('../models/Expense');
const Transfer = require('../models/Transfer');
const Category = require('../models/Category');
const Goal = require('../models/Goal');

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected.');

        // Find or upgrade admin user
        let admin = await User.findOne().sort({ createdAt: 1 });
        if (!admin) {
            console.log('❌ No users found. Create an admin account first.');
            process.exit(1);
        }

        // Upgrade first user to admin
        admin.role = 'admin';
        await admin.save();
        console.log(`✅ User "${admin.username}" upgraded to admin role.`);

        const adminId = admin._id;
        const models = [
            { name: 'Payment', model: Payment },
            { name: 'Wallet', model: Wallet },
            { name: 'Person', model: Person },
            { name: 'Income', model: Income },
            { name: 'Expense', model: Expense },
            { name: 'Transfer', model: Transfer },
            { name: 'Category', model: Category },
            { name: 'Goal', model: Goal }
        ];

        for (const { name, model } of models) {
            const result = await model.updateMany(
                { owner: { $exists: false } },
                { $set: { owner: adminId } }
            );
            console.log(`📦 ${name}: Backfilled ${result.modifiedCount} records.`);
        }

        // Also handle ones where owner is null
        for (const { name, model } of models) {
            const result = await model.updateMany(
                { owner: null },
                { $set: { owner: adminId } }
            );
            if (result.modifiedCount > 0) {
                console.log(`📦 ${name}: Fixed ${result.modifiedCount} null owners.`);
            }
        }

        console.log('\n🎉 Migration complete!');
        process.exit(0);
    } catch (err) {
        console.error('Migration Error:', err);
        process.exit(1);
    }
};

migrate();
