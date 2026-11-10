/**
 * pnpm seed — gera os dados sintéticos e recria tudo.
 *
 * 1. Gera supabase/seed.sql (apaga as 3 lojas demo e recria) e evals/datasets/planted-patterns.json.
 * 2. Aplica o seed num Postgres em memória (PGlite + migrations) para validar.
 * 3. Banco remoto (depois da T00): `pnpm supabase db reset --linked` roda migrations + seed.sql.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb } from '@socio/db/testing';
import { generate } from './generate.ts';
import { plantedPatterns } from './patterns.ts';
import { toSql } from './sql.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

const ds = generate();
const sql = toSql(ds);
const seedPath = root('supabase/seed.sql');
const patternsPath = root('evals/datasets/planted-patterns.json');

writeFileSync(seedPath, sql);
mkdirSync(dirname(patternsPath), { recursive: true });
writeFileSync(patternsPath, `${JSON.stringify(plantedPatterns(ds), null, 2)}\n`);

const db = await createTestDb();
await db.exec(sql);
const { rows } = await db.query<{ table: string; n: number }>(`
  select 'merchants' as table, count(*)::int as n from public.merchants
  union all select 'catalog_items', count(*)::int from public.catalog_items
  union all select 'orders', count(*)::int from public.orders
  union all select 'order_items', count(*)::int from public.order_items
  union all select 'reviews', count(*)::int from public.reviews`);
await db.close();

console.log(`seed ${ds.seed} aplicado (PGlite):`);
for (const r of rows) console.log(`  ${r.table.padEnd(14)} ${r.n}`);
console.log('gerados: supabase/seed.sql, evals/datasets/planted-patterns.json');
