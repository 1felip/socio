/**
 * MCP server ifood-parceiro via stdio (Claude Desktop, Claude Code, Inspector).
 * Uso: node --env-file-if-exists=../../.env src/stdio.ts
 * stdout é o canal do protocolo: logs só em stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createContext } from './context.ts';
import { createSocioMcpServer } from './tools.ts';

const ctx = await createContext();
const server = createSocioMcpServer(ctx);
await server.connect(new StdioServerTransport());
console.error(`[mcp-ifood] stdio pronto (modo ${ctx.mode}).`);
