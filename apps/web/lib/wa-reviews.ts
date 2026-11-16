/**
 * Núcleo de POST /api/whatsapp/reviews (T17): o n8n (reviews-hourly) chama de hora em hora,
 * por loja. Roda o Agente Avaliações e devolve as mensagens para os donos, com botões de
 * aprovação nas avaliações que pedem atenção. Só aceita chamada assinada pelo n8n.
 * Nunca publica nada: as respostas ficam como aprovações `review.reply`.
 */
import { CostLimitError } from '@socio/llm';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from './agent-auth.ts';
import type { Backend } from './backend/types.ts';
import { approvalButtons, type OutboundReply } from './wa-inbound.ts';

export const MAX_REVIEWS_BODY_BYTES = 1024;
/** Avisos com botão por execução; o resto vai num resumo para o painel. */
export const MAX_ALERTS_PER_RUN = 5;

type Env = Record<string, string | undefined>;

export interface WhatsAppReviewsDeps {
  backend: Backend;
  env?: Env;
  now?: () => Date;
}

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function handleWhatsAppReviews(
  req: Request,
  deps: WhatsAppReviewsDeps,
): Promise<Response> {
  const env = deps.env ?? process.env;
  if (Number(req.headers.get('content-length') ?? '0') > MAX_REVIEWS_BODY_BYTES) {
    return error(413, 'Corpo grande demais.');
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REVIEWS_BODY_BYTES) {
    return error(413, 'Corpo grande demais.');
  }
  const check = verifySignature({
    secret: env.N8N_WEBHOOK_SECRET,
    signature: req.headers.get(SIGNATURE_HEADER),
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    body: raw,
    ...(deps.now ? { now: deps.now() } : {}),
  });
  if (!check.ok) return error(403, 'Assinatura inválida.');

  let merchantId: unknown;
  try {
    merchantId = (JSON.parse(raw) as { merchantId?: unknown } | null)?.merchantId;
  } catch {
    return error(400, 'JSON inválido.');
  }
  if (typeof merchantId !== 'string' || !/^[\w-]{1,64}$/.test(merchantId)) {
    return error(400, 'merchantId obrigatório.');
  }

  try {
    const sync = await deps.backend.syncReviews(merchantId);
    const owners = await deps.backend.whatsAppOwners(merchantId);
    const replies: OutboundReply[] = [];
    const alerts = sync.alerts.slice(0, MAX_ALERTS_PER_RUN);
    const quiet = sync.approvals.length - alerts.length;
    for (const to of owners) {
      for (const a of alerts) {
        replies.push({ to, text: a.message, buttons: approvalButtons(a.approvalId) });
      }
      if (quiet > 0) {
        replies.push({
          to,
          text: `${quiet} ${quiet === 1 ? 'resposta nova está' : 'respostas novas estão'} esperando sua aprovação no painel, em Avaliações.`,
        });
      }
    }
    return Response.json({
      merchantId,
      processed: sync.processed,
      approvals: sync.approvals.length,
      truncated: sync.truncated,
      replies,
    });
  } catch (err) {
    if (err instanceof CostLimitError) {
      return error(429, 'Teto de custo do dia atingido. As avaliações seguem na próxima hora.');
    }
    console.error('[wa-reviews]', err instanceof Error ? err.message : err);
    return error(500, 'Não consegui sincronizar as avaliações agora.');
  }
}
