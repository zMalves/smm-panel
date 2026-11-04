const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const mcpRoutes = require('./routes/mcp');
const cronManager = require('./services/cronManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Rota de Login (Página de login pública)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Documentação MCP e API (Estática)
app.use('/docs', express.static(path.join(__dirname, '..', 'docs')));

// Rotas de Autenticação e Usuários (Login, Logout, Tokens)
app.use('/api/auth', authRoutes);

// Rotas REST da Aplicação (Protegidas)
app.use('/api', apiRoutes);

// Rotas MCP (Protegidas por Token)
app.use('/mcp', mcpRoutes);

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicia as tarefas agendadas (Cron Jobs)
cronManager.initScheduler();

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 SMM Panel Manager rodando com sucesso!`);
  console.log(`🔐 Autenticação e Gestão de Usuários ativas`);
  console.log(`🔑 Tokens de Integração MCP / API ativos`);
  console.log(`🤖 MCP Server em: /mcp/tools e /mcp/call`);
  console.log(`🔗 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
