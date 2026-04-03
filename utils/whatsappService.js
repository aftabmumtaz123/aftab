const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const MessageLog = require('../models/MessageLog');

// Global status payload
const whatsappStatus = {
    isReady: false,
    enabled: true, // Mapped to the global toggle feature
    qr: null,
    phoneNumber: null,
    lastConnected: null
};

let client = null;

const createClient = () => {
    whatsappStatus.isReady = false;
    whatsappStatus.qr = null;
    
    const newClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
    });

    newClient.on('qr', (qr) => {
        whatsappStatus.qr = qr;
        console.log('🔄 New WhatsApp QR Code generated for UI.');
    });

    newClient.on('ready', () => {
        whatsappStatus.isReady = true;
        whatsappStatus.qr = null;
        whatsappStatus.phoneNumber = newClient.info?.wid?.user || 'Connected';
        whatsappStatus.lastConnected = new Date();
        console.log('✅ WhatsApp Web Client is successfully authenticated and ready!');
    });

    newClient.on('disconnected', (reason) => {
        whatsappStatus.isReady = false;
        whatsappStatus.qr = null;
        whatsappStatus.phoneNumber = null;
        console.log('❌ WhatsApp Web Client disconnected:', reason);
    });

    newClient.initialize();
    return newClient;
};

// Start the core engine
console.log('🚀 Initializing WhatsApp Web Client...');
client = createClient();

/**
 * Format a phone number to WhatsApp Web requirements
 * Trims +, spaces, 0 prefixes, and appends @c.us
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let clean = phone.toString().replace(/[\s+-]/g, '');
    
    // Convert leading 0 (e.g. 0307 -> 92307 if PK) 
    // Wait, let's just strip '0' safely if it's 11 digits
    if (clean.startsWith('0') && clean.length === 11) {
        clean = '92' + clean.substring(1);
    }
    
    return `${clean}@c.us`;
};

/**
 * General helper to send a message natively
 */
const sendTemplatedMessage = async (templateData, payment, phoneStr, ownerId, overrideName = null) => {
    if (!whatsappStatus.enabled) {
        console.log('⚠️ WhatsApp Sending Disabled globally via settings.');
        return false;
    }

    if (!whatsappStatus.isReady) {
        console.log('⚠️ WhatsApp Client is not ready yet. Cannot dispatch message.');
        return false;
    }

    const chatId = formatPhoneNumber(phoneStr);
    if (!chatId) {
        console.log(`⚠️ WhatsApp Send Aborted: No valid phone number provided (Received: ${phoneStr})`);
        return false;
    }

    // Inject parameters
    const safeName = overrideName || (payment.person && payment.person.name) || 'Customer';
    let finalMsg = templateData.text
        .replace(/{{name}}/g, safeName)
        .replace(/{{amount}}/g, payment.paidAmount || payment.amount || '0')
        .replace(/{{dueDate}}/g, payment.endDate ? new Date(payment.endDate).toLocaleDateString() : new Date().toLocaleDateString());

    try {
        let sent = false;
        // Send Media if exists
        if (templateData.mediaUrl) {
            let media;
            if (templateData.mediaUrl.startsWith('http')) {
                media = await MessageMedia.fromUrl(templateData.mediaUrl);
            } else {
                // local file
                const fs = require('fs');
                if (fs.existsSync(templateData.mediaUrl)) {
                    media = MessageMedia.fromFilePath(templateData.mediaUrl);
                }
            }
            if (media) {
                await client.sendMessage(chatId, media, { caption: finalMsg });
                sent = true;
            }
        }
        
        // Otherwise, send plain text if media didn't trigger
        if (!sent) {
            await client.sendMessage(chatId, finalMsg);
            sent = true;
        }

        if (sent) {
            await MessageLog.create({
                toPhone: phoneStr,
                person: typeof payment.person === 'object' ? payment.person._id : payment.person,
                text: finalMsg,
                type: templateData.type || 'Template',
                status: 'Sent',
                owner: ownerId
            });
            return true;
        }

    } catch (e) {
        console.error('❌ Failed to dispatch WhatsApp Message:', e);
        await MessageLog.create({
            toPhone: phoneStr,
            person: typeof payment.person === 'object' ? payment.person._id : payment.person,
            text: finalMsg,
            type: templateData.type || 'Template',
            status: 'Failed',
            errorMessage: e.message,
            owner: ownerId
        });
        return false;
    }
};

/**
 * Core exported handlers hooked into finance and cron systems
 */
const service = {
    whatsappStatus,
    client,

    sendPaymentConfirmation: async (payment, phone, ownerId, name = null) => {
        const MessageTemplate = require('../models/MessageTemplate');
        const tpl = await MessageTemplate.findOne({ type: 'PaymentConfirmation', owner: ownerId });
        if (!tpl) { console.log(`⚠️ No MessageTemplate found for type: PaymentConfirmation and owner: ${ownerId}`); return false; }
        return await sendTemplatedMessage(tpl, payment, phone, ownerId, name);
    },

    sendDueReminder: async (payment, phone, ownerId, name = null) => {
        const MessageTemplate = require('../models/MessageTemplate');
        const tpl = await MessageTemplate.findOne({ type: 'DueReminder', owner: ownerId });
        if (!tpl) { console.log(`⚠️ No MessageTemplate found for type: DueReminder and owner: ${ownerId}`); return false; }
        return await sendTemplatedMessage(tpl, payment, phone, ownerId, name);
    },

    sendWeeklyReminder: async (payment, phone, ownerId, name = null) => {
        const MessageTemplate = require('../models/MessageTemplate');
        const tpl = await MessageTemplate.findOne({ type: 'WeeklyReminder', owner: ownerId });
        if (!tpl) { console.log(`⚠️ No MessageTemplate found for type: WeeklyReminder and owner: ${ownerId}`); return false; }
        return await sendTemplatedMessage(tpl, payment, phone, ownerId, name);
    },

    reconnect: async () => {
        whatsappStatus.isReady = false;
        whatsappStatus.qr = null;
        if (client) {
            try { await client.destroy(); } catch(e) {}
        }
        client = createClient();
        service.client = client;
    },

    disconnect: async () => {
        if (client) {
            try { await client.logout(); } catch(e) {}
        }
    },

    sendCustomMessage: async (phoneStr, text, ownerId, personId = null) => {
        if (!whatsappStatus.enabled) return false;
        if (!whatsappStatus.isReady) return false;

        const chatId = formatPhoneNumber(phoneStr);
        if (!chatId) return false;

        try {
            await client.sendMessage(chatId, text);
            await MessageLog.create({
                toPhone: phoneStr,
                person: personId,
                text: text,
                type: 'Announcement',
                status: 'Sent',
                owner: ownerId
            });
            return true;
        } catch(e) {
            await MessageLog.create({
                toPhone: phoneStr,
                person: personId,
                text: text,
                type: 'Announcement',
                status: 'Failed',
                errorMessage: e.message,
                owner: ownerId
            });
            return false;
        }
    }
};

module.exports = service;
