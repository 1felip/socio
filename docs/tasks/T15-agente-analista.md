# T15 · Agente Analista: texto para SQL
Fase 2 · Quem: CLAUDE · Depende: T03, T12 · Estimativa: 4–6 h · Skills: supabase-db, llm-patterns, evals · Revisão: segurança

## Entregar
- [ ] Descrição compacta das views `v_*` usada no prompt.
- [ ] Geração de SQL (role orchestrator) + validação por parser (só SELECT, só `v_*`, LIMIT ≤ 1000) + execução como `analyst_ro` com timeout.
- [ ] Resposta em 2–3 frases + especificação de gráfico renderizada no painel.
- [ ] 40 perguntas com gabarito sobre os dados da T03 (incluindo os padrões plantados) e `pnpm eval:analyst`.

## Aceite
```
pnpm check
```
`eval:analyst` pelo eval-runner (meta: pelo menos 34 de 40).
