const express = require('express');
const router = express.Router();
const smm = require('../services/smmClient');
const storage = require('../services/storage');
const checker = require('../services/followerChecker');

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
 * Atualiza a contagem atual de seguidores da conta (automático ou manual)
 * e avalia se precisa de Refill
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

    // Se não passou manual, tenta consultar publicamente
    if (followers === null) {
      const live = await checker.fetchCurrentFollowers(order.link);
      if (live && live.followers !== null) {
        followers = live.followers;
      }
    }

    if (followers !== null) {
      order.currentFollowers = followers;
      order.lastCheckedFollowers = new Date().toISOString();

      // Calcula teto e necessidade de refill
      const target = order.targetAmount || (Number(order.start_count || 0) + Number(order.quantity || 0));
      order.targetAmount = target;
      // Se seguidores atuais estão abaixo do teto contratado
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
 * Verifica todos os pedidos que precisam de refill e dispara
 */
router.post('/orders/auto-refill-check', async (req, res) => {
  try {
    const db = storage.loadData();
    const actionsTaken = [];

    for (const order of db.orders) {
      const target = order.targetAmount || (Number(order.start_count || 0) + Number(order.quantity || 0));
      if (order.currentFollowers !== null && order.currentFollowers < target) {
        // Dispara o refill
        const result = await smm.requestRefill(order.orderId);
        actionsTaken.push({
          orderId: order.orderId,
          target,
          current: order.currentFollowers,
          drop: target - order.currentFollowers,
          result
        });
        order.lastRefillRequested = new Date().toISOString();
        order.lastRefillResult = result;
      }
    }

    storage.saveData(db);
    res.json({ count: actionsTaken.length, actions: actionsTaken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/orders/sync
 */
router.post('/orders/sync', async (req, res) => {
  try {
    const db = storage.loadData();
    if (!db.orders || db.orders.length === 0) {
      return res.json({ message: 'Nenhum pedido para sincronizar' });
    }

    const ids = db.orders.map(o => o.orderId).filter(Boolean);
    if (ids.length === 0) return res.json({ message: 'Sem IDs válidos' });

    const statusMap = await smm.getOrderStatus(ids.slice(0, 100));

    db.orders.forEach(o => {
      const live = statusMap[String(o.orderId)];
      if (live && !live.error) {
        o.status = live.status;
        o.charge = live.charge;
        o.start_count = live.start_count;
        o.remains = live.remains;
        // Atualiza teto
        o.targetAmount = Number(live.start_count || 0) + Number(o.quantity || 0);
        if (o.currentFollowers !== null && o.currentFollowers !== undefined) {
          o.needsRefill = o.currentFollowers < o.targetAmount;
          o.dropAmount = Math.max(0, o.targetAmount - o.currentFollowers);
        }
      }
    });

    storage.saveData(db);
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

module.exports = router;
