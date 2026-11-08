# T13 · MCP server ifood-parceiro
Fase 2 · Quem: CLAUDE · Depende: T07 · Estimativa: 3–4 h · Skills: approvals (e mcp-builder, se instalada)

## Objetivo
Expor as mesmas ferramentas do agente para Claude Desktop e outros agentes.

## Entregar
- [ ] `packages/mcp-ifood` (stdio e HTTP) com tools: `catalog_list`, `catalog_draft`, `catalog_publish` (exige aprovação), `reviews_list`, `reviews_reply_draft`, `analytics_query` (read-only), `approvals_list`.
- [ ] Reutiliza os serviços existentes, sem duplicar lógica.
- [ ] `docs/mcp.md`: como conectar no Claude Desktop.

## Aceite
```
pnpm check
npx @modelcontextprotocol/inspector   # lista as tools sem erro
```
