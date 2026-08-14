const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Вкажіть логін і пароль' });

  const { rows } = await pool.query('SELECT * FROM dispatchers WHERE username=$1', [username]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Невірний логін або пароль' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Невірний логін або пароль' });

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username, role: user.role });
});

module.exports = router;
