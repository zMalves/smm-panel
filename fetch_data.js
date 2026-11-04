const fs = require('fs');
const path = require('path');

const API_KEY = "f188ca3f9d99fb75b083fa70bf5337a8";
const API_URL = "https://smmpainel.com/api/v2";

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

async function postApi(action, extraParams = {}) {
  const bodyParams = new URLSearchParams({
    key: API_KEY,
    action: action,
    ...extraParams
  });

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0'
    },
    body: bodyParams.toString()
  });

  try {
    return await res.json();
  } catch (err) {
    const text = await res.text();
    return { error: 'Failed to parse JSON', raw: text };
  }
}

async function run() {
  console.log("=== 1. Consultando Saldo ===");
  const balance = await postApi('balance');
  console.log("Saldo retornado:", balance);
  fs.writeFileSync(path.join(dataDir, 'balance.json'), JSON.stringify(balance, null, 2), 'utf8');

  console.log("\n=== 2. Consultando Serviços ===");
  const services = await postApi('services');
  
  if (Array.isArray(services)) {
    console.log(`Total de serviços recebidos: ${services.length}`);
    fs.writeFileSync(path.join(dataDir, 'services_raw.json'), JSON.stringify(services, null, 2), 'utf8');

    const categories = {};
    const types = new Set();
    const categoriesCount = {};

    services.forEach(s => {
      const cat = s.category || "Outros";
      if (!categories[cat]) {
        categories[cat] = [];
        categoriesCount[cat] = 0;
      }
      categories[cat].push({
        id: s.service,
        name: s.name,
        type: s.type,
        rate: parseFloat(s.rate),
        min: parseInt(s.min, 10),
        max: parseInt(s.max, 10),
        refill: s.refill,
        cancel: s.cancel
      });
      categoriesCount[cat]++;
      if (s.type) types.add(s.type);
    });

    const summary = {
      total_services: services.length,
      total_categories: Object.keys(categories).length,
      types: Array.from(types),
      categories_summary: Object.keys(categoriesCount).map(c => ({
        category: c,
        total_services: categoriesCount[c]
      })),
      services_by_category: categories
    };

    fs.writeFileSync(path.join(dataDir, 'services_organized.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`Categorias catalogadas: ${Object.keys(categories).length}`);
    console.log(`Tipos de serviço identificados: ${Array.from(types).join(', ')}`);
  } else {
    console.log("Erro ou resposta inesperada em serviços:", services);
  }

  console.log("\n=== 3. Verificando suporte a Tickets na API ===");
  const ticketActions = ['ticket', 'tickets', 'create_ticket', 'add_ticket', 'ticket_create'];
  for (const act of ticketActions) {
    const res = await postApi(act, { subject: 'Test', message: 'Test' });
    console.log(`Action "${act}":`, JSON.stringify(res));
  }
}

run().catch(console.error);

