const cron = require('node-cron');
const storage = require('./storage');
const smm = require('./smmClient');
const checker = require('./followerChecker');

const activeJobs = new Map();

/**
 * 1. Tarefa de Verificação de Queda e Disparo de Refill Unificada por Conta e Pedido
 */
async function executeRefillCheckTask() {
  const timestamp = new Date().toISOString();
  console.log(`[CRON Refill] Executando verificação de contas às ${timestamp}...`);
  const db = storage.loadData();
  const logs = [];

  // 1. Atualiza e verifica contas monitoradas
  for (const acc of (db.accounts || [])) {
    if (!acc.autoRefillEnabled) continue;

    // Checa contagem pública
    try {
      const live = await checker.fetchCurrentFollowers(acc.link);
      if (live && live.followers !== null) {
        acc.currentFollowers = live.followers;
        acc.lastChecked = timestamp;
      }
    } catch (e) {
      console.error(`[CRON] Erro ao consultar ${acc.link}:`, e.message);
    }

    // Se houver queda abaixo da meta contratada
    if (acc.currentFollowers !== null && acc.currentFollowers < acc.targetFollowers) {
      const drop = acc.targetFollowers - acc.currentFollowers;
      console.log(`[CRON] Queda detectada na conta ${acc.name} (${acc.link}): Meta=${acc.targetFollowers}, Atual=${acc.currentFollowers}, Queda=${drop}`);

      // Encontra pedidos concluídos vinculados a essa conta
      const relatedOrders = (db.orders || []).filter(o =>
        (o.accountId === acc.id || o.link === acc.link) &&
        o.status === 'Completed'
      );

      // Dispara refill para o pedido elegível mais recente ou todos
      for (const ord of relatedOrders) {
        try {
          const res = await smm.requestRefill(ord.orderId);
          console.log(`[CRON] Refill solicitado para pedido #${ord.orderId}:`, res);
          logs.push({
            account: acc.name,
            orderId: ord.orderId,
            drop,
            result: res,
            timestamp
          });
        } catch (err) {
          console.error(`[CRON] Falha no refill #${ord.orderId}:`, err.message);
        }
      }
    }
  }

  // 2. Registra histórico
  if (!db.cronHistory) db.cronHistory = [];
  db.cronHistory.unshift({
    jobName: 'daily_refill_check',
    executedAt: timestamp,
    actionsTriggered: logs.length,
    details: logs
  });
  if (db.cronHistory.length > 50) db.cronHistory = db.cronHistory.slice(0, 50);

  storage.saveData(db);
  console.log(`[CRON Refill] Concluído! ${logs.length} reposições solicitadas.`);
  return { triggered: logs.length, logs };
}

/**
 * 2. Tarefa de Sincronização de Status dos Pedidos
 */
async function executeSyncStatusTask() {
  const timestamp = new Date().toISOString();
  console.log(`[CRON Sync] Sincronizando status dos pedidos às ${timestamp}...`);
  const db = storage.loadData();
  const ids = (db.orders || []).map(o => o.orderId).filter(Boolean);

  if (ids.length > 0) {
    try {
      const statusMap = await smm.getOrderStatus(ids.slice(0, 100));
      
      // Carrega catálogo para preencher nomes de serviços pendentes
      let servicesList = [];
      try {
        const rawServices = await smm.getServices();
        if (Array.isArray(rawServices)) servicesList = rawServices;
      } catch (e) {
        // Ignora falha de busca de serviços
      }

      (db.orders || []).forEach(o => {
        const live = statusMap[String(o.orderId)];
        if (live && !live.error) {
          o.status = live.status;
          o.charge = live.charge;
          o.start_count = live.start_count;
          o.remains = live.remains;
          o.targetAmount = Number(live.start_count || 0) + Number(o.quantity || 0);
        }
        if ((!o.serviceName || o.serviceName.startsWith('Serviço #')) && servicesList.length > 0) {
          const found = servicesList.find(s => Number(s.service) === Number(o.serviceId));
          if (found && found.name) {
            o.serviceName = found.name;
          }
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
 * Inicializador
 */
function initScheduler() {
  const db = storage.loadData();
  if (db.cronConfigs && Array.isArray(db.cronConfigs)) {
    db.cronConfigs.forEach(cfg => scheduleJob(cfg));
  }
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
