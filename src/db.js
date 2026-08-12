const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dispatchers (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'dispatcher'
);
ALTER TABLE dispatchers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'dispatcher';

CREATE TABLE IF NOT EXISTS car_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id SERIAL PRIMARY KEY,
  start_city TEXT NOT NULL,
  end_city TEXT NOT NULL,
  stop1 TEXT,
  stop2 TEXT
);

CREATE TABLE IF NOT EXISTS prices (
  route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE,
  car_type_id INTEGER REFERENCES car_types(id) ON DELETE CASCADE,
  price INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (route_id, car_type_id)
);

CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  car_type_id INTEGER REFERENCES car_types(id),
  status TEXT NOT NULL DEFAULT 'offline',
  telegram_chat_id TEXT UNIQUE,
  link_code TEXT UNIQUE,
  current_order_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  route_id INTEGER REFERENCES routes(id),
  car_type_id INTEGER REFERENCES car_types(id),
  passengers INTEGER NOT NULL DEFAULT 1,
  luggage BOOLEAN NOT NULL DEFAULT false,
  price INTEGER NOT NULL DEFAULT 0,
  commission INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  driver_id INTEGER REFERENCES drivers(id),
  stage TEXT,
  telegram_message_id TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
`;

async function initSchema() {
  await pool.query(SCHEMA);
}

module.exports = { pool, initSchema };
