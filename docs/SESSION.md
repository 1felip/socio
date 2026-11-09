# Handoff
Última tarefa: T04 Contrato iFood: pesquisa, mock e adapter (done)
O que mudou: docs/research/ifood-api.md; packages/ifood-client/{openapi.yaml, src/schemas.ts, client.ts, mock.ts, memory-store.ts, fixtures.ts, real.ts, errors.ts, index.ts};
.claude/skills/ifood-api/SKILL.md resumido. getIfoodClient() por IFOOD_MODE (mock padrão). Teste de contrato openapi × Zod.
Atenção na próxima: mock usa store em memória (demoSeed); T03 deve implementar MockStore lendo do Supabase e passar em getIfoodClient({ store }).
Review, Financial e listagens marcadas x-confirmed: false (páginas 404) — conferir manualmente antes do modo real. Polling: orders:polling vs events:polling em aberto.
CLAUDE.md e README.md seguem com reformatação não commitada (fora das tarefas).
Próxima tarefa sugerida: T00 Contas e chaves [HUMANO] (destrava T02 → T03).
