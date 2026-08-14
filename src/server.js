const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Імпорт ваших модулів (підлаштовано під стандартну структуру розробника)
const db = require('./db');
const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/drivers');
const routeRoutes = require('./routes/routes');
const orderRoutes = require('./routes/orders');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Маршрути API
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/orders', orderRoutes);

// Головна сторінка
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ==========================================
// БЛОК ЗАПУСКУ СЕРВЕРА ТА ДІАГНОСТИКИ ПОМИЛОК
// ==========================================
const PORT = process.env.PORT || 3000;

// Відкриваємо порт відразу, щоб Render не видавав "No open ports detected"
const server = app.listen(PORT, () => {
  console.log(`✅ Сервер успішно запущено на порту ${PORT}`);
});

// Перехоплення критичних помилок під час виконання
process.on('uncaughtException', (err) => {
  console.error('❌ КРИТИЧНА ПОМИЛКА (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ НЕОБРОБЛЕНИЙ PROMISE (Unhandled Rejection):', reason);
});
