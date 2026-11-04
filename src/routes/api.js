const express = require('express');
const router = express.Router();
const smm = require('../services/smmClient');
const storage = require('../services/storage');
const checker = require('../services/followerChecker');
const cronManager = require('../services/cronManager');
const { authMiddleware } = require('../middlewares/auth');

// Protege todas as rotas internas /api com authMiddleware
router.use(authMiddleware);

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

function calculateWarranty(createdAtStr, serviceName = '') {
  if (!createdAtStr) return null;
  const createdDate = new Date(createdAtStr);
  if (isNaN(createdDate.getTime())) return null;

  // Analisa dias de garantia pelo nome do serviço (ex: R30, AR30 -> 30 dias; R60 -> 60 dias; R365 -> 365 dias)
  let days = 30; // padrão do provedor para serviços com reposição
  const match = (serviceName || '').match(/(?:AR|R)(\d+)/i);
  if (match) {
    days = parseInt(match[1], 10);
  }

  const warrantyUntil = new Date(createdDate.getTime() + days * 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffTime = warrantyUntil - now;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    warrantyDays: days,
    warrantyUntil: warrantyUntil.toISOString(),
    isExpired: daysRemaining < 0,
    daysRemaining: Math.max(0, daysRemaining)
  };
}

router.get('/accounts', (req, res) => {
  const db = storage.loadData();
  const accountsWithStats = (db.accounts || []).map(acc => {
    const orders = (db.orders || []).filter(o => o.link === acc.link || o.accountId === acc.id);
    const drop = acc.currentFollowers !== null && acc.currentFollowers !== undefined && acc.currentFollowers < acc.targetFollowers
      ? (acc.targetFollowers - acc.currentFollowers)
      : 0;

    // Calcula a garantia com base no pedido mais recente ou ativo da conta
    let latestWarranty = null;
    if (orders.length > 0) {
      // Ordena por data de criação decrescente
      const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const latestOrder = sortedOrders[0];
      latestWarranty = calculateWarranty(latestOrder.createdAt, latestOrder.serviceName);
    }

    return {
      ...acc,
      ordersCount: orders.length,
      dropAmount: drop,
      needsRefill: drop > 0,
      warranty: latestWarranty,
      recentOrders: orders.slice(0, 5).map(o => ({
        ...o,
        warranty: calculateWarranty(o.createdAt, o.serviceName)
      }))
    };
  });

  res.json(accountsWithStats);
});

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

router.delete('/accounts/:id', (req, res) => {
  try {
    storage.deleteAccount(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

      let acc = (db.accounts || []).find(a => a.id === accountId || a.link.toLowerCase() === cleanLink.toLowerCase());

      // Busca o nome do serviço no catálogo
      let serviceName = '';
      try {
        const services = await smm.getServices();
        const foundSvc = Array.isArray(services) && services.find(s => String(s.service) === String(service));
        if (foundSvc) serviceName = foundSvc.name;
      } catch (e) {
        // Fallback silencioso
      }

      const qtyNum = Number(quantity);
      const newEntry = {
        orderId: orderRes.order,
        serviceId: Number(service),
        serviceName: serviceName || `Serviço #${service}`,
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

      if (acc) {
        if (addToTarget) {
          acc.targetFollowers = (acc.targetFollowers || 0) + qtyNum;
        }
        acc.lastChecked = new Date().toISOString();
      } else {
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

router.get('/orders/local', (req, res) => {
  const db = storage.loadData();
  const ordersWithWarranty = (db.orders || []).map(o => ({
    ...o,
    warranty: calculateWarranty(o.createdAt, o.serviceName)
  }));
  res.json(ordersWithWarranty);
});

router.post('/orders/auto-refill-check', async (req, res) => {
  try {
    const result = await cronManager.executeRefillCheckTask();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/orders/sync', async (req, res) => {
  try {
    await cronManager.executeSyncStatusTask();
    const db = storage.loadData();
    res.json({ updated: db.orders.length, orders: db.orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.get('/refill/status/:id', async (req, res) => {
  try {
    const data = await smm.getRefillStatus(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

/* ========================================================
   CRONS
   ======================================================== */

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
