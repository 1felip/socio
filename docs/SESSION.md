# Handoff
Última tarefa: T15 Agente Analista (doing — código pronto, falta o eval real que precisa de chave)
O que mudou: packages/agents/src/analyst/{views,guard,db,pipeline,schema,fixtures,score}.ts + analyst.test.ts; prompts/analyst/{sql,answer}.v1.md; deps libpg-query 17.7.4 e postgres 3.4.9 (agents e web).
apps/web: /analista (Server Action askAnalystAction, gráfico SVG próprio), Backend.askAnalyst (demo: respostas prontas; supabase: PostgresAnalystDb via SUPABASE_DB_URL_ANALYST_RO), intenção analista do /api/agent.
Migration 20261112000001_analyst_hardening (security_barrier nas v_*, work_mem). Eval: evals/datasets/analyst/{index,questions}.json (40 casos, gold_sql sobre supabase/seed.sql em PGlite), `pnpm eval:analyst`. D17.
Estado: pnpm check verde; revisão de segurança feita (alto e médios corrigidos). Falta: `pnpm eval:analyst` real pelo eval-runner (meta ≥ 34/40) depois da T00 → então /done.
Atenção: PGlite não respeita statement_timeout (no Postgres real vale 5 s). MCP analytics_query (T13) ainda usa o resumo fixo; trocar por askAnalyst é follow-up. SUPABASE_DB_URL_ANALYST_RO precisa de um login que possa `set role analyst_ro`.
Para a T21: rate limit/teto por loja no Analista; escopo da loja depende só do validador (set_config é PUBLIC).
Pendente da T14: eval real (mesma dependência da T00).
Herdado: T02, T05, T06 doing esperando T00 (.env) e a foto evals/datasets/menus/samples/exemplo-1.jpg; proxy.ts da T08 pendente.
Env SOCIO_MCP_* (T13) ainda fora do .env.example: adicionar à mão.
Fora dos commits: CLAUDE.md, README.md, tsbuildinfo, apps/web/AGENTS.md, next-env.d.ts, evals/reports/.
Prazo: T11 (inscrição) vence 17/11 e depende de T09 e T10 (ambas AMBOS).
