const express = require('express');
const router = express.Router();
const smm = require('../services/smmClient');
const storage = require('../services/storage');
const checker = require('../services/followerChecker');
const cronManager = require('../services/cronManager');

/**
 * GET /api/balance
 */
router.get('/balance', async (req, res) => {
  try {
    const data = await smm.getBalance();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/services
 */
router.get('/services', async (req, res) => {
  try {
    const { category, search, type } = req.query;
    const services = await smm.getServices();

    if (!Array.isArray(services)) {
      return res.status(500).json(services);
    }

    let filtered = services;
    if (category) {
      filtered = filtered.filter(s => s.category && s.category.toLowerCase().includes(category.toLowerCase()));
    }
    if (type) {
      filtered = filtered.filter(s => s.type && s.type.toLowerCase() === type.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.category && s.category.toLowerCase().includes(q)) ||
        String(s.service) === q
      );
    }

    res.json({
      total: filtered.length,
      services: filtered
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   GESTÃO DE CONTAS (ACCOUNTS CRUD)
   ======================================================== */

/**
 * GET /api/accounts
 * Lista todas as contas monitoradas com cálculo de queda e teto
 */
router.get('/accounts', (req, res) => {
  const db = storage.loadData();
  const accountsWithStats = (db.accounts || []).map(acc => {
    // Pedidos vinculados à conta
    const orders = (db.orders || []).filter(o => o.link === acc.link || o.accountId === acc.id);
    const drop = acc.currentFollowers !== null && acc.currentFollowers !== undefined && acc.currentFollowers < acc.targetFollowers
      ? (acc.targetFollowers - acc.currentFollowers)
      : 0;

    return {
      ...acc,
      ordersCount: orders.length,
      dropAmount: drop,
      needsRefill: drop > 0,
      recentOrders: orders.slice(0, 5)
    };
  });

  res.json(accountsWithStats);
});

/**
 * POST /api/accounts
 * Cadastra ou atualiza uma conta monitorada
 */
router.post('/accounts', (req, res) => {
  try {
    const { id, name, link, targetFollowers, currentFollowers, serviceId, notes, autoRefillEnabled } = req.body;
    if (!link || !targetFollowers) {
      return res.status(400).json({ error: 'link e targetFollowers (meta/teto) são obrigatórios' });
    }

    const db = storage.loadData();
    if (!db.accounts) db.accounts = [];

    const accountId = id || `acc_${Date.now()}`;
    const cleanLink = link.trim().replace(/\/+$/, '') + '/';
    const existingIdx = db.accounts.findIndex(a => a.id === accountId || a.link.toLowerCase() === cleanLink.toLowerCase());

    const accountEntry = {
      id: accountId,
      name: name || checker.extractUsername(cleanLink) || 'Nova Conta',
      platform: cleanLink.includes('instagram') ? 'instagram' : cleanLink.includes('tiktok') ? 'tiktok' : 'other',
      link: cleanLink,
      targetFollowers: Number(targetFollowers),
      currentFollowers: currentFollowers !== undefined && currentFollowers !== null ? Number(currentFollowers) : Number(targetFollowers),
      serviceId: serviceId ? Number(serviceId) : undefined,
      autoRefillEnabled: autoRefillEnabled !== undefined ? Boolean(autoRefillEnabled) : true,
      notes: notes || '',
      lastChecked: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      db.accounts[existingIdx] = { ...db.accounts[existingIdx], ...accountEntry };
    } else {
      db.accounts.push(accountEntry);
    }

    storage.saveData(db);
    res.json({ success: true, account: accountEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/accounts/:id
 * Remove uma conta monitorada
 */
router.delete('/accounts/:id', (req, res) => {
  try {
    const db = storage.loadData();
    db.accounts = (db.accounts || []).filter(a => a.id !== req.params.id);
    storage.saveData(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/accounts/:id/update-followers
 * Atualiza os seguidores atuais de uma conta específica
 */
router.post('/accounts/:id/update-followers', async (req, res) => {
  try {
    const { currentFollowers } = req.body;
    const db = storage.loadData();
    const acc = (db.accounts || []).find(a => a.id === req.params.id);

    if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });

    let followers = currentFollowers !== undefined && currentFollowers !== null ? Number(currentFollowers) : null;

    if (followers === null) {
      const live = await checker.fetchCurrentFollowers(acc.link);
      if (live && live.followers !== null) {
        followers = live.followers;
      }
    }

    if (followers !== null) {
      acc.currentFollowers = followers;
      acc.lastChecked = new Date().toISOString();
    }

    storage.saveData(db);
    res.json({ success: true, account: acc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========================================================
   GESTÃO DE PEDIDOS (ORDERS)
   ======================================================== */

/**
 * POST /api/orders
 * Criar Pedido (compras normais ou recompra com atualização da conta)
 */
router.post('/orders', async (req, res) => {
  try {
    const { service, link, quantity, runs, interval, comments, accountId, addToTarget } = req.body;

    if (!service || !link || !quantity) {
      return res.status(400).json({ error: 'service, link e quantity são obrigatórios' });
    }

    const orderRes = await smm.createOrder({ service, link, quantity, runs, interval, comments });

    if (orderRes.order) {
      const db = storage.loadData();
      const cleanLink = link.trim().replace(/\/+$/, '') + '/';

      // Localiza ou vincula a conta monitorada
      let acc = (db.accounts || []).find(a => a.id === accountId || a.link.toLowerCase() === cleanLink.toLowerCase());

      const qtyNum = Number(quantity);
      const newEntry = {
        orderId: orderRes.order,
        serviceId: Number(service),
        link: cleanLink,
        accountId: acc ? acc.id : undefined,
        quantity: qtyNum,
        runs: runs ? Number(runs) : undefined,
        interval: interval ? Number(interval) : undefined,
        status: 'Pending',
        charge: '0',
        start_count: '0',
        targetAmount: qtyNum,
        createdAt: new Date().toISOString()
      };

      if (!db.orders) db.orders = [];
      db.orders.unshift(newEntry);

      // Se a conta já existe e o usuário marcou somar ao teto
      if (acc) {
        if (addToTarget) {
          acc.targetFollowers = (acc.targetFollowers || 0) + qtyNum;
        }
        acc.lastChecked = new Date().toISOString();
      } else {
        // Cria automaticamente o registro da conta para gerenciamento unificado
        db.accounts.push({
          id: `acc_${Date.now()}`,
          name: checker.extractUsername(cleanLink) || 'Conta Automática',
          platform: cleanLink.includes('instagram') ? 'instagram' : 'other',
          link: cleanLink,
          targetFollowers: qtyNum,
          currentFollowers: qtyNum,
          serviceId: Number(service),
          autoRefillEnabled: true,
          notes: 'Criada automaticamente no novo pedido',
          lastChecked: new Date().toISOString()
        });
      }

      storage.saveData(db);
    }

    res.json(orderRes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/orders/local
 */
router.get('/orders/local', (req, res) => {
  const db = storage.loadData();
  res.json(db.orders || []);
});

/**
 * POST /api/orders/sync
 */
router.post('/orders/sync', async (req, res) => {
  try {
    await cronManager.executeSyncStatusTask();
    const db = storage.loadData();
    res.json({ updated: db.orders.length, orders: db.orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/refill
 */
router.post('/refill', async (req, res) => {
  try {
    const { order, orders } = req.body;
    const target = orders || order;
    if (!target) {
      return res.status(400).json({ error: 'Informe order ou orders' });
    }

    const result = await smm.requestRefill(target);

    const db = storage.loadData();
    if (!db.refillLogs) db.refillLogs = [];
    db.refillLogs.unshift({
      target,
      result,
      requestedAt: new Date().toISOString()
    });
    storage.saveData(db);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/refill/status/:id
 */
router.get('/refill/status/:id', async (req, res) => {
  try {
    const data = await smm.getRefillStatus(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/cancel
 */
router.post('/cancel', async (req, res) => {
  try {
    const { orders } = req.body;
    if (!orders) return res.status(400).json({ error: 'Informe orders' });
    const result = await smm.cancelOrders(orders);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * CRONS
 */
router.get('/crons', (req, res) => {
  const db = storage.loadData();
  res.json({
    configs: db.cronConfigs || [],
    history: db.cronHistory || []
  });
});

router.post('/crons', (req, res) => {
  const { id, name, expression, enabled, description } = req.body;
  if (!name || !expression) {
    return res.status(400).json({ error: 'Nome e expressão cron são obrigatórios' });
  }

  const db = storage.loadData();
  if (!db.cronConfigs) db.cronConfigs = [];

  const cronId = id || `cron_${Date.now()}`;
  const existingIdx = db.cronConfigs.findIndex(c => c.id === cronId);

  const newConfig = {
    id: cronId,
    name,
    expression,
    enabled: enabled !== undefined ? enabled : true,
    description: description || ''
  };

  if (existingIdx >= 0) {
    db.cronConfigs[existingIdx] = newConfig;
  } else {
    db.cronConfigs.push(newConfig);
  }

  storage.saveData(db);
  cronManager.scheduleJob(newConfig);

  res.json({ success: true, cron: newConfig });
});

router.post('/crons/trigger/:id', async (req, res) => {
  try {
    if (req.params.id === 'daily_refill_check') {
      const result = await cronManager.executeRefillCheckTask();
      return res.json({ success: true, result });
    }
    if (req.params.id === 'hourly_order_sync') {
      await cronManager.executeSyncStatusTask();
      return res.json({ success: true, message: 'Sincronização concluída' });
    }
    res.status(400).json({ error: 'Ação não encontrada para esta cron' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
