require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, initSchema } = require('./db');

// Використання: node src/createDispatcher.js <username> <password> [role]
// role: 'admin' (керує акаунтами диспетчерів) або 'dispatcher' (за замовчуванням)
async function main() {
  const [username, password, role] = process.argv.slice(2);
  if (!username || !password) {
    console.log('Використання: node src/createDispatcher.js <username> <password> [admin|dispatcher]');
    process.exit(1);
  }
  const finalRole = role === 'admin' ? 'admin' : 'dispatcher';
  await initSchema();
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO dispatchers (username, password_hash, role) VALUES ($1,$2,$3)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    [username, hash, finalRole]
  );
  console.log(`Диспетчера "${username}" (роль: ${finalRole}) створено/оновлено.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
