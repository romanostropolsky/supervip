const express = require('express');
const { pool } = require('../db');
const { notifyDriverNewOrder } = require('../telegramBot');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { client, passengers, departureTime, stops, price, commission, driverId } = req.body || {};
  if (!client) return res.status(400).json({ error: "Вкажіть клієнта" });
  if (!Array.isArray(stops) || stops.length < 2) {
    return res.status(400).json({ error: 'Додайте мінімум 2 точки маршруту' });
  }

  // Захист від задвоєння при швидкому повторному натисканні "Створити замовлення"
  const recentDup = (await pool.query(
    `SELECT * FROM orders WHERE client=$1 AND stops=$2::jsonb
     AND created_at > now() - interval '5 seconds' AND status <> 'cancelled'`,
    [client, JSON.stringify(stops)]
  )).rows[0];
  if (recentDup) return res.json(recentDup);

  let status = 'new';
  let assignedDriverId = null;

  if (driverId) {
    const driver = (await pool.query('SELECT * FROM drivers WHERE id=$1', [driverId])).rows[0];
    if (driver && driver.status === 'online' && !driver.current_order_id) {
      status = 'sent';
      assignedDriverId = driverId;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO orders (client, passengers, departure_time, stops, price, commission, status, driver_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [client, passengers || 1, departureTime || null, JSON.stringify(stops), price || 0, commission || 0, status, assignedDriverId]
  );
  const order = rows[0];

  if (assignedDriverId) {
    await pool.query('UPDATE drivers SET current_order_id=$1 WHERE id=$2', [order.id, assignedDriverId]);
    const result = await notifyDriverNewOrder(assignedDriverId, order.id);
    if (!result.ok) {
      await pool.query("UPDATE orders SET status='new', driver_id=NULL WHERE id=$1", [order.id]);
      await pool.query('UPDATE drivers SET current_order_id=NULL WHERE id=$1', [assignedDriverId]);
      return res.json({ ...order, status: 'new', driver_id: null, warning: 'Водій ще не підключив Telegram-бота' });
    }
  }

  res.json(order);
});

// Редагувати можна лише замовлення в статусі "нове" (ще не надіслане водію)
router.put('/:id', async (req, res) => {
  const orderId = req.params.id;
  const { client, passengers, departureTime, stops, price, commission } = req.body || {};
  const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });
  if (order.status !== 'new') {
    return res.status(400).json({ error: 'Редагувати можна лише нові, ще не призначені замовлення' });
  }
  const { rows } = await pool.query(
    `UPDATE orders SET client=$1, passengers=$2, departure_time=$3, stops=$4, price=$5, commission=$6, updated_at=now()
     WHERE id=$7 RETURNING *`,
    [
      client || order.client,
      passengers || order.passengers,
      departureTime !== undefined ? (departureTime || null) : order.departure_time,
      stops && stops.length >= 2 ? JSON.stringify(stops) : order.stops,
      price !== undefined ? price : order.price,
      commission !== undefined ? commission : order.commission,
      orderId,
    ]
  );
  res.json(rows[0]);
});

router.post('/:id/assign', async (req, res) => {
  const { driverId } = req.body || {};
  const orderId = req.params.id;
  const driver = (await pool.query('SELECT * FROM drivers WHERE id=$1', [driverId])).rows[0];
  if (!driver) return res.status(404).json({ error: 'Водія не знайдено' });
  if (driver.status !== 'online' || driver.current_order_id) {
    return res.status(400).json({ error: 'Водій не онлайн або вже має активне замовлення' });
  }

  await pool.query("UPDATE orders SET driver_id=$1, status='sent', updated_at=now() WHERE id=$2", [driverId, orderId]);
  await pool.query('UPDATE drivers SET current_order_id=$1 WHERE id=$2', [orderId, driverId]);

  const result = await notifyDriverNewOrder(driverId, orderId);
  if (!result.ok) {
    await pool.query("UPDATE orders SET status='new', driver_id=NULL WHERE id=$1", [orderId]);
    await pool.query('UPDATE drivers SET current_order_id=NULL WHERE id=$1', [driverId]);
    return res.status(400).json({ error: 'Водій ще не підключив Telegram-бота' });
  }

  res.json({ ok: true });
});

router.post('/:id/cancel', async (req, res) => {
  const orderId = req.params.id;
  const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (order && order.driver_id) {
    await pool.query('UPDATE drivers SET current_order_id=NULL WHERE id=$1 AND current_order_id=$2', [order.driver_id, orderId]);
  }
  await pool.query("UPDATE orders SET status='cancelled', updated_at=now() WHERE id=$1", [orderId]);
  res.json({ ok: true });
});

module.exports = router;
