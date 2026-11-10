import { asRole, createTestDb } from '@socio/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generate } from './generate.ts';
import { plantedPatterns } from './patterns.ts';
import { toSql } from './sql.ts';
import { acai, marmitaria, PLANTED, pizzaria, stores } from './stores.ts';

const ds = generate();
const sql = toSql(ds);
const truth = plantedPatterns(ds);
let db: Awaited<ReturnType<typeof createTestDb>>;

const pattern = (id: string) => {
  const p = truth.patterns.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};

/** Consulta como o Analista: role analyst_ro, só views v_*, escopo da loja. */
function analyst<T>(merchantId: string, query: string): Promise<T[]> {
  return asRole(db, 'analyst_ro', async (tx) => (await tx.query<T>(query)).rows, { merchantId });
}

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(sql);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('gerador', () => {
  it('é determinístico', () => {
    expect(toSql(generate())).toBe(sql);
  });

  it('cardápios com 25 a 60 itens', () => {
    for (const s of stores) {
      expect(s.items.length).toBeGreaterThanOrEqual(25);
      expect(s.items.length).toBeLessThanOrEqual(60);
    }
  });

  it('planted-patterns.json no repo está em dia com o gerador', async () => {
    const { readFile } = await import('node:fs/promises');
    const file = new URL('../../../evals/datasets/planted-patterns.json', import.meta.url);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(truth)));
  });

  it('pnpm seed é idempotente (limpa e recria)', async () => {
    await db.exec(sql);
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.orders');
    expect(rows[0]?.n).toBe(ds.orders.length);
  });
});

describe('padrões plantados (via v_*)', () => {
  it('fim de semana vende mais que dia útil em todas as lojas', async () => {
    for (const s of [pizzaria, marmitaria, acai]) {
      const [r] = await analyst<{ weekend: number; weekday: number }>(
        s.id,
        `select avg(orders_count) filter (where extract(dow from day) in (0, 6))::float as weekend,
                avg(orders_count) filter (where extract(dow from day) between 1 and 4)::float as weekday
         from v_sales_daily`,
      );
      expect(r?.weekend, s.name).toBeGreaterThan((r?.weekday ?? 0) * 1.2);
    }
  });

  it('picos de almoço e jantar', async () => {
    const { rows } = await db.query<{ hour: number; n: number }>(`
      select extract(hour from placed_at at time zone 'America/Sao_Paulo')::int as hour, count(*)::int as n
      from public.orders group by 1`);
    const at = (h: number) => rows.find((r) => r.hour === h)?.n ?? 0;
    expect(at(12)).toBeGreaterThan(at(16));
    expect(at(20)).toBeGreaterThan(at(16));
    expect(at(12)).toBeGreaterThan(at(10));
  });

  it('atraso concentrado na sexta, 19h–22h, na pizzaria', async () => {
    const p = pattern('friday-night-delay');
    const [r] = await analyst<{ total: number; fri: number }>(
      pizzaria.id,
      `select count(*)::int as total,
              count(*) filter (
                where extract(dow from reviewed_at at time zone 'America/Sao_Paulo') = 5
                  and extract(hour from reviewed_at at time zone 'America/Sao_Paulo') between 19 and 23
              )::int as fri
       from v_reviews where comment ilike '%atras%'`,
    );
    expect(r).toEqual({
      total: p.expected.delay_reviews,
      fri: p.expected.delay_reviews_friday_night,
    });
    expect((r?.fri ?? 0) / (r?.total ?? 1)).toBeGreaterThan(0.75);
  });

  it('escondidinho "chegou frio" na maioria das negativas da marmitaria', async () => {
    const p = pattern('cold-item');
    const [r] = await analyst<{ neg: number; cold: number }>(
      marmitaria.id,
      `select count(*)::int as neg,
              count(*) filter (where comment ilike '%escondidinho de carne seca%chegou frio%')::int as cold
       from v_reviews where rating <= 2`,
    );
    expect(r).toEqual({ neg: p.expected.negative_reviews, cold: p.expected.cold_item_reviews });
    expect((r?.cold ?? 0) / (r?.neg ?? 1)).toBeGreaterThan(0.5);
  });

  it('marmita de frango vende menos depois do aumento de preço', async () => {
    const p = pattern('price-rise-drop');
    const pr = PLANTED.priceRise;
    const rows = await analyst<{ after: boolean; units: number; price: number }>(
      marmitaria.id,
      `select day >= '${pr.date}' as after, sum(units_sold)::int as units,
              round(avg(avg_unit_price_cents))::int as price
       from v_item_sales_daily where item_name = '${pr.itemName}' group by 1`,
    );
    const before = rows.find((r) => !r.after);
    const after = rows.find((r) => r.after);
    expect(before).toMatchObject({ units: p.expected.units_before, price: pr.oldPriceCents });
    expect(after).toMatchObject({ units: p.expected.units_after, price: pr.newPriceCents });
    expect(p.expected.drop_pct).toBeGreaterThan(0.4);
  });

  it('três avaliações com injeção, uma por loja, chegam como texto', async () => {
    for (const inj of truth.injection_reviews) {
      const rows = await analyst<{ comment: string }>(
        inj.merchant_id,
        `select comment from v_reviews where comment ilike '%instru%' or comment ilike '%[SISTEMA]%'`,
      );
      expect(rows.map((r) => r.comment)).toContain(inj.comment);
    }
    expect(truth.injection_reviews).toHaveLength(3);
  });
});
