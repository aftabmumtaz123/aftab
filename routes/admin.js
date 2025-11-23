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
const { requireAuth } = require('../middleware/authMiddleware');
const adminHelpers = require('../utils/adminHelpers');

router.use(requireAuth);

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

        const data = {
            title: 'Dashboard',
            path: '/dashboard',
            stats: { projectCount, skillCount, experienceCount, testimonialCount, views: config ? config.views : 0 },
            recentProjects,
            recentSkills,
            topProjects
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

module.exports = router;
