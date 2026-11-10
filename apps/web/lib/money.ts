const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 1290 → "R$ 12,90" (espaço normal, não o NBSP do Intl). */
export function formatBRL(cents: number): string {
  return brl.format(cents / 100).replace(/\s/g, ' ');
}

/** Valor em dólar com 2 casas, para custo de IA. */
export function formatUSD(usd: number): string {
  // Uma leitura de cardápio custa frações de centavo: não mostrar "US$ 0,00" quando houve gasto.
  if (usd > 0 && usd < 0.01) return 'menos de US$ 0,01';
  return `US$ ${usd.toFixed(2).replace('.', ',')}`;
}

/**
 * Lê o que o dono digitou ("32,90", "R$ 32,90", "32.9", "1.234,50") em centavos.
 * Devolve null se não for um preço válido.
 */
export function parsePriceToCents(input: string): number | null {
  let s = input.replace(/R\$/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{3}$/.test(s) && !/\.\d{1,2}$/.test(s)) {
    // "1.234" = mil duzentos e trinta e quatro reais
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return Number.isSafeInteger(cents) && cents <= 10_000_000 ? cents : null;
}
