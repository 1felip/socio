# T08 · Painel: upload, revisão e aprovação
Fase 1 · Quem: CLAUDE · Depende: T07 · Estimativa: 5–7 h · Skills: ui-painel, tom-socio · MCP: playwright (para o ui-tester)

## Objetivo
O dono (ou o recrutador) sobe uma foto, revisa o rascunho e aprova em menos de 2 minutos.

## Entregar
- [ ] Login Supabase (e-mail + senha) e seleção de loja.
- [ ] `/cardapio/novo`: upload da foto (Storage) → agente → tela de revisão editável, com flags destacadas → Aprovar ou Rejeitar.
- [ ] `/aprovacoes`: fila pendente e histórico.
- [ ] `/`: cards com itens publicados, minutos economizados e custo de IA no mês.
- [ ] Estados de carregando, vazio e erro; layout mobile-first; rodapé "Projeto independente, não afiliado ao iFood".

## Aceite
```
pnpm check
```
Depois, com `pnpm dev` rodando, peça ao ui-tester o fluxo: login → upload → revisar → aprovar → item aparece no catálogo mock.
