# Documentação de Autenticação & API Tokens (MCP & REST)

O **SMM Panel Pro** possui uma arquitetura de segurança dupla:
1. **Autenticação de Usuários:** Para acesso ao Painel Web via Sessão / JWT (cookie seguro ou token de sessão).
2. **Tokens de API (Bearer / X-API-Key):** Para agentes autônomos (MCP), automações (n8n, bots) e microsserviços próprios.

---

## 🔑 1. Como Usar API Tokens nos seus Apps

Para qualquer requisição às APIs protegidas (`/api/*`) ou às ferramentas MCP (`/mcp/call`), envie seu token através de qualquer um dos formatos abaixo:

### Opção A: Header `X-API-Key` (Recomendado)
```http
POST /mcp/call HTTP/1.1
Host: 100.87.205.46:3070
Content-Type: application/json
X-API-Key: smm_sec_seu_token_aqui
```

### Opção B: Header `Authorization: Bearer`
```http
POST /api/orders HTTP/1.1
Host: 100.87.205.46:3070
Content-Type: application/json
Authorization: Bearer smm_sec_seu_token_aqui
```

---

## 🤖 2. Configurando no Cursor / Claude Desktop / Agentes MCP

No arquivo de configuração do seu cliente MCP (ex: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "smm-panel": {
      "url": "http://100.87.205.46:3070/mcp/tools",
      "transport": "http",
      "headers": {
        "X-API-Key": "smm_sec_seu_token_aqui"
      }
    }
  }
}
```

---

## 👥 3. Gestão de Usuários e Tokens na Interface Web

Acesse a aba **Tokens de API & Usuários** no painel web:
- **Gerar Novo Token:** Crie chaves com nomes descritivos (ex: `Bot WhatsApp`, `n8n Flow Principal`, `Dashboard Admin`).
- **Revogar Tokens:** Cancele o acesso de qualquer integração imediatamente com 1 clique.
- **Criar Operadores/Usuários:** Defina usuários (`admin` ou `operator`) com senhas criptografadas em `bcrypt` para sua equipe gerenciar o sistema.
