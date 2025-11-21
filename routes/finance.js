const express = require('express');
const router = express.Router();
const Person = require('../models/Person');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const Income = require('../models/Income');
const { requireAuth } = require('../middleware/authMiddleware');

// Middleware to check auth
router.use(requireAuth);

// --- Helper Functions ---
const getFinancialSummary = async () => {
    // 1. Total Expenses
    const expenses = await Expense.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalExpenses = expenses.length > 0 ? expenses[0].total : 0;

    // 2. Total Income
    const income = await Income.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalIncome = income.length > 0 ? income[0].total : 0;

    // 3. Payments (Sent/Received)
    const payments = await Payment.aggregate([
        {
            $group: {
                _id: { type: "$type", status: "$status" },
                total: { $sum: "$amount" }
            }
        }
    ]);

    let totalSent = 0;
    let totalReceived = 0;
    let pendingToReceive = 0;
    let pendingToSend = 0;

    payments.forEach(p => {
        if (p._id.type === 'send') {
            if (p._id.status === 'Completed') totalSent += p.total;
            else pendingToSend += p.total;
        } else if (p._id.type === 'receive') {
            if (p._id.status === 'Completed') totalReceived += p.total;
            else pendingToReceive += p.total;
        }
    });

    // 4. Total Wallet Balance (Net Worth)
    const wallets = await Wallet.aggregate([
        { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);
    const totalWalletBalance = wallets.length > 0 ? wallets[0].total : 0;

    // Net Balance (Calculated from cash flow) - Optional, but Wallet Balance is more accurate for "Net Worth"
    // const netBalance = totalReceived - (totalSent + totalExpenses); 

    return {
        totalExpenses,
        totalIncome,
        totalSent,
        totalReceived,
        pendingToSend,
        pendingToReceive,
        totalWalletBalance
    };
};

// --- Dashboard ---
router.get('/', async (req, res) => {
    try {
        const summary = await getFinancialSummary();
        const wallets = await Wallet.find().sort({ name: 1 });

        // Fetch recent activity (Expenses + Income + Payments)
        const recentExpenses = await Expense.find().sort({ date: -1 }).limit(5).lean();
        const recentIncome = await Income.find().sort({ date: -1 }).limit(5).lean();
        const recentPayments = await Payment.find().populate('person').sort({ date: -1 }).limit(5).lean();

        // Combine and sort by date
        const recentActivity = [
            ...recentExpenses.map(e => ({ ...e, type: 'expense', sortDate: e.date })),
            ...recentIncome.map(i => ({ ...i, type: 'income', sortDate: i.date })),
            ...recentPayments.map(p => ({ ...p, type: 'payment', sortDate: p.date }))
        ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate)).slice(0, 10);

        res.render('admin/finance/dashboard', {
            title: 'Finance Dashboard',
            summary,
            wallets,
            recentActivity,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- People Management ---
router.get('/people', async (req, res) => {
    try {
        const people = await Person.find().sort({ name: 1 });
        // Calculate balances for each person
        const peopleWithBalances = await Promise.all(people.map(async (p) => {
            const payments = await Payment.find({ person: p._id });
            let given = 0;
            let received = 0;
            payments.forEach(pay => {
                if (pay.type === 'send') given += pay.amount;
                else received += pay.amount;
            });
            return {
                ...p.toObject(),
                totalGiven: given,
                totalReceived: received,
                balance: received - given
            };
        }));

        res.render('admin/finance/people/list', {
            title: 'People',
            people: peopleWithBalances,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/people/add', (req, res) => {
    res.render('admin/finance/people/form', { title: 'Add Person', person: {}, layout: 'layouts/adminLayout' });
});

router.post('/people/add', async (req, res) => {
    try {
        await Person.create(req.body);
        res.redirect('/admin/finance/people');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/people/edit/:id', async (req, res) => {
    try {
        const person = await Person.findById(req.params.id);
        res.render('admin/finance/people/form', { title: 'Edit Person', person, layout: 'layouts/adminLayout' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/people/edit/:id', async (req, res) => {
    try {
        await Person.findByIdAndUpdate(req.params.id, req.body);
        res.redirect('/admin/finance/people');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/people/delete/:id', async (req, res) => {
    try {
        await Person.findByIdAndDelete(req.params.id);
        res.redirect('/admin/finance/people');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Expense Management ---
router.get('/expenses', async (req, res) => {
    try {
        const expenses = await Expense.find().populate('wallet').populate('categoryId').sort({ date: -1 });
        res.render('admin/finance/expenses/list', {
            title: 'Expenses',
            expenses,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/expenses/add', async (req, res) => {
    try {
        const wallets = await Wallet.find().sort({ name: 1 });
        const categories = await Category.find({ type: 'expense' }).sort({ name: 1 });
        res.render('admin/finance/expenses/form', {
            title: 'Add Expense',
            expense: {},
            wallets,
            categories,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/expenses/add', async (req, res) => {
    try {
        const expense = await Expense.create(req.body);

        // Deduct from Wallet if status is Paid or Partial
        if (req.body.wallet && (req.body.status === 'Paid' || req.body.status === 'Partial')) {
            const amountToDeduct = req.body.status === 'Partial' ? (req.body.paidAmount || 0) : req.body.amount;
            await Wallet.findByIdAndUpdate(req.body.wallet, { $inc: { balance: -amountToDeduct } });
        }

        res.redirect('/admin/finance/expenses');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/expenses/edit/:id', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);
        const wallets = await Wallet.find().sort({ name: 1 });
        const categories = await Category.find({ type: 'expense' }).sort({ name: 1 });
        res.render('admin/finance/expenses/form', {
            title: 'Edit Expense',
            expense,
            wallets,
            categories,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/expenses/edit/:id', async (req, res) => {
    try {
        const oldExpense = await Expense.findById(req.params.id);

        // Revert old wallet balance
        if (oldExpense.wallet && (oldExpense.status === 'Paid' || oldExpense.status === 'Partial')) {
            const oldAmount = oldExpense.status === 'Partial' ? (oldExpense.paidAmount || 0) : oldExpense.amount;
            await Wallet.findByIdAndUpdate(oldExpense.wallet, { $inc: { balance: oldAmount } });
        }

        const updatedExpense = await Expense.findByIdAndUpdate(req.params.id, req.body, { new: true });

        // Apply new wallet balance
        if (updatedExpense.wallet && (updatedExpense.status === 'Paid' || updatedExpense.status === 'Partial')) {
            const newAmount = updatedExpense.status === 'Partial' ? (updatedExpense.paidAmount || 0) : updatedExpense.amount;
            await Wallet.findByIdAndUpdate(updatedExpense.wallet, { $inc: { balance: -newAmount } });
        }

        res.redirect('/admin/finance/expenses');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/expenses/delete/:id', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id);

        // Refund to Wallet
        if (expense.wallet && (expense.status === 'Paid' || expense.status === 'Partial')) {
            const amountToRefund = expense.status === 'Partial' ? (expense.paidAmount || 0) : expense.amount;
            await Wallet.findByIdAndUpdate(expense.wallet, { $inc: { balance: amountToRefund } });
        }

        await Expense.findByIdAndDelete(req.params.id);
        res.redirect('/admin/finance/expenses');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Income Management ---
router.get('/income', async (req, res) => {
    try {
        const income = await Income.find().populate('wallet').populate('category').sort({ date: -1 });
        res.render('admin/finance/income/list', {
            title: 'Income',
            income,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/income/add', async (req, res) => {
    try {
        const wallets = await Wallet.find().sort({ name: 1 });
        const categories = await Category.find({ type: 'income' }).sort({ name: 1 });
        res.render('admin/finance/income/form', {
            title: 'Add Income',
            income: {},
            wallets,
            categories,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/income/add', async (req, res) => {
    try {
        const income = await Income.create(req.body);

        // Add to Wallet
        if (req.body.wallet) {
            await Wallet.findByIdAndUpdate(req.body.wallet, { $inc: { balance: req.body.amount } });
        }

        res.redirect('/admin/finance/income');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/income/edit/:id', async (req, res) => {
    try {
        const income = await Income.findById(req.params.id);
        const wallets = await Wallet.find().sort({ name: 1 });
        const categories = await Category.find({ type: 'income' }).sort({ name: 1 });
        res.render('admin/finance/income/form', {
            title: 'Edit Income',
            income,
            wallets,
            categories,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/income/edit/:id', async (req, res) => {
    try {
        const oldIncome = await Income.findById(req.params.id);

        // Revert old wallet balance
        if (oldIncome.wallet) {
            await Wallet.findByIdAndUpdate(oldIncome.wallet, { $inc: { balance: -oldIncome.amount } });
        }

        const updatedIncome = await Income.findByIdAndUpdate(req.params.id, req.body, { new: true });

        // Apply new wallet balance
        if (updatedIncome.wallet) {
            await Wallet.findByIdAndUpdate(updatedIncome.wallet, { $inc: { balance: updatedIncome.amount } });
        }

        res.redirect('/admin/finance/income');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/income/delete/:id', async (req, res) => {
    try {
        const income = await Income.findById(req.params.id);

        // Deduct from Wallet
        if (income.wallet) {
            await Wallet.findByIdAndUpdate(income.wallet, { $inc: { balance: -income.amount } });
        }

        await Income.findByIdAndDelete(req.params.id);
        res.redirect('/admin/finance/income');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Payment Management ---
router.get('/payments', async (req, res) => {
    try {
        const payments = await Payment.find().populate('person').populate('wallet').sort({ date: -1 });
        res.render('admin/finance/payments/list', {
            title: 'Payments',
            payments,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/payments/add', async (req, res) => {
    try {
        const people = await Person.find().sort({ name: 1 });
        const wallets = await Wallet.find().sort({ name: 1 });
        res.render('admin/finance/payments/form', {
            title: 'Record Payment',
            people,
            wallets,
            payment: {},
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/payments/add', async (req, res) => {
    try {
        // Sanitize empty strings to null for ObjectId fields
        const paymentData = {
            ...req.body,
            wallet: req.body.wallet && req.body.wallet.trim() !== '' ? req.body.wallet : null,
            person: req.body.person && req.body.person.trim() !== '' ? req.body.person : null
        };

        const payment = await Payment.create(paymentData);

        // Update Wallet Balance if status is Completed
        if (paymentData.wallet && paymentData.status === 'Completed') {
            const amount = parseFloat(paymentData.amount) || 0;
            if (paymentData.type === 'send') {
                await Wallet.findByIdAndUpdate(paymentData.wallet, { $inc: { balance: -amount } });
            } else if (paymentData.type === 'receive') {
                await Wallet.findByIdAndUpdate(paymentData.wallet, { $inc: { balance: amount } });
            }
        }

        res.redirect('/admin/finance/payments?success=' + encodeURIComponent('Payment recorded successfully!'));
    } catch (err) {
        console.error('Error creating payment:', err);
        res.redirect('/admin/finance/payments/add?error=' + encodeURIComponent('Failed to create payment. Please check all fields.'));
    }
});

router.get('/payments/edit/:id', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.redirect('/admin/finance/payments?error=' + encodeURIComponent('Payment not found.'));
        }
        const people = await Person.find().sort({ name: 1 });
        const wallets = await Wallet.find().sort({ name: 1 });
        res.render('admin/finance/payments/form', {
            title: 'Edit Payment',
            payment,
            people,
            wallets,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error('Error loading payment:', err);
        res.redirect('/admin/finance/payments?error=' + encodeURIComponent('Failed to load payment.'));
    }
});

router.post('/payments/edit/:id', async (req, res) => {
    try {
        const oldPayment = await Payment.findById(req.params.id);
        if (!oldPayment) {
            return res.redirect('/admin/finance/payments?error=' + encodeURIComponent('Payment not found.'));
        }

        // Revert old wallet balance
        if (oldPayment.wallet && oldPayment.status === 'Completed') {
            const oldAmount = parseFloat(oldPayment.amount) || 0;
            if (oldPayment.type === 'send') {
                await Wallet.findByIdAndUpdate(oldPayment.wallet, { $inc: { balance: oldAmount } });
            } else if (oldPayment.type === 'receive') {
                await Wallet.findByIdAndUpdate(oldPayment.wallet, { $inc: { balance: -oldAmount } });
            }
        }

        // Sanitize empty strings to null for ObjectId fields
        const paymentData = {
            ...req.body,
            wallet: req.body.wallet && req.body.wallet.trim() !== '' ? req.body.wallet : null,
            person: req.body.person && req.body.person.trim() !== '' ? req.body.person : null
        };

        const updatedPayment = await Payment.findByIdAndUpdate(req.params.id, paymentData, { new: true });

        // Apply new wallet balance
        if (updatedPayment.wallet && updatedPayment.status === 'Completed') {
            const newAmount = parseFloat(updatedPayment.amount) || 0;
            if (updatedPayment.type === 'send') {
                await Wallet.findByIdAndUpdate(updatedPayment.wallet, { $inc: { balance: -newAmount } });
            } else if (updatedPayment.type === 'receive') {
                await Wallet.findByIdAndUpdate(updatedPayment.wallet, { $inc: { balance: newAmount } });
            }
        }

        res.redirect('/admin/finance/payments?success=' + encodeURIComponent('Payment updated successfully!'));
    } catch (err) {
        console.error('Error updating payment:', err);
        res.redirect('/admin/finance/payments/edit/' + req.params.id + '?error=' + encodeURIComponent('Failed to update payment.'));
    }
});

router.get('/payments/delete/:id', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
        if (!payment) {
            return res.redirect('/admin/finance/payments?error=' + encodeURIComponent('Payment not found.'));
        }

        // Refund to Wallet if payment was completed
        if (payment.wallet && payment.status === 'Completed') {
            const amount = parseFloat(payment.amount) || 0;
            if (payment.type === 'send') {
                await Wallet.findByIdAndUpdate(payment.wallet, { $inc: { balance: amount } });
            } else if (payment.type === 'receive') {
                await Wallet.findByIdAndUpdate(payment.wallet, { $inc: { balance: -amount } });
            }
        }

        await Payment.findByIdAndDelete(req.params.id);
        res.redirect('/admin/finance/payments?success=' + encodeURIComponent('Payment deleted successfully!'));
    } catch (err) {
        console.error('Error deleting payment:', err);
        res.redirect('/admin/finance/payments?error=' + encodeURIComponent('Failed to delete payment.'));
    }
});

// --- Reports ---
router.get('/reports', async (req, res) => {
    try {
        // Monthly Expenses
        const monthlyExpenses = await Expense.aggregate([
            {
                $group: {
                    _id: { $month: "$date" },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Category Breakdown
        const categoryExpenses = await Expense.aggregate([
            {
                $group: {
                    _id: "$category",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        res.render('admin/finance/reports/index', {
            title: 'Financial Reports',
            monthlyExpenses,
            categoryExpenses,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Wallet Management ---
router.get('/wallets', async (req, res) => {
    try {
        const wallets = await Wallet.find().sort({ name: 1 });
        res.render('admin/finance/wallets/list', {
            title: 'Wallets & Accounts',
            wallets,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/wallets/add', (req, res) => {
    res.render('admin/finance/wallets/form', { title: 'Add Wallet', wallet: {}, layout: 'layouts/adminLayout' });
});

router.post('/wallets/add', async (req, res) => {
    try {
        await Wallet.create(req.body);
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Wallet created successfully!'));
    } catch (err) {
        console.error('Error creating wallet:', err);
        res.redirect('/admin/finance/wallets/add?error=' + encodeURIComponent('Failed to create wallet. Please check all fields.'));
    }
});

router.get('/wallets/edit/:id', async (req, res) => {
    try {
        const wallet = await Wallet.findById(req.params.id);
        if (!wallet) {
            return res.redirect('/admin/finance/wallets?error=' + encodeURIComponent('Wallet not found.'));
        }
        res.render('admin/finance/wallets/form', { title: 'Edit Wallet', wallet, layout: 'layouts/adminLayout' });
    } catch (err) {
        console.error('Error loading wallet:', err);
        res.redirect('/admin/finance/wallets?error=' + encodeURIComponent('Failed to load wallet.'));
    }
});

router.post('/wallets/edit/:id', async (req, res) => {
    try {
        const wallet = await Wallet.findByIdAndUpdate(req.params.id, req.body);
        if (!wallet) {
            return res.redirect('/admin/finance/wallets?error=' + encodeURIComponent('Wallet not found.'));
        }
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Wallet updated successfully!'));
    } catch (err) {
        console.error('Error updating wallet:', err);
        res.redirect('/admin/finance/wallets/edit/' + req.params.id + '?error=' + encodeURIComponent('Failed to update wallet.'));
    }
});

router.get('/wallets/delete/:id', async (req, res) => {
    try {
        const wallet = await Wallet.findByIdAndDelete(req.params.id);
        if (!wallet) {
            return res.redirect('/admin/finance/wallets?error=' + encodeURIComponent('Wallet not found.'));
        }
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Wallet deleted successfully!'));
    } catch (err) {
        console.error('Error deleting wallet:', err);
        res.redirect('/admin/finance/wallets?error=' + encodeURIComponent('Failed to delete wallet.'));
    }
});

// --- Category Management ---
router.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find().sort({ type: 1, name: 1 });
        res.render('admin/finance/categories/list', {
            title: 'Categories',
            categories,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/categories/add', (req, res) => {
    res.render('admin/finance/categories/form', { title: 'Add Category', category: {}, layout: 'layouts/adminLayout' });
});

router.post('/categories/add', async (req, res) => {
    try {
        await Category.create(req.body);
        res.redirect('/admin/finance/categories');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/categories/edit/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        res.render('admin/finance/categories/form', { title: 'Edit Category', category, layout: 'layouts/adminLayout' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/categories/edit/:id', async (req, res) => {
    try {
        await Category.findByIdAndUpdate(req.params.id, req.body);
        res.redirect('/admin/finance/categories');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/categories/delete/:id', async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.redirect('/admin/finance/categories');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
