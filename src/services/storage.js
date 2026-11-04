const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'smm_panel.sqlite');
const db = new Database(DB_PATH);

// Ativa WAL mode (Write-Ahead Logging) para alta performance concorrente
db.pragma('journal_mode = WAL');

// 1. Inicializa o Schema do Banco de Dados
db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT DEFAULT 'instagram',
    link TEXT UNIQUE NOT NULL,
    target_followers INTEGER NOT NULL,
    current_followers INTEGER,
    service_id INTEGER,
    auto_refill_enabled INTEGER DEFAULT 1,
    notes TEXT,
    last_checked TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    order_id INTEGER PRIMARY KEY,
    service_id INTEGER NOT NULL,
    service_name TEXT,
    link TEXT NOT NULL,
    account_id TEXT,
    quantity INTEGER NOT NULL,
    runs INTEGER,
    interval INTEGER,
    status TEXT DEFAULT 'Pending',
    charge TEXT,
    start_count TEXT,
    remains TEXT,
    target_amount INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS refill_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    target TEXT,
    result TEXT,
    requested_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cron_configs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    expression TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS cron_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_name TEXT NOT NULL,
    actions_triggered INTEGER DEFAULT 0,
    details TEXT,
    executed_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migração inicial dos dados existentes (se houver app_store.json)
const JSON_FILE = path.join(DB_DIR, 'app_store.json');
if (fs.existsSync(JSON_FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));

    // Migra Contas
    if (raw.accounts && Array.isArray(raw.accounts)) {
      const insertAcc = db.prepare(`
        INSERT OR IGNORE INTO accounts (id, name, platform, link, target_followers, current_followers, service_id, auto_refill_enabled, notes, last_checked)
        VALUES (@id, @name, @platform, @link, @target_followers, @current_followers, @service_id, @auto_refill_enabled, @notes, @last_checked)
      `);
      for (const a of raw.accounts) {
        insertAcc.run({
          id: a.id,
          name: a.name,
          platform: a.platform || 'instagram',
          link: a.link,
          target_followers: a.targetFollowers || a.target_followers || 0,
          current_followers: a.currentFollowers ?? a.current_followers ?? null,
          service_id: a.serviceId || null,
          auto_refill_enabled: a.autoRefillEnabled ? 1 : 0,
          notes: a.notes || '',
          last_checked: a.lastChecked || new Date().toISOString()
        });
      }
    }

    // Migra Pedidos
    if (raw.orders && Array.isArray(raw.orders)) {
      const insertOrder = db.prepare(`
        INSERT OR IGNORE INTO orders (order_id, service_id, service_name, link, account_id, quantity, runs, interval, status, charge, start_count, remains, target_amount, created_at)
        VALUES (@order_id, @service_id, @service_name, @link, @account_id, @quantity, @runs, @interval, @status, @charge, @start_count, @remains, @target_amount, @created_at)
      `);
      for (const o of raw.orders) {
        insertOrder.run({
          order_id: o.orderId || o.order_id,
          service_id: o.serviceId || o.service_id,
          service_name: o.serviceName || o.service_name || '',
          link: o.link,
          account_id: o.accountId || o.account_id || null,
          quantity: o.quantity,
          runs: o.runs || null,
          interval: o.interval || null,
          status: o.status || 'Pending',
          charge: o.charge || '0',
          start_count: o.start_count || '0',
          remains: o.remains || '0',
          target_amount: o.targetAmount || o.target_amount || o.quantity,
          created_at: o.createdAt || o.created_at || new Date().toISOString()
        });
      }
    }

    // Migra Crons padrão
    if (raw.cronConfigs && Array.isArray(raw.cronConfigs)) {
      const insertCron = db.prepare(`
        INSERT OR IGNORE INTO cron_configs (id, name, expression, enabled, description)
        VALUES (@id, @name, @expression, @enabled, @description)
      `);
      for (const c of raw.cronConfigs) {
        insertCron.run({
          id: c.id,
          name: c.name,
          expression: c.expression,
          enabled: c.enabled ? 1 : 0,
          description: c.description || ''
        });
      }
    }
  } catch (err) {
    console.error('Aviso ao migrar app_store.json para SQLite:', err.message);
  }
}

// Garante crons padrões no banco
const defaultCrons = [
  { id: 'daily_refill_check', name: 'Verificação Diária de Quedas e Auto-Refill', expression: '0 9 * * *', enabled: 1, description: 'Checa contas e solicita reposição automática se houver queda' },
  { id: 'hourly_order_sync', name: 'Sincronização de Status de Pedidos', expression: '0 * * * *', enabled: 1, description: 'Atualiza start_count, status e remanescentes direto do provedor SMM' }
];
const insertCronStmt = db.prepare(`INSERT OR IGNORE INTO cron_configs (id, name, expression, enabled, description) VALUES (@id, @name, @expression, @enabled, @description)`);
defaultCrons.forEach(c => insertCronStmt.run(c));

/* ========================================================
   INTERFACE COMPATÍVEL DE DADOS
   ======================================================== */

