/**
 * Números no formato do WhatsApp (wa_id): E.164 só com dígitos, sem "+".
 * Entrada do dono pode vir com máscara brasileira: "(11) 98888-7777" vira "5511988887777".
 */

const WA_ID = /^[1-9]\d{9,14}$/;

export function isWaId(value: string): boolean {
  return WA_ID.test(value);
}

/**
 * Normaliza para wa_id. Sem código do país e com 10 ou 11 dígitos (DDD + número), assume Brasil (55).
 * Devolve null se não der para ter certeza.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return null;
  const withCountry = input.trim().startsWith('+')
    ? digits
    : digits.length === 10 || digits.length === 11
      ? `55${digits}`
      : digits;
  return isWaId(withCountry) ? withCountry : null;
}

/** Para log: 5511988887777 → 55119****7777. Nunca logue o número inteiro. */
export function maskPhone(waId: string): string {
  if (waId.length < 8) return '****';
  return `${waId.slice(0, 5)}****${waId.slice(-4)}`;
}
