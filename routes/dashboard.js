const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${unique}${ext}`);
  }
});
const upload = multer({ storage });

// Middleware de autenticação simples
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

    // Obter threads recentes e contagem de não lidas em agregação
    const threads = await Message.aggregate([
      { $match: { $or: [{ toUser: userId }, { fromUser: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$fromUser', userId] }, '$toUser', '$fromUser']
          },
          latestMessageId: { $first: '$_id' },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$toUser', userId] }, { $eq: ['$read', false] }] }, 1, 0]
            }
          }
        }
      }
    ]);

    const messageThreads = await Promise.all(threads.map(async (thread) => {
      const otherUser = await User.findById(thread._id).lean();
      const latestMessage = await Message.findById(thread.latestMessageId).lean();
      return {
        fromUser: {
          _id: otherUser._id.toString(),
          username: otherUser.username
        },
        latestMessage,
        unreadCount: thread.unreadCount
      };
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

// Pesquisa de utilizadores para autocomplete
router.get('/api/users', ensureAuth, async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) return res.json([]);

    const userId = new mongoose.Types.ObjectId(req.session.userId);

    const users = await User.find({
      username: { $regex: query, $options: 'i' },
      _id: { $ne: userId }
    }).limit(10).select('_id username').lean();

    res.json(users.map(u => ({
      _id: u._id.toString(),
      username: u.username
    })));
  } catch (err) {
    console.error('Erro ao pesquisar utilizadores:', err);
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

    // Marca mensagens como lidas
    await Message.updateMany(
      { fromUser: otherUserId, toUser: userId, read: false },
      { $set: { read: true } }
    );

    const messages = await Message.find({
      $or: [
        { fromUser: userId, toUser: otherUserId },
        { fromUser: otherUserId, toUser: userId }
      ]
    }).sort({ createdAt: 1 }).populate('fromUser', '_id username').lean();

    res.render('chat', { user, otherUser, messages });
  } catch (err) {
    console.error('Erro ao carregar chat:', err);
    res.status(500).send('Erro interno');
  }
});

// Enviar mensagem com imagem (formulário padrão)
router.post('/chat/:userId/send', ensureAuth, upload.single('image'), async (req, res) => {
  try {
    const fromUserId = new mongoose.Types.ObjectId(req.session.userId);
    const toUserId = new mongoose.Types.ObjectId(req.params.userId);
    const { message } = req.body;

    if ((!message || !message.trim()) && !req.file) {
      return res.redirect(`/dashboard/chat/${toUserId}`);
    }

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await Message.create({
      fromUser: fromUserId,
      toUser: toUserId,
      text: message?.trim() || '',
      imageUrl,
      read: false
    });

    res.redirect(`/dashboard/chat/${toUserId}`);
  } catch (err) {
    console.error('Erro ao enviar mensagem com imagem:', err);
    res.status(500).send('Erro interno');
  }
});

// Enviar mensagem via AJAX (sem imagem)
router.post('/send', ensureAuth, async (req, res) => {
  try {
    const fromUserId = new mongoose.Types.ObjectId(req.session.userId);
    const { toUser, message } = req.body;

    if (!message?.trim()) {
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
    console.error('Erro ao enviar mensagem (AJAX):', err);
    res.status(500).json({ error: 'Erro interno ao enviar mensagem.' });
  }
});

// API: Threads de mensagens
router.get('/api/threads', ensureAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);

    const threads = await Message.aggregate([
      { $match: { $or: [{ toUser: userId }, { fromUser: userId }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ['$fromUser', userId] }, '$toUser', '$fromUser']
          },
          latestMessageId: { $first: '$_id' },
          unreadCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$toUser', userId] }, { $eq: ['$read', false] }] }, 1, 0]
            }
          }
        }
      }
    ]);

    const response = await Promise.all(threads.map(async (thread) => {
      const user = await User.findById(thread._id).lean();
      const latest = await Message.findById(thread.latestMessageId).lean();

      return {
        fromUser: {
          _id: user._id.toString(),
          username: user.username
        },
        latestMessage: {
          _id: latest._id.toString(),
          text: latest.text,
          createdAt: latest.createdAt
        },
        unreadCount: thread.unreadCount
      };
    }));

    res.json(response);
  } catch (err) {
    console.error('Erro ao buscar threads:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API: Mensagens de uma conversa (AJAX)
router.get('/api/chat/:userId/messages', ensureAuth, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.session.userId);
    const otherUserId = new mongoose.Types.ObjectId(req.params.userId);

    // Busca mensagens entre utilizadores com dados populados (username)
    const messages = await Message.find({
      $or: [
        { fromUser: userId, toUser: otherUserId },
        { fromUser: otherUserId, toUser: userId }
      ]
    })
    .sort({ createdAt: 1 })
    .populate('fromUser', '_id username')
    .lean();

    // Retorna dados mais leves, formatados para frontend
    const result = messages.map(msg => ({
      _id: msg._id.toString(),
      fromUser: {
        _id: msg.fromUser._id.toString(),
        username: msg.fromUser.username
      },
      text: msg.text,
      imageUrl: msg.imageUrl,
      createdAt: msg.createdAt
    }));

    res.json(result);
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;