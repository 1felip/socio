# T05 · Camada LLM: modelos, custo e tracing
Fase 1 · Quem: CLAUDE · Depende: T02 · Estimativa: 3–4 h · Skills: llm-patterns

## Objetivo
Único ponto de chamada a modelos, com custo, tracing e proteção de PII.

## Entregar
- [ ] `packages/llm`: registry por papel (orchestrator, fast, vision, audio, judge, embed) lendo `MODEL_*`.
- [ ] Wrappers `generateText`, `generateObject`, `streamText`, `embed` com retries, timeout, tracing Langfuse e gravação em `agent_runs`.
- [ ] `pricing.ts` com preços por modelo; peça os valores ao doc-researcher e comente fonte e data.
- [ ] Tetos `COST_LIMIT_*` aplicados por conversa e por loja/dia.
- [ ] `maskPII()` (nomes, telefones, e-mails, endereços) com testes.
- [ ] Loader de prompts versionados (`prompts/<agente>/<nome>.v<N>.md` com frontmatter).
- [ ] Provider fake para testes (`LLM_FAKE=1`).
- [ ] `pnpm llm:smoke`: 1 chamada curta por provedor (pula se faltar chave).

## Aceite
```
pnpm check
pnpm llm:smoke      # 3 OK e linhas novas em agent_runs
```
