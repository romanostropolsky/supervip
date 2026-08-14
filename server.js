const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { pool } = require('./db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Автоматичне додавання нових колонок у базу даних при старті сервера
pool.query(`
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS passenger_name TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS passenger_phone TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_time TEXT;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS arrival_time TEXT;
`).catch(err => console.log('DB columns check:', err.message));

// ==========================================
// МАРШРУТИ API
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
// ЗАПУСК TELEGRAM БОТА (Обробка кнопок)
// ==========================================
try {
  const { bot, botEnabled } = require('./telegramBot');

  if (botEnabled && bot) {
    bot.launch()
      .then(() => console.log('🤖 Telegram бот успішно запущено! Обробка кнопок працює.'))
      .catch((err) => console.error('❌ Помилка запуску Telegram бота:', err.message));
  } else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN не вказано у Render Environment, бот вимкнений.');
  }
} catch (err) {
  console.error('⚠️ Помилка ініціалізації telegramBot.js:', err.message);
}

// Головна сторінка (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==========================================
// БЛОК ЗАПУСКУ СЕРВЕРА
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Сервер успішно запущено на порту ${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('❌ ПОМИЛКА (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ ПОМИЛКА (unhandledRejection):', reason);
});