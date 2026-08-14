const { Telegraf, Markup } = require('telegraf');
const { pool } = require('./db');
const { routeStages, stageLabel, formatOrderMessage } = require('./orderLogic');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const botEnabled = !!botToken;
const bot = botEnabled ? new Telegraf(botToken) : null;

async function getOrderFull(orderId) {
  const { rows } = await pool.query(
    `SELECT o.*, r.start_city, r.end_city, r.stop1, r.stop2, c.name AS car_name
     FROM orders o
     JOIN routes r ON r.id = o.route_id
     JOIN car_types c ON c.id = o.car_type_id
     WHERE o.id = $1`,
    [orderId]
  );
  return rows[0];
}

function confirmKeyboard(orderId) {
  return Markup.inlineKeyboard([
    Markup.button.callback('✅ Підтвердити', `confirm_${orderId}`),
    Markup.button.callback('❌ Відхилити', `decline_${orderId}`),
  ]);
}

function advanceKeyboard(orderId, label) {
  return Markup.inlineKeyboard([Markup.button.callback(label, `advance_${orderId}`)]);
}

function mainKeyboard() {
  return Markup.keyboard([
    ['🟢 Вийти онлайн', '🔴 Піти офлайн'],
    ['📍 Оновити локацію'],
  ]).resize();
}

function locationKeyboard() {
  return Markup.keyboard([
    [Markup.button.locationRequest('📡 Надіслати GPS-локацію')],
    ['⬅ Назад до меню'],
  ]).resize();
}

async function getDistinctCities() {
  const { rows } = await pool.query('SELECT name FROM cities ORDER BY name');
  return rows.map(r => r.name);
}

function citiesInlineKeyboard(cities) {
  const rows = [];
  for (let i = 0; i < cities.length; i += 2) {
    const chunk = cities.slice(i, i + 2).map(c => Markup.button.callback(c, `city_${c}`));
    rows.push(chunk);
  }
  return Markup.inlineKeyboard(rows);
}

// Викликається з REST API, коли диспетчер призначає водія на замовлення
async function notifyDriverNewOrder(driverId, orderId) {
  if (!botEnabled) return { ok: false, reason: 'bot_not_configured' };

  const { rows: driverRows } = await pool.query('SELECT * FROM drivers WHERE id=$1', [driverId]);
  const driver = driverRows[0];
  if (!driver || !driver.telegram_chat_id) return { ok: false, reason: 'driver_not_linked' };

  const order = await getOrderFull(orderId);
  const route = { start_city: order.start_city, end_city: order.end_city, stop1: order.stop1, stop2: order.stop2 };
  const text = formatOrderMessage(order, route, { name: order.car_name });

  const msg = await bot.telegram.sendMessage(driver.telegram_chat_id, text, confirmKeyboard(order.id));
  await pool.query('UPDATE orders SET telegram_message_id=$1 WHERE id=$2', [String(msg.message_id), order.id]);
  return { ok: true };
}

