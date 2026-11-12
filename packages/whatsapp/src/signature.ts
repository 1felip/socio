/**
 * Assinatura do webhook: header X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(corpo cru, app secret).
 * Sempre sobre o corpo exatamente como chegou (antes de JSON.parse). Falha fechada.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-hub-signature-256';

export function signPayload(appSecret: string, rawBody: string | Uint8Array): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

export function verifySignature(
  appSecret: string | undefined,
  rawBody: string | Uint8Array,
  header: string | null | undefined,
): boolean {
  if (!appSecret || !header) return false;
  const expected = Buffer.from(signPayload(appSecret, rawBody));
  const got = Buffer.from(header.trim().toLowerCase());
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/**
 * GET de verificação do webhook: devolve o challenge se modo e token baterem, senão null.
 * Compara o token em tempo constante.
 */
export function verifyChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): string | null {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token') ?? '';
  const challenge = params.get('hub.challenge');
  if (mode !== 'subscribe' || !verifyToken || !challenge) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // challenge volta como texto puro; só aceita algo curto e sem markup.
  return /^[\w.-]{1,256}$/.test(challenge) ? challenge : null;
}
