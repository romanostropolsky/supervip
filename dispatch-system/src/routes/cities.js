const express = require('express');
const { pool } = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM cities ORDER BY name');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Вкажіть назву міста' });
  try {
    const { rows } = await pool.query('INSERT INTO cities (name) VALUES ($1) RETURNING *', [name.trim()]);
    res.json(rows[0]);
  } catch (e) {
    if (String(e.message).includes('unique')) return res.status(400).json({ error: 'Таке місто вже є в списку' });
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM cities WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
