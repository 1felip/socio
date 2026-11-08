# T04 · Contrato iFood: pesquisa, mock e adapter
Fase 0 · Quem: CLAUDE · Depende: T01 · Estimativa: 2–3 h · Skills: ifood-api · MCP: context7 ou firecrawl (opcional)

## Objetivo
Espelhar a parte do contrato oficial do iFood que o projeto usa e criar o adapter com mock.

## Entregar
- [ ] Peça ao doc-researcher: ler developer.ifood.com.br e salvar `docs/research/ifood-api.md` (auth, endpoints e formatos de Catalog, Review, Order, Merchant e Financial que vamos usar, limites, URLs).
- [ ] `packages/ifood-client/openapi.yaml` com esse subconjunto.
- [ ] Interface `IfoodClient` só com o necessário (ex.: listCatalog, upsertItems, listReviews, replyReview, pollOrderEvents, getOrder, getFinancialSummary).
- [ ] `MockIfoodClient` lendo do Supabase (dados da T03) no formato oficial; `RealIfoodClient` com métodos que lançam `NotConfiguredError`.
- [ ] `getIfoodClient()` escolhe por `IFOOD_MODE=mock|real`.
- [ ] Substituir o TODO de `.claude/skills/ifood-api/SKILL.md` por um resumo de até 60 linhas.

## Aceite
```
pnpm check     # inclui testes de contrato: respostas do mock validam nos schemas Zod do openapi
```

## Fora de escopo
Chamar a API real (sem CNPJ não há credencial).
