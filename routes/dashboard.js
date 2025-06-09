const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

// Configuração multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// Página principal do dashboard
router.get('/', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const user = await User.findById(userId).lean();

    if (!user) return res.redirect('/login');

    // Agregação corrigida para incluir mensagens enviadas e recebidas
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
      const fromUser = await User.findById(thread._id).lean();
      const latestMessage = await Message.findById(thread.latestMessageId).lean();
      return { fromUser, latestMessage, unreadCount: thread.unreadCount };
    }));

    const users = await User.find({ _id: { $ne: userId } }).lean();

    res.render('dashboard', {
      username: user.username,
      userId: user._id.toString(),
      users,
      messageThreads: populatedThreads
    });
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
    res.status(500).send('Erro interno');
  }
});

// Página de chat
router.get('/chat/:userId', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const otherUserId = new mongoose.Types.ObjectId(req.params.userId);

    if (userId.equals(otherUserId)) return res.redirect('/dashboard');

    const [user, otherUser] = await Promise.all([
      User.findById(userId).lean(),
      User.findById(otherUserId).lean()
    ]);

    if (!otherUser) return res.redirect('/dashboard');

    await Message.updateMany(
      { fromUser: otherUserId, toUser: userId, read: false },
      { $set: { read: true } }
    );

    const messages = await Message.find({
      $or: [
        { fromUser: userId, toUser: otherUserId },
        { fromUser: otherUserId, toUser: userId }
      ]
    }).sort({ createdAt: 1 }).populate('fromUser').lean();

    res.render('chat', { user, otherUser, messages });
  } catch (err) {
    console.error('Erro ao carregar chat:', err);
    res.status(500).send('Erro interno');
  }
});

// Enviar mensagem (chat) com upload de imagem
router.post('/chat/:userId/send', upload.single('image'), async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');

  try {
    const fromUserId = new mongoose.Types.ObjectId(req.session.userId);
    const toUserId = new mongoose.Types.ObjectId(req.params.userId);
    const { message } = req.body;

    // Aceita mensagem de texto ou imagem (ou ambos)
    if ((!message || !message.trim()) && !req.file) {
      return res.redirect(`/dashboard/chat/${toUserId.toString()}`);
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = '/uploads/' + req.file.filename;
    }

    await Message.create({
      fromUser: fromUserId,
      toUser: toUserId,
      text: message ? message.trim() : '',
      imageUrl,
      read: false
    });

    res.redirect(`/dashboard/chat/${toUserId.toString()}`);
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).send('Erro interno');
  }
});

// Enviar mensagem via AJAX (sem imagens)
router.post('/send', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });

  try {
    const fromUserId = new mongoose.Types.ObjectId(req.session.userId);
    const { toUser, message } = req.body;

    if (!message?.trim() || !toUser || fromUserId.equals(toUser)) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }

    await Message.create({
      fromUser: fromUserId,
      toUser: new mongoose.Types.ObjectId(toUser),
      text: message.trim(),
      read: false
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// API para threads de mensagens
router.get('/api/threads', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });

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
      const fromUser = await User.findById(thread._id).lean();
      const latestMessage = await Message.findById(thread.latestMessageId).lean();
      return { fromUser, latestMessage, unreadCount: thread.unreadCount };
    }));

    res.json(populatedThreads);
  } catch (err) {
    console.error('Erro ao buscar threads:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API para carregar mensagens da conversa em JSON
router.get('/api/chat/:userId/messages', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });

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

module.exports = router;