function loadData() {
  const accountsRaw = db.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();
  const accounts = accountsRaw.map(a => ({
    id: a.id,
    name: a.name,
    platform: a.platform,
    link: a.link,
    targetFollowers: a.target_followers,
    currentFollowers: a.current_followers,
    serviceId: a.service_id,
    autoRefillEnabled: Boolean(a.auto_refill_enabled),
    notes: a.notes,
    lastChecked: a.last_checked
  }));

  const ordersRaw = db.prepare('SELECT * FROM orders ORDER BY order_id DESC').all();
  const orders = ordersRaw.map(o => ({
    orderId: o.order_id,
    serviceId: o.service_id,
    serviceName: o.service_name,
    link: o.link,
    accountId: o.account_id,
    quantity: o.quantity,
    runs: o.runs,
    interval: o.interval,
    status: o.status,
    charge: o.charge,
    start_count: o.start_count,
    remains: o.remains,
    targetAmount: o.target_amount,
    createdAt: o.created_at
  }));

  const cronConfigs = db.prepare('SELECT * FROM cron_configs').all().map(c => ({
    id: c.id,
    name: c.name,
    expression: c.expression,
    enabled: Boolean(c.enabled),
    description: c.description
  }));

  const cronHistory = db.prepare('SELECT * FROM cron_history ORDER BY id DESC LIMIT 50').all().map(h => ({
    id: h.id,
    jobName: h.job_name,
    actionsTriggered: h.actions_triggered,
    details: h.details ? JSON.parse(h.details) : [],
    executedAt: h.executed_at
  }));

  return { accounts, orders, cronConfigs, cronHistory };
}

function saveData(data) {
  // Salva contas
  if (data.accounts && Array.isArray(data.accounts)) {
    const upsertAcc = db.prepare(`
      INSERT INTO accounts (id, name, platform, link, target_followers, current_followers, service_id, auto_refill_enabled, notes, last_checked)
      VALUES (@id, @name, @platform, @link, @targetFollowers, @currentFollowers, @serviceId, @autoRefillEnabled, @notes, @lastChecked)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        target_followers=excluded.target_followers,
        current_followers=excluded.current_followers,
        auto_refill_enabled=excluded.auto_refill_enabled,
        notes=excluded.notes,
        last_checked=excluded.last_checked
    `);
    const tx = db.transaction((accs) => {
      for (const a of accs) {
        upsertAcc.run({
          id: a.id,
          name: a.name,
          platform: a.platform || 'instagram',
          link: a.link,
          targetFollowers: a.targetFollowers || 0,
          currentFollowers: a.currentFollowers ?? null,
          serviceId: a.serviceId || null,
          autoRefillEnabled: a.autoRefillEnabled ? 1 : 0,
          notes: a.notes || '',
          lastChecked: a.lastChecked || new Date().toISOString()
        });
      }
    });
    tx(data.accounts);
  }

  // Salva pedidos
  if (data.orders && Array.isArray(data.orders)) {
    const upsertOrder = db.prepare(`
      INSERT INTO orders (order_id, service_id, service_name, link, account_id, quantity, runs, interval, status, charge, start_count, remains, target_amount, created_at)
      VALUES (@orderId, @serviceId, @serviceName, @link, @accountId, @quantity, @runs, @interval, @status, @charge, @start_count, @remains, @targetAmount, @createdAt)
      ON CONFLICT(order_id) DO UPDATE SET
        status=excluded.status,
        charge=excluded.charge,
        start_count=excluded.start_count,
        remains=excluded.remains,
        target_amount=excluded.target_amount
    `);
    const tx = db.transaction((ords) => {
      for (const o of ords) {
        upsertOrder.run({
          orderId: o.orderId,
          serviceId: o.serviceId,
          serviceName: o.serviceName || '',
          link: o.link,
          accountId: o.accountId || null,
          quantity: o.quantity,
          runs: o.runs || null,
          interval: o.interval || null,
          status: o.status || 'Pending',
          charge: o.charge || '0',
          start_count: o.start_count || '0',
          remains: o.remains || '0',
          targetAmount: o.targetAmount || o.quantity,
          createdAt: o.createdAt || new Date().toISOString()
        });
      }
    });
    tx(data.orders);
  }

  // Salva histórico de cron recente se houver
  if (data.cronHistory && data.cronHistory.length > 0) {
    const latest = data.cronHistory[0];
    if (latest && !latest.id) {
      db.prepare(`
        INSERT INTO cron_history (job_name, actions_triggered, details, executed_at)
        VALUES (?, ?, ?, ?)
      `).run(
        latest.jobName,
        latest.actionsTriggered || 0,
        JSON.stringify(latest.details || []),
        latest.executedAt || new Date().toISOString()
      );
    }
  }

  // Salva configurações de cron
  if (data.cronConfigs && Array.isArray(data.cronConfigs)) {
    const upsertCron = db.prepare(`
      INSERT INTO cron_configs (id, name, expression, enabled, description)
      VALUES (@id, @name, @expression, @enabled, @description)
      ON CONFLICT(id) DO UPDATE SET
        expression=excluded.expression,
        enabled=excluded.enabled,
        description=excluded.description
    `);
    data.cronConfigs.forEach(c => upsertCron.run({
      id: c.id,
      name: c.name,
      expression: c.expression,
      enabled: c.enabled ? 1 : 0,
      description: c.description || ''
    }));
  }

  // Backup espelho em JSON para visualização e segurança dupla
  try {
    fs.writeFileSync(JSON_FILE, JSON.stringify(loadData(), null, 2), 'utf8');
  } catch (e) {}
}

module.exports = {
  db,
  loadData,
  saveData
};
