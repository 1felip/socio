# Handoff
Última tarefa: T01 Monorepo e ferramentas (done)
O que mudou: package.json raiz, pnpm-workspace.yaml (allowBuilds p/ esbuild etc.), tsconfig.base.json, biome.json, vitest.config.ts;
apps/web (Next.js 16 + Tailwind v4 + shadcn, /api/health); packages/{llm,agents,ifood-client,db,whatsapp,mcp-ifood} com src/index.ts + teste;
.github/workflows/ci.yml. Hooks em scripts/hooks/*.mjs e scripts/roadmap.mjs reformatados pelo Biome.
Atenção na próxima: `pnpm check` e `pnpm --filter web build` verdes. CLAUDE.md e README.md têm reformatação de markdown não commitada (fora do T01) — descartar ou commitar à parte.
Biome ignora *.md, docs/ e .claude/. eval:quick é placeholder.
Próxima tarefa sugerida: T04 Contrato iFood: pesquisa, mock e adapter (docs/tasks/T04-contrato-ifood.md). T02 depende de T00 (suas contas).
