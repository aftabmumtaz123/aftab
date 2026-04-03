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
    sendPush: async (payload, ownerId) => {
        try {
            if (!redisClient?.isReady || !ownerId) return;

            const subscriptions = await redisClient.sMembers(`push_subscriptions:${ownerId}`);

            const notifications = subscriptions.map(sub => {
                const subscription = JSON.parse(sub);
                return webPush.sendNotification(subscription, JSON.stringify(payload))
                    .catch(err => {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            // Subscription is invalid, remove it
                            redisClient.sRem(`push_subscriptions:${ownerId}`, sub);
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
            const pushPayload = {
                title: data.title,
                body: data.message,
                url: data.link || '/admin/dashboard',
                icon: '/images/logo.png'
            };

            await notificationService.sendPush(pushPayload, data.owner);

            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
        }
    }
};

module.exports = notificationService;
