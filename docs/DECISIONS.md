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
