/** Converte o Dataset em um script SQL idempotente (apaga as lojas demo e recria). */
import type { Dataset } from './generate.ts';

type Value = string | number | null;

function lit(v: Value): string {
  if (v === null) return 'null';
  if (typeof v === 'number') return String(v);
  return `'${v.replaceAll("'", "''")}'`;
}

function insert<T extends object>(table: string, rows: readonly T[], batch = 1000): string {
  const first = rows[0];
  if (!first) return '';
  const cols = Object.keys(first) as (keyof T & string)[];
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += batch) {
    const values = rows
      .slice(i, i + batch)
      .map((r) => `(${cols.map((c) => lit(r[c] as Value)).join(', ')})`)
      .join(',\n');
    out.push(`insert into public.${table} (${cols.join(', ')}) values\n${values};`);
  }
  return out.join('\n\n');
}

export function toSql(ds: Dataset): string {
  const ids = ds.merchants.map((m) => lit(m.id)).join(', ');
  return [
    '-- Gerado por scripts/seed (pnpm seed). Não edite à mão.',
    `-- seed=${ds.seed} · lojas=${ds.merchants.length} · pedidos=${ds.orders.length} · avaliações=${ds.reviews.length}`,
    'begin;',
    `delete from public.merchants where id in (${ids});`,
    insert('merchants', ds.merchants),
    insert('catalog_items', ds.catalogItems),
    insert('orders', ds.orders),
    insert('order_items', ds.orderItems),
    insert('reviews', ds.reviews),
    'commit;',
    '',
  ].join('\n\n');
}
