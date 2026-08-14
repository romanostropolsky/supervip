const express = require('express');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { routeChainText, STATUS_LABELS } = require('../orderLogic');
const router = express.Router();

async function buildReport() {
  const orders = (await pool.query('SELECT * FROM orders')).rows;
  const completed = orders.filter(o => o.status === 'completed');
  const revenue = completed.reduce((s, o) => s + Number(o.price), 0);
  const commission = completed.reduce((s, o) => s + Number(o.commission), 0);

  const drivers = (await pool.query('SELECT * FROM drivers')).rows;

  const byDriver = {};
  completed.forEach(o => {
    if (!o.driver_id) return;
    byDriver[o.driver_id] = byDriver[o.driver_id] || { trips: 0, revenue: 0, commission: 0 };
    byDriver[o.driver_id].trips++;
    byDriver[o.driver_id].revenue += Number(o.price);
    byDriver[o.driver_id].commission += Number(o.commission);
  });

  return {
    orders, drivers,
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
  };
}

router.get('/', async (req, res) => {
  const r = await buildReport();
  const { orders, drivers, ...summary } = r;
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

  const s3 = wb.addWorksheet('Усі замовлення');
  s3.columns = [
    { header: '№', key: 'id', width: 8 },
    { header: 'Клієнт', key: 'client', width: 22 },
    { header: 'Пасажирів', key: 'passengers', width: 12 },
    { header: 'Подача', key: 'departure', width: 20 },
    { header: 'Маршрут', key: 'route', width: 36 },
    { header: 'Ціна, грн', key: 'price', width: 12 },
    { header: 'Комісія, грн', key: 'commission', width: 14 },
    { header: 'Водій', key: 'driver', width: 20 },
    { header: 'Статус', key: 'status', width: 18 },
    { header: 'Створено', key: 'created', width: 20 },
  ];
  r.orders.forEach(o => {
    const drv = r.drivers.find(x => x.id === o.driver_id);
    s3.addRow({
      id: o.id,
      client: o.client,
      passengers: o.passengers,
      departure: o.departure_time ? new Date(o.departure_time).toLocaleString('uk-UA') : '—',
      route: routeChainText(o.stops),
      price: o.price,
      commission: o.commission,
      driver: drv ? drv.name : '—',
      status: STATUS_LABELS[o.status] || o.status,
      created: new Date(o.created_at).toLocaleString('uk-UA'),
    });
  });
  s3.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="report_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
