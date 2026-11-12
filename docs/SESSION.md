# Handoff
Última sessão: adiantei T15, T10, T09 e T11 sem chaves (commits wip). Nada fechado: todas esperam T00/.env ou passos seus.
O que mudou: T15 analista (packages/agents/src/analyst, /analista, D17); T10 rate limit + cron demo-reset + foto de exemplo (apps/web/lib/{rate-limit,demo-reset-endpoint,sample-menu}.ts, vercel.json, docs/deploy.md, D18);
T09 gabarito em planilha + eval:menu/eval:quick (packages/agents/src/menu/{score,gold-csv}.ts, scripts/{menu-gold,eval-menu}.ts, D19); T11 docs/metrics.md e docs/video-roteiro.md (com campos `__`); T20 /custos + aviso de teto no layout (apps/web/lib/{costs,budget}.ts, Backend.listRuns, D20); T19 eval:injection (20 casos, src/injection/check.ts), eval:quick, workflow .github/workflows/evals.yml, eval:table → docs/evals.md (D21).
Falta de você (ordem sugerida, prazo T11 = 17/11):
1. T00: criar .env (chaves, MODEL_*, Supabase, SUPABASE_DB_URL_ANALYST_RO, CRON_SECRET, SESSION_SECRET) — nomes novos em docs/deploy.md; adicionar ao .env.example (não consigo ler esse arquivo).
2. Fotos: 30 cardápios em evals/datasets/menus/images/ + 1 publicável em apps/web/public/samples/cardapio-exemplo.jpg (e a da T06: evals/datasets/menus/samples/exemplo-1.jpg).
3. T10: conectar na Vercel (Root Directory apps/web) e mandar a URL.
4. GitHub (T19): Secrets ANTHROPIC_API_KEY/OPENAI_API_KEY/GOOGLE_GENERATIVE_AI_API_KEY + Variables MODEL_* (e EVAL_COST_LIMIT_USD) → rodar o workflow Evals manualmente.
5. T11: medir manual × Sócio (docs/metrics.md), gravar vídeo, enviar inscrição.
Depois do .env, eu rodo (T20: conferir /custos com uso real, 1 trace público e custo médio/mês no README): evals reais T14 (eval:reviews), T15 (eval:analyst ≥ 34/40), T06/T05 pendências, `pnpm menu:gold template --prefill` (você corrige a planilha → `pnpm menu:gold import`), eval:menu, ui-tester na URL, README v1 com números.
Atenção: README.md tem mudanças suas não commitadas; README v1 fica para quando houver números. PGlite não respeita statement_timeout. MCP analytics_query ainda é resumo fixo (trocar por askAnalyst).
T21 herdou: rate limit por loja no Analista, escopo da loja depende do validador (set_config é PUBLIC), cooldown/Origin/segredo por loja do sync (T14).
Relatórios: reais em evals/reports/ (versionar), fake em evals/reports/fake/ (ignorado). Depois de rodar evals reais: pnpm eval:table.
T16 (wip): packages/whatsapp + /whatsapp com prova de posse (código SOCIO 123456 mandado do próprio número; confirmWhatsAppFromMessage para a rota da T17), D22. Pendente da revisão: downloadMedia com redirect manual, host exato e leitura limitada por stream; webhook com max() nos ids, from validado, phone_number_id conferido, timestamp inválido. Você: app Meta + WHATSAPP_* no .env → pnpm wa:ping <seu número>.
Próxima tarefa sem chaves possível: T22 (campanhas, opcional) ou partes de código da T16 (packages/whatsapp com testes, sem número real).
