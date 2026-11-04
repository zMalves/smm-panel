const express = require('express');
const router = express.Router();
const smm = require('../services/smmClient');
const storage = require('../services/storage');
const checker = require('../services/followerChecker');
const cronManager = require('../services/cronManager');

/**
 * Definição oficial das ferramentas (Tools) MCP
 */
const MCP_TOOLS = [
  {
    name: "get_balance",
    description: "Consulta o saldo atual da conta e a moeda utilizada no provedor SMM.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "list_services",
    description: "Lista serviços disponíveis no catálogo SMM com suporte a filtros de categoria, tipo e termo de busca.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filtrar por nome de categoria (ex: 'Instagram', 'TikTok')" },
        search: { type: "string", description: "Buscar por palavra-chave ou ID do serviço" },
        type: { type: "string", description: "Tipo de serviço: Default, Package, Custom Comments, etc." }
      }
    }
  },
  {
    name: "create_order",
    description: "Cria um novo pedido de seguidores, curtidas, visualizações, etc. no provedor SMM e registra na base.",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "integer", description: "ID do serviço do catálogo" },
        link: { type: "string", description: "URL ou perfil de destino (ex: https://www.instagram.com/usuario/)" },
        quantity: { type: "integer", description: "Quantidade desejada" },
        runs: { type: "integer", description: "Número de entregas (Drip-feed opcional)" },
        interval: { type: "integer", description: "Intervalo em minutos entre entregas (opcional)" },
        addToAccountTarget: { type: "boolean", description: "Se verdadeiro, soma a quantidade ao teto/meta da conta" }
      },
      required: ["service", "link", "quantity"]
    }
  },
  {
    name: "get_order_status",
    description: "Consulta o status atual de um ou múltiplos pedidos (separados por vírgula).",
    inputSchema: {
      type: "object",
      properties: {
        orders: { type: "string", description: "ID do pedido ou lista de IDs separados por vírgula (ex: '96770' ou '96770,96579')" }
      },
      required: ["orders"]
    }
  },
  {
    name: "request_refill",
    description: "Solicita reposição (Refill) para um ou mais pedidos concluídos que sofreram queda.",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "integer", description: "ID do pedido elegível para reposição" }
      },
      required: ["orderId"]
    }
  },
  {
    name: "get_refill_status",
    description: "Consulta o status de processamento de um pedido de Refill.",
    inputSchema: {
      type: "object",
      properties: {
        refillId: { type: "string", description: "ID da solicitação de refill" }
      },
      required: ["refillId"]
    }
  },
  {
    name: "list_accounts",
    description: "Lista todas as contas monitoradas pelo app, informando meta/teto, contagem atual e se há queda ativa.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "manage_account",
    description: "Cria ou atualiza uma conta monitorada no painel (meta, link, contagem).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome ou identificador da conta" },
        link: { type: "string", description: "URL do perfil" },
        targetFollowers: { type: "integer", description: "Meta de seguidores a manter" },
        currentFollowers: { type: "integer", description: "Contagem atual de seguidores" },
        autoRefillEnabled: { type: "boolean", description: "Se a conta participa do auto-refill" }
      },
      required: ["link", "targetFollowers"]
    }
  },
  {
    name: "run_refill_check",
    description: "Força a verificação de todas as contas cadastradas e dispara reposição para todas que tiverem queda.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

/**
 * GET /mcp/tools
 * Retorna o manifesto de ferramentas MCP (para discovery de agentes e ferramentas)
 */
router.get('/tools', (req, res) => {
  res.json({
    schema_version: "v1",
    name: "smm-panel-mcp-server",
    description: "Servidor MCP para Gestão de Pedidos SMM, Catálogo, Contas e Automação de Refill",
    tools: MCP_TOOLS
  });
});

/**
 * POST /mcp/call
 * Endpoint JSON-RPC / MCP Call para execução das ferramentas por agentes de IA e outros apps
 */
router.post('/call', async (req, res) => {
  const { name, arguments: args } = req.body;
  const toolName = name || (req.body.params && req.body.params.name);
  const toolArgs = args || (req.body.params && req.body.params.arguments) || {};

  try {
    let result = null;

    switch (toolName) {
      case 'get_balance':
        result = await smm.getBalance();
        break;

      case 'list_services': {
        const services = await smm.getServices();
        let filtered = Array.isArray(services) ? services : [];
        if (toolArgs.category) {
          filtered = filtered.filter(s => s.category && s.category.toLowerCase().includes(toolArgs.category.toLowerCase()));
        }
        if (toolArgs.type) {
          filtered = filtered.filter(s => s.type && s.type.toLowerCase() === toolArgs.type.toLowerCase());
        }
        if (toolArgs.search) {
          const q = toolArgs.search.toLowerCase();
          filtered = filtered.filter(s =>
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.category && s.category.toLowerCase().includes(q)) ||
            String(s.service) === q
          );
        }
        result = { total: filtered.length, services: filtered };
        break;
      }

      case 'create_order': {
        const orderRes = await smm.createOrder({
          service: toolArgs.service,
          link: toolArgs.link,
          quantity: toolArgs.quantity,
          runs: toolArgs.runs,
          interval: toolArgs.interval
        });

        if (orderRes.order) {
          const db = storage.loadData();
          const cleanLink = toolArgs.link.trim().replace(/\/+$/, '') + '/';
          const qty = Number(toolArgs.quantity);

          db.orders.unshift({
            orderId: orderRes.order,
            serviceId: Number(toolArgs.service),
            link: cleanLink,
            quantity: qty,
            status: 'Pending',
            start_count: '0',
            targetAmount: qty,
            createdAt: new Date().toISOString()
          });

          // Atualiza conta se existir
          const acc = db.accounts.find(a => a.link.toLowerCase() === cleanLink.toLowerCase());
          if (acc && toolArgs.addToAccountTarget) {
            acc.targetFollowers = (acc.targetFollowers || 0) + qty;
          }
          storage.saveData(db);
        }
        result = orderRes;
        break;
      }

      case 'get_order_status':
        result = await smm.getOrderStatus(toolArgs.orders);
        break;

      case 'request_refill':
        result = await smm.requestRefill(toolArgs.orderId);
        break;

      case 'get_refill_status':
        result = await smm.getRefillStatus(toolArgs.refillId);
        break;

      case 'list_accounts': {
        const db = storage.loadData();
        result = (db.accounts || []).map(acc => ({
          ...acc,
          needsRefill: acc.currentFollowers !== null && acc.currentFollowers < acc.targetFollowers,
          dropAmount: acc.currentFollowers !== null && acc.currentFollowers < acc.targetFollowers ? (acc.targetFollowers - acc.currentFollowers) : 0
        }));
        break;
      }

      case 'manage_account': {
        const db = storage.loadData();
        const cleanLink = toolArgs.link.trim().replace(/\/+$/, '') + '/';
        let acc = db.accounts.find(a => a.link.toLowerCase() === cleanLink.toLowerCase());

        if (acc) {
          if (toolArgs.name) acc.name = toolArgs.name;
          if (toolArgs.targetFollowers) acc.targetFollowers = Number(toolArgs.targetFollowers);
          if (toolArgs.currentFollowers !== undefined) acc.currentFollowers = Number(toolArgs.currentFollowers);
          if (toolArgs.autoRefillEnabled !== undefined) acc.autoRefillEnabled = Boolean(toolArgs.autoRefillEnabled);
          acc.lastChecked = new Date().toISOString();
        } else {
          acc = {
            id: `acc_${Date.now()}`,
            name: toolArgs.name || checker.extractUsername(cleanLink) || 'Nova Conta',
            platform: cleanLink.includes('instagram') ? 'instagram' : 'other',
            link: cleanLink,
            targetFollowers: Number(toolArgs.targetFollowers),
            currentFollowers: toolArgs.currentFollowers !== undefined ? Number(toolArgs.currentFollowers) : Number(toolArgs.targetFollowers),
            autoRefillEnabled: toolArgs.autoRefillEnabled !== undefined ? Boolean(toolArgs.autoRefillEnabled) : true,
            lastChecked: new Date().toISOString()
          };
          db.accounts.push(acc);
        }
        storage.saveData(db);
        result = acc;
        break;
      }

      case 'run_refill_check':
        result = await cronManager.executeRefillCheckTask();
        break;

      default:
        return res.status(404).json({
          error: `Ferramenta MCP desconhecida: "${toolName}"`,
          available_tools: MCP_TOOLS.map(t => t.name)
        });
    }

    res.json({
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: false,
      data: result
    });
  } catch (err) {
    res.status(500).json({
      content: [
        {
          type: "text",
          text: `Erro na execução da tool ${toolName}: ${err.message}`
        }
      ],
      isError: true,
      error: err.message
    });
  }
});

module.exports = router;
