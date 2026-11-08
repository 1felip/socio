---
name: next
description: Inicia ou retoma a próxima tarefa do roadmap
argument-hint: "[ID opcional, ex: T07]"
disable-model-invocation: true
---
1. Rode `node scripts/roadmap.mjs next $ARGUMENTS`. Ele mostra ID, título, quem faz e o arquivo da tarefa.
   - Se aparecer "Roadmap concluído", avise e pare.
   - Se Quem = HUMANO: leia o arquivo da tarefa, mostre só o checklist humano e pare.
2. Leia `docs/SESSION.md` e o arquivo da tarefa. Não leia outros docs, a menos que a tarefa mande.
3. Rode `node scripts/roadmap.mjs set <ID> doing`.
4. Escreva um plano de no máximo 8 linhas (arquivos que vai criar ou editar e a ordem).
   - Se a tarefa tiver "Confirmar antes" ou Quem = AMBOS, mostre os passos humanos e pergunte antes de seguir.
   - Senão, execute.
5. Implemente em passos pequenos. Para typecheck, lint e testes use o subagente test-runner. Não cole logs longos.
6. Concluídos os itens de "Entregar", rode o "Aceite" pelo test-runner.
   - Passou: responda "Pronto. Rode /done."
   - O contexto está ficando grande antes de terminar: rode o fluxo do /handoff.
