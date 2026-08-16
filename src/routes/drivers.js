const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT d.*, COALESCE(oc.trips, 0) AS completed_trips
    FROM drivers d
    LEFT JOIN (
      SELECT driver_id, COUNT(*) AS trips FROM orders WHERE status='completed' GROUP BY driver_id
    ) oc ON oc.driver_id = d.id
    ORDER BY d.id
  `);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, phone, carModel, carClass, seats, tariffRate } = req.body || {};
  if (!name) return res.status(400).json({ error: "Вкажіть ім'я водія" });

  // Захист від задвоєння при швидкому повторному натисканні "Зберегти водія"
  const recentDup = (await pool.query(
    `SELECT * FROM drivers WHERE name=$1 AND COALESCE(phone,'')=COALESCE($2,'') AND created_at > now() - interval '10 seconds'`,
    [name, phone || null]
  )).rows[0];
  if (recentDup) return res.json(recentDup);

  const linkCode = crypto.randomBytes(4).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO drivers (name, phone, car_model, car_class, seats, tariff_rate, status, link_code)
     VALUES ($1,$2,$3,$4,$5,$6,'offline',$7) RETURNING *`,
    [name, phone || null, carModel || null, carClass || 'Стандарт', seats || 4, tariffRate || 0, linkCode]
  );
  res.json(rows[0]);
});

// Диспетчер вручну вмикає/вимикає водія (наприклад, якщо той недоступний по телефону)
router.put('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['online', 'offline'].includes(status)) {
    return res.status(400).json({ error: 'Статус має бути online або offline' });
  }
  const { rows } = await pool.query('UPDATE drivers SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Водія не знайдено' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM drivers WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
