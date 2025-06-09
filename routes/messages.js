const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');

// Middleware para checar sessão
function ensureAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  res.redirect('/login');
}

// Enviar mensagem via AJAX (sem imagens)
router.post('/send', ensureAuthenticated, async (req, res) => {
  const fromUserId = req.session.userId;
  const { toUser, message } = req.body;

  if (!toUser || !message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Mensagem ou destinatário inválidos' });
  }

  if (fromUserId === toUser) {
    return res.status(400).json({ error: 'Não pode enviar mensagem para si mesmo' });
  }

  try {
    const fromUser = await User.findById(fromUserId);
    if (!fromUser) return res.status(401).json({ error: 'Usuário remetente inválido' });

    const recipient = await User.findById(toUser);
    if (!recipient) return res.status(400).json({ error: 'Usuário destinatário inválido' });

    await Message.create({
      fromUser: fromUser._id,
      toUser: recipient._id,
      text: message.trim(),
      read: false,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Obter threads de mensagens (resumo)
router.get('/threads', ensureAuthenticated, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);

    const threads = await Message.aggregate([
      { $match: { $or: [{ toUser: userId }, { fromUser: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$fromUser', userId] },
              '$toUser',
              '$fromUser'
            ]
          },
          latestMessageId: { $first: '$_id' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$toUser', userId] }, { $eq: ['$read', false] }] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const populatedThreads = await Promise.all(threads.map(async thread => {
      const user = await User.findById(thread._id).lean();
      const latestMessage = await Message.findById(thread.latestMessageId).lean();
      return { user, latestMessage, unreadCount: thread.unreadCount };
    }));

    res.json(populatedThreads);
  } catch (err) {
    console.error('Erro ao obter threads:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Obter mensagens de uma conversa específica
router.get('/chat/:userId/messages', ensureAuthenticated, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const otherUserId = new mongoose.Types.ObjectId(req.params.userId);

    const messages = await Message.find({
      $or: [
        { fromUser: userId, toUser: otherUserId },
        { fromUser: otherUserId, toUser: userId }
      ]
    }).sort({ createdAt: 1 }).populate('fromUser').lean();

    res.json(messages);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Marcar mensagens como lidas
router.post('/chat/:userId/read', ensureAuthenticated, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const otherUserId = new mongoose.Types.ObjectId(req.params.userId);

    await Message.updateMany(
      { fromUser: otherUserId, toUser: userId, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao marcar mensagens como lidas:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;