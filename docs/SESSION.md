# Handoff
Última tarefa: T13 MCP server ifood-parceiro (done)
O que mudou: packages/mcp-ifood/src/{context,tools,stdio,http}.ts (7 tools sobre IfoodClient/approvals/publisher; demo|supabase via SOCIO_BACKEND);
docs/mcp.md (Claude Desktop, Claude Code, HTTP, Inspector); D15. Deps: @modelcontextprotocol/sdk 1.32.2 (v1), tsx (dev).
Atenção na próxima: rodar o server só via tsx (pacotes têm imports sem extensão; Node puro falha). Inspector:
`npx @modelcontextprotocol/inspector --cli node packages/mcp-ifood/node_modules/tsx/dist/cli.mjs packages/mcp-ifood/src/stdio.ts --method tools/list`.
catalog_publish publica só com confirmação do dono por elicitation (sem token no modelo); no HTTP stateless não publica.
Env novas (SOCIO_MCP_MERCHANT_ID, SOCIO_MCP_OWNER_USER_ID, SOCIO_MCP_HTTP_TOKEN/HOST/PORT) não foram ao .env.example (regra bloqueia o arquivo): adicionar à mão.
reviews_reply_draft só cria aprovação (publicar resposta = T14); analytics_query = resumo fixo até T15. Modo supabase do MCP só compila (testar após T00).
Herdado: T02, T05, T06 doing esperando T00 (.env) e a foto evals/datasets/menus/samples/exemplo-1.jpg; proxy.ts da T08 pendente.
Fora dos commits: CLAUDE.md, README.md, tsbuildinfo, apps/web/AGENTS.md, next-env.d.ts, evals/reports/.
Próxima tarefa sugerida: T02 Banco Supabase: schema, RLS e tipos (bloqueada por T00 Contas e chaves).
