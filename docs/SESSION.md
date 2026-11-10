# Handoff
Última tarefa: T12 Orquestrador e roteamento (done)
O que mudou: packages/agents/src/orchestrator/ (schema, router, memory, orchestrator) + prompts/orchestrator/{router,chat}.v1.md;
packages/llm generateWithTools/defineTool (loop de tools com maxSteps, teto de custo, timeout; fake emite tool calls);
apps/web POST /api/agent (lib/agent-endpoint.ts, lib/agent-auth.ts HMAC ts.corpo ±5 min), Backend.conversations; evals/datasets/routing/phrases.json. D14.
Atenção na próxima: roteamento 18/20 com fake (2 frases sem palavra-chave dependem do modelo real; confirmar após T00).
Avaliações/analista/campanhas respondem "chegando": T14/T15/T22 trocam via handlers do createOrchestrator. Áudio (T18) e foto via WhatsApp (T16) com resposta fixa.
n8n (T17) deve assinar `${X-Socio-Timestamp}.${corpo}` (skill n8n-workflows atualizada). SupabaseConversationStore só compila (testar com T00).
Ainda pendente de T08: proxy.ts para renovar sessão do Supabase. Fora dos commits: CLAUDE.md, README.md, tsbuildinfo, apps/web/AGENTS.md, next-env.d.ts, evals/reports/.
T02, T05 e T06 seguem doing esperando T00 (.env) e a foto evals/datasets/menus/samples/exemplo-1.jpg.
Próxima tarefa sugerida: T02 Banco Supabase: schema, RLS e tipos (bloqueada por T00). Offline: T13 MCP server ifood-parceiro.
