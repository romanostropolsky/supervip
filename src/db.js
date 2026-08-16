const { Pool } = require('pg');

const isLocal = process.env.DATABASE_URL && (
  process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dispatchers (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dispatcher'
);
ALTER TABLE dispatchers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'dispatcher';

CREATE TABLE IF NOT EXISTS cities (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS route_templates (
  id SERIAL PRIMARY KEY,
  stops JSONB NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  car_model TEXT,
  car_class TEXT NOT NULL DEFAULT 'Стандарт',
  seats INTEGER NOT NULL DEFAULT 4,
  tariff_rate NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'offline',
  telegram_chat_id TEXT UNIQUE,
  link_code TEXT UNIQUE,
  current_order_id INTEGER,
  current_city TEXT,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
-- Безпечна міграція існуючої таблиці drivers (якщо вона вже мала старі/інші колонки)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS car_model TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS car_class TEXT NOT NULL DEFAULT 'Стандарт';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 4;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS tariff_rate NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS link_code TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_order_id INTEGER;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_city TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_telegram_chat_id_key') THEN
    ALTER TABLE drivers ADD CONSTRAINT drivers_telegram_chat_id_key UNIQUE (telegram_chat_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'drivers_link_code_key') THEN
    ALTER TABLE drivers ADD CONSTRAINT drivers_link_code_key UNIQUE (link_code);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  client TEXT NOT NULL,
  passengers INTEGER NOT NULL DEFAULT 1,
  departure_time TIMESTAMP,
  stops JSONB NOT NULL DEFAULT '[]',
  price NUMERIC NOT NULL DEFAULT 0,
  commission NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  driver_id INTEGER REFERENCES drivers(id),
  stage INTEGER,
  telegram_message_id TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
-- Безпечна міграція існуючої таблиці orders (стара схема мала route_id/car_type_id/luggage)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client TEXT;
UPDATE orders SET client = 'Без імені' WHERE client IS NULL;
ALTER TABLE orders ALTER COLUMN client SET NOT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS departure_time TIMESTAMP;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stops JSONB NOT NULL DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission NUMERIC NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE orders ALTER COLUMN stage TYPE INTEGER USING (CASE WHEN stage ~ '^[0-9]+$' THEN stage::INTEGER ELSE NULL END);
EXCEPTION WHEN others THEN NULL;
END $$;
`;

async function initSchema() {
  await pool.query(SCHEMA);
}

module.exports = { pool, initSchema };
