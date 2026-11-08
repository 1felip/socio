# T07 · Aprovações e publicação no catálogo
Fase 1 · Quem: CLAUDE · Depende: T04, T06 · Estimativa: 3–4 h · Skills: approvals · Revisão: segurança

## Objetivo
Nenhuma escrita acontece sem aprovação, e cada execução registra o tempo economizado.

## Entregar
- [ ] Serviço `approvals`: create, approve (gera token de uso único, 24 h, guarda só o hash), reject, list.
- [ ] `catalog.publish({ approvalId, approvalToken })`: valida tudo da skill approvals, converte `MenuDraft` para o formato do catálogo e chama `IfoodClient.upsertItems`.
- [ ] `roi_events`: tarefa, minutos manuais estimados (configuráveis por tipo, campo `source` = "a medir na T11") e duração real do fluxo.
- [ ] Testes: sem aprovação, token reutilizado, token expirado, payload alterado, loja errada → todos falham.

## Aceite
```
pnpm check
```
