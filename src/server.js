const express = require('express');
const { Pool } = require('pg');
const { Telegraf, Markup } = require('telegraf');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1'))
    ? false
    : { rejectUnauthorized: false }
});

const bot = process.env.TELEGRAM_BOT_TOKEN ? new Telegraf(process.env.TELEGRAM_BOT_TOKEN) : null;

// --- ІНІЦІАЛІЗАЦІЯ БАЗИ ДАНИХ ---
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dispatchers (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'dispatcher'
    );

    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      from_city VARCHAR(100) NOT NULL,
      to_city VARCHAR(100) NOT NULL,
      price NUMERIC NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      name VARCHAR(100),
      phone VARCHAR(50),
      car_info VARCHAR(100),
      current_location VARCHAR(150) DEFAULT 'Не вказано',
      location_updated_at TIMESTAMP
    );
  `);

  // Додавання базових міст, якщо таблиця порожня
  const res = await pool.query('SELECT COUNT(*) FROM cities');
  if (parseInt(res.rows[0].count) === 0) {
    const defaultCities = ['Київ', 'Львів', 'Одеса', 'Дніпро', 'Харків', 'Умань'];
    for (const city of defaultCities) {
      await pool.query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT DO NOTHING', [city]);
    }
  }
}

// --- API ДЛЯ МІСТ В АДМІНЦІ ---
app.get('/api/cities', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cities ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cities', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Вкажіть назву міста' });
    const result = await pool.query('INSERT INTO cities (name) VALUES ($1) RETURNING *', [name.trim()]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(400).json({ error: 'Місто вже існує або дані некоректні' });
  }
});

app.delete('/api/cities/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM cities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TELEGRAF BOT: ДИНАМІЧНІ МІСТА ТА GPS ---
if (bot) {
  bot.start((ctx) => {
    ctx.reply('Ласкаво просимо! Використовуйте меню для керування локацією.', Markup.keyboard([
      ['📍 Оновити локацію']
    ]).resize());
  });

  bot.hears('📍 Оновити локацію', async (ctx) => {
    try {
      const citiesRes = await pool.query('SELECT name FROM cities ORDER BY name ASC');
      const cities = citiesRes.rows.map(r => r.name);

      const buttons = [];
      for (let i = 0; i < cities.length; i += 2) {
        const row = [cities[i]];
        if (cities[i + 1]) row.push(cities[i + 1]);
        buttons.push(row);
      }

      buttons.unshift([Markup.button.locationRequest('📡 Надіслати точний GPS')]);

      ctx.reply('Оберіть ваші поточне місто або надішліть GPS:', Markup.keyboard(buttons).resize());
    } catch (err) {
      ctx.reply('Помилка завантаження міст.');
    }
  });

  bot.on('location', async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    const locationText = `GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    const tgId = ctx.from.id;

    await pool.query(
      'UPDATE drivers SET current_location = $1, location_updated_at = NOW() WHERE telegram_id = $2',
      [locationText, tgId]
    );

    ctx.reply(`Дякуємо! Вашу точну геопозицію (${locationText}) збережено.`, Markup.keyboard([
      ['📍 Оновити локацію']
    ]).resize());
  });

  bot.on('text', async (ctx, next) => {
    const text = ctx.message.text;
    if (text === '📍 Оновити локацію') return next();

    const cityCheck = await pool.query('SELECT id FROM cities WHERE name = $1', [text]);
    if (cityCheck.rows.length > 0) {
      const tgId = ctx.from.id;
      await pool.query(
        'UPDATE drivers SET current_location = $1, location_updated_at = NOW() WHERE telegram_id = $2',
        [text, tgId]
      );

      return ctx.reply(`Вашу локацію успішно змінено на місто: ${text}`, Markup.keyboard([
        ['📍 Оновити локацію']
      ]).resize());
    }

    return next();
  });
}

// SPA роутинг
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

async function main() {
  await initSchema();

  // ✅ СТВОРЕННЯ АДМІНА ТІЛЬКИ ЯКЩО ЙОГО ЩЕ НЕМАЄ В БАЗІ
  try {
    const adminCheck = await pool.query('SELECT * FROM dispatchers WHERE username = $1', ['admin']);
    
    if (adminCheck.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        'INSERT INTO dispatchers (username, password_hash, role) VALUES ($1, $2, $3)',
        ['admin', hash, 'admin']
      );
      console.log('✅ Адміністратора admin / admin123 успішно створено!');
    } else {
      console.log('ℹ️ Обліковий запис admin вже існує, пароль не змінюємо.');
    }
  } catch (e) {
    console.error('Помилка перевірки адміна:', e.message);
  }

  // Запуск бота
  if (bot) {
    bot.launch()
      .then(() => console.log('Telegram-бот запущено'))
      .catch(err => console.error('Помилка бота:', err.message));
  } else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN не вказано. Бот вимкнений.');
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущено на порті ${PORT}`));
}

main().catch((e) => {
  console.error('Помилка запуску сервера:', e);
  process.exit(1);
});

if (bot) {
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}