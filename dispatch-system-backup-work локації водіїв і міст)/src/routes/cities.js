const express = require('express');
const { pool } = require('../db');
const { geocodeCity } = require('../geocode');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM cities ORDER BY name');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Вкажіть назву міста' });
  let rows;
  try {
    ({ rows } = await pool.query('INSERT INTO cities (name) VALUES ($1) RETURNING *', [name.trim()]));
  } catch (e) {
    if (String(e.message).includes('unique')) return res.status(400).json({ error: 'Таке місто вже є в списку' });
    throw e;
  }
  const city = rows[0];

  // Геокодуємо у фоні окремим запитом, не блокуючи відповідь надовго
  const coords = await geocodeCity(name.trim());
  if (coords) {
    const updated = await pool.query('UPDATE cities SET lat=$1, lng=$2 WHERE id=$3 RETURNING *', [coords.lat, coords.lng, city.id]);
    return res.json(updated.rows[0]);
  }
  res.json(city);
});

// Повторна спроба визначити координати (якщо не вийшло при додаванні)
router.post('/:id/geocode', async (req, res) => {
  const city = (await pool.query('SELECT * FROM cities WHERE id=$1', [req.params.id])).rows[0];
  if (!city) return res.status(404).json({ error: 'Місто не знайдено' });
  const coords = await geocodeCity(city.name);
  if (!coords) return res.status(400).json({ error: 'Не вдалося визначити координати цього міста' });
  const updated = await pool.query('UPDATE cities SET lat=$1, lng=$2 WHERE id=$3 RETURNING *', [coords.lat, coords.lng, city.id]);
  res.json(updated.rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM cities WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
