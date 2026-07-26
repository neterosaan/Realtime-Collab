const mongoose = require('mongoose');



async function connectToMongoDB() {
  const mongoURI = `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}?authSource=admin`;
  try {
    await mongoose.connect(mongoURI);
    console.log('✅ Successfully connected to MongoDB.');
  } catch (error) {
    console.error('❌ Could not connect to MongoDB:', error);
    process.exit(1);
  }
}

module.exports = connectToMongoDB;
