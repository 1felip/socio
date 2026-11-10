# Handoff
Última tarefa: T08 Painel: upload, revisão e aprovação (done, aceite ui-tester no modo demo)
O que mudou: apps/web/lib/backend/ (types, demo, supabase, index), lib/flows.ts (regras membro/dono), lib/review-form.ts, lib/session.ts, app/actions.ts;
rotas app/login, app/(painel)/{page, cardapio/novo, cardapio/[id], aprovacoes, aprovacoes/[id]}. D13 em DECISIONS.
packages/llm/src/prompts.ts aceita SOCIO_PROMPTS_DIR (next.config define); hook post-edit agora cita caminhos com ( ).
Atenção na próxima: modo supabase só compila — testar com T00 (login, Storage menu-photos, extractMenu, monthStats).
Falta proxy.ts para renovar sessão do Supabase (> 1 h cai). Demo: dono@socio.demo / socio-demo (SOCIO_BACKEND=demo pnpm --filter web dev).
Turbopack ainda avisa de fs dinâmico em packages/llm/src/prompts.ts:63 (não bloqueia).
Fora dos commits: CLAUDE.md, README.md, tsbuildinfo, apps/web/AGENTS.md e next-env.d.ts (gerados pelo next dev), evals/reports/ui/.
T02, T05 e T06 seguem doing esperando T00 (.env) e a foto evals/datasets/menus/samples/exemplo-1.jpg.
Próxima tarefa sugerida: T02 Banco Supabase: schema, RLS e tipos (bloqueada por T00). Sem T00, ver próximas tarefas offline com roadmap.mjs status.
