const path = require('path');
const pureimage = require('pureimage');
const { PassThrough } = require('stream');

const LATIN_FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'NotoSans-Bold.ttf');
const HEBREW_FONT_PATH = path.join(__dirname, 'assets', 'fonts', 'NotoSansHebrew-Bold.ttf');
const LATIN_FAMILY = 'NotoSansBold';
const HEBREW_FAMILY = 'NotoSansHebrewBold';

let fontsLoadPromise = null;
function ensureFontsLoaded() {
  if (!fontsLoadPromise) {
    const latin = pureimage.registerFont(LATIN_FONT_PATH, LATIN_FAMILY);
    const hebrew = pureimage.registerFont(HEBREW_FONT_PATH, HEBREW_FAMILY);
    fontsLoadPromise = Promise.all([latin.load(), hebrew.load()]);
  }
  return fontsLoadPromise;
}

const HEBREW_RANGE = /[\u0590-\u05FF]/;
function isHebrewText(text) {
  return HEBREW_RANGE.test(text);
}
// Іврит пишеться справа наліво. pureimage/opentype.js рендерить рядки лише зліва направо,
// тому для простих імен (без змішування зі скриптами іншого напрямку) реверсуємо порядок
// символів — цього достатньо для коректного відображення короткого імені пасажира.
function prepareDisplayText(text) {
  if (isHebrewText(text)) return text.split('').reverse().join('');
  return text;
}
function fontFamilyFor(text) {
  return isHebrewText(text) ? HEBREW_FAMILY : LATIN_FAMILY;
}

function centerText(ctx, text, cx, y) {
  const w = ctx.measureText(text).width;
  ctx.fillText(text, cx - w / 2, y);
}

function fitFontSize(ctx, family, text, maxWidth, startSize, minSize = 40, step = 6) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= step;
  }
  return size;
}

// Генерує PNG-табличку для зустрічі пасажира: ім'я великими літерами + рейс + дата.
// Підтримує кирилицю, латиницю та іврит (з коректним RTL-порядком символів).
// Повертає Buffer з готовим PNG-зображенням.
async function generatePlacard({ name, flightNumber, flightDate }) {
  await ensureFontsLoaded();

  const W = 1080, H = 1350;
  const img = pureimage.make(W, H);
  const ctx = img.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Рамка
  ctx.fillStyle = '#111111';
  const border = 16;
  ctx.fillRect(0, 0, W, border);
  ctx.fillRect(0, H - border, W, border);
  ctx.fillRect(0, 0, border, H);
  ctx.fillRect(W - border, 0, border, H);

  // Верхній підпис
  ctx.font = `46px ${LATIN_FAMILY}`;
  ctx.fillStyle = '#666666';
  centerText(ctx, 'ЗУСТРІЧАЮ', W / 2, 140);

  // Ім'я пасажира — великими літерами, автопідбір розміру під ширину, правильний скрипт/напрямок
  const rawName = String(name || 'ПАСАЖИР').toUpperCase();
  const family = fontFamilyFor(rawName);
  const displayName = prepareDisplayText(rawName);
  const fontSize = fitFontSize(ctx, family, displayName, W - 140, 150);
  ctx.font = `${fontSize}px ${family}`;
  ctx.fillStyle = '#111111';
  centerText(ctx, displayName, W / 2, H / 2);

  // Рейс і дата знизу (завжди латиниця/цифри)
  const parts = [];
  if (flightNumber) parts.push(`Рейс ${flightNumber}`);
  if (flightDate) {
    const d = new Date(flightDate);
    const dateStr = isNaN(d) ? String(flightDate) : d.toLocaleDateString('uk-UA');
    parts.push(dateStr);
  }
  if (parts.length) {
    ctx.font = `52px ${LATIN_FAMILY}`;
    ctx.fillStyle = '#333333';
    centerText(ctx, parts.join('   •   '), W / 2, H - 160);
  }

  const chunks = [];
  const stream = new PassThrough();
  stream.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  await pureimage.encodePNGToStream(img, stream);
  await done;
  return Buffer.concat(chunks);
}

module.exports = { generatePlacard };
