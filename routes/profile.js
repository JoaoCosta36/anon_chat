const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Message = require('../models/Message');

// Visualizar perfil pelo username
router.get('/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).send('Usuário não encontrado');

    res.render('profile', { username: user.username, sent: req.query.sent });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).send('Erro interno');
  }
});

// Enviar mensagem para o usuário do perfil
router.post('/:username/send', async (req, res) => {
  try {
    if (!req.session.userId) return res.redirect('/login');

    const toUser = await User.findOne({ username: req.params.username });
    if (!toUser) return res.status(404).send('Usuário destinatário não encontrado');

    // Aqui assumimos que a mensagem vem no body como 'message'
    const { message } = req.body;
    if (!message) return res.status(400).send('Mensagem vazia');

    await Message.create({
      fromUser: req.session.userId,
      toUser: toUser._id,
      text: message,
      read: false,
    });

    res.redirect(`/u/${toUser.username}?sent=true`);
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    res.status(500).send('Erro interno');
  }
});

module.exports = router;