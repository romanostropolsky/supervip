const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Потрібна авторизація' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.dispatcher = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Недійсний або прострочений токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.dispatcher || req.dispatcher.role !== 'admin') {
    return res.status(403).json({ error: 'Потрібні права адміністратора' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
