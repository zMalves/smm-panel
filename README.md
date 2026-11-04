# SMM Painel Pro - Gerenciador & Automação SMM

Aplicação web completa construída em **Node.js + Express** para integração e gestão de pedidos, saldo, catálogo de serviços e controle de reposição (**Refill**) na API da **smmpainel.com**.

---

## 🚀 Como Iniciar o App

No terminal do projeto, execute:

```bash
npm start
```
Ou:
```bash
node src/server.js
```

Abra o seu navegador e acesse:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ Funcionalidades Implementadas

### 1. Gestão de Saldo em Tempo Real
- Exibição de saldo em Reais (`R$`) com botão de sincronização instantânea.

### 2. Painel "Meus Pedidos" com Cálculo de Teto
- Lista todos os pedidos realizados.
- Calcula automaticamente o **Teto Esperado** (`start_count + quantity`) para cada link/perfil.
- Botão **"Sincronizar com a API"**: atualiza status (`Pending`, `In progress`, `Completed`, etc.), remanescentes e contagem inicial direto do provedor.
- Botão individual **"Repor ♻️"** para cada pedido.

### 3. Formulário de Novo Pedido (`add`)
- Seletor dinâmico de **Categoria** e **Serviço**.
- Card com detalhes imediatos do serviço selecionado: taxa por 1.000, quantidade mínima/máxima e tipo de garantia.
- **Calculador automático de custo estimado** em tempo real conforme a quantidade digitada.
- Suporte a **Drip-feed** (entregas parceladas com `runs` e `interval`).

### 4. Catálogo Completo (490 Serviços)
- Filtro e pesquisa instantânea por nome, categoria ou ID.
- Identificação clara de taxas, limites e flags de `refill` e `cancel`.

### 5. Gestor de Refill e Diagnóstico
- Disparo manual de reposição por ID único ou em lote (até 100 pedidos).
- Verificador de status de refill (`refill_status`).
- Instruções integradas sobre a regra de manutenção econômica para manter seguidores sem gastar a mais todo mês.

---

## 📁 Estrutura do Projeto

```
smm-panel/
├── data/
│   ├── app_store.json            # Base local de pedidos e monitoramentos
│   ├── balance.json              # Saldo em cache
│   ├── services_raw.json         # Catálogo bruto da API
│   └── services_organized.json   # Catálogo organizado por categoria
├── docs/
│   ├── API.md                    # Documentação técnica das rotas da API
│   └── DATA_SUMMARY.md           # Resumo dos dados extraídos
├── src/
│   ├── public/
│   │   └── index.html            # Interface moderna SPA (TailwindCSS + Lucide)
│   ├── routes/
│   │   └── api.js                # Endpoints internos do app
│   ├── services/
│   │   ├── smmClient.js          # Cliente HTTP com todas as ações da API SMM
│   │   └── storage.js            # Gerenciador de persistência local
│   └── server.js                 # Servidor Express
├── .env                          # Configurações de API Key e URL
└── package.json
```

