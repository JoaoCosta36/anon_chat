const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

router.post('/send', async (req, res) => {
  if (!req.session.userId) {
    // Se for chamada AJAX, responde JSON, senão redireciona
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    return res.redirect('/login');
  }

  const { toUser, message } = req.body;

  if (!toUser || !message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Mensagem ou destinatário inválidos' });
  }

  try {
    const fromUser = await User.findById(req.session.userId);
    if (!fromUser) return res.status(401).json({ error: 'Usuário remetente inválido' });

    const recipient = await User.findById(toUser);
    if (!recipient) return res.status(400).json({ error: 'Usuário destinatário inválido' });

    if (fromUser._id.equals(recipient._id)) {
      return res.status(400).json({ error: 'Não pode enviar mensagem para si mesmo' });
    }

    await Message.create({
      fromUser: fromUser._id,
      toUser: recipient._id,
      text: message.trim(),
      read: false,
    });

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.json({ success: true });
    } else {
      return res.redirect('/dashboard');
    }
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;