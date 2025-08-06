// config/db.js
const mongoose = require("mongoose");
require("dotenv").config(); // Load environment variables

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    await mongoose.connect(mongoURI);
    console.log("✅ Connected to MongoDB successfully.");
  } catch (err) {
    console.error("❌ Could not connect to MongoDB:", err.message);
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;
