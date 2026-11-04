const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');
const mcpRoutes = require('./routes/mcp');
const cronManager = require('./services/cronManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rotas REST da Aplicação
app.use('/api', apiRoutes);

// Rotas MCP (Model Context Protocol para IA e Apps Externos)
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
  console.log(`🤖 MCP Server ativo em: /mcp/tools e /mcp/call`);
  console.log(`⏰ Cron Jobs inicializadas e ativas`);
  console.log(`🔗 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
