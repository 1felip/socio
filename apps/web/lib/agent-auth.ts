/**
 * Assinatura das chamadas do n8n para /api/*:
 *   X-Socio-Timestamp: segundos Unix
 *   X-Socio-Signature: hex(HMAC-SHA256(N8N_WEBHOOK_SECRET, `${timestamp}.${corpoBruto}`))
 * O timestamp entra na assinatura e vale ±5 min: corpo capturado não serve para replay longo.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-socio-signature';
export const TIMESTAMP_HEADER = 'x-socio-timestamp';
export const MAX_SKEW_SECONDS = 300;

export function signBody(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: 'no_secret' | 'missing' | 'stale' | 'mismatch' };

export function verifySignature(input: {
  secret: string | undefined;
  signature: string | null;
  timestamp: string | null;
  body: string;
  now?: Date;
}): SignatureCheck {
  // Sem segredo configurado, nunca aceita: falha fechada.
  if (!input.secret || input.secret.length < 16) return { ok: false, reason: 'no_secret' };
  if (!input.signature || !input.timestamp || !/^\d{1,12}$/.test(input.timestamp)) {
    return { ok: false, reason: 'missing' };
  }
  const nowS = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowS - Number(input.timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'stale' };
  }
  const given = input.signature
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  const expected = signBody(input.secret, input.timestamp, input.body);
  if (!/^[0-9a-f]{64}$/.test(given)) return { ok: false, reason: 'mismatch' };
  const ok = timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
  return ok ? { ok: true } : { ok: false, reason: 'mismatch' };
}
