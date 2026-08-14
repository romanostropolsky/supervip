const STATUS_LABELS = {
  new: 'Нове',
  sent: 'Надіслано водію',
  confirmed: 'Підтверджено водієм',
  in_progress: 'В дорозі',
  completed: 'Завершено',
  cancelled: 'Скасовано',
};

// Повертає послідовність етапів поїздки для маршруту: pickup -> stop1? -> stop2? -> end
function routeStages(route) {
  const stages = ['pickup'];
  if (route.stop1) stages.push('stop1');
  if (route.stop2) stages.push('stop2');
  stages.push('end');
  return stages;
}

function stageLabel(route, stage) {
  if (stage === 'pickup') return `Забрав у місті ${route.start_city}`;
  if (stage === 'stop1') return `Зупинка: ${route.stop1}`;
  if (stage === 'stop2') return `Зупинка: ${route.stop2}`;
  if (stage === 'end') return `Прибув до ${route.end_city}`;
  return '—';
}

function formatOrderMessage(order, route, carType) {
  const lines = [
    `🚕 Нове замовлення №${order.id}`,
    `👤 Пасажир: ${order.passenger_name || 'Не вказано'}`,
    `📞 Телефон: ${order.passenger_phone || 'Не вказано'}`,
    `⏰ Час подачі: ${order.pickup_time || 'Не вказано'}`,
    `🏁 Час приїзду: ${order.arrival_time || 'Не вказано'}`,
    ``,
    `Маршрут: ${route.start_city} → ${route.end_city}`,
    `Клас авто: ${carType.name}`,
    `Пасажирів: ${order.passengers}`,
    `Багаж: ${order.luggage ? 'так' : 'ні'}`,
    ``,
    `До сплати клієнтом: ${order.price} грн`,
    `Комісія сервісу: ${order.commission} грн`,
    `Вам чистими: ${order.price - order.commission} грн`,
  ];
  return lines.join('\n');
}

module.exports = { STATUS_LABELS, routeStages, stageLabel, formatOrderMessage };