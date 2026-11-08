---
name: whatsapp
description: WhatsApp Cloud API da Meta - webhook, assinatura, mensagens de texto, botões, áudio e mídia, limites do número de teste. Use ao mexer em packages/whatsapp ou no canal WhatsApp.
---
# WhatsApp Cloud API

Confirme detalhes com o subagente doc-researcher antes de implementar.

- Número de teste da Meta: só envia para até 5 destinatários verificados. Recrutadores usam o painel web.
- Token temporário expira; em produção use token permanente de usuário do sistema.
- Webhook: GET de verificação (`hub.mode`, `hub.verify_token`, `hub.challenge`) e POST com assinatura `X-Hub-Signature-256` (HMAC do corpo com o app secret). Valide sempre.
- Mensagem livre só dentro da janela de 24 h após a última mensagem do usuário; fora dela, só template aprovado.
- Botões de resposta rápida: poucos botões por mensagem; use Aprovar, Ver no painel e Corrigir.
- Mídia recebida chega como ID: pedir a URL e baixar com o token. Áudio vai para transcrição (role audio).
- Mapeie número → merchant em `merchant_members`. Número desconhecido recebe uma resposta padrão.
