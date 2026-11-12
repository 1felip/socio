# WhatsApp Cloud API: referência para o canal

Pesquisado em 2026-11-12. Marcas: [C] confirmado na página oficial lida; [S] não confirmado na página lida; [I] inferido.

## 1. Versão, base e auth
- Versão atual: **v27.0** [C] (https://developers.facebook.com/docs/graph-api/guides/versioning). Os guias de 2026 usam v27.0. A página de referência do Message API ainda lista v23.0 a v25.0 no seletor, e o get-started usa v23.0 no exemplo. Fixe v27.0 e confira.
- Envio: `POST https://graph.facebook.com/v27.0/<PHONE_NUMBER_ID>/messages`, com `Authorization: Bearer <TOKEN>` e `Content-Type: application/json` [C]
- Token permanente: System User no Business Settings, com permissões `whatsapp_business_messaging`, `whatsapp_business_management` e `business_management` [C] (https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens). O token gerado no painel API Setup expira rápido [C]. Trate o token como string opaca [C].

## 2. Webhook
**GET (verificação)** [C] (https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint)
```
GET <CALLBACK_URL>?hub.mode=subscribe&hub.challenge=1158201444&hub.verify_token=SEU_TOKEN
-> 200, corpo em texto puro: 1158201444   (se verify_token bater; senão 4xx)
```

**POST (eventos)** [C]. Header `X-Hub-Signature-256: sha256=<hex>`, onde o hex é HMAC-SHA256 do corpo cru com o App Secret. Calcule sobre o corpo antes de parsear o JSON. Responda 200; qualquer outro status gera retry por até 7 dias, então deduplique por `wamid`. O corpo chega em lote de até 1000 updates e tem até 3 MB.

Texto recebido (exemplo oficial, abreviado):
```json
{"object":"whatsapp_business_account","entry":[{"id":"102290129340398","changes":[{"field":"messages","value":{
 "messaging_product":"whatsapp",
 "metadata":{"display_phone_number":"15550783881","phone_number_id":"106540352242922"},
 "contacts":[{"profile":{"name":"Sheena Nelson"},"wa_id":"16505551234","user_id":"US.13491208655302741918"}],
 "messages":[{"from":"16505551234","from_user_id":"US.13491208655302741918","id":"wamid.HBg...","timestamp":"1749416383","type":"text","text":{"body":"Oi"}}]}}]}]}
```
- Resposta de botão: `type:"interactive"`, `interactive.type:"button_reply"`, `interactive.button_reply.{id,title}` [C]
- Áudio: `type:"audio"`, `audio.{id, mime_type:"audio/ogg; codecs=opus", sha256, voice:bool, url}`. `url` é gradual, então não conte com ele [C]
- Imagem: `type:"image"` existe, mas o schema não foi lido [S]. Status de envio: `value.statuses[]` com `id`, `status` (sent/delivered/read/failed), `recipient_id`, `pricing` [C]

## 3. Enviar
**Texto** [C]
```json
{"messaging_product":"whatsapp","recipient_type":"individual","to":"+16505551234","type":"text","text":{"preview_url":false,"body":"Pedido confirmado"}}
```
Resposta: `{"messaging_product":"whatsapp","contacts":[{"input":"+16505551234","wa_id":"16505551234"}],"messages":[{"id":"wamid.HBg..."}]}`

**Reply buttons** [C] (https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages)
- Máximo 3 botões. `body.text` até 1024 caracteres. `footer.text` até 60. `reply.title` até 20 (único por mensagem). `reply.id` até 256, devolvido em `button_reply.id`. Header opcional: text, image, video ou document.

**Áudio** [C] por id (recomendado) ou link: `{"type":"audio","audio":{"id":"<MEDIA_ID>"}}`. Formatos: AAC, AMR, MP3, M4A e OGG só com OPUS, mono, até 16 MB. `audio/ogg` puro não é aceito.

**Template** [C] fora da janela: `{"type":"template","template":{"name":"hello_world","language":{"code":"en_US"}}}`. Não há regra de categoria confirmada para utility/auth aqui; o erro 134100 cita só MARKETING [S].

## 4. Mídia
- Upload: `POST /v27.0/<PHONE_NUMBER_ID>/media`, multipart com `messaging_product=whatsapp` e `file=@arq.ogg;type=audio/ogg`. Resposta: `{"id":"1037543291543636"}` [C]
- Consultar: `GET /v27.0/<MEDIA_ID>` retorna `url`, `mime_type`, `sha256`, `file_size`, `id`. **A URL vale 5 minutos** [C]
- Baixar: `GET <url>` com `Authorization: Bearer`. Sem o token, falha. Em 404, refaça o GET do ID [C]
- Validade do ID: 30 dias quando a API devolve o ID; 7 dias quando ele vem no webhook [C]
- Limites: imagem 5 MB (jpeg, png, webp estático); áudio 16 MB; vídeo 16 MB (H.264 + AAC, mp4 ou 3gp); documento 100 MB [C]. Mídia recebida acima de 100 MB gera erro 131052 [C].

## 5. Janela, limites e erros
- Janela de 24 h: começa na última mensagem ou chamada do usuário e reinicia a cada nova mensagem. Fora dela, só template [C]. Envie só a quem deu opt-in [C].
- Messaging limit (por portfólio, unique users em 24 h fora da janela): novo portfólio começa em 250; sobe para 2.000, 10.000, 100.000 ou ilimitado [C]. O campo `messaging_limit_tier` foi descontinuado. Use `whatsapp_business_manager_messaging_limit` [C].
- Throughput: 80 mps por número, com upgrade automático até 1.000 mps [C].
- Pair rate limit: 1 msg a cada 6 s para o mesmo usuário. Rajada de até 45 msgs é permitida e cobra o tempo depois [C]. Retry sugerido: 4^X s [C].
- Rate do app: 200 req/h por app e Messaging account; 5.000 req/h se houver número registrado [C].
- Número de teste: criado automaticamente, com limites relaxados [C]. Máximo de destinatários não confirmado (página test-numbers vazia) [S].
- Códigos [C] (https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes):
  - 131047: mais de 24 h desde a última resposta. Use template.
  - 131056: pair rate limit. Aguarde.
  - 130429: throughput excedido. 80007: limite da conta.
  - 131026: não entregável (não é WhatsApp, ToS antigo).
  - 131050 e 131049: opt-out de marketing e limite de marketing por usuário.
  - 131052 e 131053: mídia recebida grande demais, ou mídia enviada não suportada (MIME errado).
  - 131062: template de autenticação enviado a BSUID.
  - 131051, 131008, 100, 131021: tipo não suportado, parâmetro ausente, parâmetro inválido, remetente igual ao destinatário.
  - 131030 ("destinatário não permitido" no número de teste): não aparece na página de erros lida [S].

## 6. Formato do número
- `wa_id` e `from` vêm em E.164 sem `+`: `16505551234` [C].
- `to` aceita com `+`: `+16505551234` [C].
- BSUID (novo): `US.13491208655302741918`. Vem em `user_id` e `from_user_id`. Se o usuário tiver username, `wa_id` e `from` podem faltar. Para enviar a um BSUID, use `recipient` no lugar de `to`. Templates de autenticação não aceitam BSUID [C]. Monte a integração por BSUID, não por telefone.

## 7. O que mudou em relação ao conhecimento comum
1. Versão v27.0 (exemplos antigos usam v17 a v23). Throughput 80 mps, com upgrade até 1.000.
2. BSUID: `wa_id`/`from` podem faltar. Mapeie por `user_id`/`from_user_id`; envie por `recipient`.
3. Pair rate limit de 1 msg a cada 6 s, com rajada de 45. `messaging_limit_tier` foi deprecado.

Fontes (consultadas em 2026-11-12), prefixo https://developers.facebook.com/documentation/business-messaging/whatsapp/: about-the-platform, get-started, access-tokens, messaging-limits, throughput, webhooks/overview, webhooks/reference/messages, webhooks/reference/messages/audio, messages/send-messages, messages/interactive-reply-buttons-messages, business-phone-numbers/media, reference/whatsapp-business-phone-number/message-api, support/error-codes. Versão: https://developers.facebook.com/docs/graph-api/guides/versioning.
