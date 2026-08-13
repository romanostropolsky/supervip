require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { initSchema } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const { bot } = require('./telegramBot');

const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const driverRoutes = require('./routes/drivers');
const orderRoutes = require('./routes/orders');
const reportRoutes = require('./routes/reports');
const dispatcherRoutes = require('./routes/dispatchers');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/config', requireAuth, configRoutes);
app.use('/api/drivers', requireAuth, driverRoutes);
app.use('/api/orders', requireAuth, orderRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/dispatchers', requireAuth, requireAdmin, dispatcherRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

async function main() {
  await initSchema();
  bot.launch()
    .then(() => console.log('Telegram-бот запущено'))
    .catch(err => console.error('Помилка бота:', err.message));
exec('node createDispatcher.js admin admin123 admin', { cwd: __dirname }, (err, stdout) => {
    if (err) console.log('Create admin note:', err.message);
    else console.log('Create admin output:', stdout);
});
  app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущено на порті ${PORT}`));
}

main().catch((e) => {
  console.error('Помилка запуску сервера:', e);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
