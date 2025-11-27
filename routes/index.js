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

// Helper to render with user layout
const renderUser = (res, view, data) => {
    res.render(view, { layout: 'layouts/userLayout', ...data });
};

// Home Page
// Middleware to check DB connection for all public routes
router.use((req, res, next) => {
    if (req.method === 'GET' && require('mongoose').connection.readyState !== 1) {
        // If it's the home page, we might want to try to render it if possible, 
        // but it relies on DB for projects, skills etc.
        // So yes, offline page is appropriate if DB is down.
        return res.status(503).render('offline', { layout: false });
    }
    next();
});

// Offline Page (for Service Worker)
router.get('/offline', (req, res) => {
    res.render('offline', { layout: false });
});

router.get('/', async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        if (!config) config = new SiteConfig();

        // Increment Site Views
        config.views += 1;
        await config.save();

        let hero = await HeroSection.findOne();
        if (!hero) {
            hero = {
                title: 'Welcome',
                subtitle: 'To My Portfolio',
                description: 'I am a passionate developer.',
                resumeLink: '',
                backgroundImage: ''
            };
        }
        const services = await Service.find();
        const projects = await Project.find().limit(6); // Featured projects
        const skills = await Skill.find().sort({ level: -1 });
        const testimonials = await Testimonial.find();
        const experience = await Experience.find().sort({ startDate: -1 });
        const education = await Education.find().sort({ startDate: -1 });

        renderUser(res, 'index', {
            title: config.homeTitle,
            config,
            hero,
            services,
            projects,
            skills,
            testimonials,
            experience,
            education
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Projects Page
router.get('/projects', async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        const projects = await Project.find();
        renderUser(res, 'projects', { title: 'Projects', config, projects });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Resume Page
router.get('/resume', async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        const experience = await Experience.find().sort({ startDate: -1 });
        const skills = await Skill.find().sort({ level: -1 });
        const education = await Education.find().sort({ startDate: -1 });
        const hero = await HeroSection.findOne(); // For resume link
        renderUser(res, 'resume', { title: 'Resume', config, experience, skills, education, hero });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Print Resume Page
router.get('/resume/print', async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        const experience = await Experience.find().sort({ startDate: -1 });
        const skills = await Skill.find().sort({ level: -1 });
        const education = await Education.find().sort({ startDate: -1 });
        const hero = await HeroSection.findOne();
        const projects = await Project.find().sort({ createdAt: -1 }); // Fetch projects

        // Render without the main layout, as it's a standalone print view
        res.render('resume-print', {
            layout: false,
            config,
            experience,
            skills,
            education,
            hero,
            projects // Pass projects to view
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Contact Page
router.get('/contact', async (req, res) => {
    try {
        let config = await SiteConfig.findOne();
        renderUser(res, 'contact', { title: 'Contact Me', config });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Handle Contact Form Submit
router.post('/contact', async (req, res) => {
    const { name, email, subject, message } = req.body;
    const Contact = require('../models/Contact'); // Import Contact model
    const notificationService = require('../utils/notificationService');

    try {
        // Save to Database
        await Contact.create({ name, email, subject, message });

        // 1. Send Email to Admin (You)
        const adminSubject = `Portfolio Contact: ${subject}`;
        const adminHtml = `
            <h3>New Message from ${name}</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <blockquote style="border-left: 4px solid #eee; padding-left: 10px; color: #555;">
                ${message.replace(/\n/g, '<br>')}
            </blockquote>
        `;
        await notificationService.sendEmail(process.env.EMAIL_USER, adminSubject, adminHtml);

        // 2. Send Push Notification + In-App Notification to Admin
        await notificationService.createNotification({
            title: `New Message from ${name}`,
            message: subject || 'No subject',
            type: 'info',
            link: '/admin/contacts'
        });

        // Redirect with success message
        res.redirect('/contact?success=true');
    } catch (err) {
        console.error('Contact Error:', err);
        res.redirect('/contact?error=true');
    }
});

// Track Project Click
router.get('/track/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        if (project) {
            project.clicks += 1;
            await project.save();
            if (project.liveLink) {
                return res.redirect(project.liveLink);
            }
        }
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

module.exports = router;
