const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../../data/app_store.json');

// Inicializa a base caso não exista
if (!fs.existsSync(DB_FILE)) {
  const initialData = {
    orders: [
      {
        orderId: 96770,
        serviceId: 35,
        serviceName: "Seguidores Brasileiros | ⚡️ | ♻️AR30 | ⭐",
        link: "https://www.instagram.com/lentschmarketing/",
        quantity: 142,
        charge: "1.32202",
        status: "Completed",
        start_count: "123",
        createdAt: "2026-10-24T06:58:16Z",
        targetAmount: 265, // Teto acumulado
        lastRefillCheck: null
      },
      {
        orderId: 96579,
        serviceId: 35,
        serviceName: "Seguidores Brasileiros | ⚡️ | ♻️AR30 | ⭐",
        link: "https://www.instagram.com/lentschmarketing/",
        quantity: 123,
        charge: "1.14513",
        status: "Completed",
        start_count: "0",
        createdAt: "2026-10-23T21:44:30Z",
        targetAmount: 123,
        lastRefillCheck: null
      }
    ],
    refillLogs: [],
    monitoredAccounts: [
      {
        link: "https://www.instagram.com/lentschmarketing/",
        targetKeepAmount: 265,
        serviceId: 35,
        autoRefillEnabled: true,
        lastChecked: "2026-11-03T23:00:00Z"
      }
    ]
  };
  fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { orders: [], refillLogs: [], monitoredAccounts: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  loadData,
  saveData
};

