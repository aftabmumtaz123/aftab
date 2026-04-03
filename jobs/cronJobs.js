const cron = require('node-cron');
const Payment = require('../models/Payment');
const whatsappService = require('../utils/whatsappService');

// Run every day at 09:00 AM
cron.schedule('0 9 * * *', async () => {
    console.log('Running daily cron job to check for due payments...');
    try {
        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));

        // Find payments that owe money and have passed due date (endDate)
        const duePayments = await Payment.find({
            status: { $in: ['Pending', 'Partial', 'Overdue'] },
            endDate: { $lte: startOfDay }, // Due date has passed
            $expr: { $gt: ["$amount", { $ifNull: ["$paidAmount", 0] }] } // Still money owed
        }).populate('person');

        for (const payment of duePayments) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Check if reminder was already sent in the last 7 days
            if (!payment.lastReminderDate || payment.lastReminderDate <= sevenDaysAgo) {
                
                const phone = payment.person?.phone;
                if (phone) {
                    // It's the first reminder or weekly subsequent one
                    const isFirstReminder = !payment.lastReminderDate;
                    
                    let sent = false;
                    if (isFirstReminder) {
                        sent = await whatsappService.sendDueReminder(payment, phone, payment.owner);
                    } else {
                        sent = await whatsappService.sendWeeklyReminder(payment, phone, payment.owner);
                    }

                    if (sent) {
                        payment.lastReminderDate = new Date();
                        if (payment.status !== 'Overdue') {
                             payment.status = 'Overdue';
                        }
                        await payment.save();
                    }
                }
            }
        }
        console.log('Cron job completed successfully.');
    } catch (error) {
        console.error('Error in scheduled cron job:', error);
    }
});

module.exports = cron;
