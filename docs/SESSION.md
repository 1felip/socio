# Handoff
Última tarefa: T07 Aprovações e publicação no catálogo (done, offline com mock)
O que mudou: migration supabase/migrations/20261110000002_approvals_tokens.sql (kinds da skill, token só no approve, summary, trigger de imutabilidade, colunas de ROI);
packages/agents/src/approvals/ (serviço + SupabaseApprovalStore), src/catalog/publish.ts (propose + publish, MenuDraft → ItemUpsert), src/roi/roi.ts. D12 em DECISIONS.
Atenção na próxima: approve/reject recebem { approvalId, merchantId, userId }; a rota da T08 precisa checar se userId é dono da loja. catalogId/categoryIds ainda não conferidos com o catálogo real (T08).
O token sai só de approve() para o canal; o serviço nunca devolve tokenHash. database.types.ts segue escrito à mão até `pnpm db:types`.
T02, T05 e T06 seguem doing esperando T00 (.env) e a foto em evals/datasets/menus/samples/exemplo-1.jpg. CLAUDE.md/README.md/tsbuildinfo seguem fora dos commits.
Próxima tarefa sugerida: T02 (bloqueada por T00). Sem T00, dá para adiantar T08 (painel, depende de T07) offline.
