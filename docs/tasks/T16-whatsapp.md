# T16 · WhatsApp Cloud API
Fase 2 · Quem: AMBOS · Depende: T12 · Estimativa: 3–5 h · Skills: whatsapp · Revisão: segurança

## Passos humanos
- [ ] App na Meta for Developers com WhatsApp; número de teste; adicionar seu número como destinatário.
- [ ] Token permanente de usuário do sistema; app secret; verify token no `.env`.

## Entregar (Claude)
- [ ] Peça ao doc-researcher um resumo atual da Cloud API (webhook, assinatura, botões, mídia, janela de 24 h) em `docs/research/whatsapp.md`.
- [ ] `packages/whatsapp`: `sendText`, `sendButtons`, `sendAudio`, `getMedia`, `verifySignature`.
- [ ] Mapeamento número → loja em `merchant_members`.
- [ ] Script `pnpm wa:ping <numero>` que envia uma mensagem de teste.

## Aceite
```
pnpm check
pnpm wa:ping <seu número>     # a mensagem chega no seu WhatsApp
```
