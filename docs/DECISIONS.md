# Decisões

Formato: `D<n> (T<id>) — decisão. Motivo.` Duas linhas no máximo.

- D1 (T00) — Monorepo pnpm com Next.js + pacotes. Um repo só para o recrutador abrir e entender.
- D2 (T00) — Vercel AI SDK para os três provedores. Troca de modelo por env, sem reescrever código.
- D3 (T00) — n8n orquestra processos (webhooks, cron, retries); lógica de negócio fica na API. Mostra a competência pedida sem esconder regra no n8n.
- D4 (T00) — iFood via interface IfoodClient com mock no mesmo contrato. Sem CNPJ não há loja de teste.
- D5 (T00) — Supabase cloud de dev em vez de local com Docker. Menos atrito no Windows.
- D6 (T00) — Biome em vez de ESLint + Prettier. Uma ferramenta rápida, boa para o hook pós-edição.
- D5 (T04) — Mock do iFood sobre interface MockStore (memória agora, Supabase na T03); respostas validadas em Zod espelhando openapi.yaml.
  Review/Financial não confirmados na doc oficial (x-confirmed: false); getFinancialSummary é agregação nossa sobre /sales.
- D7 (T02) — Embeddings com 768 dimensões (`vector(768)`): MODEL_EMBED do Gemini com output_dimensionality=768. Menor custo de índice; trocar exige migration.
- D8 (T02) — Migrations testadas offline com PGlite + shim de auth/storage (sem Docker). Analista escopado por `app.merchant_id`; views v_* sem acesso para anon/authenticated.
- D9 (T03) — Seed como `supabase/seed.sql` gerado (seed fixa, janela fixa de 2026-08-01 a 2026-10-29), validado em PGlite e aplicado com `db reset`. Padrões plantados verificados só por views v_*; nova `v_item_sales_daily`.
- D10 (T05) — AI SDK `ai` 7 + Langfuse v6 via OTel com TracerProvider próprio (não global). Saída estruturada por `generateText`+`Output.object` e revalidada em Zod; system em `instructions` com cacheControl na Anthropic.
  agent_runs grava `agente:step` em `agent` (sem coluna step). Tetos checados antes da chamada; bloqueio gravado como `blocked`. Claude 5.x: `temperature` é omitida.
- D11 (T05) — env.example usa MODEL_EMBED=text-embedding-3-small com `dimensions: 768` (o D7 previa Gemini). O código aceita os dois provedores em 768; a escolha final fica para a T00.
- D12 (T07) — Aprovação nasce sem token; `approve()` gera token de 32 bytes (só sha256 no banco, 24 h). Kinds do banco = skill (`catalog.publish`...). Consumo por UPDATE condicional (status + token_hash + expires_at) antes da escrita: uso único mesmo com corrida.
  Falha do iFood no meio não devolve o token (nova aprovação para o resto). IDs do catálogo derivados do id da aprovação. ROI: `manual_minutes_estimate` por kind (base + por item, `estimate_source` = "a medir na T11"), duração = criação da aprovação → publicação.
  Revisão de segurança (T07): approve/reject exigem merchantId (outra loja = not_found, sem enumeração; checar membro/dono fica na rota da T08); pendente expira em 7 dias;
  serviço nunca devolve tokenHash; texto do rascunho limitado (80/200, sem controle nem links, ≤ 300 itens) antes de virar aprovação; payload e loja validados antes de consumir o token;
  trigger torna payload/hash/loja/kind imutáveis. catalogId do payload ainda não é conferido com o catálogo da loja (fica para a T08, que lista as categorias reais).
- D13 (T08) — Painel atrás da interface `Backend` (apps/web/lib/backend): `demo` (memória + mock iFood + rascunho fixo, sessão HMAC) e `supabase`; `SOCIO_BACKEND` escolhe, produção exige valor explícito.
  Autorização em lib/flows.ts (membro envia, só owner aprova/rejeita); aprovar no painel = approve + publish na mesma ação; categorias vêm do catálogo real e são revalidadas no servidor.
- D14 (T12) — Orquestrador (`POST /api/agent`): roteador híbrido (regras com peso; modelo `fast` só sem sinal ou empate; erro → `conversa`). Loop de tools via `generateWithTools` em packages/llm
  (AI SDK, `maxSteps`, teto de custo por loop, timeout); handlers só recebem tools de leitura/proposta. Memória curta em `conversations.state.messages` (últimas 12, sem tabela nova).
  Avaliações, analista e campanhas respondem "chegando" até T14/T15/T22 trocarem o handler. HMAC do n8n assina `${timestamp}.${corpo}` (±5 min); painel força `channel=panel` e checa membro.
- D15 (T13) — MCP server `ifood-parceiro` (SDK v1 `@modelcontextprotocol/sdk` 1.32.2; a v2 dividida em pacotes fica para depois). Uma loja por processo (`SOCIO_BACKEND` demo|supabase, mesma fiação do painel).
  `catalog_publish` recebe só `approvalId`: o dono confirma por elicitation em modo form (só sim/não, nada sensível, conforme a spec) e o server faz approve + publish na hora, como o painel; o token nunca sai do server.
  Sem elicitation (ou via HTTP stateless) nada é publicado. HTTP: Bearer com 32+ caracteres, 127.0.0.1 por padrão, 1 MB. `analytics_query` = resumo fixo do IfoodClient até a T15 (SQL via analyst_ro). Comentários de avaliação saem com maskPII. Runtime via tsx (imports sem extensão nos pacotes).
- D16 (T14) — Agente Avaliações em 2 passos sem tools (`generateObject`): `classify` (fast: sentimento, causa, item, gravidade, `injection_suspected`) e `reply` (orchestrator, tom de `merchants.voice_tone`, até 3 respostas publicadas como exemplo).
  Causas = lista da tarefa + `pedido_errado` (tema da T03) + `nenhuma`. Resposta passa por trava em código (≤ 300, sem link/controle, sem PII, sem promessa de desconto/brinde/dinheiro); reprovou → modelo seguro por causa.
  `syncReviews` (POST /api/reviews/sync, HMAC do n8n ou sessão de membro): janela de 7 dias, ≤ 30 por execução (notas baixas primeiro), uma aprovação `review.reply` {reviewId, text} por avaliação, alerta para nota ≤ 2 ou gravidade alta;
  injeção suspeita só vira aviso no alerta. Estado em reviews (sentiment/topics) + review_replies (draft ligado à aprovação). Painel aprova e publica `review.reply` como o catálogo. Demo: classificação por palavra-chave, sem modelo.
  Eval: 80 casos gerados da T03 (`reviews:dataset`, teste impede divergência) + 20 à mão; `pnpm eval:reviews` (causa, juiz role judge, injeção sem ação).
