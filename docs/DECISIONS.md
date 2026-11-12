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
- D17 (T15) — Agente Analista em 2 passos sem tools: `sql` (orchestrator: SELECT + sugestão de gráfico, views descritas em `analyst/views.ts`) e `answer` (fast: 2–3 frases; linhas vão por `untrusted('resultado')`, ≤ 50 linhas/6 kB).
  Validador com o parser real do Postgres (`libpg-query` 17.7.4, WASM): 1 comando SelectStmt, sem INTO/FOR UPDATE/CTE de escrita/parâmetros/tipos reg*; relações só `v_*` (CTE com escopo, sem sombrear tabela); funções por lista branca; LIMIT constante ≤ 1000, sem LIMIT anexa `\nlimit 1000`.
  Recusa ou erro do banco volta ao modelo 1 vez. Execução (`postgres` 3.4.9, `SUPABASE_DB_URL_ANALYST_RO`): transação read only + `set local role analyst_ro` + `statement_timeout` 5 s + `app.merchant_id` do servidor, sempre rollback.
  Gráfico (number/bar/line/table) montado por código a partir das linhas; coluna inválida cai para tabela. Painel `/analista` (Server Action, SVG próprio); intenção `analista` do orquestrador responde com o texto. Demo: respostas prontas.
  Eval: 40 perguntas com `gold_sql` recalculado sobre `supabase/seed.sql` num PGlite como analyst_ro (value/top/answer/refuse), padrões plantados como checagem de texto; `pnpm eval:analyst`, meta ≥ 34/40.
  Revisão de segurança (T15): nomes exatos no validador (CTE entre aspas não sombreia `pg_class`/`orders`) e CTE só com nome simples minúsculo; pontas de UNION validadas como SELECT; sem lpad/rpad;
  views v_* com `security_barrier` + `work_mem` 16 MB na role (migration 20261112000001); erro do banco volta ao modelo sem valores citados; resultado ao modelo com maskPII só em texto e `<`/`>` escapados; célula ≤ 1000 caracteres.
  Limite conhecido: o escopo da loja é GUC (`app.merchant_id`) e `set_config` é PUBLIC (não dá para revogar sem quebrar o PostgREST) — só o validador impede trocar de loja. Rate limit por loja/usuário fica para a T21.
- D18 (T10) — Demo pública: rate limit por IP em memória (janela de 10 min; 20 chamadas de modelo e 5 fotos, via env) no upload, Analista, `/api/agent` e sync pelo painel; n8n assinado fica de fora. Custo: teto diário por loja de packages/llm.
  Cron Vercel `0 6 * * *` → `/api/cron/demo-reset` (Bearer `CRON_SECRET`, fechado sem segredo): demo zera stores em memória sem derrubar sessão; supabase apaga tabelas transitórias das lojas em `DEMO_MERCHANT_IDS`. Foto de exemplo versionada em `public/samples` (botão some sem ela).
- D19 (T09) — Gabarito do cardápio em `evals/datasets/menus/gold/<foto_id>.json` ({id, image, items[{category, name, price_cents|null, allergens}]}), gerado de planilha CSV com ";" e preço com vírgula (`pnpm menu:gold template [--prefill] | import`; import valida tudo e não sobrescreve sem --force).
  Correção: casamento 1-para-1 por nome normalizado (exato, depois Jaccard de palavras ≥ 0,6); F1 de itens, preço exato e F1 de alérgenos em micro. `eval:quick` = `eval:menu --quick` (ids em index.json); sem dados avisa e sai 0.
- D20 (T20) — `/custos` agrega `agent_runs` em código (lib/costs.ts, puro): por dia no fuso da loja (dias vazios incluídos), por agente (prefixo de `agent`), p50/p95 interpolados sem as bloqueadas, últimas 20 com link Langfuse (`LANGFUSE_PROJECT_ID`; ids validados). Leitura via `Backend.listRuns` (RLS de membro; ≤ 5000 linhas).
  Aviso de teto no layout: gasto de hoje × `COST_LIMIT_USD_PER_MERCHANT_DAY` (mesmo teto do packages/llm), 80% = atenção, 100% = bateu; falha no cálculo nunca derruba o painel. Demo: 14 dias de histórico determinístico de exemplo.
- D21 (T19) — `eval:injection`: 20 ataques em 3 superfícies (8 avaliações via analyzeReview, 7 mensagens ao orquestrador numa loja com aprovação pendente, 5 textos "da foto" via `refineExtraction`, a etapa 2 do cardápio exposta para isso). "Sem ação" por superfície em src/injection/check.ts; eco do texto no rascunho é aviso, não falha. Meta 100%.
  `eval:quick` = injeção + `eval:menu --quick`. Workflow Evals: quick em PR (sem chave → aviso e passa), completo manual/segunda 09:00 UTC (`pnpm seed` antes; relatórios no Step Summary e artifact 90 dias). Rodadas fake vão para evals/reports/fake (ignorado); reais viram histórico versionado; `pnpm eval:table` → docs/evals.md.
