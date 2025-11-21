const express = require('express');
const router = express.Router();
const SiteConfig = require('../models/SiteConfig');
const Service = require('../models/Service');
const Project = require('../models/Project');
const Skill = require('../models/Skill');
const Experience = require('../models/Experience');
const Testimonial = require('../models/Testimonial');
const HeroSection = require('../models/HeroSection');
const upload = require('../middleware/uploadMiddleware');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

// Helper to render with layout
const renderAdmin = (res, view, data) => {
    res.render(view, { layout: 'layouts/adminLayout', ...data });
};

// Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const projectCount = await Project.countDocuments();
        const skillCount = await Skill.countDocuments();
        const experienceCount = await Experience.countDocuments();
        const testimonialCount = await Testimonial.countDocuments();
        let config = await SiteConfig.findOne();

        const recentProjects = await Project.find().sort({ _id: -1 }).limit(5);
        const recentSkills = await Skill.find().sort({ _id: -1 }).limit(5);

        renderAdmin(res, 'admin/dashboard', {
            title: 'Dashboard',
            path: '/dashboard',
            stats: { projectCount, skillCount, experienceCount, testimonialCount, views: config ? config.views : 0 },
            recentProjects,
            recentSkills
        });
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
        await HeroSection.findOneAndUpdate({}, updateData, { upsert: true });
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
        await Skill.create(req.body);
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
        await Skill.findByIdAndDelete(req.params.id);
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
        res.status(500).send('Error fetching skill');
    }
});

router.post('/skills/:id/edit', async (req, res) => {
    try {
        await Skill.findByIdAndUpdate(req.params.id, req.body);
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
        await Experience.create(req.body);
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
        await Experience.findByIdAndDelete(req.params.id);
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
        res.status(500).send('Error fetching experience');
    }
});

router.post('/experience/:id/edit', async (req, res) => {
    try {
        req.body.current = !!req.body.current;
        await Experience.findByIdAndUpdate(req.params.id, req.body);
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

        await Project.create(projectData);
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
        await Project.findByIdAndDelete(req.params.id);
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

        await Project.findByIdAndUpdate(req.params.id, projectData);
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
        await Testimonial.create(data);
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
        await Testimonial.findByIdAndDelete(req.params.id);
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
        res.status(500).send('Error fetching testimonial');
    }
});

router.post('/testimonials/:id/edit', upload.single('photo'), async (req, res) => {
    try {
        const data = req.body;
        if (req.file) data.photoUrl = req.file.path;
        await Testimonial.findByIdAndUpdate(req.params.id, data);
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
        await SiteConfig.findOneAndUpdate({}, updateData, { upsert: true });
        res.redirect('/admin/config');
    } catch (err) {
        res.status(500).send('Error updating config');
    }
});

module.exports = router;
