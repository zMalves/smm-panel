const jwt = require('jsonwebtoken');
const { db } = require('../services/storage');

const JWT_SECRET = process.env.JWT_SECRET || 'smm_jwt_super_secret_key_2026_xyz';

/**
 * Middleware para autenticação mista:
 * 1. Aceita Token JWT via Header 'Authorization: Bearer <jwt>' ou Cookie 'auth_token' (Para navegação Web).
 * 2. Aceita API Token estático via Header 'X-API-Key: <token>' ou 'Authorization: Bearer smm_sec_...' (Para outros Apps e MCP).
 */
function authMiddleware(req, res, next) {
  // 1. Verifica se foi passado um API Key de aplicação (X-API-Key ou Bearer smm_sec_...)
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const authHeader = req.headers['authorization'];
  let bearerToken = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  // Verifica API Token de terceiros / integração
  const targetToken = apiKey || (bearerToken && bearerToken.startsWith('smm_sec_') ? bearerToken : null);
  if (targetToken) {
    const tokenRecord = db.prepare('SELECT * FROM api_tokens WHERE token = ?').get(targetToken);
    if (tokenRecord) {
      // Atualiza último uso do token
      db.prepare("UPDATE api_tokens SET last_used = datetime('now') WHERE id = ?").run(tokenRecord.id);
      req.auth = {
        type: 'api_token',
        name: tokenRecord.name,
        role: tokenRecord.role
      };
      return next();
    } else {
      return res.status(401).json({ error: 'API Key inválida ou revogada' });
    }
  }

  // 2. Verifica JWT (Cookie ou Header Bearer)
  const token = bearerToken || (req.cookies && req.cookies.auth_token);
  if (!token) {
    // Se for requisição de página HTML, redireciona para login
    if (req.accepts('html') && !req.path.startsWith('/api') && !req.path.startsWith('/mcp')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Não autenticado. Forneça um token de sessão ou API Key válida.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = {
      type: 'user_session',
      user: decoded
    };
    next();
  } catch (err) {
    if (req.accepts('html') && !req.path.startsWith('/api') && !req.path.startsWith('/mcp')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Sessão expirada ou inválida' });
  }
}

/**
 * Middleware para rotas MCP:
 * Se o app configurar autenticação, exige token válido.
 */
function mcpAuthMiddleware(req, res, next) {
  // Ferramenta de discovery pública ou protegida
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const authHeader = req.headers['authorization'];
  let bearerToken = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerToken = authHeader.substring(7).trim();
  }

  const tokenCandidate = apiKey || bearerToken;
  if (!tokenCandidate) {
    return res.status(401).json({
      content: [{ type: "text", text: "Erro: Autenticação MCP necessária. Envie o header 'X-API-Key: <seu_token>' ou 'Authorization: Bearer <seu_token>'" }],
      isError: true,
      error: "Authentication required"
    });
  }

  // Valida contra api_tokens
  const tokenRecord = db.prepare('SELECT * FROM api_tokens WHERE token = ?').get(tokenCandidate);
  if (tokenRecord) {
    db.prepare("UPDATE api_tokens SET last_used = datetime('now') WHERE id = ?").run(tokenRecord.id);
    req.auth = { type: 'api_token', name: tokenRecord.name };
    return next();
  }

  // Ou valida contra JWT de usuário
  try {
    const decoded = jwt.verify(tokenCandidate, JWT_SECRET);
    req.auth = { type: 'user_session', user: decoded };
    return next();
  } catch (e) {
    return res.status(401).json({
      content: [{ type: "text", text: "Erro: Token MCP inválido ou expirado." }],
      isError: true,
      error: "Invalid token"
    });
  }
}

module.exports = {
  authMiddleware,
  mcpAuthMiddleware,
  JWT_SECRET
};
