/**
 * Núcleo do POST /api/reviews/sync (o n8n chama de hora em hora).
 *
 * Corpo: { merchantId }. Resposta: aprovações criadas e alertas prontos para o WhatsApp.
 * - n8n: assinatura HMAC (lib/agent-auth.ts).
 * - painel: sessão de membro da loja ("sincronizar agora").
 * Nunca publica nada: só cria aprovações `review.reply`.
 */
import { CostLimitError } from '@socio/llm';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from './agent-auth.ts';
import type { Backend } from './backend/types.ts';
import { limitByIp, type RateLimiter, rateLimitMessage } from './rate-limit.ts';

export const MAX_SYNC_BODY_BYTES = 1024;

type Env = Record<string, string | undefined>;

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export interface ReviewsSyncDeps {
  backend: Backend;
  env?: Env;
  now?: () => Date;
  /** Rate limit por IP do caminho do painel (testes injetam o seu). */
  limiter?: RateLimiter;
}

export async function handleReviewsSyncPost(
  req: Request,
  deps: ReviewsSyncDeps,
): Promise<Response> {
  const env = deps.env ?? process.env;
  if (Number(req.headers.get('content-length') ?? '0') > MAX_SYNC_BODY_BYTES) {
    return error(413, 'Corpo grande demais.');
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_SYNC_BODY_BYTES) {
    return error(413, 'Corpo grande demais.');
  }

  const signature = req.headers.get(SIGNATURE_HEADER);
  if (signature !== null) {
    const check = verifySignature({
      secret: env.N8N_WEBHOOK_SECRET,
      signature,
      timestamp: req.headers.get(TIMESTAMP_HEADER),
      body: raw,
      ...(deps.now ? { now: deps.now() } : {}),
    });
    if (!check.ok) return error(401, 'Assinatura inválida.');
  }

  let merchantId: unknown;
  try {
    merchantId = (JSON.parse(raw) as { merchantId?: unknown } | null)?.merchantId;
  } catch {
    return error(400, 'JSON inválido.');
  }
  if (typeof merchantId !== 'string' || merchantId.length === 0 || merchantId.length > 64) {
    return error(400, 'merchantId obrigatório.');
  }

  if (signature === null) {
    const rate = limitByIp(req.headers, 'model', {
      env,
      ...(deps.limiter ? { limiter: deps.limiter } : {}),
    });
    if (!rate.ok) return error(429, rateLimitMessage(rate.retryAfter));
    const user = await deps.backend.currentUser();
    if (!user) return error(401, 'Faça login.');
    const merchants = await deps.backend.merchantsFor(user.id);
    if (!merchants.some((m) => m.id === merchantId)) {
      return error(403, 'Você não tem acesso a essa loja.');
    }
  }

  try {
    return Response.json(await deps.backend.syncReviews(merchantId));
  } catch (err) {
    if (err instanceof CostLimitError) return error(429, err.userMessage);
    console.error('[api/reviews/sync]', err instanceof Error ? err.message : err);
    return error(500, 'Não consegui ler as avaliações agora. Tento de novo na próxima hora.');
  }
}