if (botEnabled) {
// /start <код_прив'язки> — водій підключає свій Telegram до профілю
bot.start(async (ctx) => {
  const code = (ctx.startPayload || '').trim();
  if (!code) {
    return ctx.reply('Вітаю! Щоб підключитись, попросіть у диспетчера код прив\'язки та надішліть:\n/start ВАШ_КОД');
  }
  const { rows } = await pool.query('SELECT * FROM drivers WHERE link_code=$1', [code]);
  const driver = rows[0];
  if (!driver) return ctx.reply('Код не знайдено. Перевірте код у диспетчера.');

  // Якщо цей Telegram-акаунт уже прив'язаний до іншого (старого/тестового) запису водія —
  // відв'язуємо його звідти, щоб уникнути конфлікту унікальності
  await pool.query(
    'UPDATE drivers SET telegram_chat_id=NULL WHERE telegram_chat_id=$1 AND id<>$2',
    [String(ctx.chat.id), driver.id]
  );

  await pool.query(
    'UPDATE drivers SET telegram_chat_id=$1, link_code=NULL WHERE id=$2',
    [String(ctx.chat.id), driver.id]
  );
  await ctx.reply(
    `Вітаю, ${driver.name}! Ваш акаунт підключено.\nВикористовуйте кнопки нижче, щоб керувати статусом і локацією.`,
    mainKeyboard()
  );
});

bot.hears('🟢 Вийти онлайн', async (ctx) => {
  await pool.query('UPDATE drivers SET status=$1 WHERE telegram_chat_id=$2', ['online', String(ctx.chat.id)]);
  await ctx.reply('Статус: онлайн ✅. Очікуйте замовлення.');
});

bot.hears('🔴 Піти офлайн', async (ctx) => {
  await pool.query('UPDATE drivers SET status=$1 WHERE telegram_chat_id=$2', ['offline', String(ctx.chat.id)]);
  await ctx.reply('Статус: офлайн 🚫. Нові замовлення не надходитимуть.');
});

bot.hears('📍 Оновити локацію', async (ctx) => {
  const cities = await getDistinctCities();
  await ctx.reply('Оберіть спосіб визначення локації: натисніть кнопку GPS нижче або оберіть місто зі списку.', locationKeyboard());
  if (cities.length > 0) {
    await ctx.reply('Оберіть місто:', citiesInlineKeyboard(cities));
  } else {
    await ctx.reply('Диспетчер ще не додав жодного міста до списку — скористайтесь GPS.');
  }
});

bot.hears('⬅ Назад до меню', async (ctx) => {
  await ctx.reply('Головне меню', mainKeyboard());
});

bot.on('location', async (ctx) => {
  const { latitude, longitude } = ctx.message.location;
  await pool.query(
    `UPDATE drivers SET current_lat=$1, current_lng=$2, current_city=NULL, location_updated_at=now()
     WHERE telegram_chat_id=$3`,
    [latitude, longitude, String(ctx.chat.id)]
  );
  await ctx.reply('📍 Локацію (GPS) оновлено. Диспетчер бачить її в панелі.', mainKeyboard());
});

bot.action(/^city_(.+)$/, async (ctx) => {
  const city = ctx.match[1];
  await pool.query(
    `UPDATE drivers SET current_city=$1, current_lat=NULL, current_lng=NULL, location_updated_at=now()
     WHERE telegram_chat_id=$2`,
    [city, String(ctx.chat.id)]
  );
  await ctx.editMessageReplyMarkup(null);
  await ctx.reply(`📍 Локацію оновлено: ${city}`, mainKeyboard());
  await ctx.answerCbQuery('Локацію оновлено');
});

bot.action(/confirm_(\d+)/, async (ctx) => {
  const orderId = ctx.match[1];
  await pool.query(
    "UPDATE orders SET status='confirmed', updated_at=now() WHERE id=$1 AND status='sent'",
    [orderId]
  );
  await ctx.editMessageReplyMarkup(null);
  await ctx.reply('Замовлення підтверджено. Коли заберете пасажира — натисніть кнопку нижче.',
    advanceKeyboard(orderId, 'Забрав пасажира — виїхали'));
  await ctx.answerCbQuery('Підтверджено');
});

bot.action(/decline_(\d+)/, async (ctx) => {
  const orderId = ctx.match[1];
  const { rows } = await pool.query('SELECT driver_id FROM orders WHERE id=$1', [orderId]);
  const driverId = rows[0] && rows[0].driver_id;
  await pool.query("UPDATE orders SET status='new', driver_id=NULL, updated_at=now() WHERE id=$1", [orderId]);
  if (driverId) await pool.query('UPDATE drivers SET current_order_id=NULL WHERE id=$1', [driverId]);
  await ctx.editMessageReplyMarkup(null);
  await ctx.reply('Ви відхилили замовлення. Диспетчер призначить іншого водія.');
  await ctx.answerCbQuery('Відхилено');
});

bot.action(/advance_(\d+)/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = await getOrderFull(orderId);
  if (!order) return ctx.answerCbQuery('Замовлення не знайдено');
  const route = { start_city: order.start_city, end_city: order.end_city, stop1: order.stop1, stop2: order.stop2 };
  const stages = routeStages(route);

  await ctx.editMessageReplyMarkup(null);

  if (order.status === 'confirmed') {
    const stage = stages[0];
    await pool.query("UPDATE orders SET status='in_progress', stage=$1, updated_at=now() WHERE id=$2", [stage, orderId]);
    const nextIdx = 1;
    if (nextIdx < stages.length) {
      const label = nextIdx === stages.length - 1 ? 'Завершити поїздку' : `Далі: ${stageLabel(route, stages[nextIdx])}`;
      await ctx.reply(`Етап: ${stageLabel(route, stage)}`, advanceKeyboard(orderId, label));
    }
  } else if (order.status === 'in_progress') {
    const idx = stages.indexOf(order.stage);
    const nextIdx = idx + 1;
    const stage = stages[nextIdx];
    if (stage === 'end') {
      await pool.query("UPDATE orders SET status='completed', stage=$1, updated_at=now() WHERE id=$2", [stage, orderId]);
      await pool.query('UPDATE drivers SET current_order_id=NULL WHERE id=$1', [order.driver_id]);
      await ctx.reply(`✅ Поїздку завершено: ${stageLabel(route, stage)}`);
    } else {
      await pool.query("UPDATE orders SET stage=$1, updated_at=now() WHERE id=$2", [stage, orderId]);
      const followIdx = nextIdx + 1;
      const label = followIdx === stages.length - 1 ? 'Завершити поїздку' : `Далі: ${stageLabel(route, stages[followIdx])}`;
      await ctx.reply(`Етап: ${stageLabel(route, stage)}`, advanceKeyboard(orderId, label));
    }
  }
  await ctx.answerCbQuery('Оновлено');
});

bot.catch((err, ctx) => {
  console.error('Помилка бота:', err);
  try { ctx.reply('Сталася технічна помилка. Спробуйте ще раз або зверніться до диспетчера.'); } catch (e) {}
});
} // кінець блоку if (botEnabled)

module.exports = { bot, botEnabled, notifyDriverNewOrder };
