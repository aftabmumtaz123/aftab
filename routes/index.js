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

        // Render without the main layout, as it's a standalone print view
        res.render('resume-print', {
            layout: false,
            config,
            experience,
            skills,
            education,
            hero
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
    const nodemailer = require('nodemailer');

    try {
        // Create transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail', // or your preferred service
            auth: {
                user: process.env.EMAIL_USER, // Add these to .env
                pass: process.env.EMAIL_PASS
            }
        });

        // Email options
        const mailOptions = {
            from: email,
            to: process.env.EMAIL_USER, // Send to yourself
            subject: `Portfolio Contact: ${subject}`,
            text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`
        };

        // Send email
        await transporter.sendMail(mailOptions);

        // Redirect with success message (you might want to add flash messages later)
        // For now, just redirect back to contact
        res.redirect('/contact?success=true');
    } catch (err) {
        console.error('Email Error:', err);
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
