const express = require('express');
const router = express.Router();
const Person = require('../models/Person');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Wallet = require('../models/Wallet');
const Category = require('../models/Category');
const Income = require('../models/Income');
const Transfer = require('../models/Transfer');
const redisClient = require('../config/redis');
const financeHelpers = require('../utils/financeHelpers');
const { requireAuth } = require('../middleware/authMiddleware');

// Middleware to check auth
router.use(requireAuth);

// Middleware to check DB connection for all finance routes
router.use((req, res, next) => {
    if (req.method === 'GET' && require('mongoose').connection.readyState !== 1) {
        // Allow if it's a sync request or if we have cache (handled in individual routes)
        // But for general navigation if cache is missing and DB is down:
        // Individual routes check cache first. If cache misses and DB is down, they should handle it.
        // However, adding a global check here might be too aggressive if we want to allow cache hits.
        // Let's NOT add a global blocker here, but ensure individual routes handle "Cache Miss + DB Down" gracefully.
        // Actually, the user wants it "everywhere".
        // If I block here, cache logic in routes won't run.
        // So I should insert this check AFTER cache check failure in routes, OR allow routes to run and handle it.
        // Better strategy: Update routes to check DB status if cache misses.
    }
    next();
});

// --- Sync Route ---
router.post('/sync', async (req, res) => {
    try {
        const { changes } = req.body;
        if (!changes || !Array.isArray(changes)) {
            return res.status(400).json({ success: false, message: 'Invalid changes format' });
        }

        for (const change of changes) {
            const { url, method, body } = change;
            const cleanUrl = url.split('?')[0]; // Remove query params if any
            const id = cleanUrl.split('/').pop();

            if (cleanUrl.includes('/expenses/add')) await financeHelpers.createExpense(body);
            else if (cleanUrl.includes('/expenses/edit/')) await financeHelpers.updateExpense(id, body);
            else if (cleanUrl.includes('/expenses/delete/')) await financeHelpers.deleteExpense(id);

            else if (cleanUrl.includes('/income/add')) await financeHelpers.createIncome(body);
            else if (cleanUrl.includes('/income/edit/')) await financeHelpers.updateIncome(id, body);
            else if (cleanUrl.includes('/income/delete/')) await financeHelpers.deleteIncome(id);

            else if (cleanUrl.includes('/wallets/add')) await financeHelpers.createWallet(body);
            else if (cleanUrl.includes('/wallets/edit/')) await financeHelpers.updateWallet(id, body);
            else if (cleanUrl.includes('/wallets/delete/')) await financeHelpers.deleteWallet(id);
            else if (cleanUrl.includes('/wallets/transfer')) await financeHelpers.transferFunds(body);

            else if (cleanUrl.includes('/people/add')) await financeHelpers.createPerson(body);
            else if (cleanUrl.includes('/people/edit/')) await financeHelpers.updatePerson(id, body);

            else if (cleanUrl.includes('/categories/add')) await financeHelpers.createCategory(body);
            else if (cleanUrl.includes('/categories/edit/')) await financeHelpers.updateCategory(id, body);
            else if (cleanUrl.includes('/categories/delete/')) await financeHelpers.deleteCategory(id);

            else if (cleanUrl.includes('/payments/add')) await financeHelpers.createPayment(body);
            else if (cleanUrl.includes('/payments/edit/')) await financeHelpers.updatePayment(id, body);
            else if (cleanUrl.includes('/payments/delete/')) await financeHelpers.deletePayment(id);
        }

        res.json({ success: true });

        // Invalidate Caches
        if (redisClient.isReady) {
            await redisClient.del('finance:expenses');
            await redisClient.del('finance:income');
            await redisClient.del('finance:wallets');
            await redisClient.del('finance:people');
            await redisClient.del('finance:categories');
        }
    } catch (err) {
        console.error('Sync Error:', err);
        res.status(500).json({ success: false, message: 'Sync failed' });
    }
});

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

