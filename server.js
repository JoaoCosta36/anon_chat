require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');

const app = express();

// Ativa confiança no proxy (necessário em produção com HTTPS e reverse proxy como Nginx/Render/etc)
app.set('trust proxy', 1);

// Conexão com o banco de dados
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado ao MongoDB'))
.catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Motor de views (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Sessão segura com MongoDB Store
app.use(session({
  secret: process.env.SESSION_SECRET || 'defaultsecret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 dia
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS em produção
    sameSite: 'lax'
  }
}));

// Torna a sessão acessível nas views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Rotas
app.use('/', require('./routes/auth'));
app.use('/u', require('./routes/profile'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/messages', require('./routes/messages'));

// Página 404
app.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl });
});

// Inicia o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http${process.env.NODE_ENV === 'production' ? 's' : ''}://localhost:${PORT}`);
});