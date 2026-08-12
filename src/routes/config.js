const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// Повний конфіг: маршрути, класи авто, тарифна сітка
router.get('/', async (req, res) => {
  const routes = (await pool.query('SELECT * FROM routes ORDER BY id')).rows;
  const carTypes = (await pool.query('SELECT * FROM car_types ORDER BY id')).rows;
  const prices = (await pool.query('SELECT * FROM prices')).rows;
  res.json({ routes, carTypes, prices });
});

router.post('/routes', async (req, res) => {
  const { startCity, endCity, stop1, stop2 } = req.body || {};
  if (!startCity || !endCity) return res.status(400).json({ error: 'Вкажіть початок і кінець маршруту' });
  const count = (await pool.query('SELECT COUNT(*) FROM routes')).rows[0].count;
  if (Number(count) >= 10) return res.status(400).json({ error: 'Досягнуто ліміту 10 маршрутів' });

  const { rows } = await pool.query(
    'INSERT INTO routes (start_city,end_city,stop1,stop2) VALUES ($1,$2,$3,$4) RETURNING *',
    [startCity, endCity, stop1 || null, stop2 || null]
  );
  const route = rows[0];
  const carTypes = (await pool.query('SELECT id FROM car_types')).rows;
  for (const ct of carTypes) {
    await pool.query(
      'INSERT INTO prices (route_id, car_type_id, price, commission) VALUES ($1,$2,0,0) ON CONFLICT DO NOTHING',
      [route.id, ct.id]
    );
  }
  res.json(route);
});

router.delete('/routes/:id', async (req, res) => {
  await pool.query('DELETE FROM routes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/car-types', async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Вкажіть назву класу' });
  const count = (await pool.query('SELECT COUNT(*) FROM car_types')).rows[0].count;
  if (Number(count) >= 5) return res.status(400).json({ error: 'Досягнуто ліміту 5 класів авто' });

  const { rows } = await pool.query('INSERT INTO car_types (name) VALUES ($1) RETURNING *', [name]);
  const carType = rows[0];
  const routes = (await pool.query('SELECT id FROM routes')).rows;
  for (const r of routes) {
    await pool.query(
      'INSERT INTO prices (route_id, car_type_id, price, commission) VALUES ($1,$2,0,0) ON CONFLICT DO NOTHING',
      [r.id, carType.id]
    );
  }
  res.json(carType);
});

router.delete('/car-types/:id', async (req, res) => {
  await pool.query('DELETE FROM car_types WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.put('/prices', async (req, res) => {
  const { routeId, carTypeId, price, commission } = req.body || {};
  await pool.query(
    `INSERT INTO prices (route_id, car_type_id, price, commission) VALUES ($1,$2,$3,$4)
     ON CONFLICT (route_id, car_type_id) DO UPDATE SET price=$3, commission=$4`,
    [routeId, carTypeId, price || 0, commission || 0]
  );
  res.json({ ok: true });
});

module.exports = router;
