const Project = require('../models/Project');
const Skill = require('../models/Skill');
const Experience = require('../models/Experience');
const Testimonial = require('../models/Testimonial');
const SiteConfig = require('../models/SiteConfig');
const HeroSection = require('../models/HeroSection');
const Education = require('../models/Education');
const redisClient = require('../config/redis');

const adminHelpers = {
    // --- Projects ---
    createProject: async (data) => {
        const project = await Project.create(data);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:projects');
                await redisClient.del('user:home');
                await redisClient.del('user:projects');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return project;
    },

    updateProject: async (id, data) => {
        const project = await Project.findByIdAndUpdate(id, data, { new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:projects');
                await redisClient.del('user:home');
                await redisClient.del('user:projects');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return project;
    },

    deleteProject: async (id) => {
        const project = await Project.findByIdAndDelete(id);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:projects');
                await redisClient.del('user:home');
                await redisClient.del('user:projects');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return project;
    },

    // --- Skills ---
    createSkill: async (data) => {
        const skill = await Skill.create(data);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:skills');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return skill;
    },

    updateSkill: async (id, data) => {
        const skill = await Skill.findByIdAndUpdate(id, data, { new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:skills');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return skill;
    },

    deleteSkill: async (id) => {
        const skill = await Skill.findByIdAndDelete(id);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:skills');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return skill;
    },

    // --- Experience ---
    createExperience: async (data) => {
        const experience = await Experience.create(data);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:experience');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return experience;
    },

    updateExperience: async (id, data) => {
        const experience = await Experience.findByIdAndUpdate(id, data, { new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:experience');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return experience;
    },

    deleteExperience: async (id) => {
        const experience = await Experience.findByIdAndDelete(id);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:experience');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return experience;
    },

    // --- Testimonials ---
    createTestimonial: async (data) => {
        const testimonial = await Testimonial.create(data);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:testimonials');
                await redisClient.del('user:home');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return testimonial;
    },

    updateTestimonial: async (id, data) => {
        const testimonial = await Testimonial.findByIdAndUpdate(id, data, { new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:testimonials');
                await redisClient.del('user:home');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return testimonial;
    },

    deleteTestimonial: async (id) => {
        const testimonial = await Testimonial.findByIdAndDelete(id);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:testimonials');
                await redisClient.del('user:home');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return testimonial;
    },

    // --- Config ---
    updateConfig: async (data) => {
        const config = await SiteConfig.findOneAndUpdate({}, data, { upsert: true, new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:config');
                await redisClient.del('user:home');
                await redisClient.del('user:projects');
                await redisClient.del('user:resume');
                await redisClient.del('user:contact');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return config;
    },

    // --- Hero ---
    updateHero: async (data) => {
        const hero = await HeroSection.findOneAndUpdate({}, data, { upsert: true, new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:hero');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return hero;
    },

    // --- Education ---
    createEducation: async (data) => {
        const education = await Education.create(data);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:education');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return education;
    },

    updateEducation: async (id, data) => {
        const education = await Education.findByIdAndUpdate(id, data, { new: true });

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:education');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return education;
    },

    deleteEducation: async (id) => {
        const education = await Education.findByIdAndDelete(id);

        // Clear Cache (with error handling)
        try {
            if (redisClient.isReady) {
                await redisClient.del('admin:dashboard');
                await redisClient.del('admin:education');
                await redisClient.del('user:home');
                await redisClient.del('user:resume');
            }
        } catch (err) {
            console.log('Redis cache clear error:', err.message);
        }
        return education;
    }
};

module.exports = adminHelpers;
