# API de parceiros iFood: referência para o adapter

Pesquisado em 2026-11-09. Marcas: [C] confirmado na página oficial lida; [S] resumo de busca, não confirmado na página; [I] inferido.

## 1. Autenticação
- Base: https://merchant-api.ifood.com.br. TLS 1.2+ obrigatório, HTTP é rejeitado [C].
- POST `/authentication/v1.0/oauth/token`, `Content-Type: application/x-www-form-urlencoded` [C].
  Fonte: https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro
- Request: `grantType` (client_credentials | authorization_code | refresh_token), `clientId`, `clientSecret`. `authorizationCode` e `authorizationCodeVerifier` só em authorization_code. `refreshToken` só em refresh_token [C].
- Response: `accessToken`, `expiresIn` [C]. Campo `type` não aparece na página lida.
- Validade: access 3h, refresh 168h, com aviso de que pode mudar [C]. Resumo de busca cita 6h (21600s) no fluxo centralized [S]. Ler `expiresIn`, não fixar.
- Centralized = client_credentials, sem refresh token [S]. Página centralized deu 404. Distributed = authorization_code [I].
- Expirado: usar refresh ou pedir token novo [C]. 401 sinaliza expiração [S].
- Limite do endpoint: 100 req/min [C] https://developer.ifood.com.br/en-US/docs/getting-started/documentation/rate-limit/
- Exemplo:
  `curl -X POST https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token -H 'Content-Type: application/x-www-form-urlencoded' -d 'grantType=client_credentials&clientId=ID&clientSecret=SECRET'`
- CNPJ exigido: não confirmado. Termos de uso dizem que o acesso é OAuth2 client credentials e que a chave pode ser revogada [S].

## 2. Merchant (v1.0): parcial
Base: `https://merchant-api.ifood.com.br/merchant/v1.0` [S]
- GET `/merchants` (params `page`, `size`, padrão 100) e GET `/merchants/{merchantId}`: [S] (resumo de busca; página de endpoints deu 404). Campos do merchant não confirmados.
- GET `/merchants/{merchantId}/status`: heartbeat a cada 30s [C] https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/best-practices-troubleshooting
  - Campos: `available` (usar só este campo, segundo a página), `state` (pode vir `ERROR` com validações normais), `reopenable`, `validations[]` (cada um com `code` e `message`) [C].
  - `/status/{operation}` (DELIVERY, TAKEOUT, INDOOR): [S].
- Interrupções: GET `/merchants/{merchantId}/interruptions`, POST `/merchants/{merchantId}/interruptions` [C]. Remoção: `DELETE /interruptions/{id}` na página de boas práticas, versus `/merchants/{merchantId}/interruptions/{interruptionId}` no resumo. Conflito, não resolvido.
- Horário: GET e PUT `/merchants/{merchantId}/opening-hours` (PUT exige todos os dias da semana) [C].
- Limites: GET /merchants 100/min, GET /{id} 300/min, GET /status 20000/min [C no rate-limit].
- Campos completos e schema: não confirmados. Referência de API citada pela página, não acessível.

## 3. Catálogo (v2.0) [C]
Base: `https://merchant-api.ifood.com.br/catalog/v2.0/merchants/{merchantId}`
- GET `/categories/{categoryId}/items` [C]. Fonte: https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/multisetup
- PUT `/items`: corpo `{ item, products[], optionGroups[], options[] }` [C]. Fonte: https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/pizza
- PATCH `/items/status`: `{ "itemId", "status" }` [C]. Fonte: https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/availability
- PATCH `/items/price`: existe [C]. Corpo não confirmado [I]: `{ "itemId", "price": { "value" } }`.
- PATCH `/options/price`: `{ "optionId", "price": { "value" }, "parentCustomizationOptionId"?, "priceByCatalog"?: [{ value, catalogContext }] }` [C].
- PATCH `/options/status`: `{ "optionId", "status", "statusByCatalog"? }` [C]. PATCH `/optionGroups/status`: `{ "optionGroupId", "status" }` [C].
- POST `/inventory` `{ productId, quantity }`; GET `/inventory/{productId}` [C].
- Objeto item: `id`, `type` (ex.: PIZZA), `status`, `externalCode`, `contextModifiers[{ catalogContext, status, price }]` [C]. `categoryId`, `index`, `productId`, `originalValue`: não confirmados.
- Objeto product: `id`, `name`, `externalCode`, `optionGroups[{ id, min, max }]`, `quantity` [C]. `description`, `image`, `serving`: não confirmados.
- Status: AVAILABLE | UNAVAILABLE [C]. Contextos: DEFAULT (entrega), WHITELABEL (cardápio digital), INDOOR (salão) [C].
- Item PIZZA sem os grupos SIZE, CRUST, EDGE e TOPPING retorna 422 [C].
- Listar catálogos e `categories?includeItems=true`: não confirmados.

