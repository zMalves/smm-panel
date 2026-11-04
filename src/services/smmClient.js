const API_KEY = process.env.SMM_API_KEY || "f188ca3f9d99fb75b083fa70bf5337a8";
const API_URL = process.env.SMM_API_URL || "https://smmpainel.com/api/v2";

/**
 * Chamada genérica POST para a API SMM
 */
async function callApi(action, extraParams = {}) {
  const bodyParams = new URLSearchParams({
    key: API_KEY,
    action: action,
    ...extraParams
  });

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    },
    body: bodyParams.toString()
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return { error: 'Invalid JSON response from provider', raw: text };
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

