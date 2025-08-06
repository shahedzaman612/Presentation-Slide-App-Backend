// routes/presentations.js

const express = require('express');
const router = express.Router();
const Presentation = require('../models/Presentation');
const Slide = require('../models/Slide');

// GET a specific presentation and its slides
// This is the primary endpoint for the frontend to load a presentation.
router.get('/:id', async (req, res) => {
    try {
        const presentation = await Presentation.findById(req.params.id);
        if (!presentation) {
            return res.status(404).send('Presentation not found.');
        }

        const slides = await Slide.find({ presentationId: req.params.id }).sort('slideNumber');
        res.send({ presentation, slides });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// POST to create a new presentation
router.post('/', async (req, res) => {
    try {
        const presentation = new Presentation(req.body);
        await presentation.save();
        
        // When a new presentation is created, also create the first slide
        const firstSlide = new Slide({
            presentationId: presentation._id,
            slideNumber: 1
        });
        await firstSlide.save();
        
        res.status(201).send({ presentation, slides: [firstSlide] });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// POST to add a new slide to an existing presentation
router.post('/:id/slides', async (req, res) => {
    try {
        const presentation = await Presentation.findById(req.params.id);
        if (!presentation) {
            return res.status(404).send('Presentation not found.');
        }

        const slideCount = await Slide.countDocuments({ presentationId: req.params.id });
        const newSlide = new Slide({
            presentationId: presentation._id,
            slideNumber: slideCount + 1
        });
        await newSlide.save();

        res.status(201).send(newSlide);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// DELETE a specific slide
router.delete('/:id/slides/:slideId', async (req, res) => {
    try {
        const deletedSlide = await Slide.findOneAndDelete({ _id: req.params.slideId, presentationId: req.params.id });
        if (!deletedSlide) {
            return res.status(404).send('Slide not found.');
        }
        res.status(200).send({ message: 'Slide deleted successfully.' });
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// TODO: We will add the WebSocket update logic for elements later.
// For now, this gives you the basic CRUD functionality for presentations and slides.

module.exports = router;