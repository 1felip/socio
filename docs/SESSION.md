# Handoff
Última tarefa: T03 Dados sintéticos com padrões plantados (done offline)
O que mudou: scripts/seed/{generate,stores,reviews,patterns,sql,index}.ts + seed.test.ts; evals/datasets/planted-patterns.json;
migration 20261110000001 (v_item_sales_daily) + tipo em database.types.ts; @socio/db exporta ./testing; scripts/vitest.mjs (--filter → --project).
Atenção na próxima: seed.sql é gerado e gitignored; aplicar no remoto com `supabase db reset --linked` (passo 4 da T02).
MockStore do ifood-client lendo do Supabase segue pendente (precisa de banco real). Commit da T02 parcial: 53c6a2b.
CLAUDE.md e README.md seguem com reformatação não commitada (fora das tarefas).
Próxima tarefa sugerida (offline): T05 camada LLM. T00 [HUMANO] ainda destrava T02 remoto.