## 4. Review (v2.0): não confirmado
- Context7 não tem Review (em inglês; a biblioteca pt-BR `/websites/developer_ifood_br_pt-br` não existe). Páginas de review deram 404 em 3 URLs (pt-BR details, pt-BR guide, docs/review/errors).
- Resumo de busca: POST `/merchants/{merchantId}/reviews/{reviewId}/answers` em v2.0 [S]; guia antigo usa v1.0 [S]. Listagem `GET /merchants/{merchantId}/reviews` com page, pageSize, addCount, dateFrom, dateTo, sort, sortBy: [I] pelo pedido, não confirmado.
- Conflito de limite: 2000 req/min na tabela [S] x 10 req/s por token no guia [S].
- Campos da review (id, comment, score, createdAt, order, published, etc.), tamanho e prazo de resposta: não confirmados. Não implementar sem ler a referência.

## 5. Order (v1.0)
Base: `https://merchant-api.ifood.com.br/order/v1.0`
- GET `/orders:polling` (param `limit`, padrão 100) [C]. Fonte: https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/endpoints
- POST `/orders:acknowledgment` `{ "acknowledgedEventIds": [] }` [C].
- Polling a cada 30s [S]. Header `x-polling-merchants`: não confirmado.
- Conflito de caminho: `/events/v1.0/events:polling` [S] e `GET /events:polling` na tabela de rate limit [C]. Usar `orders:polling` até confirmar.
- Limite de ack: 2000 IDs (homologação) x 10000 eventos (events) [S]. Retenção de 8h após entrega [S].
- GET `/orders/{id}`; POST `/orders/{id}/confirm` (202), `/dispatch` `{ deliveredBy: "MERCHANT" }`, `/readyToPickup`, `/requestCancellation` `{ reason }`, `/startPreparation`, GET `/tracking` [C].
- Códigos de evento [C] https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/events
  - PLC: novo pedido; confirmar em 8 min ou cancela sozinho.
  - CFM: confirmado. RTP: pronto para retirada (só FOOD). DSP: saiu/retirado. CON: concluído. CAN: cancelado.
- Detalhe (food) [C] https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/details
  - Campos: `id` (uuid), `displayId`, `orderType` (DELIVERY | TAKEOUT | DINE_IN), `orderTiming` (IMMEDIATE | SCHEDULED), `salesChannel`, `category`, `createdAt`, `preparationStartDateTime`, `isTest`.
  - `merchant{id,name}`, `customer{id,name,documentType,phone,billingAddress}`.
  - `items[]{index,id,uniqueId,name,quantity,unitPrice,price,optionsPrice,totalPrice,options[]}`.
  - `total{subTotal,deliveryFee,benefits,additionalFees,orderAmount}`, `payments{prepaid,pending,methods[]}`, `delivery`, `takeout`, `dineIn`, `schedule`.
  - Valores numéricos sem unidade declarada. Centavos aparece só na página Groceries [S]: confirmar.
  - Atenção: a página Groceries `order/details` tem outro schema (`bag.items`, `virtual-bag`). Não usar.

## 6. Financeiro: não confirmado
- Context7 sem resultado para financial. Páginas `financial/api-settlement` (404) e `financial/api-antecipation` (404) não abriram.
- Resumo de busca (pt-BR `financial/api-settlement`): `beginDate`, `endDate`, `balance`, `settlements[]` com `type` (REPASSE | BOLETO), `amount`, `status`, `paymentDate` [S].
- Rotas citadas em resumo: GET `/merchants/{merchantId}/periods?competence=...` [S], GET `/merchants/{merchantId}/sales` (1000/min) [S], GET `/merchants/{merchantId}/payments` [S].
- Nenhum endpoint de "resumo de vendas" único foi confirmado. Não implementar sem checar a referência.

## 7. Limites e regras
- Limites por aplicação, quase sempre por minuto [C]. Exemplos: POST /oauth/token 100/min; GET /events:polling 6000/min; catálogo v1 15000/min; Financial/Promotion/Item 1000/min; Picking 1000 req/s [C].
- Timeout e homologação: não confirmados. Página de homologação existe: https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/homologation (não lida) [S].
- Paginação: merchant `page`/`size`; order `limit`. Demais não confirmado.

## Pegadinhas
- Não abriram: centralized, merchant, review, financial, homologação. Confirmar antes de codar o adapter.
- Firecrawl devolveu "Invalid token". Context7 (`/websites/developer_ifood_br_en-us`) foi útil para catálogo e pedidos.

## URLs consultadas (2026-11-09)
- https://developer.ifood.com.br (página inicial, sem links úteis)
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/intro
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/availability
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/pizza
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/catalog/guides/multisetup
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/endpoints
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/events
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/details
- https://developer.ifood.com.br/en-US/docs/getting-started/documentation/rate-limit/
- https://developer.ifood.com.br/en-US/docs/guides/modules/authentication/centralized/ (404)
- https://developer.ifood.com.br/pt-BR/docs/guides/modules/merchant/endpoints (404)
- https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-settlement/ (404)
- https://developer.ifood.com.br/pt-BR/docs/guides/modules/review/details/ (404)
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/merchant/best-practices-troubleshooting (2ª rodada, OK)
- https://developer.ifood.com.br/docs/guides/modules/review/errors (404, 2ª rodada)
- https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-antecipation (404, 2ª rodada)
