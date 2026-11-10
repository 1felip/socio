import { createHmac, timingSafeEqual } from 'node:crypto';

/** "valor.assinatura" com HMAC-SHA256. Usado só pela sessão do modo demo. */
export function sign(value: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${mac}`;
}

export function unsign(signed: string | undefined, secret: string): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const expected = Buffer.from(sign(value, secret));
  const got = Buffer.from(signed);
  return expected.length === got.length && timingSafeEqual(expected, got) ? value : null;
}
