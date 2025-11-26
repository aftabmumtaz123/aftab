const Person = require('../models/Person');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const Income = require('../models/Income');
const Transfer = require('../models/Transfer');
const redisClient = require('../config/redis');

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
            await Wallet.findByIdAndUpdate(data.wallet, { $inc: { balance: -amountToDeduct } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:expenses');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:categories');
        }
        return expense;
    },

    updateExpense: async (id, data) => {
        const oldExpense = await Expense.findById(id);
        if (!oldExpense) throw new Error('Expense not found');

        // Revert old wallet balance
        if (oldExpense.wallet && (oldExpense.status === 'Paid' || oldExpense.status === 'Partial')) {
            const oldAmount = oldExpense.paidAmount || 0;
            await Wallet.findByIdAndUpdate(oldExpense.wallet, { $inc: { balance: oldAmount } });
        }

        // Auto-calculate status
        if (data.paidAmount >= data.amount) data.status = 'Paid';
        else if (data.paidAmount > 0) data.status = 'Partial';
        else data.status = 'Pending';

        const updatedExpense = await Expense.findByIdAndUpdate(id, data, { new: true });

        // Apply new wallet balance
        if (updatedExpense.wallet && (updatedExpense.status === 'Paid' || updatedExpense.status === 'Partial')) {
            const newAmount = updatedExpense.paidAmount || 0;
            await Wallet.findByIdAndUpdate(updatedExpense.wallet, { $inc: { balance: -newAmount } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:expenses');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:categories');
        }
        return updatedExpense;
    },

    deleteExpense: async (id) => {
        const expense = await Expense.findById(id);
        if (!expense) throw new Error('Expense not found');

        // Refund to Wallet
        if (expense.wallet && (expense.status === 'Paid' || expense.status === 'Partial')) {
            const amountToRefund = expense.paidAmount || 0;
            await Wallet.findByIdAndUpdate(expense.wallet, { $inc: { balance: amountToRefund } });
        }

        await Expense.findByIdAndDelete(id);

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
            await Wallet.findByIdAndUpdate(data.wallet, { $inc: { balance: data.amount } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:income');
            await redisClient.del('finance:wallets');
        }
        return income;
    },

    updateIncome: async (id, data) => {
        const oldIncome = await Income.findById(id);
        if (!oldIncome) throw new Error('Income not found');

        // Revert old wallet balance
        if (oldIncome.wallet) {
            await Wallet.findByIdAndUpdate(oldIncome.wallet, { $inc: { balance: -oldIncome.amount } });
        }

        const updatedIncome = await Income.findByIdAndUpdate(id, data, { new: true });

        // Apply new wallet balance
        if (updatedIncome.wallet) {
            await Wallet.findByIdAndUpdate(updatedIncome.wallet, { $inc: { balance: updatedIncome.amount } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:income');
            await redisClient.del('finance:wallets');
        }
        return updatedIncome;
    },

    deleteIncome: async (id) => {
        const income = await Income.findById(id);
        if (!income) throw new Error('Income not found');

        // Deduct from Wallet
        if (income.wallet) {
            await Wallet.findByIdAndUpdate(income.wallet, { $inc: { balance: -income.amount } });
        }

        await Income.findByIdAndDelete(id);

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

    updateWallet: async (id, data) => {
        const wallet = await Wallet.findByIdAndUpdate(id, data, { new: true });
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return wallet;
    },

    deleteWallet: async (id) => {
        const wallet = await Wallet.findByIdAndDelete(id);
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return wallet;
    },

    transferFunds: async (data) => {
        const { fromWallet, toWallet, amount, date, notes } = data;
        const transferAmount = parseFloat(amount);

        const transfer = await Transfer.create({
            fromWallet,
            toWallet,
            amount: transferAmount,
            date: date || Date.now(),
            notes
        });

        // Update Wallet Balances
        await Wallet.findByIdAndUpdate(fromWallet, { $inc: { balance: -transferAmount } });
        await Wallet.findByIdAndUpdate(toWallet, { $inc: { balance: transferAmount } });

        // Clear Cache
        if (redisClient?.isReady) await redisClient.del('finance:wallets');
        return transfer;
    },

    // --- People ---
    createPerson: async (data) => {
        const person = await Person.create(data);
        if (redisClient?.isReady) await redisClient.del('finance:people');
        return person;
    },

    updatePerson: async (id, data) => {
        const person = await Person.findByIdAndUpdate(id, data, { new: true });
        if (redisClient?.isReady) await redisClient.del('finance:people');
        return person;
    },

    deletePerson: async (id) => {
        const person = await Person.findByIdAndDelete(id);
        if (redisClient?.isReady) await redisClient.del('finance:people');
        return person;
    },

    // --- Categories ---
    createCategory: async (data) => {
        const category = await Category.create(data);
        if (redisClient?.isReady) await redisClient.del('finance:categories');
        return category;
    },

    updateCategory: async (id, data) => {
        const category = await Category.findByIdAndUpdate(id, data, { new: true });
        if (redisClient?.isReady) await redisClient.del('finance:categories');
        return category;
    },

    deleteCategory: async (id) => {
        const category = await Category.findByIdAndDelete(id);
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
            await Wallet.findByIdAndUpdate(data.wallet, { $inc: { balance: change } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:payments');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:people');
        }
        return payment;
    },

    updatePayment: async (id, data) => {
        const oldPayment = await Payment.findById(id);
        if (!oldPayment) throw new Error('Payment not found');

        // Revert old wallet balance
        if (oldPayment.wallet && oldPayment.status === 'Completed') {
            const revertChange = oldPayment.type === 'receive' ? -oldPayment.amount : oldPayment.amount;
            await Wallet.findByIdAndUpdate(oldPayment.wallet, { $inc: { balance: revertChange } });
        }

        const updatedPayment = await Payment.findByIdAndUpdate(id, data, { new: true });

        // Apply new wallet balance
        if (updatedPayment.wallet && updatedPayment.status === 'Completed') {
            const newChange = updatedPayment.type === 'receive' ? updatedPayment.amount : -updatedPayment.amount;
            await Wallet.findByIdAndUpdate(updatedPayment.wallet, { $inc: { balance: newChange } });
        }

        // Clear Cache
        if (redisClient?.isReady) {
            await redisClient.del('finance:payments');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:people');
        }
        return updatedPayment;
    },

    deletePayment: async (id) => {
        const payment = await Payment.findById(id);
        if (!payment) throw new Error('Payment not found');

        // Revert Wallet Balance
        if (payment.wallet && (payment.status === 'Completed' || payment.status === 'Partial')) {
            const amountToRevert = payment.paidAmount || 0;
            const revertChange = payment.type === 'receive' ? -amountToRevert : amountToRevert;
            await Wallet.findByIdAndUpdate(payment.wallet, { $inc: { balance: revertChange } });
        }

        await Payment.findByIdAndDelete(id);

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
