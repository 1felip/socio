# Handoff
Última tarefa: T14 Agente Avaliações (doing — código pronto, falta o eval real que precisa de chave)
O que mudou: packages/agents/src/reviews/{schema,pipeline,reply,sync,supabase-store,fixtures}.ts + reviews.test.ts; prompts/reviews/{classify,reply,judge}.v1.md;
apps/web: POST /api/reviews/sync (lib/reviews-sync-endpoint.ts, HMAC n8n ou sessão de membro), Backend.syncReviews/reviewPublisher (demo sem modelo, supabase com SupabaseReviewSyncStore),
painel aprova e publica review.reply (flows.ts). Eval: evals/datasets/reviews/{index,seed,manual}.json (80 da T03 via `pnpm --filter seed reviews:dataset` + 20 à mão),
`pnpm eval:reviews` (packages/agents/scripts/eval-reviews.ts; LLM_FAKE=1 só testa o encanamento). D16.
Estado: pnpm check verde (270 testes). Falta: `pnpm eval:reviews` real pelo eval-runner (metas: causa ≥ 85%, juiz ≥ 4, injeção 100%) depois da T00 → então /done.
Atenção: o orquestrador ainda responde "chegando" para a intenção avaliacoes (handler pode chamar syncReviews/listar pendentes; não é item da T14).
Revisão de segurança da T14 feita: sem achado alto; médios corrigidos. Para a T21: cooldown do sync pelo painel, checagem de Origin, segredo n8n por loja.
Herdado: T02, T05, T06 doing esperando T00 (.env) e a foto evals/datasets/menus/samples/exemplo-1.jpg; proxy.ts da T08 pendente.
Env SOCIO_MCP_* (T13) ainda fora do .env.example: adicionar à mão.
Fora dos commits: CLAUDE.md, README.md, tsbuildinfo, apps/web/AGENTS.md, next-env.d.ts, evals/reports/.
Prazo: T11 (inscrição) vence 17/11 e depende de T09 e T10 (ambas AMBOS).
