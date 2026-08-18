const STATUS_LABELS = {
  new: 'Нове',
  sent: 'Надіслано водію',
  confirmed: 'Підтверджено водієм',
  in_progress: 'В дорозі',
  completed: 'Завершено',
  cancelled: 'Скасовано',
};

function routeChainText(stops) {
  if (!Array.isArray(stops) || stops.length === 0) return '—';
  return stops.map(s => s.time ? `${s.city} (${s.time})` : s.city).join(' → ');
}

// Етап — це індекс зупинки у масиві stops. Останній індекс = кінець поїздки.
function stageLabel(stops, idx) {
  if (!Array.isArray(stops) || idx == null || !stops[idx]) return '—';
  const isLast = idx === stops.length - 1;
  return isLast ? `Прибув до ${stops[idx].city}` : `Проходить: ${stops[idx].city}`;
}

function formatOrderMessage(order) {
  const lines = [
    `🚕 Нове замовлення №${order.id}`,
    `Клієнт: ${order.client}`,
    order.client_phone ? `Телефон клієнта: ${order.client_phone}` : null,
    `Пасажирів: ${order.passengers}`,
    order.departure_time ? `Подача: ${new Date(order.departure_time).toLocaleString('uk-UA')}` : null,
    `Маршрут: ${routeChainText(order.stops)}`,
    order.airport_pickup ? `✈️ Зустріч в аеропорту${order.flight_number?`, рейс ${order.flight_number}`:''}${order.flight_date?` (${new Date(order.flight_date).toLocaleDateString('uk-UA')})`:''}` : null,
    ``,
    `До сплати клієнтом: ${order.price} грн`,
    `Комісія сервісу: ${order.commission} грн`,
    `Вам чистими: ${order.price - order.commission} грн`,
  ].filter(Boolean);
  return lines.join('\n');
}

module.exports = { STATUS_LABELS, routeChainText, stageLabel, formatOrderMessage };
