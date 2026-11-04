# Documentação da API - SMM Painel

Esta documentação descreve os endpoints, parâmetros e exemplos de requisição/resposta para integração com a API da **smmpainel.com**.

---

## 📌 Informações Gerais

- **Método HTTP:** `POST`
- **URL Base:** `https://smmpainel.com/api/v2`
- **Formato da Resposta:** `JSON`
- **Chave de API:** Obtenha sua chave na página [Account](https://smmpainel.com/account).
- **Autenticação:** Todas as requisições devem incluir o parâmetro `key` com sua chave de API.

---

## 📋 Sumário de Ações (`action`)

| Ação | Descrição |
| :--- | :--- |
| [`services`](#1-listar-serviços-services) | Retorna a lista de todos os serviços disponíveis |
| [`add`](#2-criar-pedido-add) | Cria um novo pedido |
| [`status`](#3-consultar-status-do-pedido-status) | Consulta o status de um ou múltiplos pedidos |
| [`refill`](#4-solicitar-refill-reposição-refill) | Solicita reposição para um ou múltiplos pedidos |
| [`refill_status`](#5-consultar-status-do-refill-refill_status) | Consulta o status de reposição |
| [`cancel`](#6-cancelar-pedidos-cancel) | Solicita cancelamento de múltiplos pedidos |
| [`balance`](#7-consultar-saldo-balance) | Consulta o saldo atual da conta |

---

## 1. Listar Serviços (`services`)

Retorna todos os serviços disponíveis, incluindo taxas, limites e tipos.

### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `services` |

### Exemplo de Resposta

```json
[
  {
    "service": 1,
    "name": "Followers",
    "type": "Default",
    "category": "First Category",
    "rate": "0.90",
    "min": "50",
    "max": "10000",
    "refill": true,
    "cancel": true
  },
  {
    "service": 2,
    "name": "Comments",
    "type": "Custom Comments",
    "category": "Second Category",
    "rate": "8",
    "min": "10",
    "max": "1500",
    "refill": false,
    "cancel": true
  }
]
```

---

## 2. Criar Pedido (`add`)

Envia uma nova ordem para execução.

### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `add` |
| `service` | `integer` | Sim | ID do serviço desejado |
| `link` | `string` | Sim | Link da página/publicação |
| `quantity` | `integer` | Sim | Quantidade desejada |
| `runs` | `integer` | Não | Número de execuções (Drip-feed) |
| `interval` | `integer` | Não | Intervalo em minutos entre as execuções |

### Exemplo de Resposta

```json
{
  "order": 23501
}
```

---

## 3. Consultar Status do Pedido (`status`)

Permite consultar o status de um pedido específico ou de múltiplos pedidos de uma só vez (até 100 IDs).

### 3.1. Pedido Único

#### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `status` |
| `order` | `integer` | Sim | ID do pedido |

#### Exemplo de Resposta

```json
{
  "charge": "0.27819",
  "start_count": "3572",
  "status": "Partial",
  "remains": "157",
  "currency": "USD"
}
```

### 3.2. Múltiplos Pedidos

#### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `status` |
| `orders` | `string` | Sim | IDs dos pedidos separados por vírgula (máximo: 100) |

#### Exemplo de Resposta

```json
{
  "1": {
    "charge": "0.27819",
    "start_count": "3572",
    "status": "Partial",
    "remains": "157",
    "currency": "USD"
  },
  "10": {
    "error": "Incorrect order ID"
  },
  "100": {
    "charge": "1.44219",
    "start_count": "234",
    "status": "In progress",
    "remains": "10",
    "currency": "USD"
  }
}
```

---

## 4. Solicitar Refill / Reposição (`refill`)

Permite solicitar reposição de serviços que tenham suporte a refill.

### 4.1. Refill Individual

#### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `refill` |
| `order` | `integer` | Sim | ID do pedido |

#### Exemplo de Resposta

```json
{
  "refill": "1"
}
```

### 4.2. Múltiplos Refills

#### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `refill` |
| `orders` | `string` | Sim | IDs dos pedidos separados por vírgula (máximo: 100) |

#### Exemplo de Resposta

```json
[
  { "order": 1, "refill": 1 },
  { "order": 2, "refill": 2 },
  { "order": 3, "refill": { "error": "Incorrect order ID" } }
]
```

---

## 5. Consultar Status do Refill (`refill_status`)

Consulta o andamento de uma ou mais solicitações de reposição.

### 5.1. Refill Individual

#### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `refill_status` |
| `refill` | `integer` | Sim | ID da solicitação de refill |

#### Exemplo de Resposta

```json
{
  "status": "Completed"
}
```

### 5.2. Múltiplos Refills

#### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `refill_status` |
| `refills` | `string` | Sim | IDs de refill separados por vírgula (máximo: 100) |

#### Exemplo de Resposta

```json
[
  { "refill": 1, "status": "Completed" },
  { "refill": 2, "status": "Rejected" },
  { "refill": 3, "status": { "error": "Refill not found" } }
]
```

---

## 6. Cancelar Pedidos (`cancel`)

Permite solicitar cancelamento de pedidos.

### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `cancel` |
| `orders` | `string` | Sim | IDs dos pedidos separados por vírgula (máximo: 100) |

### Exemplo de Resposta

```json
[
  { "order": 9, "cancel": { "error": "Incorrect order ID" } },
  { "order": 2, "cancel": 1 }
]
```

---

## 7. Consultar Saldo (`balance`)

Retorna o saldo restante e a moeda configurada da conta.

### Parâmetros

| Parâmetro | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `key` | `string` | Sim | Sua chave de API |
| `action` | `string` | Sim | Valor fixo: `balance` |

### Exemplo de Resposta

```json
{
  "balance": "100.84292",
  "currency": "USD"
}
```

