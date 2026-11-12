/**
 * Correção do eval do cardápio (T09): rascunho do Agente Cardápio × gabarito humano.
 *
 * - F1 de itens: casamento 1-para-1 pelo nome normalizado (exato primeiro, depois parecido).
 * - Preço exato: entre os itens casados com preço no gabarito, quantos têm o mesmo centavo.
 * - F1 de alérgenos: micro, sobre pares (item casado, alérgeno).
 */
import type { Allergen, MenuDraft } from './schema.ts';

export interface GoldItem {
  category: string;
  name: string;
  /** null quando a foto não mostra preço. */
  price_cents: number | null;
  allergens: Allergen[];
}

export interface MenuGold {
  id: string;
  /** Arquivo em evals/datasets/menus/images/. */
  image: string;
  items: GoldItem[];
  notes?: string;
}

export interface MenuScore {
  goldItems: number;
  predictedItems: number;
  matched: number;
  itemPrecision: number;
  itemRecall: number;
  itemF1: number;
  pricedMatched: number;
  priceExact: number;
  /** Proporção de preços exatos (1 quando não há preço a conferir). */
  priceAccuracy: number;
  allergenTp: number;
  allergenFp: number;
  allergenFn: number;
  allergenF1: number;
  misses: string[];
  extras: string[];
  wrongPrices: Array<{ name: string; gold: number; got: number | null }>;
}

/** Minúsculo, sem acento, só letras/números, espaço único. "Pizza  Calabresa (G)" → "pizza calabresa g". */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}

/** Jaccard de palavras: tolera "Pizza Calabresa" × "Calabresa". */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export const SIMILAR_THRESHOLD = 0.6;

interface Predicted {
  name: string;
  price_cents: number | null;
  allergens: readonly string[];
}

function flatten(draft: MenuDraft): Predicted[] {
  return draft.categories.flatMap((c) =>
    c.items.map((i) => ({ name: i.name, price_cents: i.price_cents, allergens: i.allergens })),
  );
}

/** Pares (gold, pred): exatos primeiro, depois o mais parecido acima do limiar. */
export function matchItems(
  gold: readonly GoldItem[],
  pred: readonly Predicted[],
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  const usedG = new Set<number>();
  const usedP = new Set<number>();
  gold.forEach((g, gi) => {
    const n = normalizeName(g.name);
    const pi = pred.findIndex((p, i) => !usedP.has(i) && normalizeName(p.name) === n);
    if (pi >= 0) {
      pairs.push([gi, pi]);
      usedG.add(gi);
      usedP.add(pi);
    }
  });
  const candidates: Array<[number, number, number]> = [];
  gold.forEach((g, gi) => {
    if (usedG.has(gi)) return;
    pred.forEach((p, pi) => {
      if (usedP.has(pi)) return;
      const s = nameSimilarity(g.name, p.name);
      if (s >= SIMILAR_THRESHOLD) candidates.push([s, gi, pi]);
    });
  });
  candidates.sort((a, b) => b[0] - a[0]);
  for (const [, gi, pi] of candidates) {
    if (usedG.has(gi) || usedP.has(pi)) continue;
    pairs.push([gi, pi]);
    usedG.add(gi);
    usedP.add(pi);
  }
  return pairs;
}

const f1 = (p: number, r: number) => (p + r === 0 ? 0 : (2 * p * r) / (p + r));

export function scoreMenu(gold: MenuGold, draft: MenuDraft): MenuScore {
  const pred = flatten(draft);
  const pairs = matchItems(gold.items, pred);
  const matched = pairs.length;
  const precision = pred.length === 0 ? (gold.items.length === 0 ? 1 : 0) : matched / pred.length;
  const recall = gold.items.length === 0 ? 1 : matched / gold.items.length;

  let priced = 0;
  let exact = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const wrongPrices: MenuScore['wrongPrices'] = [];
  for (const [gi, pi] of pairs) {
    const g = gold.items[gi] as GoldItem;
    const p = pred[pi] as Predicted;
    if (g.price_cents !== null) {
      priced += 1;
      if (p.price_cents === g.price_cents) exact += 1;
      else wrongPrices.push({ name: g.name, gold: g.price_cents, got: p.price_cents });
    }
    const ga = new Set<string>(g.allergens);
    const pa = new Set<string>(p.allergens);
    for (const a of pa) {
      if (ga.has(a)) tp += 1;
      else fp += 1;
    }
    for (const a of ga) if (!pa.has(a)) fn += 1;
  }
  const ap = tp + fp === 0 ? 1 : tp / (tp + fp);
  const ar = tp + fn === 0 ? 1 : tp / (tp + fn);
  const matchedG = new Set(pairs.map(([g]) => g));
  const matchedP = new Set(pairs.map(([, p]) => p));

  return {
    goldItems: gold.items.length,
    predictedItems: pred.length,
    matched,
    itemPrecision: precision,
    itemRecall: recall,
    itemF1: f1(precision, recall),
    pricedMatched: priced,
    priceExact: exact,
    priceAccuracy: priced === 0 ? 1 : exact / priced,
    allergenTp: tp,
    allergenFp: fp,
    allergenFn: fn,
    allergenF1: f1(ap, ar),
    misses: gold.items.filter((_, i) => !matchedG.has(i)).map((g) => g.name),
    extras: pred.filter((_, i) => !matchedP.has(i)).map((p) => p.name),
    wrongPrices,
  };
}

/** Soma micro de vários cardápios (o número que vai para o relatório). */
export function aggregate(scores: readonly MenuScore[]) {
  const sum = (k: keyof MenuScore) => scores.reduce((s, x) => s + (x[k] as number), 0);
  const gold = sum('goldItems');
  const predicted = sum('predictedItems');
  const matched = sum('matched');
  const p = predicted === 0 ? 0 : matched / predicted;
  const r = gold === 0 ? 0 : matched / gold;
  const priced = sum('pricedMatched');
  const tp = sum('allergenTp');
  const fp = sum('allergenFp');
  const fn = sum('allergenFn');
  return {
    menus: scores.length,
    goldItems: gold,
    predictedItems: predicted,
    itemF1: f1(p, r),
    priceAccuracy: priced === 0 ? 1 : sum('priceExact') / priced,
    allergenF1: f1(tp + fp === 0 ? 1 : tp / (tp + fp), tp + fn === 0 ? 1 : tp / (tp + fn)),
  };
}
