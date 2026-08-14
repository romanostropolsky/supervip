const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ==========================================
// МАРШРУТИ API (Усі модулі з папки src/routes)
// ==========================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/routes', require('./routes/cities')); // Для сумісності з фронтендом
app.use('/api/config', require('./routes/config'));
app.use('/api/dispatchers', require('./routes/dispatchers'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reports', require('./routes/reports'));

// ==========================================
// ЗАПУСК TELEGRAM БОТА (Слухач кнопок)
// ==========================================
try {
  const botModule = require('./telegramBot');
  
  // Якщо модуль експортує безпосередньо об'єкт бота Telegraf
  if (botModule && typeof botModule.launch === 'function') {
    botModule.launch()
      .then(() => console.log('🤖 Telegram бот успішно запущений і слухає кнопки!'))
      .catch((err) => console.error('❌ Помилка запуску бота:', err.message));
  } else {
    console.log('🤖 Telegram бот підключений');
  }
} catch (err) {
  console.log('⚠️ Помилка завантаження telegramBot.js:', err.message);
}

// Головна сторінка (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==========================================
// БЛОК ЗАПУСКУ СЕРВЕРА ТА ОБРОБКИ ПОМИЛОК
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Сервер успішно запущено на порту ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('❌ КРИТИЧНА ПОМИЛКА (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ НЕОБРОБЛЕНИЙ PROMISE (unhandledRejection):', reason);
});
