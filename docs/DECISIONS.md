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
