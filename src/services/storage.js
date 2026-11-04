const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../data/app_store.json');

// Estrutura padrão inicial
function getDefaultData() {
  return {
    accounts: [
      {
        id: 'acc_1',
        name: 'Lentsch Marketing',
        platform: 'instagram',
        link: 'https://www.instagram.com/lentschmarketing/',
        targetFollowers: 265, // Teto meta contratado
        currentFollowers: 265,
        serviceId: 35,
        serviceName: 'Seguidores Brasileiros | ⚡️ | ♻️AR30 | ⭐',
        autoRefillEnabled: true,
        lastChecked: new Date().toISOString(),
        notes: 'Conta corporativa - meta inicial atingida'
      }
    ],
    orders: [
      {
        orderId: 96770,
        serviceId: 35,
        serviceName: "Seguidores Brasileiros | ⚡️ | ♻️AR30 | ⭐",
        link: "https://www.instagram.com/lentschmarketing/",
        accountId: 'acc_1',
        quantity: 142,
        charge: "1.32202",
        status: "Completed",
        start_count: "123",
        targetAmount: 265,
        createdAt: "2026-10-24T06:58:16Z"
      },
      {
        orderId: 96579,
        serviceId: 35,
        serviceName: "Seguidores Brasileiros | ⚡️ | ♻️AR30 | ⭐",
        link: "https://www.instagram.com/lentschmarketing/",
        accountId: 'acc_1',
        quantity: 123,
        charge: "1.14513",
        status: "Completed",
        start_count: "0",
        targetAmount: 123,
        createdAt: "2026-10-23T21:44:30Z"
      }
    ],
    refillLogs: [],
    cronConfigs: [
      {
        id: 'daily_refill_check',
        name: 'Verificação Diária de Quedas e Auto-Refill',
        expression: '0 9 * * *',
        enabled: true,
        description: 'Checa todas as contas monitoradas e solicita reposição automática se houver queda'
      },
      {
        id: 'hourly_order_sync',
        name: 'Sincronização de Status de Pedidos',
        expression: '0 * * * *',
        enabled: true,
        description: 'Atualiza start_count, status e remanescentes direto do provedor SMM'
      }
    ],
    cronHistory: []
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const def = getDefaultData();
      saveData(def);
      return def;
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.accounts) data.accounts = getDefaultData().accounts;
    if (!data.orders) data.orders = getDefaultData().orders;
    if (!data.cronConfigs) data.cronConfigs = getDefaultData().cronConfigs;
    if (!data.cronHistory) data.cronHistory = [];
    return data;
  } catch (e) {
    return getDefaultData();
  }
}

function saveData(data) {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar app_store.json:', e.message);
  }
}

module.exports = {
  loadData,
  saveData
};
