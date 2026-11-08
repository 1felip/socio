---
name: approvals
description: Regras de aprovação humana para qualquer ação de escrita (catálogo, resposta a avaliação, promoção, envio de mensagem). Use ao criar ou chamar tools que alteram a loja.
---
# Aprovações

Toda ação que muda algo fora do nosso banco passa por `approvals`.

Fluxo:
1. O agente propõe: `approvals.create({ merchantId, kind, payload, summary })` → status `pending`. Nada é executado.
2. O dono aprova no painel ou no botão do WhatsApp → `approvals.approve(id, userId)` gera `approval_token` de uso único, válido por 24 h.
3. A tool de escrita recebe `{ approvalId, approvalToken }`, valida (pendente→aprovada, mesmo merchant, mesmo kind, hash do payload igual, token não usado e não expirado), executa, marca `executed_at` e grava `roi_events`.

Regras:
- O modelo nunca gera nem vê `approval_token`. Ele chega só pelo canal de aprovação (painel ou n8n).
- Tools de escrita não ficam disponíveis nos passos que leem texto de terceiros.
- Payload executado = payload aprovado (comparar hash). Se o dono editar, gera nova aprovação.
- Todo teste de tool de escrita cobre: sem aprovação, token reutilizado, token expirado, payload alterado.

Kinds: `catalog.publish`, `review.reply`, `promo.create`, `message.send`.
