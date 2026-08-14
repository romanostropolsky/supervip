const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Підключення всіх маршрутів з папки src/routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/cities', require('./routes/cities'));
app.use('/api/routes', require('./routes/cities')); // Для сумісності, якщо фронтенд звертається до /api/routes
app.use('/api/config', require('./routes/config'));
app.use('/api/dispatchers', require('./routes/dispatchers'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/reports', require('./routes/reports'));

// Запуск Telegram бота (якщо файл присутній)
try {
  require('./telegramBot');
  console.log('🤖 Telegram бот ініціалізовано');
} catch (err) {
  console.log('⚠️ Telegram бот не запущено або виникла помилка:', err.message);
}

// Головна сторінка
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
