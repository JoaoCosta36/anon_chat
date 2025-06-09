const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

// Middleware para garantir que o usuário está autenticado
router.use((req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
});

// Página do chat entre o usuário logado e outro usuário
router.get('/:userId', async (req, res) => {
  try {
    const userId = req.session.userId;
    const otherUserId = req.params.userId;

    if (userId === otherUserId) {
      return res.redirect('/dashboard');
    }

    const user = await User.findById(userId).lean();
    const otherUser = await User.findById(otherUserId).lean();

    if (!otherUser) {
      return res.redirect('/dashboard');
    }

    // Marca mensagens recebidas do otherUser como lidas
    await Message.updateMany(
      { fromUser: otherUserId, toUser: userId, read: false },
      { $set: { read: true } }
    );

    // Busca todas as mensagens trocadas entre os dois usuários, ordenadas cronologicamente
    const messages = await Message.find({
      $or: [
        { fromUser: userId, toUser: otherUserId },
        { fromUser: otherUserId, toUser: userId }
      ]
    }).sort({ createdAt: 1 }).populate('fromUser', 'username');

    res.render('chat', {
      user,
      otherUser,
      messages
    });
  } catch (err) {
    console.error('Erro ao carregar chat:', err);
    res.status(500).send('Erro interno');
  }
});

// Enviar mensagem pelo chat (form clássico)
router.post('/:userId/send', async (req, res) => {
  try {
    const fromUserId = req.session.userId;
    const toUserId = req.params.userId;
    const { message } = req.body;

    if (!message || fromUserId === toUserId) {
      return res.redirect(`/chat/${toUserId}`);
    }

    await Message.create({
      fromUser: fromUserId,
      toUser: toUserId,
      text: message,
      read: false
    });

    res.redirect(`/chat/${toUserId}`);
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).send('Erro interno');
  }
});

module.exports = router;