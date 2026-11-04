const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../services/storage');
const { JWT_SECRET, authMiddleware } = require('../middlewares/auth');

/**
 * POST /api/auth/login
 * Realiza autenticação e retorna Token JWT + Cookie HttpOnly
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const tokenPayload = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

  // Define cookie HttpOnly
  res.cookie('auth_token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  });

  res.json({
    success: true,
    user: tokenPayload,
    token
  });
});

/**
 * POST /api/auth/logout
 * Limpa cookie de sessão
 */
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado
 */
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    auth: req.auth
  });
});

/* ========================================================
   GERENCIAMENTO DE USUÁRIOS (USERS CRUD)
   ======================================================== */

/**
 * GET /api/auth/users
 */
router.get('/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, name, username, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

/**
 * POST /api/auth/users
 * Criar novo usuário
 */
router.post('/users', authMiddleware, (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const userId = `usr_${Date.now()}`;
    db.prepare(`
      INSERT INTO users (id, name, username, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, name.trim(), username.trim().toLowerCase(), hash, role || 'operator');

    res.json({ success: true, user: { id: userId, name, username, role: role || 'operator' } });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Nome de usuário já em uso' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/auth/users/:id
 */
router.delete('/users/:id', authMiddleware, (req, res) => {
  const count = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (count <= 1) {
    return res.status(400).json({ error: 'Não é possível excluir o único usuário do sistema.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/* ========================================================
   GERENCIAMENTO DE API TOKENS (MCP & APPS EXTERNOS)
   ======================================================== */

/**
 * GET /api/auth/tokens
 * Lista tokens cadastrados
 */
router.get('/tokens', authMiddleware, (req, res) => {
  const tokens = db.prepare('SELECT id, name, token, role, last_used, created_at FROM api_tokens ORDER BY created_at DESC').all();
  res.json(tokens);
});

/**
 * POST /api/auth/tokens
 * Gera novo token de API para agentes, n8n ou outros apps
 */
router.post('/tokens', authMiddleware, (req, res) => {
  const { name, role } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Nome da integração é obrigatório (ex: "App n8n", "Bot de IA")' });
  }

  const tokenId = `tok_${Date.now()}`;
  const rawToken = 'smm_sec_' + crypto.randomBytes(24).toString('hex');

  db.prepare(`
    INSERT INTO api_tokens (id, name, token, role)
    VALUES (?, ?, ?, ?)
  `).run(tokenId, name.trim(), rawToken, role || 'full_access');

  res.json({
    success: true,
    token: {
      id: tokenId,
      name,
      token: rawToken,
      role: role || 'full_access'
    }
  });
});

/**
 * DELETE /api/auth/tokens/:id
 * Revoga um token de API
 */
router.delete('/tokens/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM api_tokens WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;

