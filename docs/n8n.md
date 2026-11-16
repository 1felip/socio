# n8n · fluxos do canal WhatsApp (T17)

O n8n só orquestra: recebe o webhook da Meta, chama a API do Sócio, envia as respostas, agenda e tenta de novo. Quem decide o que responder, quem pode aprovar e o que vai para o iFood é a API (`apps/web/lib/wa-inbound.ts` e `wa-reviews.ts`).

## Workflows (`n8n/*.json`)

| Workflow | Gatilho | O que faz |
|---|---|---|
| `wa-inbound` | Webhook `GET/POST /webhook/socio-wa` (URL que a Meta chama) | GET: repassa `hub.*` para `GET /api/whatsapp/inbound`, que confere o token e devolve o challenge. POST: responde 200 na hora para a Meta, assina o corpo **cru** e manda para `POST /api/whatsapp/inbound`. Cada item de `replies` vai para o `wa-buttons`. |
| `wa-buttons` | Execute Workflow (chamado pelos outros) | Recebe `{to, text, buttons?}` e envia pela Cloud API: texto simples ou mensagem interativa com até 3 botões. Tenta 3 vezes. |
| `reviews-hourly` | A cada hora | Para cada loja em `SOCIO_MERCHANT_IDS`: `POST /api/whatsapp/reviews` (assinado) e envia os avisos aos donos pelo `wa-buttons`. |
| `error-handler` | Error Trigger (é o `errorWorkflow` dos outros três) | Resume a falha (workflow, nó, mensagem, id da execução, sem dados de cliente) e avisa `SOCIO_OPS_WHATSAPP`, se estiver definido. |

## Fluxos

```
Mensagem do dono
  Meta ──POST──▶ n8n wa-inbound ──200──▶ Meta
                    │ corpo cru + X-Hub-Signature-256 + X-Socio-Signature
                    ▼
            /api/whatsapp/inbound
              1. ≤ 1 MB, corpo lido uma vez
              2. HMAC do n8n (±5 min) e HMAC da Meta (app secret) sobre os mesmos bytes → senão 403
              3. parseWebhook (só o nosso phone_number_id)
              4. wamid já visto? pula (wa_inbound_messages)
              5. número verificado? senão resposta genérica (ou confirma o código "SOCIO 123456")
              6. texto → orquestrador · foto → Agente Cardápio → aprovação · botão → decideFor
                    │ { replies: [{to, text, buttons?}] }
                    ▼
            n8n wa-buttons ──▶ Cloud API ──▶ WhatsApp do dono

Foto de cardápio
  foto → rascunho → aprovação catalog.publish → "Publicar N itens… Posso publicar?" [Aprovar] [Recusar]
  Aprovar (só dono) → approve → token → publicação no iFood (mock ou real) → "Feito: publiquei N itens"
  Se o rascunho não fecha sozinho (categoria sem par no iFood, preço faltando): manda o link de revisão do painel, sem botão.
  Foto mandada por funcionário: ele recebe "mandei para o dono" e os donos recebem os botões.

Avaliações (de hora em hora)
  reviews-hourly → /api/whatsapp/reviews → Agente Avaliações (só cria aprovações review.reply)
  → até 5 avisos com [Aprovar] [Recusar] por loja + resumo do resto → donos.
```

## Ambiente do n8n

| Variável | Para quê |
|---|---|
| `SOCIO_API_URL` | Base da API (ex.: `https://socio.vercel.app`), sem barra no fim |
| `N8N_WEBHOOK_SECRET` | Mesmo valor do `.env` da API (≥ 16 caracteres) |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` | Envio pela Cloud API |
| `SOCIO_MERCHANT_IDS` | Lojas do `reviews-hourly`, separadas por vírgula |
| `SOCIO_OPS_WHATSAPP` | Opcional: wa_id que recebe os avisos do `error-handler` |
| `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | Os nós Code assinam com HMAC |

Credencial (criada no n8n, nunca no JSON): **`WhatsApp Socio (Bearer)`**, do tipo Header Auth, com `Authorization: Bearer <WHATSAPP_TOKEN>`.

## Importar e ligar

1. Importar os quatro JSON e criar `error-handler` e `wa-buttons` primeiro. Depois reapontar o "Execute Workflow" e o `errorWorkflow` para os ids gerados.
2. Criar a credencial e as variáveis acima.
3. Ativar `wa-inbound` e, no app da Meta, em WhatsApp > Configuration, colocar a URL de produção `…/webhook/socio-wa`, o verify token `WHATSAPP_VERIFY_TOKEN` e assinar o campo `messages`.
4. Cadastrar seu número em /whatsapp no painel, mandar `SOCIO 123456` (o código que aparece lá) e depois uma foto de cardápio.

Exportar de volta para `n8n/` depois de mudar algo no editor (sem credenciais).
