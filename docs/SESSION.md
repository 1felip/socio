# Handoff
Última sessão: adiantei T15, T10, T09 e T11 sem chaves (commits wip). Nada fechado: todas esperam T00/.env ou passos seus.
O que mudou: T15 analista (packages/agents/src/analyst, /analista, D17); T10 rate limit + cron demo-reset + foto de exemplo (apps/web/lib/{rate-limit,demo-reset-endpoint,sample-menu}.ts, vercel.json, docs/deploy.md, D18);
T09 gabarito em planilha + eval:menu/eval:quick (packages/agents/src/menu/{score,gold-csv}.ts, scripts/{menu-gold,eval-menu}.ts, D19); T11 docs/metrics.md e docs/video-roteiro.md (com campos `__`).
Falta de você (ordem sugerida, prazo T11 = 17/11):
1. T00: criar .env (chaves, MODEL_*, Supabase, SUPABASE_DB_URL_ANALYST_RO, CRON_SECRET, SESSION_SECRET) — nomes novos em docs/deploy.md; adicionar ao .env.example (não consigo ler esse arquivo).
2. Fotos: 30 cardápios em evals/datasets/menus/images/ + 1 publicável em apps/web/public/samples/cardapio-exemplo.jpg (e a da T06: evals/datasets/menus/samples/exemplo-1.jpg).
3. T10: conectar na Vercel (Root Directory apps/web) e mandar a URL.
4. T11: medir manual × Sócio (docs/metrics.md), gravar vídeo, enviar inscrição.
Depois do .env, eu rodo: evals reais T14 (eval:reviews), T15 (eval:analyst ≥ 34/40), T06/T05 pendências, `pnpm menu:gold template --prefill` (você corrige a planilha → `pnpm menu:gold import`), eval:menu, ui-tester na URL, README v1 com números.
Atenção: README.md tem mudanças suas não commitadas; README v1 fica para quando houver números. PGlite não respeita statement_timeout. MCP analytics_query ainda é resumo fixo (trocar por askAnalyst).
T21 herdou: rate limit por loja no Analista, escopo da loja depende do validador (set_config é PUBLIC), cooldown/Origin/segredo por loja do sync (T14).
Próxima tarefa sem chaves possível: T20 (página /custos) ou T19 (eval:injection + CI com secrets).
