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
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const ejs = require('ejs');
const path = require('path');

// Middleware to check auth
router.use(requireAuth);

// Middleware to check DB connection for all finance routes
router.use((req, res, next) => {
    if (req.method === 'GET' && require('mongoose').connection.readyState !== 1) {
        // If DB is down, return 503 so Service Worker can serve from cache
        return res.status(503).render('offline', { layout: false });
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
        {
            $group: {
                _id: null,
                total: { $sum: "$amount" },
                totalPaid: { $sum: "$paidAmount" }
            }
        }
    ]);
    const totalExpenses = expenses.length > 0 ? expenses[0].total : 0;
    const totalExpensesPaid = expenses.length > 0 ? expenses[0].totalPaid : 0;
    const totalExpensesDue = totalExpenses - totalExpensesPaid;

    // 2. Total Income
    const income = await Income.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalIncome = income.length > 0 ? income[0].total : 0;

    // 3. Payments (Sent/Received)
    const payments = await Payment.aggregate([
        {
            $group: {
                _id: "$type",
                totalAmount: { $sum: "$amount" },
                totalPaid: { $sum: "$paidAmount" }
            }
        }
    ]);

    let totalSent = 0;
    let totalReceived = 0;
    let totalSentPaid = 0;
    let totalReceivedPaid = 0;

    payments.forEach(p => {
        if (p._id === 'send') {
            totalSent += p.totalAmount;
            totalSentPaid += p.totalPaid;
        } else if (p._id === 'receive') {
            totalReceived += p.totalAmount;
            totalReceivedPaid += p.totalPaid;
        }
    });

    const pendingToSend = totalSent - totalSentPaid;
    const pendingToReceive = totalReceived - totalReceivedPaid;

    // 4. Total Wallet Balance (Net Worth)
    const wallets = await Wallet.aggregate([
        { $group: { _id: null, total: { $sum: "$balance" } } }
    ]);
    const totalWalletBalance = wallets.length > 0 ? wallets[0].total : 0;

    return {
        totalExpenses,
        totalExpensesPaid,
        totalExpensesDue,
        totalIncome,
        totalSent,
        totalSentPaid,
        pendingToSend,
        totalReceived,
        totalReceivedPaid,
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
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(today.getDate() + 30);

    // 1. Expenses Due
    const expenses = await Expense.find({
        $or: [
            { endDate: { $gte: today, $lte: thirtyDaysLater } },
            { nextDueDate: { $gte: today, $lte: thirtyDaysLater } }
        ],
        status: { $ne: 'Paid' }
    }).lean();

    // 2. Payments Due (Money I owe)
    const payments = await Payment.find({
        type: 'send',
        endDate: { $gte: today, $lte: thirtyDaysLater },
        status: { $ne: 'Completed' }
    }).populate('person').lean();

    // Combine and Normalize
    const combined = [
        ...expenses.map(e => ({
            _id: e._id,
            title: e.title,
            amount: e.amount,
            paidAmount: e.paidAmount,
            nextDueDate: e.endDate || e.nextDueDate,
            type: 'expense'
        })),
        ...payments.map(p => ({
            _id: p._id,
            title: `Pay ${p.person ? p.person.name : 'Unknown'}`,
            amount: p.amount,
            paidAmount: p.paidAmount,
            nextDueDate: p.endDate,
            type: 'payment'
        }))
    ];

    // Sort by due date asc
    combined.sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));

    return combined.slice(0, 5);
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
            income = await Income.find(query).populate('category').populate('wallet').sort({ date: -1 }).limit(limit).lean();
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
            ...payments.map(p => ({ ...p, type: 'payment', paymentType: p.type, sortDate: p.date }))
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

        // Optimized: Use aggregation to calculate balances and get last transaction
        const peopleWithBalances = await Person.aggregate([
            {
                $lookup: {
                    from: 'payments',
                    localField: '_id',
                    foreignField: 'person',
                    pipeline: [{ $sort: { date: -1 } }], // Sort payments by date desc
                    as: 'payments'
                }
            },
            {
                $addFields: {
                    lastTransaction: { $arrayElemAt: ['$payments', 0] },
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
            { $project: { payments: 0 } }
        ]);

        // --- Calculate Dashboard Metrics ---
        let totalLent = 0;
        let totalBorrowed = 0;
        const totalPeople = peopleWithBalances.length;

        peopleWithBalances.forEach(p => {
            if (p.balance < 0) totalLent += Math.abs(p.balance);
            else if (p.balance > 0) totalBorrowed += p.balance;
        });

        const netPosition = totalLent - totalBorrowed;

        // Top 5 Who Owe You (Lowest negative balance -> Largest absolute debt)
        const topDebtors = peopleWithBalances
            .filter(p => p.balance < 0)
            .sort((a, b) => a.balance - b.balance) // Ascending (e.g. -500 before -100)
            .slice(0, 5)
            .map(p => ({ ...p, absBalance: Math.abs(p.balance) }));

        // Top 5 You Owe (Highest positive balance)
        const topCreditors = peopleWithBalances
            .filter(p => p.balance > 0)
            .sort((a, b) => b.balance - a.balance) // Descending
            .slice(0, 5);

        // Set Cache (1 hour)
        if (redisClient.isReady) {
            try {
                await redisClient.set('finance:people', JSON.stringify(peopleWithBalances), { EX: 3600 });
            } catch (err) {
                console.log('Redis cache error:', err.message);
            }
        }

        res.render('admin/finance/people/list', {
            title: 'People Management',
            people: peopleWithBalances,
            dashboard: {
                metrics: {
                    count: totalPeople,
                    lent: totalLent,
                    borrowed: totalBorrowed,
                    net: netPosition
                },
                topDebtors,
                topCreditors
            },
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

router.get('/people/delete/:id', async (req, res) => {
    try {
        await financeHelpers.deletePerson(req.params.id);
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

        const wallets = await Wallet.find().sort({ name: 1 }).lean();

        res.render('admin/finance/people/view', {
            title: person.name,
            person,
            payments,
            wallets,
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
            // We are skipping cache for now to ensure dashboard is always fresh or we need to cache the dashboard data too.
            // For this task, let's invalidate or just fetch fresh for the dashboard metrics.
            // Actually, let's just fetch fresh for now to be safe and simple.
        }

        if (require('mongoose').connection.readyState !== 1) {
            return res.render('offline', { layout: false });
        }

        const expenses = await Expense.find().populate('wallet').populate('categoryId').sort({ date: -1 });

        // --- Calculate Advanced Dashboard Metrics ---
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // End of last month

        const thisYearStart = new Date(now.getFullYear(), 0, 1);
        const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
        const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

        // Metrics Containers
        let todayExpense = 0;
        let yesterdayExpense = 0;

        let thisMonthExpense = 0;
        let lastMonthExpense = 0;

        let thisYearExpense = 0;
        let lastYearExpense = 0;

        let totalExpense = 0;

        // For Charts & Stats
        let highestExpense = { amount: 0, title: '' };
        let categoryMapThisMonth = {};
        let monthlyTrend = Array(12).fill(0); // Last 12 months

        expenses.forEach(e => {
            const eDate = new Date(e.date);
            const amount = e.amount;

            totalExpense += amount;

            // 1. Comparative Metrics
            if (eDate >= todayStart) todayExpense += amount;
            else if (eDate >= yesterdayStart && eDate < yesterdayEnd) yesterdayExpense += amount;

            if (eDate >= thisMonthStart) thisMonthExpense += amount;
            else if (eDate >= lastMonthStart && eDate <= lastMonthEnd) lastMonthExpense += amount;

            if (eDate >= thisYearStart) thisYearExpense += amount;
            else if (eDate >= lastYearStart && eDate <= lastYearEnd) lastYearExpense += amount;

            // 2. Quick Stats: Highest Expense
            if (amount > highestExpense.amount) {
                highestExpense = { amount, title: e.title };
            }

            // 3. Category Breakdown (This Month)
            if (eDate >= thisMonthStart) {
                const catName = e.category ? e.category : (e.categoryId ? e.categoryId.name : 'Uncategorized');
                categoryMapThisMonth[catName] = (categoryMapThisMonth[catName] || 0) + amount;
            }

            // 4. Monthly Trend (Last 12 Months)
            // Calculate index relative to current month (0 = this month, 11 = 11 months ago)
            // Actually, let's do 0 = 11 months ago, 11 = this month for the chart
            const monthsAgo = (now.getFullYear() - eDate.getFullYear()) * 12 + (now.getMonth() - eDate.getMonth());
            if (monthsAgo >= 0 && monthsAgo < 12) {
                monthlyTrend[11 - monthsAgo] += amount;
            }
        });

        // Calculate Trends (%)
        const calcTrend = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        const trends = {
            today: calcTrend(todayExpense, yesterdayExpense),
            month: calcTrend(thisMonthExpense, lastMonthExpense),
            year: calcTrend(thisYearExpense, lastYearExpense)
        };

        // Quick Stats: Avg Daily Spend (This Month)
        const daysPassed = now.getDate();
        const avgDailySpend = daysPassed > 0 ? Math.round(thisMonthExpense / daysPassed) : 0;

        // Quick Stats: Top Category
        let topCategory = { name: 'None', amount: 0 };
        Object.entries(categoryMapThisMonth).forEach(([name, amount]) => {
            if (amount > topCategory.amount) {
                topCategory = { name, amount };
            }
        });

        // Format Chart Data
        const categoryLabels = Object.keys(categoryMapThisMonth);
        const categoryData = Object.values(categoryMapThisMonth);

        // Generate Month Labels for Trend Chart
        const monthLabels = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthLabels.push(d.toLocaleString('default', { month: 'short' }));
        }

        // Set Cache (1 hour) - We might want to cache the metrics too if we were optimizing heavily
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
            dashboard: {
                metrics: {
                    today: { amount: todayExpense, trend: trends.today },
                    month: { amount: thisMonthExpense, trend: trends.month },
                    year: { amount: thisYearExpense, trend: trends.year },
                    total: { amount: totalExpense }
                },
                charts: {
                    trend: { labels: monthLabels, data: monthlyTrend },
                    categories: { labels: categoryLabels, data: categoryData }
                },
                stats: {
                    highest: highestExpense,
                    avgDaily: avgDailySpend,
                    topCategory: topCategory
                }
            },
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

// Expense Detail View
router.get('/expenses/:id', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.id).populate('wallet');
        const wallets = await Wallet.find().sort({ name: 1 });
        if (!expense) return res.status(404).send('Expense not found');

        res.render('admin/finance/expenses/view', {
            title: expense.title,
            expense,
            wallets,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Expense Partial Payment
router.post('/expenses/:id/pay', async (req, res) => {
    try {
        await financeHelpers.addExpensePayment(req.params.id, req.body);
        res.redirect(`/admin/finance/expenses/${req.params.id}`);
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
        const income = await Income.find().populate('wallet').populate('category').sort({ date: -1 });

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

// Income Detail View
router.get('/income/:id', async (req, res) => {
    try {
        const income = await Income.findById(req.params.id).populate('wallet').populate('category');
        if (!income) return res.status(404).send('Income not found');

        res.render('admin/finance/income/view', {
            title: income.source,
            income,
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});
// --- Reports ---
router.get('/reports', async (req, res) => {
    try {
        // --- Advanced Report Metrics ---
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // 1. Summary Cards (This Month)
        const thisMonthIncome = await Income.aggregate([
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalIncome = thisMonthIncome.length ? thisMonthIncome[0].total : 0;

        const thisMonthExpense = await Expense.aggregate([
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const totalExpense = thisMonthExpense.length ? thisMonthExpense[0].total : 0;

        const netSavings = totalIncome - totalExpense;

        // Wallet Balance
        const wallets = await Wallet.aggregate([
            { $group: { _id: null, total: { $sum: "$balance" } } }
        ]);
        const walletBalance = wallets.length ? wallets[0].total : 0;

        // Trends (vs Last Month)
        const lastMonthIncome = await Income.aggregate([
            { $match: { date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const lmIncome = lastMonthIncome.length ? lastMonthIncome[0].total : 0;
        const incomeTrend = lmIncome === 0 ? 100 : Math.round(((totalIncome - lmIncome) / lmIncome) * 100);

        const lastMonthExpenseAgg = await Expense.aggregate([
            { $match: { date: { $gte: startOfLastMonth, $lte: endOfLastMonth } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        const lmExpense = lastMonthExpenseAgg.length ? lastMonthExpenseAgg[0].total : 0;
        const expenseTrend = lmExpense === 0 ? 100 : Math.round(((totalExpense - lmExpense) / lmExpense) * 100);

        // 2. Charts Data
        // Income vs Expense (Last 12 Months)
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const monthlyStats = await Expense.aggregate([
            { $match: { date: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    expense: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const monthlyIncomeStats = await Income.aggregate([
            { $match: { date: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: "$date" }, month: { $month: "$date" } },
                    income: { $sum: "$amount" }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        // Merge and Format for Chart
        const chartLabels = [];
        const chartIncome = [];
        const chartExpense = [];

        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString('default', { month: 'short' });
            chartLabels.push(label);

            const year = d.getFullYear();
            const month = d.getMonth() + 1;

            const inc = monthlyIncomeStats.find(s => s._id.year === year && s._id.month === month);
            chartIncome.push(inc ? inc.income : 0);

            const exp = monthlyStats.find(s => s._id.year === year && s._id.month === month);
            chartExpense.push(exp ? exp.expense : 0);
        }

        // Category Breakdown (This Month)
        const categoryBreakdown = await Expense.aggregate([
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: "$category", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } }
        ]);

        // Top 5 Expenses (This Month)
        const topExpenses = await Expense.find({ date: { $gte: startOfMonth } })
            .sort({ amount: -1 })
            .limit(5)
            .lean();

        // Wallet Breakdown (This Month)
        const walletBreakdown = await Expense.aggregate([
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: "$wallet", total: { $sum: "$amount" } } }
        ]);
        await Wallet.populate(walletBreakdown, { path: "_id", select: "name" });

        // Savings Rate
        const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

        // Quick Insights
        // Highest Expense Day
        const dailyExpenses = await Expense.aggregate([
            { $match: { date: { $gte: startOfMonth } } },
            { $group: { _id: { $dayOfMonth: "$date" }, total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
            { $limit: 1 }
        ]);
        const highestExpenseDay = dailyExpenses.length ? dailyExpenses[0]._id : '-';

        // Avg Daily Spend
        const daysPassed = now.getDate();
        const avgDailySpend = Math.round(totalExpense / daysPassed);

        // Projected Total
        const projectedTotal = Math.round(avgDailySpend * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());

        res.render('admin/finance/reports/index', {
            title: 'Financial Reports',
            dashboard: {
                metrics: {
                    income: { total: totalIncome, trend: incomeTrend },
                    expense: { total: totalExpense, trend: expenseTrend },
                    savings: { total: netSavings, rate: savingsRate },
                    balance: walletBalance
                },
                charts: {
                    trend: { labels: chartLabels, income: chartIncome, expense: chartExpense },
                    categories: categoryBreakdown,
                    monthlyComparison: {
                        thisMonth: { income: totalIncome, expense: totalExpense },
                        lastMonth: { income: lmIncome, expense: lmExpense }
                    }
                },
                lists: {
                    topExpenses,
                    walletBreakdown
                },
                insights: {
                    highestDay: highestExpenseDay,
                    avgDaily: avgDailySpend,
                    projected: projectedTotal,
                    biggestCategory: categoryBreakdown.length ? categoryBreakdown[0]._id : '-'
                }
            },
            layout: 'layouts/adminLayout'
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/reports/export/pdf', async (req, res) => {
    try {
        const summary = await getFinancialSummary();
        const income = await Income.find().populate('category').sort({ date: -1 });
        const expenses = await Expense.find().populate('categoryId').sort({ date: -1 });
        const upcomingPayments = await getUpcomingPayments();
        const wallets = await Wallet.find();

        const html = await ejs.renderFile(path.join(__dirname, '../views/admin/finance/reports/pdf-template.ejs'), {
            summary,
            income,
            expenses,
            upcomingPayments,
            wallets,
            date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        });

        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });

        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
            'Content-Disposition': `attachment; filename="Finance_Report_${new Date().toISOString().split('T')[0]}.pdf"`
        });
        res.send(pdf);
    } catch (err) {
        console.error('PDF Export Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate PDF' });
    }
});

router.get('/reports/export/excel', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Aftab Dev';
        workbook.created = new Date();

        // 1. Summary Sheet
        const summarySheet = workbook.addWorksheet('Summary');
        const summary = await getFinancialSummary();

        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 }
        ];

        summarySheet.addRows([
            { metric: 'Total Income', value: summary.totalIncome },
            { metric: 'Total Expenses', value: summary.totalExpenses },
            { metric: 'Net Savings', value: summary.totalIncome - summary.totalExpenses },
            { metric: 'Wallet Balance', value: summary.totalWalletBalance },
            { metric: 'Pending to Receive', value: summary.pendingToReceive },
            { metric: 'Pending to Pay', value: summary.pendingToSend }
        ]);

        // Style Summary
        summarySheet.getRow(1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };

        // 2. Income Sheet
        const incomeSheet = workbook.addWorksheet('Income');
        const income = await Income.find().populate('category').sort({ date: -1 });

        incomeSheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Source', key: 'source', width: 30 },
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Amount', key: 'amount', width: 15 }
        ];

        income.forEach(i => {
            incomeSheet.addRow({
                date: i.date,
                source: i.source,
                category: i.category ? i.category.name : '-',
                amount: i.amount
            });
        });

        incomeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        incomeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };

        // 3. Expenses Sheet
        const expenseSheet = workbook.addWorksheet('Expenses');
        const expenses = await Expense.find().populate('categoryId').sort({ date: -1 });

        expenseSheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Title', key: 'title', width: 30 },
            { header: 'Category', key: 'category', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Amount', key: 'amount', width: 15 }
        ];

        expenses.forEach(e => {
            expenseSheet.addRow({
                date: e.date,
                title: e.title,
                category: e.categoryId ? e.categoryId.name : '-',
                status: e.status,
                amount: e.amount
            });
        });

        expenseSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        expenseSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="Finance_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('Excel Export Error:', err);
        res.status(500).json({ success: false, message: 'Failed to generate Excel' });
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

router.post('/categories/delete/:id', async (req, res) => {
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

        // --- Calculate Dashboard Metrics ---
        let totalSent = 0;
        let totalReceived = 0;
        let pendingAmount = 0;
        let pendingCount = 0;

        // For Charts
        const now = new Date();
        const cashFlow = Array(6).fill(0).map(() => ({ sent: 0, received: 0 })); // Last 6 months

        // For Top People
        const peopleStats = {};

        payments.forEach(p => {
            const amount = p.amount || 0;

            // 1. Summary Metrics
            if (p.type === 'send') {
                totalSent += amount;
            } else if (p.type === 'receive') {
                totalReceived += amount;
            }

            if (p.status === 'Pending') {
                pendingAmount += amount;
                pendingCount++;
            }

            // 2. Cash Flow (Last 6 Months)
            const pDate = new Date(p.date);
            const monthsAgo = (now.getFullYear() - pDate.getFullYear()) * 12 + (now.getMonth() - pDate.getMonth());

            if (monthsAgo >= 0 && monthsAgo < 6) {
                // 0 = this month, 5 = 5 months ago
                // We want to store it so index 5 is this month, 0 is 5 months ago for the chart
                if (p.type === 'send') cashFlow[5 - monthsAgo].sent += amount;
                else if (p.type === 'receive') cashFlow[5 - monthsAgo].received += amount;
            }

            // 3. Top People
            if (p.person) {
                const pid = p.person._id.toString();
                if (!peopleStats[pid]) {
                    peopleStats[pid] = {
                        name: p.person.name,
                        avatar: p.person.avatar || null, // Assuming avatar field exists or handle in frontend
                        sent: 0,
                        received: 0,
                        lastTransaction: p.date
                    };
                }
                if (p.type === 'send') peopleStats[pid].sent += amount;
                else if (p.type === 'receive') peopleStats[pid].received += amount;

                // Update last transaction if this one is newer
                if (new Date(p.date) > new Date(peopleStats[pid].lastTransaction)) {
                    peopleStats[pid].lastTransaction = p.date;
                }
            }
        });

        const netBalance = totalReceived - totalSent;

        // Process Top People
        const topPeople = Object.values(peopleStats)
            .map(p => ({
                ...p,
                net: p.received - p.sent,
                volume: p.received + p.sent
            }))
            .sort((a, b) => b.volume - a.volume) // Sort by total volume
            .slice(0, 10); // Top 10

        // Process Chart Labels
        const monthLabels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthLabels.push(d.toLocaleString('default', { month: 'short' }));
        }

        res.render('admin/finance/payments/list', {
            title: 'Payments & Transactions',
            payments,
            dashboard: {
                metrics: {
                    sent: totalSent,
                    received: totalReceived,
                    net: netBalance,
                    pending: { amount: pendingAmount, count: pendingCount }
                },
                charts: {
                    cashFlow: {
                        labels: monthLabels,
                        sent: cashFlow.map(c => c.sent),
                        received: cashFlow.map(c => c.received)
                    }
                },
                topPeople
            },
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
