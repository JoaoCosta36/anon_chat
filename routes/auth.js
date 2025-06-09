const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Rota raiz: redireciona para login ou dashboard
router.get('/', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

// Registro
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register');
});

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).send('Preencha todos os campos');
    }

    const existingUser = await User.findOne({ username: username.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).send('Nome de usuário já existe');
    }

    const hash = await bcrypt.hash(password, 10);

    await User.create({ username: username.toLowerCase().trim(), password: hash });
    res.redirect('/login');
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).send('Erro interno');
  }
});

// Login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login');
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).send('Preencha todos os campos');
    }

    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      return res.status(400).send('Credenciais inválidas');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).send('Credenciais inválidas');
    }

    req.session.userId = user._id.toString(); // Garantir string para evitar problemas
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).send('Erro interno');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erro ao destruir sessão:', err);
      return res.status(500).send('Erro interno');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;