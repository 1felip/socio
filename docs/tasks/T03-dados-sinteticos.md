# T03 · Dados sintéticos com padrões plantados
Fase 0 · Quem: CLAUDE · Depende: T02 · Estimativa: 1–2 h · Skills: supabase-db

## Objetivo
Três lojas fictícias com 90 dias de dados e padrões que os evals vão cobrar.

## Entregar
- [x] `scripts/seed/` em TS, determinístico (seed fixa): Pizzaria Forno da Vila, Marmitaria Dona Cida, Açaí do Porto. Cardápios de 25 a 60 itens.
- [x] Pedidos com picos de almoço e jantar e fim de semana mais forte.
- [x] Avaliações por templates combinatórios (sem LLM nesta tarefa), incluindo 3 com tentativa de injeção de prompt.
- [x] Padrões plantados e documentados em `evals/datasets/planted-patterns.json`:
  - atraso às sextas, 19h–22h, na pizzaria;
  - um item que aparece como "chegou frio" na maioria das avaliações negativas;
  - queda de vendas de uma marmita depois de aumento de preço numa data fixa.
- [x] `pnpm seed` limpa e recria tudo.

## Aceite
```
pnpm seed
pnpm test --filter seed     # testes consultam v_* e confirmam cada padrão plantado
```

## Notas (feito)
- Pacote `scripts/seed` (workspace `seed`). `pnpm seed` gera `supabase/seed.sql` (gitignored, apaga as 3 lojas demo e recria) e `evals/datasets/planted-patterns.json`, e valida tudo em PGlite.
- Banco remoto: `pnpm supabase db reset --linked` depois da T00 (ver passo 4 da T02).
- Nova view `v_item_sales_daily` (migration 20261110000001) para o Analista ver o efeito da mudança de preço.
- Atraso é visto pelas avaliações (não há coluna de tempo de entrega). `reviewed_at` fica 45–100 min depois do pedido.
- `sentiment`/`topics` ficam vazios no banco (trabalho do agente). O gabarito por tópico está em `review_topics` no JSON.
- `pnpm test --filter <pacote>` vira `vitest run --project <pacote>` (scripts/vitest.mjs).
- Pendente: MockStore do ifood-client lendo do Supabase (handoff da T04), que precisa de banco real.
