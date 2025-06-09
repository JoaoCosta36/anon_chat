const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { 
    type: String, 
    required: function() { return !this.imageUrl; }, 
    trim: true 
  }, // texto obrigatório se não houver imagem
  imageUrl: { type: String, default: null }, // URL opcional de imagem
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Índices para otimizar buscas por conversas e mensagens não lidas
MessageSchema.index({ fromUser: 1, toUser: 1, createdAt: -1 });
MessageSchema.index({ toUser: 1, read: 1 });

module.exports = mongoose.model('Message', MessageSchema);