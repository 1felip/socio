# T06 · Agente Cardápio: foto para rascunho
Fase 1 · Quem: CLAUDE · Depende: T05 · Estimativa: 4–6 h · Skills: llm-patterns, tom-socio

## Objetivo
Transformar a foto de um cardápio num rascunho estruturado e revisável.

## Entregar
- [ ] Schema Zod `MenuDraft`: categorias; itens com nome, descrição, preço em centavos, grupos de complementos, alérgenos possíveis, flags `price_outlier` e `low_confidence`.
- [ ] Etapa 1 (role vision): extração com saída estruturada.
- [ ] Etapa 2 (role orchestrator): padroniza nomes, escreve descrições curtas (tom-socio), marca alérgenos de uma lista fixa (glúten, lactose, ovo, amendoim, castanhas, soja, peixe, crustáceos), sinaliza preço muito fora da mediana da categoria.
- [ ] Prompts `v1` versionados.
- [ ] CLI: `pnpm --filter @socio/agents menu:extract <caminho-da-imagem>` imprime o JSON.
- [ ] Testes com provider fake.

## Aceite
```
pnpm check
pnpm --filter @socio/agents menu:extract evals/datasets/menus/samples/exemplo-1.jpg
```
(Se não houver foto de exemplo ainda, peça uma ao usuário e salve em `evals/datasets/menus/samples/`.)

## Fora de escopo
Publicar e UI.
