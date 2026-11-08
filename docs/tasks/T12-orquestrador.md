# T12 · Orquestrador e roteamento
Fase 2 · Quem: CLAUDE · Depende: T07 · Estimativa: 4–5 h · Skills: llm-patterns, approvals

## Objetivo
Uma porta de entrada única para todos os canais.

## Entregar
- [ ] `POST /api/agent`: auth por sessão do painel ou assinatura HMAC do n8n. Entrada `{ merchantId, channel, text? , audioUrl?, imageUrl? }`.
- [ ] Roteador de intenção (role fast): cardapio, avaliacoes, analista, campanhas, conversa.
- [ ] Loop de tools com `maxSteps`, teto de custo e timeout.
- [ ] Memória curta por loja (últimas N mensagens em `conversations`).
- [ ] Resposta padrão `{ text, approvals[], attachments[] }`.
- [ ] 20 frases de teste de roteamento.

## Aceite
```
pnpm check     # roteamento acerta pelo menos 18 de 20
```