const getChartData = async () => {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Monthly Expense Trend
    const expenseTrend = await Expense.aggregate([
        { $match: { date: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" }
                },
                total: { $sum: "$amount" }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Monthly Income Trend
    const incomeTrend = await Income.aggregate([
        { $match: { date: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" }
                },
                total: { $sum: "$amount" }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Category Spending (All time for now, or last 30 days)
    const categorySpending = await Expense.aggregate([
        {
            $group: {
                _id: "$category",
                total: { $sum: "$amount" }
            }
        },
        { $sort: { total: -1 } },
        { $limit: 5 }
    ]);

    return { expenseTrend, incomeTrend, categorySpending };
};

const getFinancialHealthScore = (summary) => {
    // Simple heuristic score 0-100
    let score = 50; // Base score

    // 1. Savings Rate (Income vs Expense)
    if (summary.totalIncome > 0) {
        const savingsRate = (summary.totalIncome - summary.totalExpenses) / summary.totalIncome;
        if (savingsRate > 0.5) score += 30;
        else if (savingsRate > 0.2) score += 20;
        else if (savingsRate > 0) score += 10;
        else score -= 10; // Spending more than income
    }

    // 2. Net Worth Positive
    if (summary.totalWalletBalance > 0) score += 10;
    if (summary.totalWalletBalance > 50000) score += 10;

    // 3. Pending Debts
    if (summary.pendingToSend === 0) score += 10; // No debts
    else score -= 5;

    // Cap score
    return Math.min(Math.max(score, 0), 100);
};

const getPeopleSummary = async () => {
    const people = await Person.aggregate([
        {
            $group: {
                _id: "$type",
                count: { $sum: 1 }
            }
        }
    ]);

    const totalPeople = people.reduce((acc, curr) => acc + curr.count, 0);
    return { breakdown: people, total: totalPeople };
};

const getUpcomingPayments = async () => {
    const today = new Date();
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    return await Expense.find({
        nextDueDate: { $gte: today, $lte: thirtyDaysLater },
        status: { $ne: 'Paid' }
    }).sort({ nextDueDate: 1 }).limit(5);
};

// --- Dashboard ---
router.get('/', async (req, res) => {
    try {
        const summary = await getFinancialSummary();
        const wallets = await Wallet.find().sort({ name: 1 });
        const chartData = await getChartData();
        const healthScore = getFinancialHealthScore(summary);
        const peopleSummary = await getPeopleSummary();
        const upcomingPayments = await getUpcomingPayments();

        // Filter Logic
        let filter = req.query.filter || 'all';
        let search = req.query.search || '';

        let recentActivity = [];

        // Fetch recent activity based on filter
        // Note: For a real app with pagination, we'd do this in DB. 
        // Here we fetch a bit more and filter in memory for simplicity or do separate queries.
        // Given the requirements, let's fetch recent 20 of each and combine, then filter.

        const limit = 20;
        let expenses = [], income = [], payments = [];

        if (filter === 'all' || filter === 'expense') {
            let query = {};
            if (search) query.title = { $regex: search, $options: 'i' };
            expenses = await Expense.find(query).sort({ date: -1 }).limit(limit).lean();
        }

        if (filter === 'all' || filter === 'income') {
            let query = {};
            if (search) query.source = { $regex: search, $options: 'i' };
            income = await Income.find(query).sort({ date: -1 }).limit(limit).lean();
        }

        if (filter === 'all' || filter === 'transfers' || filter === 'people') {
            // For payments, search might be on person name, so we need populate first or aggregate
            // Simple approach: fetch then filter if search exists
            let pQuery = Payment.find().populate('person').sort({ date: -1 }).limit(limit).lean();
            let pResults = await pQuery;

            if (search) {
                pResults = pResults.filter(p =>
                    (p.person && p.person.name.toLowerCase().includes(search.toLowerCase())) ||
                    (p.amount.toString().includes(search))
                );
            }
            payments = pResults;
        }

        // Combine
        recentActivity = [
            ...expenses.map(e => ({ ...e, type: 'expense', sortDate: e.date })),
            ...income.map(i => ({ ...i, type: 'income', sortDate: i.date })),
            ...payments.map(p => ({ ...p, type: 'payment', sortDate: p.date }))
        ];

        // Sort by date desc
        recentActivity.sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

        // Slice to show top 10-20
        recentActivity = recentActivity.slice(0, 20);

        res.render('admin/finance/dashboard', {
            title: 'Finance Dashboard',
            summary,
            wallets,
            recentActivity,
            chartData,
            healthScore,
            peopleSummary,
            upcomingPayments,
            filter,
            search,
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
        // Check Cache
        if (redisClient.isReady) {
            const cachedPeople = await redisClient.get('finance:people');
            if (cachedPeople) {
                console.log('Cache Hit: People');
                return res.render('admin/finance/people/list', {
                    title: 'People',
                    people: JSON.parse(cachedPeople),
                    layout: 'layouts/adminLayout'
                });
            }
        }

        console.log('Cache Miss: People');

        if (require('mongoose').connection.readyState !== 1) {
            return res.render('offline', { layout: false });
        }

        // Optimized: Use aggregation to calculate balances in one query
        const peopleWithBalances = await Person.aggregate([
            {
                $lookup: {
                    from: 'payments',
                    localField: '_id',
                    foreignField: 'person',
                    as: 'payments'
                }
            },
            {
                $addFields: {
                    totalGiven: {
                        $sum: {
                            $map: {
                                input: { $filter: { input: '$payments', cond: { $eq: ['$$this.type', 'send'] } } },
                                in: '$$this.amount'
                            }
                        }
                    },
                    totalReceived: {
                        $sum: {
                            $map: {
                                input: { $filter: { input: '$payments', cond: { $eq: ['$$this.type', 'receive'] } } },
                                in: '$$this.amount'
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    balance: { $subtract: ['$totalReceived', '$totalGiven'] }
                }
            },
            { $sort: { name: 1 } },
            { $project: { payments: 0 } } // Remove payments array from output
        ]);

        // Set Cache (1 hour)
        if (redisClient.isReady) {
            try {
                await redisClient.set('finance:people', JSON.stringify(peopleWithBalances), { EX: 3600 });
            } catch (err) {
                console.log('Redis cache error:', err.message);
            }
        }

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
        await financeHelpers.createPerson(req.body);
        res.redirect('/admin/finance/people');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/people/edit/:id', async (req, res) => {
    try {
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        const person = await Person.findById(req.params.id);
        res.render('admin/finance/people/form', { title: 'Edit Person', person, layout: 'layouts/adminLayout' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/people/edit/:id', async (req, res) => {
    try {
        await financeHelpers.updatePerson(req.params.id, req.body);
        res.redirect('/admin/finance/people');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});



router.get('/people/:id', async (req, res) => {
    try {
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        const person = await Person.findById(req.params.id);
        if (!person) return res.redirect('/admin/finance/people');

        // Fetch all related payments
        const payments = await Payment.find({ person: person._id }).populate('wallet').sort({ date: -1 }).lean();

        // Calculate totals
        let totalGiven = 0;
        let totalReceived = 0;

        payments.forEach(p => {
            if (p.type === 'send') totalGiven += p.amount;
            else totalReceived += p.amount;
        });

        const balance = totalReceived - totalGiven; // Positive means they owe us? No.
        // If I gave 100 (send), balance is -100 (I am owed 100). 
        // If I received 100 (receive), balance is +100 (I owe 100).
        // Let's stick to:
        // Net Balance > 0: I owe them (Payable)
        // Net Balance < 0: They owe me (Receivable)

        res.render('admin/finance/people/view', {
            title: person.name,
            person,
            payments,
            stats: { totalGiven, totalReceived, balance },
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Expense Management ---
router.get('/expenses', async (req, res) => {
    try {
        // Check Cache
        if (redisClient.isReady) {
            const cachedExpenses = await redisClient.get('finance:expenses');
            if (cachedExpenses) {
                console.log('Cache Hit: Expenses');
                return res.render('admin/finance/expenses/list', {
                    title: 'Expenses',
                    expenses: JSON.parse(cachedExpenses),
                    layout: 'layouts/adminLayout'
                });
            }
        }



        console.log('Cache Miss: Expenses');

        if (require('mongoose').connection.readyState !== 1) {
            return res.render('offline', { layout: false });
        }

        const expenses = await Expense.find().populate('wallet').populate('categoryId').sort({ date: -1 });

        // Set Cache (1 hour)
        if (redisClient.isReady) {
            try {
                await redisClient.set('finance:expenses', JSON.stringify(expenses), { EX: 3600 });
            } catch (err) {
                console.log('Redis cache error:', err.message);
            }
        }

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
        await financeHelpers.createExpense(req.body);
        if (redisClient.isReady) await redisClient.del('finance:expenses');
        res.redirect('/admin/finance/expenses');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/expenses/edit/:id', async (req, res) => {
    try {
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
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
        await financeHelpers.updateExpense(req.params.id, req.body);
        if (redisClient.isReady) await redisClient.del('finance:expenses');
        res.redirect('/admin/finance/expenses');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/expenses/delete/:id', async (req, res) => {
    try {
        await financeHelpers.deleteExpense(req.params.id);
        if (redisClient.isReady) await redisClient.del('finance:expenses');
        res.redirect('/admin/finance/expenses');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Income Management ---
router.get('/income', async (req, res) => {
    try {
        // Check Cache
        if (redisClient.isReady) {
            const cachedIncome = await redisClient.get('finance:income');
            if (cachedIncome) {
                console.log('Cache Hit: Income');
                return res.render('admin/finance/income/list', {
                    title: 'Income',
                    income: JSON.parse(cachedIncome),
                    layout: 'layouts/adminLayout'
                });
            }
        }



        console.log('Cache Miss: Income');

        if (require('mongoose').connection.readyState !== 1) {
            return res.render('offline', { layout: false });
        }

        const income = await Income.find().populate('wallet').populate('source').sort({ date: -1 });

        // Set Cache (1 hour)
        if (redisClient.isReady) {
            try {
                await redisClient.set('finance:income', JSON.stringify(income), { EX: 3600 });
            } catch (err) {
                console.log('Redis cache error:', err.message);
            }
        }

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
        await financeHelpers.createIncome(req.body);
        if (redisClient.isReady) await redisClient.del('finance:income');
        res.redirect('/admin/finance/income');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/income/edit/:id', async (req, res) => {
    try {
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
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
        await financeHelpers.updateIncome(req.params.id, req.body);
        if (redisClient.isReady) await redisClient.del('finance:income');
        res.redirect('/admin/finance/income');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/income/delete/:id', async (req, res) => {
    try {
        await financeHelpers.deleteIncome(req.params.id);
        if (redisClient.isReady) await redisClient.del('finance:income');
        res.redirect('/admin/finance/income');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
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

        // Yearly Expenses
        const yearlyExpenses = await Expense.aggregate([
            {
                $group: {
                    _id: { $year: "$date" },
                    total: { $sum: "$amount" }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        // Wallet-wise Expenses
        const walletExpenses = await Expense.aggregate([
            {
                $group: {
                    _id: "$wallet",
                    total: { $sum: "$amount" }
                }
            }
        ]);
        await Wallet.populate(walletExpenses, { path: "_id", select: "name" });

        res.render('admin/finance/reports/index', {
            title: 'Financial Reports',
            monthlyExpenses,
            categoryExpenses,
            yearlyExpenses,
            walletExpenses,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/reports/export', async (req, res) => {
    try {
        const expenses = await Expense.find().sort({ date: -1 }).lean();
        const income = await Income.find().sort({ date: -1 }).lean();

        let csv = 'Type,Date,Amount,Category/Source,Description\n';

        expenses.forEach(e => {
            csv += `Expense,${e.date.toISOString().split('T')[0]},${e.amount},${e.category || ''},${e.title}\n`;
        });

        income.forEach(i => {
            csv += `Income,${i.date.toISOString().split('T')[0]},${i.amount},${i.source || ''},${i.description || ''}\n`;
        });

        res.header('Content-Type', 'text/csv');
        res.attachment('finance_report.csv');
        return res.send(csv);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Wallet Management ---
router.get('/wallets', async (req, res) => {
    try {
        // Check Cache
        if (redisClient.isReady) {
            const cachedWallets = await redisClient.get('finance:wallets');
            if (cachedWallets) {
                console.log('Cache Hit: Wallets');
                return res.render('admin/finance/wallets/list', {
                    title: 'Wallets & Accounts',
                    wallets: JSON.parse(cachedWallets),
                    layout: 'layouts/adminLayout'
                });
            }
        }



        console.log('Cache Miss: Wallets');
        if (require('mongoose').connection.readyState !== 1) {
            return res.render('offline', { layout: false });
        }
        const wallets = await Wallet.find().sort({ name: 1 });

        // Set Cache (1 hour)
        if (redisClient.isReady) {
            try {
                await redisClient.set('finance:wallets', JSON.stringify(wallets), { EX: 3600 });
            } catch (err) {
                console.log('Redis cache error:', err.message);
            }
        }

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
        await financeHelpers.createWallet(req.body);
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Wallet created successfully!'));
    } catch (err) {
        console.error('Error creating wallet:', err);
        res.redirect('/admin/finance/wallets/add?error=' + encodeURIComponent('Failed to create wallet. Please check all fields.'));
    }
});

router.get('/wallets/edit/:id', async (req, res) => {
    try {
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
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
        await financeHelpers.updateWallet(req.params.id, req.body);
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Wallet updated successfully!'));
    } catch (err) {
        console.error('Error updating wallet:', err);
        res.redirect('/admin/finance/wallets/edit/' + req.params.id + '?error=' + encodeURIComponent('Failed to update wallet.'));
    }
});

router.get('/wallets/delete/:id', async (req, res) => {
    try {
        await financeHelpers.deleteWallet(req.params.id);
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Wallet deleted successfully!'));
    } catch (err) {
        console.error('Error deleting wallet:', err);
        res.redirect('/admin/finance/wallets?error=' + encodeURIComponent('Failed to delete wallet.'));
    }
});

router.get('/wallets/transfer', async (req, res) => {
    try {
        const wallets = await Wallet.find().sort({ name: 1 });
        res.render('admin/finance/wallets/transfer', {
            title: 'Transfer Funds',
            wallets,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/wallets/transfer', async (req, res) => {
    try {
        const { fromWallet, toWallet, amount } = req.body;

        if (fromWallet === toWallet) {
            return res.redirect('/admin/finance/wallets/transfer?error=' + encodeURIComponent('Cannot transfer to the same wallet.'));
        }

        const transferAmount = parseFloat(amount);
        if (isNaN(transferAmount) || transferAmount <= 0) {
            return res.redirect('/admin/finance/wallets/transfer?error=' + encodeURIComponent('Invalid amount.'));
        }

        await financeHelpers.transferFunds(req.body);
        res.redirect('/admin/finance/wallets?success=' + encodeURIComponent('Transfer successful!'));
    } catch (err) {
        console.error('Error processing transfer:', err);
        res.redirect('/admin/finance/wallets/transfer?error=' + encodeURIComponent('Failed to process transfer.'));
    }
});

router.get('/wallets/:id', async (req, res) => {
    try {
        const wallet = await Wallet.findById(req.params.id);
        if (!wallet) return res.redirect('/admin/finance/wallets');

        // Fetch all related transactions
        const expenses = await Expense.find({ wallet: wallet._id }).sort({ date: -1 }).lean();
        const income = await Income.find({ wallet: wallet._id }).sort({ date: -1 }).lean();
        const sentPayments = await Payment.find({ wallet: wallet._id, type: 'send', status: 'Completed' }).populate('person').sort({ date: -1 }).lean();
        const receivedPayments = await Payment.find({ wallet: wallet._id, type: 'receive', status: 'Completed' }).populate('person').sort({ date: -1 }).lean();
        const sentTransfers = await Transfer.find({ fromWallet: wallet._id }).populate('toWallet').sort({ date: -1 }).lean();
        const receivedTransfers = await Transfer.find({ toWallet: wallet._id }).populate('fromWallet').sort({ date: -1 }).lean();

        // Combine into a single timeline
        const history = [
            ...expenses.map(e => ({ ...e, type: 'expense', amount: -e.amount })),
            ...income.map(i => ({ ...i, type: 'income', amount: i.amount })),
            ...sentPayments.map(p => ({ ...p, type: 'payment_sent', amount: -p.amount, description: `Paid to ${p.person ? p.person.name : 'Unknown'}` })),
            ...receivedPayments.map(p => ({ ...p, type: 'payment_received', amount: p.amount, description: `Received from ${p.person ? p.person.name : 'Unknown'}` })),
            ...sentTransfers.map(t => ({ ...t, type: 'transfer_sent', amount: -t.amount, description: `Transfer to ${t.toWallet ? t.toWallet.name : 'Unknown'}` })),
            ...receivedTransfers.map(t => ({ ...t, type: 'transfer_received', amount: t.amount, description: `Transfer from ${t.fromWallet ? t.fromWallet.name : 'Unknown'}` }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate chart data (Balance over time)
        // Start with current balance and work backwards
        let currentBalance = wallet.balance;
        const chartLabels = [];
        const chartData = [];

        // Take last 30 transactions or 30 days
        const chartHistory = [...history].reverse(); // Oldest first

        // Simplified chart: just show running balance after each transaction in the last 30 items
        // Ideally we'd do daily balances, but transaction-based is easier for now

        // Reconstruct balance history
        // This is tricky without a starting balance snapshot. 
        // Alternative: Just show income/expense bars for this wallet?
        // Let's try to reconstruct: Current Balance is known. 
        // Previous Balance = Current - (Last Transaction Amount)

        let runningBalance = wallet.balance;
        const balanceHistory = [];

        // We need to process from newest to oldest to calculate backwards
        history.forEach(txn => {
            balanceHistory.push({ date: txn.date, balance: runningBalance });
            runningBalance -= txn.amount; // Reverse the transaction
        });

        // Now we have history from newest to oldest. Reverse it for the chart.
        const chartPoints = balanceHistory.reverse().slice(-20); // Last 20 points

        res.render('admin/finance/wallets/view', {
            title: wallet.name,
            wallet,
            history,
            chartPoints,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Category Management ---
router.get('/categories', async (req, res) => {
    try {
        // Check Cache
        if (redisClient.isReady) {
            const cachedCategories = await redisClient.get('finance:categories');
            if (cachedCategories) {
                console.log('Cache Hit: Categories');
                return res.render('admin/finance/categories/list', {
                    title: 'Categories',
                    categories: JSON.parse(cachedCategories),
                    layout: 'layouts/adminLayout'
                });
            }
        }

        console.log('Cache Miss: Categories');
        const categories = await Category.find().sort({ type: 1, name: 1 });

        // Set Cache (1 hour)
        if (redisClient.isReady) {
            try {
                await redisClient.set('finance:categories', JSON.stringify(categories), { EX: 3600 });
            } catch (err) {
                console.log('Redis cache error:', err.message);
            }
        }

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
        await financeHelpers.createCategory(req.body);
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
        await financeHelpers.updateCategory(req.params.id, req.body);
        res.redirect('/admin/finance/categories');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/categories/delete/:id', async (req, res) => {
    try {
        await financeHelpers.deleteCategory(req.params.id);
        res.redirect('/admin/finance/categories');
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
            title: 'Add Payment',
            payment: {},
            people,
            wallets,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/payments/add', async (req, res) => {
    try {
        await financeHelpers.createPayment(req.body);
        res.redirect('/admin/finance/payments');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/payments/edit/:id', async (req, res) => {
    try {
        const payment = await Payment.findById(req.params.id);
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
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/payments/edit/:id', async (req, res) => {
    try {
        await financeHelpers.updatePayment(req.params.id, req.body);
        res.redirect('/admin/finance/payments');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/payments/delete/:id', async (req, res) => {
    try {
        await financeHelpers.deletePayment(req.params.id);
        res.redirect('/admin/finance/payments');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
