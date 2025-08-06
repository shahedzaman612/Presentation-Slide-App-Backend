// config/db.js

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = 'mongodb://localhost:27017/presentations_db';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB successfully.');
  } catch (err) {
    console.error('❌ Could not connect to MongoDB:', err.message);
    // Exit process with failure
    process.exit(1); 
  }
};

module.exports = connectDB;