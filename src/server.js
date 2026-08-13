const express = require('express');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

    CREATE TABLE IF NOT EXISTS drivers (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE,
      name VARCHAR(100) NOT NULL,
      phone VARCHAR(50),
      car_model VARCHAR(100),
      car_class VARCHAR(50) DEFAULT 'Стандарт',
      seats INT DEFAULT 4,
      tariff_rate NUMERIC DEFAULT 0,
      current_location VARCHAR(150) DEFAULT 'Не вказано',
      location_updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      client TEXT,
      passengers INT DEFAULT 1,
      departure_time TIMESTAMP,
      stops JSONB,
      price NUMERIC,
      status VARCHAR(50) DEFAULT 'Нове',
      driver_id INT REFERENCES drivers(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const res = await pool.query('SELECT COUNT(*) FROM cities');
  if (parseInt(res.rows[0].count) === 0) {
    const defaultCities = ['Київ', 'Житомир', 'Рівне', 'Львів', 'Одеса', 'Дніпро', 'Харків', 'Умань'];
    for (const city of defaultCities) {
      await pool.query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT DO NOTHING', [city]);
    }
  }
}

// --- АВТОРИЗАЦІЯ ---
const handleLogin = async (req, res) => {
  try {
    const username = req.body.username || req.body.login;
    const password = req.body.password || req.body.pass;

    if (!username || !password) return res.status(400).json({ status: 'error', message: 'Введіть логін та пароль' });

    const result = await pool.query('SELECT * FROM dispatchers WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) return res.status(401).json({ status: 'error', message: 'Невірний логін або пароль' });

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ status: 'error', message: 'Невірний логін або пароль' });

    res.json({
      success: true,
      ok: true,
      role: user.role,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

app.post('/api/login', handleLogin);

// --- REST API ДЛЯ ВОДІЇВ ---
app.get('/api/drivers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM drivers ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/drivers', async (req, res) => {
  try {
    const { name, phone, car_model, car_class, seats, tariff_rate } = req.body;
    const result = await pool.query(
      `INSERT INTO drivers (name, phone, car_model, car_class, seats, tariff_rate)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, phone, car_model, car_class || 'Стандарт', seats || 4, tariff_rate || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/drivers/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM drivers WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REST API ДЛЯ ЗАМОВЛЕНЬ ---
app.get('/api/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, d.name as driver_name, d.car_model, d.car_class, d.seats 
      FROM orders o 
      LEFT JOIN drivers d ON o.driver_id = d.id 
      ORDER BY o.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { client, passengers, departure_time, stops, price, driver_id } = req.body;
    const result = await pool.query(
      `INSERT INTO orders (client, passengers, departure_time, stops, price, driver_id) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [client, passengers || 1, departure_time, JSON.stringify(stops), price, driver_id || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- МІСТА ---
app.get('/api/cities', async (req, res) => {
  const result = await pool.query('SELECT * FROM cities ORDER BY name ASC');
  res.json(result.rows);
});

app.post('/api/cities', async (req, res) => {
  const { name } = req.body;
  const result = await pool.query('INSERT INTO cities (name) VALUES ($1) RETURNING *', [name.trim()]);
  res.json(result.rows[0]);
});

app.delete('/api/cities/:id', async (req, res) => {
  await pool.query('DELETE FROM cities WHERE id = $1', [req.params.id]);
  res.json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

async function main() {
  await initSchema();
  try {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      `INSERT INTO dispatchers (username, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET password_hash = $2`,
      ['admin', hash, 'admin']
    );
  } catch (e) {
    console.error(e.message);
  }

  if (bot) bot.launch().catch(err => console.error('Bot error:', err.message));
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}

main();
