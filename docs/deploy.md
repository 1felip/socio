# Deploy na Vercel (T10)

## Passos (você)

1. Vercel → Add New Project → importar o repositório.
2. **Root Directory:** `apps/web` (o `vercel.json` com o cron está lá). Framework: Next.js. Install: `pnpm install` (a Vercel detecta o workspace).
3. Variáveis de ambiente (Production). Copie os valores do seu `.env`; só os nomes estão aqui.
4. Deploy. Depois mande a URL para o ui-tester rodar o fluxo da T08 em produção.

## Variáveis

| Variável | Para quê | Demo sem chaves | Supabase + modelos |
|---|---|---|---|
| `SOCIO_BACKEND` | `demo` ou `supabase` (produção exige explícito) | `demo` | `supabase` |
| `SESSION_SECRET` | assina o cookie de sessão do modo demo (32+ caracteres) | sim | — |
| `DEMO_PASSWORD` | senha dos usuários demo (padrão `socio-demo`) | opcional | — |
| `CRON_SECRET` | protege `/api/cron/demo-reset` (16+ caracteres; a Vercel manda como Bearer) | sim | sim |
| `DEMO_MERCHANT_IDS` | uuids das lojas que o cron pode limpar, separados por vírgula | — | sim |
| `RATE_LIMIT_MODEL_PER_10MIN` | chamadas de modelo por IP a cada 10 min (padrão 20) | opcional | opcional |
| `RATE_LIMIT_UPLOAD_PER_10MIN` | fotos por IP a cada 10 min (padrão 5) | opcional | opcional |
| `COST_LIMIT_USD_PER_MERCHANT_DAY` | teto diário de custo por loja (padrão 2). Na demo use 1 | — | sim |
| `COST_LIMIT_USD_PER_CONVERSATION` | teto por conversa (padrão 0,20) | — | opcional |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase | — | sim |
| `SUPABASE_DB_URL_ANALYST_RO` | conexão do Analista (login que pode `set role analyst_ro`) | — | sim |
| `MODEL_*` e chaves dos provedores | ver `.env.example` (T05) | — | sim |
| `LANGFUSE_PROJECT_ID` | link do trace em /custos (id do projeto na URL do Langfuse; `LANGFUSE_HOST` opcional) | — | opcional |
| `N8N_WEBHOOK_SECRET` | HMAC do n8n | — | quando ligar o n8n |

## Conta demo

- Login: `dono@socio.demo` (dono, aprova) e `equipe@socio.demo` (equipe, só envia). Senha: `DEMO_PASSWORD` (padrão `socio-demo`).
- Loja: Pizzaria Forno da Vila, com catálogo de exemplo (mock do iFood no modo demo; seed da T03 no modo supabase).
- Restauração diária: cron `0 6 * * *` (03:00 em Brasília) chama `/api/cron/demo-reset`.
  - demo: zera uploads, aprovações, conversas, ROI e avaliações sincronizadas; volta o catálogo ao seed. Quem está logado continua logado.
  - supabase: apaga `review_replies`, `roi_events`, `approvals`, `menu_uploads` e `conversations` das lojas em `DEMO_MERCHANT_IDS`. Fotos no Storage ficam (limpar à mão se crescer).
- Proteções: rate limit por IP no upload, no Analista, no `/api/agent` e no sync de avaliações pelo painel (por instância; trava contra abuso, não limite exato) + teto diário de custo por loja em `packages/llm` (vale entre instâncias).

## Foto de exemplo

O botão "Usar foto de exemplo" em `/cardapio/novo` só aparece se existir `apps/web/public/samples/cardapio-exemplo.jpg`. Coloque ali uma foto de cardápio que você pode publicar (com permissão), até 10 MB.
