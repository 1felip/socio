# T01 · Monorepo e ferramentas
Fase 0 · Quem: CLAUDE · Depende: — · Estimativa: 2–3 h

## Objetivo
Esqueleto do monorepo com `pnpm check` verde. Nenhuma regra de negócio.

## Entregar
- [ ] `package.json` raiz (private, `packageManager` pnpm), `pnpm-workspace.yaml` (apps/*, packages/*).
- [ ] `tsconfig.base.json` strict; `biome.json` (lint + format); Vitest em modo workspace.
- [ ] Scripts raiz: `dev`, `build`, `typecheck`, `lint`, `test`, `check` (typecheck + lint + test), `eval:quick` (placeholder que sai 0), `db:types`, `seed`.
- [ ] `apps/web`: Next.js App Router + Tailwind + shadcn/ui; página `/` simples; `GET /api/health` → `{ ok: true }`.
- [ ] Pacotes `@socio/llm`, `@socio/agents`, `@socio/ifood-client`, `@socio/db`, `@socio/whatsapp`, `@socio/mcp-ifood`, cada um com `src/index.ts` e 1 teste trivial.
- [ ] devDependencies na raiz: `supabase` (CLI), `promptfoo`, `@biomejs/biome`, `vitest`, `typescript`.
- [ ] `.github/workflows/ci.yml`: install com cache + `pnpm check`.

## Aceite
```
pnpm install
pnpm check
pnpm --filter web build
```

## Notas
- Versões estáveis atuais; se em dúvida, pergunte ao doc-researcher.
- Lib nova fora desta lista → registre em docs/DECISIONS.md.
