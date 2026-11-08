---
name: done
description: Fecha a tarefa atual - aceite, roadmap, handoff e commit
disable-model-invocation: true
---
1. Descubra a tarefa em andamento: `node scripts/roadmap.mjs next` (linha Status: doing).
2. Rode os comandos do "Aceite" da tarefa pelo subagente test-runner (ou eval-runner se for eval).
   - Falhou: resuma as falhas em até 5 linhas e pare. Não marque como done.
3. Se a tarefa tiver "Revisão: segurança", chame o subagente security-reviewer sobre `git diff HEAD`. Corrija achados altos antes de seguir.
4. `node scripts/roadmap.mjs set <ID> done`.
5. Acrescente uma linha em `docs/PROGRESS.md`: `- AAAA-MM-DD <ID> — <resumo em até 15 palavras>`.
6. Se tomou uma decisão de arquitetura nova, acrescente 2 linhas em `docs/DECISIONS.md`.
7. Sobrescreva `docs/SESSION.md` com no máximo 15 linhas, neste formato:
   ```
   # Handoff
   Última tarefa: <ID> <título> (done)
   O que mudou: <2-3 linhas, com caminhos>
   Atenção na próxima: <pegadinhas, TODOs, comandos>
   Próxima tarefa sugerida: <saída de roadmap.mjs next>
   ```
8. `git add -A` e `git commit -m "feat(<ID>): <título curto>"`.
9. Responda só: "Commitado. Rode /clear e depois /next."
