---
name: handoff
description: Salva o estado de uma tarefa inacabada para continuar numa sessão limpa
disable-model-invocation: true
---
1. Mantenha a tarefa como doing.
2. Sobrescreva `docs/SESSION.md` (máx. 15 linhas):
   ```
   # Handoff
   Tarefa em andamento: <ID> <título>
   Feito: <itens de "Entregar" concluídos>
   Falta: <itens restantes, na ordem>
   Estado: <testes passando? o que está quebrado? arquivo e linha>
   Próximo passo exato: <1 frase>
   ```
3. `git add -A` e `git commit -m "wip(<ID>): <resumo>"`.
4. Responda só: "Salvo. Rode /clear e depois /next <ID>."
