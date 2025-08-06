// models/Presentation.js

const mongoose = require('mongoose');

// Define the schema for a Presentation
const PresentationSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'Untitled Presentation'
    },
    creatorId: {
        type: String, // Store the user's nickname as an ID for now
        default: 'anonymous'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Presentation', PresentationSchema);