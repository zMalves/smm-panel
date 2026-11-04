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

/**
 * POST /api/orders
 */
router.post('/orders', async (req, res) => {
  try {
    const { service, link, quantity, runs, interval, comments } = req.body;

    if (!service || !link || !quantity) {
      return res.status(400).json({ error: 'service, link e quantity são obrigatórios' });
    }

    const orderRes = await smm.createOrder({ service, link, quantity, runs, interval, comments });

    if (orderRes.order) {
      const db = storage.loadData();
      const newEntry = {
        orderId: orderRes.order,
        serviceId: Number(service),
        link,
        quantity: Number(quantity),
        runs: runs ? Number(runs) : undefined,
        interval: interval ? Number(interval) : undefined,
        status: 'Pending',
        charge: '0',
        start_count: '0',
        targetAmount: Number(quantity),
        currentFollowers: null,
        needsRefill: false,
        createdAt: new Date().toISOString()
      };
      db.orders.unshift(newEntry);
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
 * POST /api/orders/update-followers
 */
router.post('/orders/update-followers', async (req, res) => {
  try {
    const { orderId, currentFollowers } = req.body;
    const db = storage.loadData();
    const order = db.orders.find(o => o.orderId === Number(orderId));

    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    let followers = currentFollowers !== undefined && currentFollowers !== null
      ? Number(currentFollowers)
      : null;

    if (followers === null) {
      const live = await checker.fetchCurrentFollowers(order.link);
      if (live && live.followers !== null) {
        followers = live.followers;
      }
    }

    if (followers !== null) {
      order.currentFollowers = followers;
      order.lastCheckedFollowers = new Date().toISOString();

      const target = order.targetAmount || (Number(order.start_count || 0) + Number(order.quantity || 0));
      order.targetAmount = target;
      order.needsRefill = followers < target;
      order.dropAmount = Math.max(0, target - followers);
    }

    storage.saveData(db);
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/auto-refill-check
 */
router.post('/orders/auto-refill-check', async (req, res) => {
  try {
    const result = await cronManager.executeRefillCheckTask();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    if (!orders) {
      return res.status(400).json({ error: 'Informe orders' });
    }
    const result = await smm.cancelOrders(orders);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/crons
 * Retorna as crons configuradas e o histórico de execuções
 */
router.get('/crons', (req, res) => {
  const db = storage.loadData();
  res.json({
    configs: db.cronConfigs || [],
    history: db.cronHistory || []
  });
});

/**
 * POST /api/crons
 * Cria ou atualiza uma cron job
 */
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

/**
 * POST /api/crons/trigger/:id
 * Dispara manualmente uma cron imediatamente
 */
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
