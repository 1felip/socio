/**
 * Prova de posse do número de WhatsApp (T16, revisão de segurança).
 *
 * 1. Painel: membro informa o número → gera código de 6 dígitos, guarda só o hash (30 min).
 * 2. WhatsApp: chega mensagem DESSE número com "SOCIO 123456" → confirma (rota da T17).
 * Só número confirmado é reconhecido pelo canal; até lá ele não lê nem aprova nada.
 */
import { createHash, randomInt } from 'node:crypto';

export const LINK_CODE_TTL_MS = 30 * 60_000;

export function newLinkCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Hash amarrado ao número: o mesmo código não serve para outro número. */
export function linkCodeHash(waId: string, code: string): string {
  return createHash('sha256').update(`socio-wa-link:${waId}:${code}`).digest('hex');
}

/** "SOCIO 123456", "socio-123456", "Sócio: 123456" → "123456". */
export function extractLinkCode(text: string): string | null {
  const m = /\bs[oó]cio\b\W{0,3}(\d{6})\b/i.exec(text.normalize('NFC'));
  return m?.[1] ?? null;
}

export function linkMessage(code: string): string {
  return `SOCIO ${code}`;
}
