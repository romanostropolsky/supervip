require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { initSchema } = require('./db');
const { requireAuth, requireAdmin } = require('./auth');
const { bot, botEnabled } = require('./telegramBot');

const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const driverRoutes = require('./routes/drivers');
const orderRoutes = require('./routes/orders');
const reportRoutes = require('./routes/reports');
const dispatcherRoutes = require('./routes/dispatchers');
const cityRoutes = require('./routes/cities');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/config', requireAuth, configRoutes);
app.use('/api/drivers', requireAuth, driverRoutes);
app.use('/api/orders', requireAuth, orderRoutes);
app.use('/api/reports', requireAuth, reportRoutes);
app.use('/api/dispatchers', requireAuth, requireAdmin, dispatcherRoutes);
app.use('/api/cities', requireAuth, cityRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

async function main() {
  await initSchema();
  if (botEnabled) {
    await bot.launch();
    console.log('Telegram-бот запущено');
  } else {
    console.log('⚠ TELEGRAM_BOT_TOKEN не задано — сповіщення водіям вимкнені, панель диспетчера працює як звичайно.');
  }
  app.listen(PORT, () => console.log(`Сервер запущено на порті ${PORT}`));
}

main().catch((e) => {
  console.error('Помилка запуску сервера:', e);
  process.exit(1);
});

process.once('SIGINT', () => { if (botEnabled) bot.stop('SIGINT'); });
process.once('SIGTERM', () => { if (botEnabled) bot.stop('SIGTERM'); });
