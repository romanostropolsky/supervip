const express = require('express');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const router = express.Router();

const STATUS_LABELS = {
  new: 'Нове', sent: 'Надіслано водію', confirmed: 'Підтверджено', in_progress: 'В дорозі',
  completed: 'Завершено', cancelled: 'Скасовано',
};

async function buildReport() {
  const orders = (await pool.query('SELECT * FROM orders')).rows;
  const completed = orders.filter(o => o.status === 'completed');
  const revenue = completed.reduce((s, o) => s + o.price, 0);
  const commission = completed.reduce((s, o) => s + o.commission, 0);

  const drivers = (await pool.query('SELECT * FROM drivers')).rows;
  const routes = (await pool.query('SELECT * FROM routes')).rows;
  const carTypes = (await pool.query('SELECT * FROM car_types')).rows;

  const byDriver = {};
  completed.forEach(o => {
    if (!o.driver_id) return;
    byDriver[o.driver_id] = byDriver[o.driver_id] || { trips: 0, revenue: 0, commission: 0 };
    byDriver[o.driver_id].trips++;
    byDriver[o.driver_id].revenue += o.price;
    byDriver[o.driver_id].commission += o.commission;
  });

  const byRoute = {};
  completed.forEach(o => {
    byRoute[o.route_id] = byRoute[o.route_id] || { trips: 0, revenue: 0 };
    byRoute[o.route_id].trips++;
    byRoute[o.route_id].revenue += o.price;
  });

  return {
    orders, drivers, routes, carTypes,
    totalOrders: orders.length,
    completedOrders: completed.length,
    revenue,
    commission,
    byDriver: Object.entries(byDriver).map(([driverId, v]) => ({
      driverId: Number(driverId),
      driverName: (drivers.find(d => d.id === Number(driverId)) || {}).name || '—',
      ...v,
      net: v.revenue - v.commission,
    })),
    byRoute: Object.entries(byRoute).map(([routeId, v]) => {
      const r = routes.find(x => x.id === Number(routeId));
      return { routeId: Number(routeId), routeLabel: r ? `${r.start_city} → ${r.end_city}` : '—', ...v };
    }),
  };
}

router.get('/', async (req, res) => {
  const r = await buildReport();
  const { orders, drivers, routes, carTypes, ...summary } = r;
  res.json(summary);
});

router.get('/export', async (req, res) => {
  const r = await buildReport();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Диспетчерська';
  wb.created = new Date();

  const s1 = wb.addWorksheet('Зведення');
  s1.columns = [{ header: 'Показник', key: 'k', width: 30 }, { header: 'Значення', key: 'v', width: 20 }];
  s1.addRows([
    { k: 'Усього замовлень', v: r.totalOrders },
    { k: 'Завершено', v: r.completedOrders },
    { k: 'Оборот, грн', v: r.revenue },
    { k: 'Комісія сервісу, грн', v: r.commission },
  ]);
  s1.getRow(1).font = { bold: true };

  const s2 = wb.addWorksheet('По водіях');
  s2.columns = [
    { header: 'Водій', key: 'driverName', width: 24 },
    { header: 'Поїздок', key: 'trips', width: 12 },
    { header: 'Зібрано, грн', key: 'revenue', width: 16 },
    { header: 'Комісія, грн', key: 'commission', width: 16 },
    { header: 'Чистими водію, грн', key: 'net', width: 18 },
  ];
  s2.addRows(r.byDriver);
  s2.getRow(1).font = { bold: true };

  const s3 = wb.addWorksheet('По маршрутах');
  s3.columns = [
    { header: 'Маршрут', key: 'routeLabel', width: 28 },
    { header: 'Поїздок', key: 'trips', width: 12 },
    { header: 'Оборот, грн', key: 'revenue', width: 16 },
  ];
  s3.addRows(r.byRoute);
  s3.getRow(1).font = { bold: true };

  const s4 = wb.addWorksheet('Усі замовлення');
  s4.columns = [
    { header: '№', key: 'id', width: 8 },
    { header: 'Маршрут', key: 'route', width: 26 },
    { header: 'Клас авто', key: 'car', width: 16 },
    { header: 'Пасажирів', key: 'passengers', width: 12 },
    { header: 'Багаж', key: 'luggage', width: 10 },
    { header: 'Ціна, грн', key: 'price', width: 12 },
    { header: 'Комісія, грн', key: 'commission', width: 14 },
    { header: 'Водій', key: 'driver', width: 20 },
    { header: 'Статус', key: 'status', width: 18 },
    { header: 'Створено', key: 'created', width: 20 },
  ];
  r.orders.forEach(o => {
    const route = r.routes.find(x => x.id === o.route_id);
    const car = r.carTypes.find(x => x.id === o.car_type_id);
    const drv = r.drivers.find(x => x.id === o.driver_id);
    s4.addRow({
      id: o.id,
      route: route ? `${route.start_city} → ${route.end_city}` : '—',
      car: car ? car.name : '—',
      passengers: o.passengers,
      luggage: o.luggage ? 'так' : 'ні',
      price: o.price,
      commission: o.commission,
      driver: drv ? drv.name : '—',
      status: STATUS_LABELS[o.status] || o.status,
      created: new Date(o.created_at).toLocaleString('uk-UA'),
    });
  });
  s4.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="report_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
