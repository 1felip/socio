/**
 * `promo.simulate`: quanto sobra de margem com um desconto e o que esperar de volume.
 *
 * Pura e determinística (sem LLM, sem escrita). O custo do item é opcional por loja
 * (`catalog_items.cost_cents`); sem custo não dá para garantir a margem, e o item fica bloqueado.
 *
 * Suposições (também no README, seção "Campanhas"):
 * - Elasticidade linear e constante: cada 1% de desconto aumenta o volume em
 *   `ELASTICITY`% (1,5 → 20% off vende 30% a mais). Valor conservador para delivery;
 *   não vem de dado da loja.
 * - O ganho de volume tem teto de `MAX_UPLIFT` (+60%), por mais fundo que seja o desconto.
 * - Sem canibalização entre itens, sem efeito em pedidos fora da promoção e sem cliente novo
 *   recorrente: só o volume do próprio item na semana.
 * - Margem = (preço − custo − comissão) ÷ preço. A comissão é um % do preço informado pela
 *   loja (padrão 0: margem sobre custo, como o `min_margin_pct` do cadastro).
 */

export const ELASTICITY = 1.5;
export const MAX_UPLIFT = 0.6;
export const MAX_DISCOUNT_PCT = 70;

export interface PromoItemInput {
  id: string;
  name: string;
  priceCents: number;
  /** Custo unitário; null quando a loja não informou. */
  costCents: number | null;
  /** Unidades vendidas por semana sem promoção (opcional: só muda a projeção de lucro). */
  weeklyUnits?: number;
}

export interface SimulateInput {
  items: PromoItemInput[];
  discountPct: number;
  /** `merchants.min_margin_pct` da loja. */
  minMarginPct: number;
  /** % do preço que sai como comissão/taxa. Padrão 0. */
  commissionPct?: number;
}

export type PromoItemStatus = 'ok' | 'below_min_margin' | 'missing_cost';

export interface PromoItemResult {
  id: string;
  name: string;
  status: PromoItemStatus;
  priceCents: number;
  promoPriceCents: number;
  costCents: number | null;
  /** Margem % antes e depois do desconto (null sem custo). */
  marginPctBefore: number | null;
  marginPctAfter: number | null;
  /** Ganho de volume suposto, em % (ex.: 30 = +30%). */
  expectedUpliftPct: number;
  /** Aumento de volume necessário para empatar o lucro da semana (null se impossível ou sem custo). */
  breakEvenUpliftPct: number | null;
  weeklyProfitBeforeCents: number | null;
  weeklyProfitAfterCents: number | null;
}

export interface SimulateResult {
  discountPct: number;
  minMarginPct: number;
  commissionPct: number;
  items: PromoItemResult[];
  /** true se todos os itens têm custo e ficam na margem mínima. */
  ok: boolean;
  assumptions: { elasticity: number; maxUpliftPct: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function promoPrice(priceCents: number, discountPct: number): number {
  return Math.round(priceCents * (1 - discountPct / 100));
}

export function expectedUplift(discountPct: number): number {
  return Math.min(ELASTICITY * (discountPct / 100), MAX_UPLIFT);
}

export function simulatePromo(input: SimulateInput): SimulateResult {
  const { discountPct, minMarginPct } = input;
  const commissionPct = input.commissionPct ?? 0;
  if (!Number.isInteger(discountPct) || discountPct < 1 || discountPct > MAX_DISCOUNT_PCT) {
    throw new RangeError(`Desconto precisa ser inteiro entre 1% e ${MAX_DISCOUNT_PCT}%.`);
  }
  if (minMarginPct < 0 || minMarginPct > 100 || commissionPct < 0 || commissionPct >= 100) {
    throw new RangeError('Margem mínima ou comissão fora de 0–100%.');
  }
  const uplift = expectedUplift(discountPct);

  const items = input.items.map((item): PromoItemResult => {
    const after = promoPrice(item.priceCents, discountPct);
    const base = {
      id: item.id,
      name: item.name,
      priceCents: item.priceCents,
      promoPriceCents: after,
      costCents: item.costCents,
      expectedUpliftPct: round1(uplift * 100),
    };
    if (item.costCents === null || item.priceCents <= 0) {
      return {
        ...base,
        status: 'missing_cost',
        marginPctBefore: null,
        marginPctAfter: null,
        breakEvenUpliftPct: null,
        weeklyProfitBeforeCents: null,
        weeklyProfitAfterCents: null,
      };
    }
    const cost = item.costCents;
    const unitProfit = (price: number) => price - cost - (price * commissionPct) / 100;
    const before = unitProfit(item.priceCents);
    const afterProfit = unitProfit(after);
    const marginAfter = after > 0 ? (afterProfit / after) * 100 : Number.NEGATIVE_INFINITY;
    const units = item.weeklyUnits;
    return {
      ...base,
      status: marginAfter >= minMarginPct ? 'ok' : 'below_min_margin',
      marginPctBefore: round1((before / item.priceCents) * 100),
      marginPctAfter: Number.isFinite(marginAfter) ? round1(marginAfter) : null,
      breakEvenUpliftPct:
        afterProfit > 0 && before > 0 ? round1((before / afterProfit - 1) * 100) : null,
      weeklyProfitBeforeCents: units === undefined ? null : Math.round(units * before),
      weeklyProfitAfterCents:
        units === undefined ? null : Math.round(units * (1 + uplift) * afterProfit),
    };
  });

  return {
    discountPct,
    minMarginPct,
    commissionPct,
    items,
    ok: items.length > 0 && items.every((i) => i.status === 'ok'),
    assumptions: { elasticity: ELASTICITY, maxUpliftPct: MAX_UPLIFT * 100 },
  };
}
