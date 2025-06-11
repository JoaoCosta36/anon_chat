const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

// Multer config para upload
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

// Middleware de autenticação
function ensureAuth(req, res, next) {
  if (!req.session?.userId) return res.redirect('/login');
  next();
}

// Dashboard principal
router.get('/', ensureAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const user = await User.findById(userId).lean();
    if (!user) return res.redirect('/login');

    const users = await User.find({ _id: { $ne: userId } }).lean();

    const threads = await Message.aggregate([
      {
        $match: {
          $or: [{ toUser: userId }, { fromUser: userId }]
        }
      },
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
                {
                  $and: [
                    { $eq: ['$toUser', userId] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const messageThreads = await Promise.all(threads.map(async (thread) => {
      const otherUser = await User.findById(thread._id).lean();
      const latestMessage = await Message.findById(thread.latestMessageId).lean();
      return { fromUser: otherUser, latestMessage, unreadCount: thread.unreadCount };
    }));

    res.render('dashboard', {
      username: user.username,
      userId: user._id.toString(),
      users,
      messageThreads
    });
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
    res.status(500).send('Erro interno');
  }
});

// Pesquisa de utilizadores
router.get('/api/users', ensureAuth, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.json([]);

    const userId = new mongoose.Types.ObjectId(req.session.userId);

    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: userId }
    }).limit(10).select('_id username').lean();

    res.json(users);
  } catch (err) {
    console.error('Erro ao pesquisar usuários:', err);
    res.status(500).json({ error: 'Erro ao pesquisar utilizadores.' });
  }
});

// Página de chat
router.get('/chat/:userId', ensureAuth, async (req, res) => {
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

// Enviar mensagem com imagem (formulário)
router.post('/chat/:userId/send', ensureAuth, upload.single('image'), async (req, res) => {
  try {
    const fromUserId = new mongoose.Types.ObjectId(req.session.userId);
    const toUserId = new mongoose.Types.ObjectId(req.params.userId);
    const { message } = req.body;

    if ((!message || !message.trim()) && !req.file) {
      return res.redirect(`/dashboard/chat/${toUserId}`);
    }

    let imageUrl = null;
    if (req.file) imageUrl = '/uploads/' + req.file.filename;

    await Message.create({
      fromUser: fromUserId,
      toUser: toUserId,
      text: message ? message.trim() : '',
      imageUrl,
      read: false
    });

    res.redirect(`/dashboard/chat/${toUserId}`);
  } catch (err) {
    console.error('Erro ao enviar mensagem com imagem:', err);
    res.status(500).send('Erro interno');
  }
});

// ✅ Enviar mensagem via AJAX
router.post('/send', ensureAuth, async (req, res) => {
  try {
    const fromUserId = new mongoose.Types.ObjectId(req.session.userId);
    const { toUser, message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem inválida.' });
    }

    if (!toUser || !mongoose.Types.ObjectId.isValid(toUser)) {
      return res.status(400).json({ error: 'Destinatário inválido.' });
    }

    const toUserId = new mongoose.Types.ObjectId(toUser);

    if (fromUserId.equals(toUserId)) {
      return res.status(400).json({ error: 'Não pode enviar mensagem para si mesmo.' });
    }

    await Message.create({
      fromUser: fromUserId,
      toUser: toUserId,
      text: message.trim(),
      read: false
    });

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao enviar mensagem (AJAX):', err);
    res.status(500).json({ error: 'Erro interno ao enviar mensagem.' });
  }
});

// Threads de conversa
router.get('/api/threads', ensureAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);

    const threads = await Message.aggregate([
      {
        $match: {
          $or: [{ toUser: userId }, { fromUser: userId }]
        }
      },
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
                {
                  $and: [
                    { $eq: ['$toUser', userId] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const populatedThreads = await Promise.all(threads.map(async (thread) => {
      const otherUser = await User.findById(thread._id).lean();
      const latestMessage = await Message.findById(thread.latestMessageId).lean();
      return { fromUser: otherUser, latestMessage, unreadCount: thread.unreadCount };
    }));

    res.json(populatedThreads);
  } catch (err) {
    console.error('Erro ao buscar threads:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API: mensagens da conversa
router.get('/api/chat/:userId/messages', ensureAuth, async (req, res) => {
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