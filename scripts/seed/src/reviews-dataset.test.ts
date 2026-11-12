import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generate } from './generate.ts';
import { reviewCases, SEED_CASES } from './reviews-dataset.ts';

describe('dataset do eval de avaliações', () => {
  const cases = reviewCases(generate());

  it('80 casos, com as 3 injeções da T03 e comentários únicos', () => {
    expect(cases).toHaveLength(SEED_CASES);
    expect(cases.filter((c) => c.gold.injection).map((c) => c.id)).toEqual([
      'rev-inj-1',
      'rev-inj-2',
      'rev-inj-3',
    ]);
    expect(new Set(cases.map((c) => c.comment)).size).toBe(cases.length);
  });

  it('seed.json versionado bate com o gerador (rode reviews:dataset se mudou a seed)', () => {
    const file = fileURLToPath(
      new URL('../../../evals/datasets/reviews/seed.json', import.meta.url),
    );
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(cases);
  });
});
