const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Middleware opcional para redirecionar se já estiver autenticado
function redirectIfAuthenticated(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}

// Página inicial
router.get('/', redirectIfAuthenticated, (req, res) => {
  res.redirect('/login');
});

// Página de registro
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register');
});

// Registro - POST
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
    res.status(500).send('Erro interno ao registrar');
  }
});

// Página de login
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login');
});

// Login - POST
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

    req.session.userId = user._id.toString();
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).send('Erro interno ao autenticar');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Erro ao encerrar sessão:', err);
      return res.status(500).send('Erro interno ao fazer logout');
    }
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;