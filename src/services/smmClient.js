const API_KEY = process.env.SMM_API_KEY || "f188ca3f9d99fb75b083fa70bf5337a8";
const API_URL = process.env.SMM_API_URL || "https://smmpainel.com/api/v2";

/**
 * Chamada genérica POST resiliente para a API SMM
 * Inclui tratamento de timeout, retentativas e parse seguro
 */
async function callApi(action, extraParams = {}, retries = 2) {
  const bodyParams = new URLSearchParams({
    key: API_KEY,
    action: action,
    ...extraParams
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'SmmPanelPro/2.0 (Node.js)'
        },
        body: bodyParams.toString(),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        return { error: 'Provedor retornou formato inválido', raw: text };
      }
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === retries) {
        return { error: `Falha na conexão com API SMM (${err.name === 'AbortError' ? 'Timeout de 12s' : err.message})` };
      }
      // Espera 1s antes de tentar novamente
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

/**
 * 1. Obter Saldo
 */
async function getBalance() {
  return await callApi('balance');
}

/**
 * 2. Obter Lista de Serviços
 */
async function getServices() {
  return await callApi('services');
}

/**
 * 3. Criar Pedido (add)
 */
async function createOrder({ service, link, quantity, runs, interval, comments }) {
  const params = {
    service: String(service),
    link: String(link),
    quantity: String(quantity)
  };

  if (runs) params.runs = String(runs);
  if (interval) params.interval = String(interval);
  if (comments) params.comments = String(comments);

  return await callApi('add', params);
}

/**
 * 4. Status de Pedido (Unitário ou Múltiplos)
 */
async function getOrderStatus(orderIds) {
  if (Array.isArray(orderIds)) {
    return await callApi('status', { orders: orderIds.join(',') });
  }
  if (String(orderIds).includes(',')) {
    return await callApi('status', { orders: String(orderIds) });
  }
  return await callApi('status', { order: String(orderIds) });
}

/**
 * 5. Solicitar Refill (Unitário ou Múltiplos)
 */
async function requestRefill(orderIds) {
  if (Array.isArray(orderIds)) {
    return await callApi('refill', { orders: orderIds.join(',') });
  }
  if (String(orderIds).includes(',')) {
    return await callApi('refill', { orders: String(orderIds) });
  }
  return await callApi('refill', { order: String(orderIds) });
}

/**
 * 6. Consultar Status do Refill
 */
async function getRefillStatus(refillIds) {
  if (Array.isArray(refillIds)) {
    return await callApi('refill_status', { refills: refillIds.join(',') });
  }
  if (String(refillIds).includes(',')) {
    return await callApi('refill_status', { refills: String(refillIds) });
  }
  return await callApi('refill_status', { refill: String(refillIds) });
}

/**
 * 7. Cancelar Pedidos
 */
async function cancelOrders(orderIds) {
  const ordersStr = Array.isArray(orderIds) ? orderIds.join(',') : String(orderIds);
  return await callApi('cancel', { orders: ordersStr });
}

module.exports = {
  callApi,
  getBalance,
  getServices,
  createOrder,
  getOrderStatus,
  requestRefill,
  getRefillStatus,
  cancelOrders
};
