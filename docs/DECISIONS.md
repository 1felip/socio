# Decisões

Formato: `D<n> (T<id>) — decisão. Motivo.` Duas linhas no máximo.

- D1 (T00) — Monorepo pnpm com Next.js + pacotes. Um repo só para o recrutador abrir e entender.
- D2 (T00) — Vercel AI SDK para os três provedores. Troca de modelo por env, sem reescrever código.
- D3 (T00) — n8n orquestra processos (webhooks, cron, retries); lógica de negócio fica na API. Mostra a competência pedida sem esconder regra no n8n.
- D4 (T00) — iFood via interface IfoodClient com mock no mesmo contrato. Sem CNPJ não há loja de teste.
- D5 (T00) — Supabase cloud de dev em vez de local com Docker. Menos atrito no Windows.
- D6 (T00) — Biome em vez de ESLint + Prettier. Uma ferramenta rápida, boa para o hook pós-edição.
