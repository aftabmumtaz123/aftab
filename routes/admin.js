const express = require('express');
const router = express.Router();
const SiteConfig = require('../models/SiteConfig');
const Service = require('../models/Service');
const Project = require('../models/Project');
const Skill = require('../models/Skill');
const Experience = require('../models/Experience');
const Testimonial = require('../models/Testimonial');
const HeroSection = require('../models/HeroSection');
const Education = require('../models/Education');
const upload = require('../middleware/uploadMiddleware');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const User = require('../models/User');
const adminHelpers = require('../utils/adminHelpers');
const Contact = require('../models/Contact'); // Import Contact model
const Notification = require('../models/Notification');
const notificationService = require('../utils/notificationService');

router.use(requireAuth);

// --- Notifications ---
router.get('/notifications', async (req, res) => {
    try {
        const ownerId = req.user._id;
        const notifications = await Notification.find({ owner: ownerId }).sort({ date: -1 }).limit(20);
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

router.post('/notifications/mark-read', async (req, res) => {
    try {
        const ownerId = req.user._id;
        await Notification.updateMany({ owner: ownerId, read: false }, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

router.post('/notifications/subscribe', async (req, res) => {
    try {
        const subscription = req.body;
        const ownerId = req.user._id;
        const redisClient = require('../config/redis');
        if (redisClient && redisClient.isReady) {
            await redisClient.sAdd(`push_subscriptions:${ownerId}`, JSON.stringify(subscription));
        }
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Subscription error:', err);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Middleware to check DB connection for all admin routes
router.use((req, res, next) => {
    if (req.method === 'GET' && require('mongoose').connection.readyState !== 1) {
        // If it's a sync request or static asset, let it pass (though static assets usually handled before)
        // But for admin pages, if DB is down, show offline page
        return res.status(503).render('offline', { layout: false });
    }
    next();
});

// Helper to render with layout
const renderAdmin = (res, view, data) => {
    res.render(view, { layout: 'layouts/adminLayout', ...data });
};

// ======= USER MANAGEMENT (Admin Only) =======
router.get('/users', requireAdmin, async (req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    renderAdmin(res, 'admin/users', { title: 'Users', path: '/users', users });
});

router.get('/users/add', requireAdmin, (req, res) => {
    renderAdmin(res, 'admin/add-user', { title: 'Add User', path: '/users' });
});

router.post('/users/add', requireAdmin, async (req, res) => {
    try {
        const { username, password, email, phone, role } = req.body;
        const existing = await User.findOne({ username });
        if (existing) {
            return res.redirect('/admin/users/add?error=Username+already+exists');
        }
        await User.create({ username, password, email: email || '', phone: phone || '', role: role || 'user' });
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/users/add?error=Failed+to+create+user');
    }
});

router.post('/users/:id/toggle', requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user && user.role !== 'admin') {
        user.isActive = !user.isActive;
        await user.save();
    }
    res.redirect('/admin/users');
});

router.post('/users/:id/delete', requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user && user.role !== 'admin') {
        // Delete all user's data
        const Payment = require('../models/Payment');
        const Wallet = require('../models/Wallet');
        const Person = require('../models/Person');
        const Income = require('../models/Income');
        const Expense = require('../models/Expense');
        const Transfer = require('../models/Transfer');
        const Category = require('../models/Category');
        const Goal = require('../models/Goal');
        
        await Promise.all([
            Payment.deleteMany({ owner: user._id }),
            Wallet.deleteMany({ owner: user._id }),
            Person.deleteMany({ owner: user._id }),
            Income.deleteMany({ owner: user._id }),
            Expense.deleteMany({ owner: user._id }),
            Transfer.deleteMany({ owner: user._id }),
            Category.deleteMany({ owner: user._id }),
            Goal.deleteMany({ owner: user._id })
        ]);
        await User.findByIdAndDelete(user._id);
    }
    res.redirect('/admin/users');
});

// Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // Fetch from database
        const projectCount = await Project.countDocuments();
        const skillCount = await Skill.countDocuments();
        const experienceCount = await Experience.countDocuments();
        const testimonialCount = await Testimonial.countDocuments();
        let config = await SiteConfig.findOne();

        const recentProjects = await Project.find().sort({ _id: -1 }).limit(5);
        const recentSkills = await Skill.find().sort({ _id: -1 }).limit(5);
        const topProjects = await Project.find().sort({ clicks: -1 }).limit(5);
        const recentContacts = await Contact.find().sort({ createdAt: -1 }).limit(5);

        const data = {
            title: 'Dashboard',
            path: '/dashboard',
            stats: { projectCount, skillCount, experienceCount, testimonialCount, views: config ? config.views : 0 },
            recentProjects,
            recentSkills,
            topProjects,
            recentContacts
        };

        renderAdmin(res, 'admin/dashboard', data);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// --- Hero Section ---
router.get('/hero', async (req, res) => {
    try {
        let hero = await HeroSection.findOne();
        if (!hero) hero = await HeroSection.create({});
        renderAdmin(res, 'admin/hero', { title: 'Hero Section', path: '/hero', hero });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/hero', upload.single('backgroundImage'), async (req, res) => {
    try {
        const updateData = req.body;
        if (req.file) updateData.backgroundImage = req.file.path;
        await adminHelpers.updateHero(updateData);
        res.redirect('/admin/hero');
    } catch (err) {
        res.status(500).send('Error updating hero');
    }
});

// --- Skills ---
router.get('/skills', async (req, res) => {
    try {
        const skills = await Skill.find();
        renderAdmin(res, 'admin/skills', { title: 'Skills', path: '/skills', skills });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/skills', async (req, res) => {
    try {
        await adminHelpers.createSkill(req.body);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send('Error adding skill');
    }
});

router.get('/skills/add', (req, res) => {
    renderAdmin(res, 'admin/add-skill', { title: 'Add Skill', path: '/skills' });
});

router.post('/skills/:id/delete', async (req, res) => {
    try {
        await adminHelpers.deleteSkill(req.params.id);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send('Error deleting skill');
    }
});

router.get('/skills/:id/edit', async (req, res) => {
    try {
        const skill = await Skill.findById(req.params.id);
        renderAdmin(res, 'admin/edit-skill', { title: 'Edit Skill', path: '/skills', skill });
    } catch (err) {
        console.error(err);
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        res.status(500).send('Error fetching skill');
    }
});

router.post('/skills/:id/edit', async (req, res) => {
    try {
        await adminHelpers.updateSkill(req.params.id, req.body);
        res.redirect('/admin/skills');
    } catch (err) {
        res.status(500).send('Error updating skill');
    }
});

// --- Experience ---
router.get('/experience', async (req, res) => {
    try {
        const experience = await Experience.find().sort({ startDate: -1 });
        renderAdmin(res, 'admin/experience', { title: 'Experience', path: '/experience', experience });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/experience', async (req, res) => {
    try {
        req.body.current = !!req.body.current; // Convert to boolean
        await adminHelpers.createExperience(req.body);
        res.redirect('/admin/experience');
    } catch (err) {
        res.status(500).send('Error adding experience');
    }
});

router.get('/experience/add', (req, res) => {
    renderAdmin(res, 'admin/add-experience', { title: 'Add Experience', path: '/experience' });
});

router.post('/experience/:id/delete', async (req, res) => {
    try {
        await adminHelpers.deleteExperience(req.params.id);
        res.redirect('/admin/experience');
    } catch (err) {
        res.status(500).send('Error deleting experience');
    }
});

router.get('/experience/:id/edit', async (req, res) => {
    try {
        const experience = await Experience.findById(req.params.id);
        renderAdmin(res, 'admin/edit-experience', { title: 'Edit Experience', path: '/experience', experience });
    } catch (err) {
        console.error(err);
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        res.status(500).send('Error fetching experience');
    }
});

router.post('/experience/:id/edit', async (req, res) => {
    try {
        req.body.current = !!req.body.current;
        await adminHelpers.updateExperience(req.params.id, req.body);
        res.redirect('/admin/experience');
    } catch (err) {
        res.status(500).send('Error updating experience');
    }
});

// --- Projects ---
router.get('/projects', async (req, res) => {
    try {
        const projects = await Project.find();
        renderAdmin(res, 'admin/projects', { title: 'Projects', path: '/projects', projects });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/projects', upload.single('image'), async (req, res) => {
    try {
        const projectData = {
            title: req.body.title,
            description: req.body.description,
            liveLink: req.body.liveLink,
            repoLink: req.body.repoLink,
            tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : []
        };
        if (req.file) projectData.imageUrl = req.file.path;

        await adminHelpers.createProject(projectData);
        res.redirect('/admin/projects');
    } catch (err) {
        res.status(500).send('Error adding project');
    }
});

router.get('/projects/add', (req, res) => {
    renderAdmin(res, 'admin/add-project', { title: 'Add Project', path: '/projects' });
});

router.post('/projects/:id/delete', async (req, res) => {
    try {
        await adminHelpers.deleteProject(req.params.id);
        res.redirect('/admin/projects');
    } catch (err) {
        res.status(500).send('Error deleting project');
    }
});

router.get('/projects/:id/edit', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        renderAdmin(res, 'admin/edit-project', { title: 'Edit Project', path: '/projects', project });
    } catch (err) {
        console.error(err);
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        res.status(500).send('Error fetching project');
    }
});

router.post('/projects/:id/edit', upload.single('image'), async (req, res) => {
    try {
        const projectData = {
            title: req.body.title,
            description: req.body.description,
            liveLink: req.body.liveLink,
            repoLink: req.body.repoLink,
            tags: req.body.tags ? req.body.tags.split(',').map(tag => tag.trim()) : []
        };
        if (req.file) projectData.imageUrl = req.file.path;

        await adminHelpers.updateProject(req.params.id, projectData);
        res.redirect('/admin/projects');
    } catch (err) {
        res.status(500).send('Error updating project');
    }
});

// --- Testimonials ---
router.get('/testimonials', async (req, res) => {
    try {
        const testimonials = await Testimonial.find();
        renderAdmin(res, 'admin/testimonials', { title: 'Testimonials', path: '/testimonials', testimonials });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/testimonials', upload.single('photo'), async (req, res) => {
    try {
        const data = req.body;
        if (req.file) data.photoUrl = req.file.path;
        await adminHelpers.createTestimonial(data);
        res.redirect('/admin/testimonials');
    } catch (err) {
        res.status(500).send('Error adding testimonial');
    }
});

router.get('/testimonials/add', (req, res) => {
    renderAdmin(res, 'admin/add-testimonial', { title: 'Add Testimonial', path: '/testimonials' });
});

router.post('/testimonials/:id/delete', async (req, res) => {
    try {
        await adminHelpers.deleteTestimonial(req.params.id);
        res.redirect('/admin/testimonials');
    } catch (err) {
        res.status(500).send('Error deleting testimonial');
    }
});

router.get('/testimonials/:id/edit', async (req, res) => {
    try {
        const testimonial = await Testimonial.findById(req.params.id);
        renderAdmin(res, 'admin/edit-testimonial', { title: 'Edit Testimonial', path: '/testimonials', testimonial });
    } catch (err) {
        console.error(err);
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        res.status(500).send('Error fetching testimonial');
    }
});

router.post('/testimonials/:id/edit', upload.single('photo'), async (req, res) => {
    try {
        const data = req.body;
        if (req.file) data.photoUrl = req.file.path;
        await adminHelpers.updateTestimonial(req.params.id, data);
        res.redirect('/admin/testimonials');
    } catch (err) {
        res.status(500).send('Error updating testimonial');
    }
});

// --- Settings (Site Config) ---
router.get('/config', async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) config = await SiteConfig.create({});
        renderAdmin(res, 'admin/config', { title: 'Settings', path: '/config', config });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/config', upload.single('aboutImage'), async (req, res) => {
    try {
        const updateData = req.body;
        if (req.file) updateData.aboutImage = req.file.path;
        await adminHelpers.updateConfig(updateData);
        res.redirect('/admin/config');
    } catch (err) {
        res.status(500).send('Error updating config');
    }
});

// --- Contacts (Messages) ---
router.get('/contacts', async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        renderAdmin(res, 'admin/contacts/list', { title: 'Messages', path: '/contacts', contacts });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/contacts/:id/delete', async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.redirect('/admin/contacts');
    } catch (err) {
        res.status(500).send('Error deleting message');
    }
});

// Sync Endpoint for Offline Changes
router.post('/sync', async (req, res) => {
    try {
        const { changes } = req.body;

        if (!changes || !Array.isArray(changes)) {
            return res.status(400).json({ success: false, message: 'Invalid sync data' });
        }

        const results = [];

        for (const change of changes) {
            try {
                const { url, method, body } = change;

                // Parse the URL to determine entity type and action
                if (url.includes('/projects')) {
                    if (method === 'POST' && url.endsWith('/projects')) {
                        await adminHelpers.createProject(body);
                    } else if (url.includes('/edit')) {
                        const id = url.split('/')[3];
                        await adminHelpers.updateProject(id, body);
                    } else if (url.includes('/delete')) {
                        const id = url.split('/')[3];
                        await adminHelpers.deleteProject(id);
                    }
                } else if (url.includes('/skills')) {
                    if (method === 'POST' && url.endsWith('/skills')) {
                        await adminHelpers.createSkill(body);
                    } else if (url.includes('/edit')) {
                        const id = url.split('/')[3];
                        await adminHelpers.updateSkill(id, body);
                    } else if (url.includes('/delete')) {
                        const id = url.split('/')[3];
                        await adminHelpers.deleteSkill(id);
                    }
                } else if (url.includes('/experience')) {
                    if (method === 'POST' && url.endsWith('/experience')) {
                        await adminHelpers.createExperience(body);
                    } else if (url.includes('/edit')) {
                        const id = url.split('/')[3];
                        await adminHelpers.updateExperience(id, body);
                    } else if (url.includes('/delete')) {
                        const id = url.split('/')[3];
                        await adminHelpers.deleteExperience(id);
                    }
                } else if (url.includes('/testimonials')) {
                    if (method === 'POST' && url.endsWith('/testimonials')) {
                        await adminHelpers.createTestimonial(body);
                    } else if (url.includes('/edit')) {
                        const id = url.split('/')[3];
                        await adminHelpers.updateTestimonial(id, body);
                    } else if (url.includes('/delete')) {
                        const id = url.split('/')[3];
                        await adminHelpers.deleteTestimonial(id);
                    }
                } else if (url.includes('/config')) {
                    await adminHelpers.updateConfig(body);
                } else if (url.includes('/hero')) {
                    await adminHelpers.updateHero(body);
                } else if (url.includes('/education')) {
                    if (method === 'POST' && url.endsWith('/education')) {
                        await adminHelpers.createEducation(body);
                    } else if (url.includes('/edit')) {
                        const id = url.split('/')[3];
                        await adminHelpers.updateEducation(id, body);
                    } else if (url.includes('/delete')) {
                        const id = url.split('/')[3];
                        await adminHelpers.deleteEducation(id);
                    }
                }

                results.push({ success: true, change });
            } catch (err) {
                console.error('Error processing change:', err);
                results.push({ success: false, change, error: err.message });
            }
        }

        res.json({ success: true, results });
    } catch (err) {
        console.error('Sync error:', err);
        res.status(500).json({ success: false, message: 'Sync failed' });
    }
});

// ===== EDUCATION ROUTES =====

// List Education
router.get('/education', async (req, res) => {
    try {
        const education = await Education.find().sort({ startDate: -1 });
        renderAdmin(res, 'admin/education', {
            title: 'Education',
            path: '/education',
            education
        });
    } catch (err) {
        res.status(500).send('Error loading education');
    }
});

// Add Education Form
router.get('/education/add', (req, res) => {
    renderAdmin(res, 'admin/add-education', {
        title: 'Add Education',
        path: '/education'
    });
});

// Create Education
router.post('/education', async (req, res) => {
    try {
        req.body.current = !!req.body.current;
        await adminHelpers.createEducation(req.body);
        res.redirect('/admin/education');
    } catch (err) {
        res.status(500).send('Error adding education');
    }
});

// Edit Education Form
router.get('/education/:id/edit', async (req, res) => {
    try {
        const education = await Education.findById(req.params.id);
        renderAdmin(res, 'admin/edit-education', {
            title: 'Edit Education',
            path: '/education',
            education
        });
    } catch (err) {
        console.error(err);
        if (require('mongoose').connection.readyState !== 1) return res.render('offline', { layout: false });
        res.status(500).send('Error loading education');
    }
});

// Update Education
router.post('/education/:id/edit', async (req, res) => {
    try {
        req.body.current = !!req.body.current;
        await adminHelpers.updateEducation(req.params.id, req.body);
        res.redirect('/admin/education');
    } catch (err) {
        res.status(500).send('Error updating education');
    }
});

// Delete Education
router.post('/education/:id/delete', async (req, res) => {
    try {
        await adminHelpers.deleteEducation(req.params.id);
        res.redirect('/admin/education');
    } catch (err) {
        res.status(500).send('Error deleting education');
    }
});

// ===== MESSAGE TEMPLATES ROUTES =====
const MessageTemplate = require('../models/MessageTemplate');

// List Message Templates
router.get('/messages', async (req, res) => {
    try {
        const ownerId = req.user._id;
        const messages = await MessageTemplate.find({ owner: ownerId }).sort({ createdAt: -1 });
        
        // Calculate Stats
        const stats = {
            total: messages.length,
            active: messages.length,
            lastUpdated: messages.length > 0 ? messages[0].createdAt : new Date()
        };

        renderAdmin(res, 'admin/messages', {
            title: 'Message Templates',
            path: '/messages',
            messages,
            stats
        });
    } catch (err) {
        res.status(500).send('Error loading messages');
    }
});

// Add Message Template Form
router.get('/messages/add', (req, res) => {
    renderAdmin(res, 'admin/add-message', {
        title: 'Add Message Template',
        path: '/messages',
        types: ['PaymentConfirmation', 'DueReminder', 'WeeklyReminder', 'Custom']
    });
});

// Create Message Template
router.post('/messages', upload.single('media'), async (req, res) => {
    try {
        const messageData = {
            name: req.body.name,
            type: req.body.type,
            text: req.body.text,
            owner: req.user._id
        };
        // Use Cloudinary uploaded URL if image attached
        if (req.file) messageData.mediaUrl = req.file.path;
        
        await MessageTemplate.create(messageData);
        res.redirect('/admin/messages');
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).send('A message template with this system type already exists.');
        }
        res.status(500).send('Error adding message template');
    }
});

// ======= WHATSAPP SETTINGS =======

router.get('/whatsapp', (req, res) => {
    renderAdmin(res, 'admin/whatsapp', {
        title: 'WhatsApp Settings',
        path: '/whatsapp'
    });
});

router.get('/whatsapp/status', (req, res) => {
    const whatsappService = require('../utils/whatsappService');
    res.json({
        isReady: whatsappService.whatsappStatus.isReady,
        qr: whatsappService.whatsappStatus.qr,
        enabled: whatsappService.whatsappStatus.enabled,
        phoneNumber: whatsappService.whatsappStatus.phoneNumber,
        lastConnected: whatsappService.whatsappStatus.lastConnected
    });
});

router.post('/whatsapp/disconnect', async (req, res) => {
    const whatsappService = require('../utils/whatsappService');
    await whatsappService.disconnect();
    res.redirect('/admin/whatsapp');
});

router.post('/whatsapp/refresh', async (req, res) => {
    const whatsappService = require('../utils/whatsappService');
    await whatsappService.reconnect();
    res.redirect('/admin/whatsapp');
});

router.post('/whatsapp/toggle-whatsapp', (req, res) => {
    const whatsappService = require('../utils/whatsappService');
    whatsappService.whatsappStatus.enabled = !whatsappService.whatsappStatus.enabled;
    res.redirect('/admin/whatsapp');
});

router.get('/whatsapp/logs', async (req, res) => {
    const MessageLog = require('../models/MessageLog');
    const ownerId = req.user._id;
    const logs = await MessageLog.find({ owner: ownerId }).populate('person').sort({ createdAt: -1 }).limit(200);
    const totalSent = await MessageLog.countDocuments({ owner: ownerId, status: 'Sent' });
    const totalFailed = await MessageLog.countDocuments({ owner: ownerId, status: 'Failed' });
    
    renderAdmin(res, 'admin/message-logs', {
        title: 'Message Logs',
        path: '/whatsapp/logs',
        logs,
        stats: { totalSent, totalFailed }
    });
});

router.post('/whatsapp/bulk', async (req, res) => {
    const { messageText } = req.body;
    if(!messageText) return res.redirect('/admin/whatsapp/logs');

    const whatsappService = require('../utils/whatsappService');
    const Person = require('../models/Person');
    const ownerId = req.user._id;
    
    // Redirect instantly while background blast executes
    res.redirect('/admin/whatsapp/logs');
    
    const people = await Person.find({ owner: ownerId, phone: { $exists: true, $type: "string", $ne: "" } });
    console.log(`🚀 Starting Bulk Announcement to ${people.length} contacts...`);
    
    for (const p of people) {
        if (p.phone && p.phone.trim() !== "") {
            const safeText = messageText.replace(/{{name}}/g, p.name);
            await whatsappService.sendCustomMessage(p.phone, safeText, ownerId, p._id);
            // Delay 1 second to avoid rate limiting
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    console.log('✅ Bulk Announcement Blast Finished');
});

// ======= MESSAGE TEMPLATES =======

// Edit Message Template Form
router.get('/messages/:id/edit', async (req, res) => {
    try {
        const message = await MessageTemplate.findOne({ _id: req.params.id, owner: req.user._id });
        renderAdmin(res, 'admin/edit-message', {
            title: 'Edit Message Template',
            path: '/messages',
            msg: message,
            types: ['PaymentConfirmation', 'DueReminder', 'WeeklyReminder', 'Custom']
        });
    } catch (err) {
        res.status(500).send('Error loading message template');
    }
});

// Update Message Template
router.post('/messages/:id/edit', upload.single('media'), async (req, res) => {
    try {
        const messageData = {
            name: req.body.name,
            type: req.body.type,
            text: req.body.text
        };
        if (req.file) messageData.mediaUrl = req.file.path;

        await MessageTemplate.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, messageData);
        res.redirect('/admin/messages');
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).send('A message template with this system type already exists.');
        }
        res.status(500).send('Error updating message template');
    }
});

// Delete Message Template
router.post('/messages/:id/delete', async (req, res) => {
    try {
        await MessageTemplate.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
        res.redirect('/admin/messages');
    } catch (err) {
        res.status(500).send('Error deleting message template');
    }
});

module.exports = router;
