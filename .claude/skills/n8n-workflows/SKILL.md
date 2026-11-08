---
name: n8n-workflows
description: Convenções dos workflows n8n (WhatsApp inbound, botões de aprovação, sync de avaliações, briefing, erros). Use ao criar ou editar workflows via MCP do n8n.
---
# n8n

- Crie e edite pelo MCP do n8n (ligue com /mcp). Depois exporte o JSON para `n8n/<nome>.json` e commite.
- Nunca commite credenciais. Workflows referenciam credenciais pelo nome.
- n8n só orquestra: recebe webhook, chama nossa API, envia resposta, agenda e faz retry. Lógica de negócio fica na API.
- Chamadas para a API levam header `X-Socio-Signature` (HMAC-SHA256 do corpo com `N8N_WEBHOOK_SECRET`).
- Workflows: `wa-inbound`, `wa-buttons`, `reviews-hourly`, `briefing-daily` (10h, America/Sao_Paulo), `error-handler`.
- Todo workflow tem um nó de erro que chama `error-handler`.
