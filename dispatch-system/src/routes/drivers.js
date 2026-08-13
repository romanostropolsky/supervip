const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM drivers ORDER BY id');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, phone, carTypeId } = req.body || {};
  if (!name) return res.status(400).json({ error: "Вкажіть ім'я водія" });
  const linkCode = crypto.randomBytes(4).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO drivers (name, phone, car_type_id, status, link_code)
     VALUES ($1,$2,$3,'offline',$4) RETURNING *`,
    [name, phone || null, carTypeId || null, linkCode]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM drivers WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
