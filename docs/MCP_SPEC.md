# Documentação da API MCP (Model Context Protocol)

Este documento descreve como conectar agentes de IA (Cursor, Antigravity, Claude, n8n, etc.) e seus outros sistemas ao **SMM Panel Pro** utilizando o padrão **Model Context Protocol (MCP)** e chamadas HTTP diretas.

---

## 📌 Informações do Servidor MCP

- **URL Base:** `http://100.87.205.46:3070/mcp`
- **Descoberta de Ferramentas (Manifest):** `GET http://100.87.205.46:3070/mcp/tools`
- **Execução de Ferramentas (Tool Call):** `POST http://100.87.205.46:3070/mcp/call`
- **Content-Type:** `application/json`

---

## 🛠️ Ferramentas Disponíveis (MCP Tools)

| Ferramenta | Descrição |
| :--- | :--- |
| `get_balance` | Consulta saldo e moeda da conta no provedor SMM. |
| `list_services` | Lista serviços com filtros de categoria, busca ou tipo. |
| `create_order` | Cria um pedido de seguidores, likes, views, etc. |
| `get_order_status` | Consulta status de um ou múltiplos pedidos (até 100 IDs). |
| `request_refill` | Solicita reposição manual para um pedido com queda. |
| `get_refill_status`| Consulta o status de um pedido de Refill. |
| `list_accounts` | Lista contas monitoradas, suas metas e quedas ativas. |
| `manage_account` | Cria ou atualiza uma conta monitorada no painel. |
| `run_refill_check` | Dispara varredura e reposição imediata para todas as contas. |

---

## 🚀 Como Chamar as Ferramentas (Exemplos)

### 1. `get_balance` (Consultar Saldo)
**Endpoint:** `POST /mcp/call`
```json
{
  "name": "get_balance",
  "arguments": {}
}
```
**Resposta:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"balance\": \"27.5328500\",\n  \"currency\": \"BRL\"\n}"
    }
  ],
  "isError": false,
  "data": {
    "balance": "27.5328500",
    "currency": "BRL"
  }
}
```

---

### 2. `create_order` (Comprar Seguidores / Serviços)
**Endpoint:** `POST /mcp/call`
```json
{
  "name": "create_order",
  "arguments": {
    "service": 35,
    "link": "https://www.instagram.com/lentschmarketing/",
    "quantity": 500,
    "addToAccountTarget": true
  }
}
```
**Resposta:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\n  \"order\": 96800\n}"
    }
  ],
  "isError": false,
  "data": {
    "order": 96800
  }
}
```

---

### 3. `list_accounts` (Listar Contas e Quedas)
**Endpoint:** `POST /mcp/call`
```json
{
  "name": "list_accounts",
  "arguments": {}
}
```
**Resposta:**
```json
{
  "isError": false,
  "data": [
    {
      "id": "acc_1",
      "name": "Lentsch Marketing",
      "link": "https://www.instagram.com/lentschmarketing/",
      "targetFollowers": 265,
      "currentFollowers": 240,
      "needsRefill": true,
      "dropAmount": 25
    }
  ]
}
```

---

### 4. `run_refill_check` (Disparar Reposição Imediata)
**Endpoint:** `POST /mcp/call`
```json
{
  "name": "run_refill_check",
  "arguments": {}
}
```

---

## ⚙️ Configuração para Claude Desktop / Cursor / Outros Apps

No seu arquivo `mcpServers` (ex: `claude_desktop_config.json` ou settings do seu sistema):

```json
{
  "mcpServers": {
    "smm-panel": {
      "url": "http://100.87.205.46:3070/mcp/tools",
      "transport": "http"
    }
  }
}
```

Para chamadas diretas via **Node.js / cURL / n8n / Python**, você só precisa fazer um `POST` no endpoint `/mcp/call` passando o nome da tool e os argumentos.
