const Person = require('../models/Person');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const Income = require('../models/Income');
const Transfer = require('../models/Transfer');
const redisClient = require('../config/redis');
const notificationService = require('./notificationService');
const whatsappService = require('./whatsappService');

const financeHelpers = {
    // --- Expenses ---
    createExpense: async (data) => {
        // Auto-calculate status
        if (data.paidAmount >= data.amount) data.status = 'Paid';
        else if (data.paidAmount > 0) data.status = 'Partial';
        else data.status = 'Pending';

        // Initialize Payment History if paidAmount > 0
        if (data.paidAmount > 0) {
            data.paymentHistory = [{
                amount: data.paidAmount,
                date: data.date || new Date(),
                method: data.paymentMethod,
                wallet: data.wallet,
                notes: 'Initial payment'
            }];
        }

        const expense = await Expense.create(data);

        // Deduct from Wallet if status is Paid or Partial
        if (data.wallet && (data.status === 'Paid' || data.status === 'Partial')) {
            const amountToDeduct = data.paidAmount || 0;
            await Wallet.findOneAndUpdate({ _id: data.wallet, owner: data.owner }, { $inc: { balance: -amountToDeduct } });
        }

        // Notification
        await notificationService.createNotification({
            title: 'Expense Created',
            message: `New expense: ${data.title} (${data.amount})`,
            type: 'info',
            link: '/admin/finance',
            owner: data.owner
        });

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:expenses');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:categories');
        }
        return expense;
    },

    updateExpense: async (id, data, ownerId) => {
        const oldExpense = await Expense.findOne({ _id: id, owner: ownerId });
        if (!oldExpense) throw new Error('Expense not found or unauthorized');

        // Revert old wallet balance
        if (oldExpense.wallet && (oldExpense.status === 'Paid' || oldExpense.status === 'Partial')) {
            const oldAmount = oldExpense.paidAmount || 0;
            await Wallet.findOneAndUpdate({ _id: oldExpense.wallet, owner: ownerId }, { $inc: { balance: oldAmount } });
        }

        // Auto-calculate status
        if (data.paidAmount >= data.amount) data.status = 'Paid';
        else if (data.paidAmount > 0) data.status = 'Partial';
        else data.status = 'Pending';

        const updatedExpense = await Expense.findOneAndUpdate({ _id: id, owner: ownerId }, data, { new: true });

        // Apply new wallet balance
        if (updatedExpense.wallet && (updatedExpense.status === 'Paid' || updatedExpense.status === 'Partial')) {
            const newAmount = updatedExpense.paidAmount || 0;
            await Wallet.findOneAndUpdate({ _id: updatedExpense.wallet, owner: ownerId }, { $inc: { balance: -newAmount } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:expenses');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:categories');
        }
        return updatedExpense;
    },

    deleteExpense: async (id, ownerId) => {
        const expense = await Expense.findOne({ _id: id, owner: ownerId });
        if (!expense) throw new Error('Expense not found or unauthorized');

        // Refund to Wallet
        if (expense.wallet && (expense.status === 'Paid' || expense.status === 'Partial')) {
            const amountToRefund = expense.paidAmount || 0;
            await Wallet.findOneAndUpdate({ _id: expense.wallet, owner: ownerId }, { $inc: { balance: amountToRefund } });
        }

        await Expense.findOneAndDelete({ _id: id, owner: ownerId });

        // Notification
        await notificationService.createNotification({
            title: 'Expense Deleted',
            message: `Deleted expense: ${expense.title}`,
            type: 'warning',
            link: '/admin/finance',
            owner: ownerId
        });

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:expenses');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:categories');
        }
        return expense;
    },

    // --- Income ---
    createIncome: async (data) => {
        const income = await Income.create(data);

        // Add to Wallet
        if (data.wallet) {
            await Wallet.findOneAndUpdate({ _id: data.wallet, owner: data.owner }, { $inc: { balance: data.amount } });
        }

        // Notification
        await notificationService.createNotification({
            title: 'Income Added',
            message: `Income added: ${data.amount} (${data.source})`,
            type: 'success',
            link: '/admin/finance',
            owner: data.owner
        });

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:income');
            await redisClient.del('finance:wallets');
        }
        return income;
    },

    updateIncome: async (id, data, ownerId) => {
        const oldIncome = await Income.findOne({ _id: id, owner: ownerId });
        if (!oldIncome) throw new Error('Income not found or unauthorized');

        // Revert old wallet balance
        if (oldIncome.wallet) {
            await Wallet.findOneAndUpdate({ _id: oldIncome.wallet, owner: ownerId }, { $inc: { balance: -oldIncome.amount } });
        }

        const updatedIncome = await Income.findOneAndUpdate({ _id: id, owner: ownerId }, data, { new: true });

        // Apply new wallet balance
        if (updatedIncome.wallet) {
            await Wallet.findOneAndUpdate({ _id: updatedIncome.wallet, owner: ownerId }, { $inc: { balance: updatedIncome.amount } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:income');
            await redisClient.del('finance:wallets');
        }
        return updatedIncome;
    },

    deleteIncome: async (id, ownerId) => {
        const income = await Income.findOne({ _id: id, owner: ownerId });
        if (!income) throw new Error('Income not found or unauthorized');

        // Deduct from Wallet
        if (income.wallet) {
            await Wallet.findOneAndUpdate({ _id: income.wallet, owner: ownerId }, { $inc: { balance: -income.amount } });
        }

        await Income.findOneAndDelete({ _id: id, owner: ownerId });

        // Notification
        await notificationService.createNotification({
            title: 'Income Deleted',
            message: `Deleted income: ${income.amount}`,
            type: 'warning',
            link: '/admin/finance',
            owner: ownerId
        });

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:income');
            await redisClient.del('finance:wallets');
        }
        return income;
    },

    // --- Wallets ---
    createWallet: async (data) => {
        const wallet = await Wallet.create(data);
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return wallet;
    },

    updateWallet: async (id, data, ownerId) => {
        const wallet = await Wallet.findOneAndUpdate({ _id: id, owner: ownerId }, data, { new: true });
        if (!wallet) throw new Error('Wallet not found or unauthorized');
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return wallet;
    },

    deleteWallet: async (id, ownerId) => {
        const wallet = await Wallet.findOneAndDelete({ _id: id, owner: ownerId });
        if (!wallet) throw new Error('Wallet not found or unauthorized');
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return wallet;
    },

    transferFunds: async (data, ownerId) => {
        const { fromWallet, toWallet, amount, date, notes } = data;
        const transferAmount = parseFloat(amount);

        // Verify ownership of both wallets
        const [source, target] = await Promise.all([
            Wallet.findOne({ _id: fromWallet, owner: ownerId }),
            Wallet.findOne({ _id: toWallet, owner: ownerId })
        ]);

        if (!source || !target) throw new Error('Unauthorized or invalid wallet');

        const transfer = await Transfer.create({
            owner: ownerId,
            fromWallet,
            toWallet,
            amount: transferAmount,
            date: date || Date.now(),
            notes
        });

        // Update Wallet Balances
        await Wallet.findOneAndUpdate({ _id: fromWallet, owner: ownerId }, { $inc: { balance: -transferAmount } });
        await Wallet.findOneAndUpdate({ _id: toWallet, owner: ownerId }, { $inc: { balance: transferAmount } });

        // Clear Cache
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return transfer;
    },

    // --- People ---
    createPerson: async (data) => {
        const person = await Person.create(data);

        // Notification
        await notificationService.createNotification({
            title: 'Person Added',
            message: `New person added: ${data.name}`,
            type: 'info',
            link: '/admin/finance/people',
            owner: data.owner
        });

        if (redisClient?.isReady) await redisClient.del('finance:people');
        return person;
    },

    updatePerson: async (id, data, ownerId) => {
        const person = await Person.findOneAndUpdate({ _id: id, owner: ownerId }, data, { new: true });
        if (!person) throw new Error('Person not found or unauthorized');
        if (redisClient?.isReady) await redisClient.del('finance:people');
        return person;
    },

    deletePerson: async (id, ownerId) => {
        const person = await Person.findOneAndDelete({ _id: id, owner: ownerId });
        if (!person) throw new Error('Person not found or unauthorized');

        // Notification
        await notificationService.createNotification({
            title: 'Person Deleted',
            message: `Deleted person: ${person.name}`,
            type: 'warning',
            link: '/admin/finance/people',
            owner: ownerId
        });

        if (redisClient?.isReady) await redisClient.del('finance:people');
        return person;
    },

    // --- Categories ---
    createCategory: async (data) => {
        const category = await Category.create(data);
        if (redisClient?.isReady) await redisClient.del('finance:categories');
        return category;
    },

    updateCategory: async (id, data, ownerId) => {
        const category = await Category.findOneAndUpdate({ _id: id, owner: ownerId }, data, { new: true });
        if (!category) throw new Error('Category not found or unauthorized');
        if (redisClient?.isReady) await redisClient.del('finance:categories');
        return category;
    },

    deleteCategory: async (id, ownerId) => {
        const category = await Category.findOneAndDelete({ _id: id, owner: ownerId });
        if (!category) throw new Error('Category not found or unauthorized');
        if (redisClient?.isReady) await redisClient.del('finance:categories');
        return category;
    },

    // --- Payments ---
    createPayment: async (data) => {
        // Auto-calculate status
        if (data.paidAmount >= data.amount) data.status = 'Completed';
        else if (data.paidAmount > 0) data.status = 'Partial';
        else data.status = 'Pending';

        const payment = await Payment.create(data);

        // Update Wallet Balance
        if (data.wallet && (data.status === 'Completed' || data.status === 'Partial')) {
            const amountToProcess = data.paidAmount || 0;
            const change = data.type === 'receive' ? amountToProcess : -amountToProcess;
            await Wallet.findOneAndUpdate({ _id: data.wallet, owner: data.owner }, { $inc: { balance: change } });
        }

        // Notification & Email
        const person = await Person.findOne({ _id: data.person, owner: data.owner });
        const personName = person ? person.name : 'Someone';
        const amount = data.paidAmount || data.amount;

        // Admin Notification
        await notificationService.createNotification({
            title: 'Payment Recorded',
            message: `${data.type === 'receive' ? 'Received' : 'Paid'} ${amount} ${data.type === 'receive' ? 'from' : 'to'} ${personName}`,
            type: 'success',
            link: `/admin/finance/people/${data.person}`,
            owner: data.owner
        });

        // Email to Person (if email exists)
        if (person && person.email) {
            const subject = `Payment Update – ${new Date().toLocaleDateString()}`;
            const action = data.type === 'receive' ? 'paid me' : 'received';
            const html = `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                    <h2>Payment Update</h2>
                    <p>Hi ${person.name},</p>
                    <p>Just recording that you ${action} <strong>${amount}</strong> today.</p>
                    <p>Thanks!</p>
                    <a href="#" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">View History</a>
                </div>
            `;
            await notificationService.sendEmail(person.email, subject, html);
        }

        // WhatsApp to Person (if phone exists)
        if (person && person.phone) {
            try {
                console.log(`📲 Triggering standard creation WhatsApp to ${person.phone}...`);
                await whatsappService.sendPaymentConfirmation(payment, person.phone, data.owner, personName);
            } catch (err) {
                console.error('❌ WhatsApp Confirmation Error:', err.message);
            }
        } else {
            console.log('⚠️ No phone number associated with person ID:', data.person);
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:payments');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:people');
        }
        return payment;
    },

    updatePayment: async (id, data, ownerId) => {
        const oldPayment = await Payment.findOne({ _id: id, owner: ownerId });
        if (!oldPayment) throw new Error('Payment not found');

        // Revert old wallet balance
        if (oldPayment.wallet && oldPayment.status === 'Completed') {
            const revertChange = oldPayment.type === 'receive' ? -oldPayment.amount : oldPayment.amount;
            await Wallet.findOneAndUpdate({ _id: oldPayment.wallet, owner: ownerId }, { $inc: { balance: revertChange } });
        }

        const updatedPayment = await Payment.findOneAndUpdate({ _id: id, owner: ownerId }, data, { new: true });

        // Apply new wallet balance
        if (updatedPayment.wallet && updatedPayment.status === 'Completed') {
            const newChange = updatedPayment.type === 'receive' ? updatedPayment.amount : -updatedPayment.amount;
            await Wallet.findOneAndUpdate({ _id: updatedPayment.wallet, owner: ownerId }, { $inc: { balance: newChange } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:payments');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:people');
        }

        // WhatsApp Notification check for updates
        const person = await Person.findOne({ _id: updatedPayment.person, owner: ownerId });
        if (person && person.phone) {
            try {
                if (updatedPayment.status === 'Completed' && oldPayment.status !== 'Completed') {
                    console.log(`📲 Triggering Completed WhatsApp to ${person.phone}...`);
                    await whatsappService.sendPaymentConfirmation(updatedPayment, person.phone, ownerId, person.name);
                } else if (updatedPayment.status === 'Partial' && oldPayment.status !== 'Partial') {
                    console.log(`📲 Triggering Partial WhatsApp to ${person.phone}...`);
                    await whatsappService.sendPaymentConfirmation(updatedPayment, person.phone, ownerId, person.name);
                } else if (updatedPayment.status === 'Overdue' && oldPayment.status !== 'Overdue') {
                    console.log(`📲 Triggering Overdue WhatsApp to ${person.phone}...`);
                    await whatsappService.sendDueReminder(updatedPayment, person.phone, ownerId, person.name);
                }
            } catch (err) {
                console.error('❌ WhatsApp Update Error:', err.message);
            }
        }

        return updatedPayment;
    },

    deletePayment: async (id, ownerId) => {
        const payment = await Payment.findOne({ _id: id, owner: ownerId });
        if (!payment) throw new Error('Payment not found');

        // Revert Wallet Balance
        if (payment.wallet && (payment.status === 'Completed' || payment.status === 'Partial')) {
            const amountToRevert = payment.paidAmount || 0;
            const revertChange = payment.type === 'receive' ? -amountToRevert : amountToRevert;
            await Wallet.findOneAndUpdate({ _id: payment.wallet, owner: ownerId }, { $inc: { balance: revertChange } });
        }

        await Payment.findOneAndDelete({ _id: id, owner: ownerId });

        // Notification
        await notificationService.createNotification({
            title: 'Payment Deleted',
            message: `Deleted payment of ${payment.amount}`,
            type: 'warning',
            link: '/admin/finance',
            owner: ownerId
        });

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:payments');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:people');
        }
        return payment;
    }
};

module.exports = financeHelpers;
