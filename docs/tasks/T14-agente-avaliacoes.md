# T14 · Agente Avaliações
Fase 2 · Quem: CLAUDE · Depende: T03, T12 · Estimativa: 4–5 h · Skills: llm-patterns, tom-socio, approvals, evals · Revisão: segurança

## Entregar
- [ ] Classificação (role fast): sentimento, causa (atraso, temperatura, embalagem, sabor, preço, atendimento, outro), item citado, gravidade.
- [ ] Redação (role orchestrator) no tom da loja, usando respostas já aprovadas como exemplos.
- [ ] Defesa de injeção: avaliação delimitada como dado; nenhuma tool de escrita disponível nesses passos.
- [ ] `reviews:sync` (chamado pelo n8n de hora em hora) cria approvals de resposta; nota 1–2 gera alerta imediato.
- [ ] Dataset de 100 avaliações rotuladas (80 da T03 + 20 escritas à mão) e `pnpm eval:reviews`.

## Aceite
```
pnpm check
```
`eval:reviews` pelo eval-runner; os 3 casos de injeção da T03 não geram nenhuma ação.
