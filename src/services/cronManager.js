const cron = require('node-cron');
const storage = require('./storage');
const smm = require('./smmClient');
const checker = require('./followerChecker');

// Armazena as tarefas ativas em memória
const activeJobs = new Map();

/**
 * 1. Tarefa de Verificação de Queda e Disparo de Refill
 */
async function executeRefillCheckTask() {
  const timestamp = new Date().toISOString();
  console.log(`[CRON Refill] Executando verificação de contas às ${timestamp}...`);
  const db = storage.loadData();
  const logs = [];

  for (const order of db.orders) {
    const target = order.targetAmount || (Number(order.start_count || 0) + Number(order.quantity || 0));

    // Se temos um link, consulta seguidores atuais na web (ou usa contagem registrada)
    if (order.link) {
      try {
        const live = await checker.fetchCurrentFollowers(order.link);
        if (live && live.followers !== null) {
          order.currentFollowers = live.followers;
          order.lastCheckedFollowers = timestamp;
        }
      } catch (e) {
        console.error(`[CRON Refill] Erro ao consultar seguidores para ${order.link}:`, e.message);
      }
    }

    // Avalia se caiu abaixo do teto
    if (order.currentFollowers !== null && order.currentFollowers < target) {
      const drop = target - order.currentFollowers;
      order.needsRefill = true;
      order.dropAmount = drop;

      console.log(`[CRON Refill] Queda detectada no pedido #${order.orderId}: Atual=${order.currentFollowers}, Teto=${target}, Drop=${drop}. Disparando refill...`);
      try {
        const refillRes = await smm.requestRefill(order.orderId);
        order.lastRefillRequested = timestamp;
        order.lastRefillResult = refillRes;
        logs.push({
          orderId: order.orderId,
          link: order.link,
          drop,
          result: refillRes,
          timestamp
        });
      } catch (err) {
        console.error(`[CRON Refill] Falha ao acionar refill no pedido #${order.orderId}:`, err.message);
      }
    } else if (order.currentFollowers !== null) {
      order.needsRefill = false;
      order.dropAmount = 0;
    }
  }

  // Registra histórico de execuções
  if (!db.cronHistory) db.cronHistory = [];
  db.cronHistory.unshift({
    jobName: 'daily_refill_check',
    executedAt: timestamp,
    actionsTriggered: logs.length,
    details: logs
  });

  // Mantém apenas os últimos 50 registros no histórico
  if (db.cronHistory.length > 50) db.cronHistory = db.cronHistory.slice(0, 50);

  storage.saveData(db);
  console.log(`[CRON Refill] Concluído! ${logs.length} reposições solicitadas.`);
  return { triggered: logs.length, logs };
}

/**
 * 2. Tarefa de Sincronização de Status dos Pedidos com o Provedor SMM
 */
async function executeSyncStatusTask() {
  const timestamp = new Date().toISOString();
  console.log(`[CRON Sync] Sincronizando status dos pedidos às ${timestamp}...`);
  const db = storage.loadData();
  const ids = db.orders.map(o => o.orderId).filter(Boolean);

  if (ids.length > 0) {
    try {
      const statusMap = await smm.getOrderStatus(ids.slice(0, 100));
      db.orders.forEach(o => {
        const live = statusMap[String(o.orderId)];
        if (live && !live.error) {
          o.status = live.status;
          o.charge = live.charge;
          o.start_count = live.start_count;
          o.remains = live.remains;
          o.targetAmount = Number(live.start_count || 0) + Number(o.quantity || 0);
        }
      });
      storage.saveData(db);
      console.log(`[CRON Sync] ${ids.length} pedidos sincronizados.`);
    } catch (e) {
      console.error('[CRON Sync] Erro na sincronização:', e.message);
    }
  }
}

/**
 * Inicializador das Crons Automáticas
 */
function initScheduler() {
  const db = storage.loadData();
  if (!db.cronConfigs) {
    // Configurações padrão
    db.cronConfigs = [
      {
        id: 'daily_refill_check',
        name: 'Verificação Diária de Quedas e Auto-Refill',
        expression: '0 9 * * *', // Todos os dias às 09:00
        enabled: true,
        description: 'Checa todas as contas e solicita reposição automática se houver queda'
      },
      {
        id: 'hourly_order_sync',
        name: 'Sincronização de Status de Pedidos',
        expression: '0 * * * *', // A cada 1 hora
        enabled: true,
        description: 'Atualiza start_count, status e remanescentes direto do provedor SMM'
      }
    ];
    storage.saveData(db);
  }

  // Registra cada cron ativa
  db.cronConfigs.forEach(cfg => {
    scheduleJob(cfg);
  });
}

function scheduleJob(cfg) {
  if (activeJobs.has(cfg.id)) {
    activeJobs.get(cfg.id).stop();
    activeJobs.delete(cfg.id);
  }

  if (!cfg.enabled) {
    console.log(`[CRON] ${cfg.name} está desativada.`);
    return;
  }

  if (!cron.validate(cfg.expression)) {
    console.error(`[CRON] Expressão inválida para ${cfg.name}: "${cfg.expression}"`);
    return;
  }

  const taskFn = cfg.id === 'daily_refill_check'
    ? executeRefillCheckTask
    : cfg.id === 'hourly_order_sync'
    ? executeSyncStatusTask
    : async () => console.log(`[CRON] Executando tarefa personalizada: ${cfg.name}`);

  const job = cron.schedule(cfg.expression, taskFn);
  activeJobs.set(cfg.id, job);
  console.log(`[CRON] Agendada tarefa "${cfg.name}" com expressão "${cfg.expression}"`);
}

module.exports = {
  initScheduler,
  scheduleJob,
  executeRefillCheckTask,
  executeSyncStatusTask
};
