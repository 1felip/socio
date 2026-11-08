# T21 · Revisão de segurança e PII
Fase 3 · Quem: CLAUDE · Depende: T14, T15, T17 · Estimativa: 2–3 h · Revisão: segurança

## Entregar
- [ ] Rodar o security-reviewer no repositório inteiro (prioridade: tools de escrita, webhooks, SQL, RLS, segredos, PII).
- [ ] Corrigir achados ALTA e MÉDIA, com teste para cada um.
- [ ] `docs/security.md`: modelo de ameaças em 1 página (atores, ativos, controles, riscos aceitos).

## Aceite
security-reviewer sem achados ALTA; `pnpm check` verde.
