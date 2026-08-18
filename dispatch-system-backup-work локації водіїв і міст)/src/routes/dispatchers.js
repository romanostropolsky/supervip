const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role FROM dispatchers ORDER BY id');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Вкажіть логін і пароль' });
  const finalRole = role === 'admin' ? 'admin' : 'dispatcher';
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO dispatchers (username, password_hash, role) VALUES ($1,$2,$3) RETURNING id, username, role',
      [username, hash, finalRole]
    );
    res.json(rows[0]);
  } catch (e) {
    if (String(e.message).includes('unique')) return res.status(400).json({ error: 'Такий логін вже існує' });
    throw e;
  }
});

router.delete('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.dispatcher.id) {
    return res.status(400).json({ error: 'Не можна видалити власний акаунт, поки ви в ньому' });
  }
  await pool.query('DELETE FROM dispatchers WHERE id=$1', [targetId]);
  res.json({ ok: true });
});

module.exports = router;
