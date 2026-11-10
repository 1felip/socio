# Handoff
Tarefa em andamento: T06 Agente Cardápio: foto para rascunho
Feito: schema MenuDraft (src/menu/schema.ts); etapa 1 vision + etapa 2 orchestrator (src/menu/pipeline.ts);
prompts menu/extract.v1 e menu/refine.v1; CLI menu:extract (scripts/menu-extract.ts, LLM_FAKE=1 usa src/menu/fixtures.ts); testes com fake.
Falta: aceite real: foto em evals/datasets/menus/samples/exemplo-1.jpg (pedir ao usuário) + chaves da T00 no .env.
Estado: pnpm check verde (135 testes). Etapa 2 só recebe nome/descrição por índice; preço, outlier (0,4×–2,5× mediana, ≥3 preços) e low_confidence são calculados em código.
Imagem vai como part `file` (ai 7 deprecou `image`). Sem MENU_MERCHANT_ID o CLI grava agent_runs só em memória.
T02 e T05 seguem doing, esperando T00. CLAUDE.md/README.md/tsbuildinfo seguem fora dos commits.
Próximo passo exato: com foto + .env, rodar `pnpm --filter @socio/agents menu:extract evals/datasets/menus/samples/exemplo-1.jpg` e conferir o JSON.
