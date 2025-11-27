const nodemailer = require('nodemailer');
const webPush = require('web-push');
const Notification = require('../models/Notification');
const redisClient = require('../config/redis');

// Configure Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail', // Or use host/port from env
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Configure Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        `mailto:${process.env.EMAIL_USER}`,
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

const notificationService = {
    // Send Email
    sendEmail: async (to, subject, html) => {
        try {
            if (!to) return;
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to,
                subject,
                html
            };
            await transporter.sendMail(mailOptions);
            console.log(`Email sent to ${to}`);
        } catch (error) {
            console.error('Error sending email:', error);
        }
    },

    // Send Web Push
    sendPush: async (payload) => {
        try {
            // Fetch all subscriptions from Redis or DB (Assuming we store them in Redis for now or a separate model)
            // For simplicity, let's assume we store subscriptions in a Redis set 'push_subscriptions'
            if (!redisClient?.isReady) return;

            const subscriptions = await redisClient.sMembers('push_subscriptions');

            const notifications = subscriptions.map(sub => {
                const subscription = JSON.parse(sub);
                return webPush.sendNotification(subscription, JSON.stringify(payload))
                    .catch(err => {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            // Subscription is invalid, remove it
                            redisClient.sRem('push_subscriptions', sub);
                        } else {
                            console.error('Error sending push:', err);
                        }
                    });
            });

            await Promise.all(notifications);
        } catch (error) {
            console.error('Error in sendPush:', error);
        }
    },

    // Create In-App Notification + Trigger Push
    createNotification: async (data) => {
        try {
            // 1. Save to DB
            const notification = await Notification.create(data);

            // 2. Trigger Push (if applicable)
            // We only send push for important events, or we can send for all.
            // Let's send for all "createNotification" calls as they are usually important.
            const pushPayload = {
                title: data.title,
                body: data.message,
                url: data.link || '/admin/dashboard',
                icon: '/images/logo.png' // Ensure this exists or use a default
            };

            await notificationService.sendPush(pushPayload);

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    }
};

module.exports = notificationService;
