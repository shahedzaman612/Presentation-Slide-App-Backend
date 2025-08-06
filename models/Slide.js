// models/Slide.js

const mongoose = require('mongoose');

// Define the schema for a Slide
const SlideSchema = new mongoose.Schema({
    presentationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Presentation', // Reference to the Presentation model
        required: true
    },
    slideNumber: {
        type: Number,
        required: true
    },
    elements: {
        type: Array, // A flexible array to hold all different types of elements
        default: []
    }
});

module.exports = mongoose.model('Slide', SlideSchema);