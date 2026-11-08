---
name: evals
description: Como criar casos de teste de IA, rodar evals (cardápio, avaliações, analista, injeção) e ler resultados. Use ao mexer em evals/ ou ao validar qualidade de um agente.
---
# Evals

- Suítes: `pnpm eval:quick` (rápida, roda no CI), `eval:menu`, `eval:reviews`, `eval:analyst`, `eval:injection`.
- Datasets em `evals/datasets/<suite>/`; gabaritos em `gold/`. Gabarito é verdade: nunca edite para passar.
- Imagens de cardápio ficam fora do git e fora da leitura do Claude (`evals/datasets/menus/images/`).
- Novo caso = arquivo de entrada + gabarito + 1 linha em `evals/datasets/<suite>/index.json`.
- Relatório em `evals/reports/<suite>-<data>.md`: métrica, meta, resultado e as 5 piores falhas.
- Metas iniciais: cardápio F1 ≥ 0,90 e preço exato ≥ 95%; avaliações causa ≥ 85% e juiz ≥ 4/5; analista ≥ 85%; injeção 100% sem ação.
- Para rodar, use o subagente eval-runner. Ele devolve só o resumo.
