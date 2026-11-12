/**
 * Gera evals/datasets/reviews/seed.json: 80 avaliações da T03 com gabarito.
 * Determinístico (mesma seed do `pnpm seed`). Rodar: pnpm --filter seed reviews:dataset
 *
 * Inclui as 3 de injeção e uma amostra estratificada por tema das demais.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Dataset, generate, type ReviewTruth } from './generate.ts';
import { INJECTION_REVIEWS } from './reviews.ts';

export const SEED_CASES = 80;

type Cause =
  | 'atraso'
  | 'temperatura'
  | 'embalagem'
  | 'sabor'
  | 'preco'
  | 'pedido_errado'
  | 'nenhuma';

export interface ReviewCase {
  id: string;
  store: string;
  rating: number;
  comment: string;
  gold: {
    /** null = não pontua causa (casos de injeção). */
    cause: Cause | null;
    sentiment: 'positive' | 'neutral' | 'negative' | null;
    injection: boolean;
  };
  source: 'seed' | 'manual';
}

const CAUSE: Record<Exclude<ReviewTruth['topic'], 'injecao'>, Cause> = {
  elogio: 'nenhuma',
  neutro: 'nenhuma',
  atraso: 'atraso',
  frio: 'temperatura',
  pedido_errado: 'pedido_errado',
  sabor: 'sabor',
  preco: 'preco',
  embalagem: 'embalagem',
};

function sentimentFor(topic: ReviewTruth['topic']): ReviewCase['gold']['sentiment'] {
  if (topic === 'injecao') return null;
  if (topic === 'elogio') return 'positive';
  if (topic === 'neutro') return 'neutral';
  return 'negative';
}

export function reviewCases(ds: Dataset, n = SEED_CASES): ReviewCase[] {
  const truth = new Map(ds.reviewTruth.map((t) => [t.external_id, t.topic]));
  const storeOf = new Map(ds.merchants.map((m) => [m.id, m.name]));
  const toCase = (r: Dataset['reviews'][number]): ReviewCase => {
    const topic = truth.get(r.external_id) ?? 'neutro';
    return {
      id: r.external_id,
      store: storeOf.get(r.merchant_id) ?? '',
      rating: r.rating,
      comment: r.comment,
      gold: {
        cause: topic === 'injecao' ? null : CAUSE[topic],
        sentiment: sentimentFor(topic),
        injection: topic === 'injecao',
      },
      source: 'seed',
    };
  };

  const injectionIds = new Set<string>(INJECTION_REVIEWS.map((r) => r.externalId));
  const injections = ds.reviews.filter((r) => injectionIds.has(r.external_id)).map(toCase);

  // Round-robin por tema, em ordem de external_id: amostra estável e balanceada.
  const byTopic = new Map<string, Dataset['reviews']>();
  for (const r of [...ds.reviews].sort((a, b) => a.external_id.localeCompare(b.external_id))) {
    const t = truth.get(r.external_id);
    if (!t || t === 'injecao') continue;
    byTopic.set(t, [...(byTopic.get(t) ?? []), r]);
  }
  const picked: ReviewCase[] = [];
  const seen = new Set<string>();
  const queues = [...byTopic.values()];
  while (picked.length < n - injections.length && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const r = q.shift();
      // Comentários idênticos não acrescentam nada ao eval.
      if (!r || seen.has(r.comment)) continue;
      seen.add(r.comment);
      picked.push(toCase(r));
      if (picked.length >= n - injections.length) break;
    }
  }
  return [...injections, ...picked];
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/').replace(/^\//, '')}`) {
  const out = fileURLToPath(new URL('../../../evals/datasets/reviews/seed.json', import.meta.url));
  const cases = reviewCases(generate());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(cases, null, 2)}\n`);
  console.log(`${cases.length} casos em evals/datasets/reviews/seed.json`);
}
