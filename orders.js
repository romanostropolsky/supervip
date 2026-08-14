const express = require('express');
const { pool } = require('../db');
const { notifyDriverNewOrder } = require('../telegramBot');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { routeId, carTypeId, passengers, luggage, driverId, passengerName, passengerPhone, pickupTime, arrivalTime } = req.body || {};
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
      return res.json({ ...order, status: 'new', driver_id: null, warning: 'Водій ще не підключив Telegram-бота' });
    }
  }

  res.json(order);
});

router.put('/:id', async (req, res) => {
  const orderId = req.params.id;
  const { routeId, carTypeId, passengers, luggage, passengerName, passengerPhone, pickupTime, arrivalTime } = req.body || {};
  const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
  if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });
  if (order.status !== 'new') {
    return res.status(400).json({ error: 'Редагувати можна лише нові, ще не призначені замовлення' });
  }
  const finalRouteId = routeId || order.route_id;
  const finalCarTypeId = carTypeId || order.car_type_id;

  const priceRow = (await pool.query(
    'SELECT * FROM prices WHERE route_id=$1 AND car_type_id=$2', [finalRouteId, finalCarTypeId]
  )).rows[0];
  const price = priceRow ? priceRow.price : 0;
  const commission = priceRow ? priceRow.commission : 0;

  const { rows } = await pool.query(
    `UPDATE orders SET route_id=$1, car_type_id=$2, passengers=$3, luggage=$4, price=$5, commission=$6, 
     passenger_name=$7, passenger_phone=$8, pickup_time=$9, arrival_time=$10, updated_at=now()
     WHERE id=$11 RETURNING *`,
    [
      finalRouteId, 
      finalCarTypeId, 
      passengers || order.passengers, 
      luggage !== undefined ? !!luggage : order.luggage, 
      price, 
      commission, 
      passengerName !== undefined ? passengerName : order.passenger_name, 
      passengerPhone !== undefined ? passengerPhone : order.passenger_phone, 
      pickupTime !== undefined ? pickupTime : order.pickup_time, 
      arrivalTime !== undefined ? arrivalTime : order.arrival_time, 
      orderId
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