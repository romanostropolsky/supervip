const express = require('express');
const { pool } = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM route_templates ORDER BY id');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { stops, price, commission } = req.body || {};
  if (!Array.isArray(stops) || stops.length < 2) {
    return res.status(400).json({ error: 'Оберіть мінімум 2 точки маршруту' });
  }
  // Перевіряємо, що всі точки — реально додані міста зі списку
  const known = (await pool.query('SELECT name FROM cities')).rows.map(r => r.name);
  const unknown = stops.filter(s => !known.includes(s));
  if (unknown.length > 0) {
    return res.status(400).json({ error: `Цих міст немає у списку "Міста": ${unknown.join(', ')}` });
  }
  const { rows } = await pool.query(
    'INSERT INTO route_templates (stops, price, commission) VALUES ($1,$2,$3) RETURNING *',
    [JSON.stringify(stops), price || 0, commission || 0]
  );
  res.json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { price, commission, stops } = req.body || {};
  const route = (await pool.query('SELECT * FROM route_templates WHERE id=$1', [req.params.id])).rows[0];
  if (!route) return res.status(404).json({ error: 'Маршрут не знайдено' });
  const { rows } = await pool.query(
    'UPDATE route_templates SET price=$1, commission=$2, stops=$3 WHERE id=$4 RETURNING *',
    [
      price !== undefined ? price : route.price,
      commission !== undefined ? commission : route.commission,
      stops && stops.length >= 2 ? JSON.stringify(stops) : JSON.stringify(route.stops),
      req.params.id,
    ]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM route_templates WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
