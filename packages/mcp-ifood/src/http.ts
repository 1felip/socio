/**
 * MCP server ifood-parceiro via HTTP Streamable (stateless): POST /mcp.
 *
 * - Exige `Authorization: Bearer <SOCIO_MCP_HTTP_TOKEN>` (comparação em tempo constante).
 * - Escuta em 127.0.0.1 por padrão (SOCIO_MCP_HOST para mudar).
 * - Um server + transport por requisição; o contexto (serviços) é compartilhado.
 * - Sem elicitation: catalog_publish responde para aprovar pelo painel.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { SocioContext } from './context.ts';
import { createSocioMcpServer } from './tools.ts';

export const MCP_PATH = '/mcp';
export const MAX_BODY_BYTES = 1_000_000;

function digest(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

export function bearerOk(header: string | undefined, token: string): boolean {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!m?.[1]) return false;
  return timingSafeEqual(digest(m[1].trim()), digest(token));
}

function sendJson(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RangeError('too_large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createHttpServer(ctx: SocioContext, token: string): Server {
  if (token.length < 32)
    throw new Error('SOCIO_MCP_HTTP_TOKEN precisa de pelo menos 32 caracteres.');

  return createServer(async (req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== MCP_PATH) return sendJson(res, 404, 'Not found');
    if (!bearerOk(req.headers.authorization, token)) return sendJson(res, 401, 'Unauthorized');
    if (req.method !== 'POST') return sendJson(res, 405, 'Method not allowed');

    let body: unknown;
    try {
      body = await readBody(req);
    } catch (err) {
      return err instanceof RangeError
        ? sendJson(res, 413, 'Payload too large')
        : sendJson(res, 400, 'Invalid JSON');
    }

    const server = createSocioMcpServer(ctx, { elicitApproval: false });
    // Sem sessionIdGenerator = modo stateless.
    const transport = new StreamableHTTPServerTransport({});
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error('[mcp-ifood/http]', err instanceof Error ? err.message : err);
      if (!res.headersSent) sendJson(res, 500, 'Internal error');
    }
  });
}

/** Entrada CLI: node --env-file-if-exists=../../.env src/http.ts */
if (import.meta.main) {
  const { createContext } = await import('./context.ts');
  const token = process.env.SOCIO_MCP_HTTP_TOKEN?.trim() ?? '';
  const host = process.env.SOCIO_MCP_HOST?.trim() || '127.0.0.1';
  const port = Number(process.env.SOCIO_MCP_PORT ?? 3333);
  const ctx = await createContext();
  createHttpServer(ctx, token).listen(port, host, () => {
    console.error(`[mcp-ifood] http em http://${host}:${port}${MCP_PATH} (modo ${ctx.mode}).`);
  });
}
