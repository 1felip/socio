# T03 · Dados sintéticos com padrões plantados
Fase 0 · Quem: CLAUDE · Depende: T02 · Estimativa: 1–2 h · Skills: supabase-db

## Objetivo
Três lojas fictícias com 90 dias de dados e padrões que os evals vão cobrar.

## Entregar
- [ ] `scripts/seed/` em TS, determinístico (seed fixa): Pizzaria Forno da Vila, Marmitaria Dona Cida, Açaí do Porto. Cardápios de 25 a 60 itens.
- [ ] Pedidos com picos de almoço e jantar e fim de semana mais forte.
- [ ] Avaliações por templates combinatórios (sem LLM nesta tarefa), incluindo 3 com tentativa de injeção de prompt.
- [ ] Padrões plantados e documentados em `evals/datasets/planted-patterns.json`:
  - atraso às sextas, 19h–22h, na pizzaria;
  - um item que aparece como "chegou frio" na maioria das avaliações negativas;
  - queda de vendas de uma marmita depois de aumento de preço numa data fixa.
- [ ] `pnpm seed` limpa e recria tudo.

## Aceite
```
pnpm seed
pnpm test --filter seed     # testes consultam v_* e confirmam cada padrão plantado
```
