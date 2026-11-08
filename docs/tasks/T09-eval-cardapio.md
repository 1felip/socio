# T09 · Gabarito e eval do cardápio
Fase 1 · Quem: AMBOS · Depende: T06 · Estimativa: 4–6 h (boa parte é sua) · Skills: evals

## Objetivo
Medir a qualidade da extração com 30 cardápios reais.

## Passos humanos
- [ ] Juntar 30 fotos de cardápios (com permissão) em `evals/datasets/menus/images/` (fora do git).
- [ ] Preencher o gabarito na planilha que o Claude gerar.

## Entregar (Claude)
- [ ] Formato do gabarito `evals/datasets/menus/gold/<id>.json` e script que gera um CSV para você preencher e converte de volta.
- [ ] Métricas: F1 de itens (nome normalizado), preço exato, F1 de alérgenos.
- [ ] `pnpm eval:menu` (30 fotos) e `pnpm eval:quick` (5 fotos).
- [ ] Relatório em `evals/reports/menu-<data>.md`.

## Aceite
Rodar `eval:quick` e `eval:menu` pelo eval-runner. Metas (F1 ≥ 0,90; preço ≥ 95%) são registradas; não atingir não bloqueia o /done.

## Confirmar antes
Pergunte ao usuário se as fotos e o gabarito já estão prontos antes de rodar a suíte completa.
