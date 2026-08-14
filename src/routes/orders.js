const express = require('express');
const { pool } = require('../db');
const { notifyDriverNewOrder } = require('../telegramBot');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  console.log('DEBUG (POST): Отримано дані:', req.body);
  const { routeId, carTypeId, passengers, luggage, driverId, passengerName, passengerPhone, pickupTime, arrivalTime } = req.body;
  
  if (!routeId || !carTypeId) return res.status(400).json({ error: 'Вкажіть маршрут і клас авто' });

  const priceRow = (await pool.query(
    'SELECT * FROM prices WHERE route_id=$1 AND car_type_id=$2', [routeId, carTypeId]
  )).rows[0];
  const price = priceRow ? priceRow.price : 0;
  const commission = priceRow ? priceRow.commission : 0;

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
    `INSERT INTO orders (route_id, car_type_id, passengers, luggage, price, commission, status, driver_id, passenger_name, passenger_phone, pickup_time, arrival_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [routeId, carTypeId, passengers || 1, !!luggage, price, commission, status, assignedDriverId, passengerName || null, passengerPhone || null, pickupTime || null, arrivalTime || null]
  );
  
  const order = rows[0];

  if (assignedDriverId) {
    await pool.query('UPDATE drivers SET current_order_id=$1 WHERE id=$2', [order.id, assignedDriverId]);
    const result = await notifyDriverNewOrder(assignedDriverId, order.id);
    if (!result.ok) {
      await pool.query("UPDATE orders SET status='new', driver_id=NULL WHERE id=$1", [order.id]);
      await pool.query('UPDATE drivers SET current_order_id=NULL WHERE id=$1', [assignedDriverId]);
      return res.json({ ...order, status: 'new', driver_id: null, warning: 'Водій не отримав повідомлення' });
    }
  }

  res.json(order);
});

router.put('/:id', async (req, res) => {
  console.log('DEBUG (PUT): Отримано дані:', req.body);
  const orderId = req.params.id;
  const { routeId, carTypeId, passengers, luggage, passengerName, passengerPhone, pickupTime, arrivalTime } = req.body;
  
  const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });

  const { rows } = await pool.query(
    `UPDATE orders SET 
     route_id=COALESCE($1, route_id), car_type_id=COALESCE($2, car_type_id), 
     passengers=COALESCE($3, passengers), luggage=COALESCE($4, luggage), 
     passenger_name=COALESCE($5, passenger_name), passenger_phone=COALESCE($6, passenger_phone), 
     pickup_time=COALESCE($7, pickup_time), arrival_time=COALESCE($8, arrival_time), 
     updated_at=now() 
     WHERE id=$9 RETURNING *`,
    [routeId, carTypeId, passengers, luggage, passengerName, passengerPhone, pickupTime, arrivalTime, orderId]
  );
  
  res.json(rows[0]);
});

router.post('/:id/assign', async (req, res) => {
  const { driverId } = req.body;
  const orderId = req.params.id;
  
  await pool.query("UPDATE orders SET driver_id=$1, status='sent' WHERE id=$2", [driverId, orderId]);
  await pool.query('UPDATE drivers SET current_order_id=$1 WHERE id=$2', [orderId, driverId]);
  
  await notifyDriverNewOrder(driverId, orderId);
  res.json({ ok: true });
});

router.post('/:id/cancel', async (req, res) => {
  const orderId = req.params.id;
  await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1", [orderId]);
  res.json({ ok: true });
});

module.exports = router;