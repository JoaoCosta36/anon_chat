const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    minlength: 3,
    trim: true,
    lowercase: true // para evitar duplicatas tipo "User" e "user"
  },
  password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Índice único para garantir unicidade de username com lowercase
userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);