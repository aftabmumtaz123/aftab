const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const MessageLog = require('../models/MessageLog');

// Global status payload
const whatsappStatus = {
    isReady: false,
    enabled: true, // Mapped to the global toggle feature
    qr: null,
    phoneNumber: null,
    lastConnected: null
};

let sock = null;
let isInitializing = false;

const connectToWhatsApp = async () => {
    if (isInitializing) return;
    isInitializing = true;

    try {
        if (!fs.existsSync('baileys_auth_info')) {
            fs.mkdirSync('baileys_auth_info', { recursive: true });
        }
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        
        console.log(`🚀 Initializing Baileys v${version.join('.')} (latest: ${isLatest})`);

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['Dynamic Portfolio', 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                whatsappStatus.qr = qr;
                console.log('🔄 New WhatsApp QR Code generated for UI.');
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ WhatsApp connection closed. Should reconnect:', shouldReconnect);
                whatsappStatus.isReady = false;
                whatsappStatus.qr = null;
                whatsappStatus.phoneNumber = null;
                
                if (shouldReconnect) {
                    isInitializing = false;
                    connectToWhatsApp();
                } else {
                    console.log('🚪 Logged out. Clearing session and preparing for new login...');
                    isInitializing = false;
                    // Run disconnect to clear state and folder
                    service.disconnect().then(() => {
                        connectToWhatsApp();
                    });
                }
            } else if (connection === 'open') {
                whatsappStatus.isReady = true;
                whatsappStatus.qr = null;
                whatsappStatus.phoneNumber = sock.user.id.split(':')[0].split('@')[0];
                whatsappStatus.lastConnected = new Date();
                console.log('✅ WhatsApp Baileys Client is successfully connected and ready!');
                isInitializing = false;
            }
        });

    } catch (error) {
        console.error('❌ Failed to initialize Baileys:', error);
        isInitializing = false;
    }
};

// Start the core engine
connectToWhatsApp();

/**
 * Format a phone number to Baileys requirements
 * Trims +, spaces, 0 prefixes, and appends @s.whatsapp.net
 */
const formatPhoneNumber = (phone) => {
    if (!phone) return null;
    let clean = phone.toString().replace(/[\s+-]/g, '');
    
    // Convert leading 0 (e.g. 0307 -> 92307 if PK) 
    if (clean.startsWith('0') && clean.length === 11) {
        clean = '92' + clean.substring(1);
    }
    
    // If it's already a full ID, keep it, otherwise append suffix
    if (!clean.includes('@')) {
        return `${clean}@s.whatsapp.net`;
    }
    return clean;
};

/**
 * General helper to send a message natively
 */
const sendTemplatedMessage = async (templateData, payment, phoneStr, ownerId, overrideName = null) => {
    if (!whatsappStatus.enabled) {
        console.log('⚠️ WhatsApp Sending Disabled globally via settings.');
        return false;
    }

    if (!whatsappStatus.isReady || !sock) {
        console.log('⚠️ WhatsApp Client is not ready yet. Cannot dispatch message.');
        return false;
    }
    const chatId = formatPhoneNumber(phoneStr);
    if (!chatId) {
        console.log(`⚠️ WhatsApp Send Aborted: No valid phone number provided (Received: ${phoneStr})`);
        return false;
    }

    try {
        // Inject parameters
        if (!templateData || !templateData.text) {
            console.log('⚠️ Template data or text is missing, skipping WhatsApp message.');
            return false;
        }

        const safeName = overrideName || (payment.person && payment.person.name) || 'Customer';
        let finalMsg = templateData.text
            .replace(/{{name}}/g, safeName)
            .replace(/{{amount}}/g, payment.paidAmount || payment.amount || '0')
            .replace(/{{dueDate}}/g, payment.endDate ? new Date(payment.endDate).toLocaleDateString() : new Date().toLocaleDateString());

        if (!whatsappStatus.isReady || !sock) {
            console.log('⚠️ WhatsApp not ready, skipping message...');
            return false;
        }

        let sent = false;
        
        // Send Media if exists
        if (templateData.mediaUrl) {
            const isUrl = templateData.mediaUrl.startsWith('http');
            const mediaOptions = {};
            
            // Detect if image or video (Baileys needs it specified)
            const ext = path.extname(templateData.mediaUrl).toLowerCase();
            const isVideo = ['.mp4', '.mov', '.avi'].includes(ext);
            
            if (isVideo) {
                mediaOptions.video = { url: templateData.mediaUrl };
            } else {
                mediaOptions.image = { url: templateData.mediaUrl };
            }
            
            mediaOptions.caption = finalMsg;
            
            await sock.sendMessage(chatId, mediaOptions);
            sent = true;
        }
        
        // Otherwise, send plain text if media didn't trigger
        if (!sent) {
            await sock.sendMessage(chatId, { text: finalMsg });
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
    get sock() { return sock; },

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
        console.log('🔄 Manual reconnect triggered...');
        whatsappStatus.isReady = false;
        whatsappStatus.qr = null;
        if (sock) {
            try { sock.ws.close(); } catch(e) {}
        }
        isInitializing = false;
        await connectToWhatsApp();
    },

    disconnect: async () => {
        console.log('🔌 Manual disconnect triggered...');
        try {
            if (sock) {
                // sock.logout() is the proper way to invalidate session
                await sock.logout().catch(err => console.log('⚠️ Baileys logout error (ignoring):', err.message));
                try { sock.ws.close(); } catch(e) {}
                sock = null;
            }

            // Clear auth folder after a short delay to ensure file handles are released
            setTimeout(() => {
                if (fs.existsSync('baileys_auth_info')) {
                    try {
                        fs.rmSync('baileys_auth_info', { recursive: true, force: true });
                        console.log('🗑️ WhatsApp session data cleared.');
                    } catch (err) {
                        console.log('⚠️ Could not clear auth folder automatically (busy). It will be overwritten on next login.');
                    }
                }
            }, 1000);

        } catch (err) {
            console.error('❌ Error during disconnect:', err);
        }

        whatsappStatus.isReady = false;
        whatsappStatus.qr = null;
        whatsappStatus.phoneNumber = null;
    },

    sendCustomMessage: async (phoneStr, text, ownerId, personId = null) => {
        if (!whatsappStatus.enabled) return false;
        if (!whatsappStatus.isReady || !sock) return false;

        const chatId = formatPhoneNumber(phoneStr);
        if (!chatId) return false;

        try {
            await sock.sendMessage(chatId, { text: text });
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
            console.error('❌ Failed to send custom message:', e);
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
