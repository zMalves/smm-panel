# Resumo e Estrutura dos Dados Extraídos

Dados coletados e estruturados a partir da API da **smmpainel.com** em 03/11/2026.

---

## 💰 Saldo da Conta
- **Saldo Atual:** `R$ 27,5328500`
- **Moeda:** `BRL`
- Arquivo de origem: [`data/balance.json`](file:///c:/Users/Maychel/OneDrive%20-%20Seconds/Documentos/Sistemas/smm-panel/data/balance.json)

---

## 📦 Serviços e Categorias

- **Total de Serviços Disponíveis:** `490`
- **Total de Categorias:** `51`
- **Tipos de Serviço Identificados:**
  1. `Default` (Seguidores, curtidas, visualizações convencionais)
  2. `Package` (Pacotes de serviços fechados)
  3. `Custom Comments` (Comentários personalizados onde o usuário envia os textos)
  4. `Comment Likes` (Curtidas em comentários específicos)
  5. `Poll` (Votos em enquetes)
  6. `Subscriptions` (Inscrições/assinaturas recorrentes)

---

## 📂 Arquivos Gerados na Pasta `data/`

| Arquivo | Descrição |
| :--- | :--- |
| [`data/balance.json`](file:///c:/Users/Maychel/OneDrive%20-%20Seconds/Documentos/Sistemas/smm-panel/data/balance.json) | Saldo e moeda da conta |
| [`data/services_raw.json`](file:///c:/Users/Maychel/OneDrive%20-%20Seconds/Documentos/Sistemas/smm-panel/data/services_raw.json) | Retorno bruto completo dos 490 serviços |
| [`data/services_organized.json`](file:///c:/Users/Maychel/OneDrive%20-%20Seconds/Documentos/Sistemas/smm-panel/data/services_organized.json) | Serviços agrupados por categoria, com taxas convertidas, limites e contadores |

---

## 🎟️ Sobre Criação de Tickets via API

A API padrão fornecida pelo painel **não oferece endpoints para criação ou listagem de tickets**.

- As únicas ações documentadas e aceitas são: `services`, `add`, `status`, `refill`, `refill_status`, `cancel` e `balance`.
- Requisições enviando ações como `ticket`, `tickets`, `create_ticket` ou `add_ticket` retornam `{"error": "Incorrect request"}`.
- **Alternativas para o seu app:**
  1. **Sistema de Tickets Local:** O seu próprio aplicativo pode ter um sistema interno de chamados/suporte onde os clientes abrem tickets para os seus administradores resolverem.
  2. **Integração Externa:** WhatsApp / Telegram bot ou webhook de suporte direto com a equipe.

