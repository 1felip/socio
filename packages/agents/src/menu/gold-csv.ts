/**
 * Planilha do gabarito do cardápio (T09): CSV com ";" (o Excel em pt-BR abre direto) e
 * preço com vírgula. Uma linha por item; o id da foto agrupa os itens em gold/<id>.json.
 *
 * Colunas: foto_id; arquivo; categoria; item; preco; alergenos; obs
 * - preco: "32,90", "R$ 32,90" ou vazio (foto sem preço).
 * - alergenos: separados por "," (gluten, lactose, ovo, amendoim, castanhas, soja, peixe, crustaceos).
 */

import { ALLERGENS, type Allergen, type MenuDraft } from './schema.ts';
import type { MenuGold } from './score.ts';

export const GOLD_CSV_HEADER = [
  'foto_id',
  'arquivo',
  'categoria',
  'item',
  'preco',
  'alergenos',
  'obs',
];
const SEP = ';';

function quote(v: string): string {
  return /[;"\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

export function toCsvLine(cells: readonly string[]): string {
  return cells.map(quote).join(SEP);
}

/** Parser RFC 4180 com ";" (aspas, aspas dobradas, quebra de linha dentro de aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === SEP) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function formatPrice(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** "R$ 1.234,50" → 123450; vazio → null; inválido → undefined. */
export function parsePrice(raw: string): number | null | undefined {
  const s = raw.replace(/r\$/i, '').replace(/\s/g, '');
  if (!s) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+\.\d{1,2}$/.test(s)) return undefined;
  const normalized = s.includes(',') ? s.replaceAll('.', '').replace(',', '.') : s;
  const n = Math.round(Number(normalized) * 100);
  return Number.isFinite(n) ? n : undefined;
}

export class GoldCsvError extends Error {
  override readonly name = 'GoldCsvError';
}

/** Linhas para preencher: prévia do modelo (se houver) ou uma linha vazia por foto. */
export function templateRows(
  photos: ReadonlyArray<{ id: string; file: string; draft?: MenuDraft | null }>,
): string {
  const lines = [toCsvLine(GOLD_CSV_HEADER)];
  for (const p of photos) {
    const items = p.draft?.categories.flatMap((c) => c.items.map((i) => ({ c: c.name, i }))) ?? [];
    if (items.length === 0) {
      lines.push(toCsvLine([p.id, p.file, '', '', '', '', 'preencher']));
      continue;
    }
    for (const { c, i } of items) {
      lines.push(
        toCsvLine([
          p.id,
          p.file,
          c,
          i.name,
          formatPrice(i.price_cents),
          i.allergens.join(','),
          'conferir',
        ]),
      );
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** CSV preenchido → um MenuGold por foto. Erros juntos, com o número da linha. */
export function goldFromCsv(text: string): MenuGold[] {
  const rows = parseCsv(text);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  for (const h of ['foto_id', 'arquivo', 'item', 'preco']) {
    if (col(h) < 0) throw new GoldCsvError(`coluna "${h}" não encontrada no cabeçalho.`);
  }
  const errors: string[] = [];
  const byId = new Map<string, MenuGold>();
  for (const [idx, r] of rows.entries()) {
    const line = idx + 2;
    const get = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
    const id = get('foto_id');
    const name = get('item');
    if (!id) {
      errors.push(`linha ${line}: foto_id vazio.`);
      continue;
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) {
      errors.push(`linha ${line}: foto_id "${id}" inválido (use letras, números, - e _).`);
      continue;
    }
    const gold = byId.get(id) ?? { id, image: get('arquivo'), items: [] };
    byId.set(id, gold);
    if (!name) continue; // foto sem itens (ex.: ilegível) ou linha de anotação
    const price = parsePrice(get('preco'));
    if (price === undefined) {
      errors.push(`linha ${line}: preço "${get('preco')}" inválido.`);
      continue;
    }
    const allergens: Allergen[] = [];
    for (const a of get('alergenos')
      .split(/[,\s]+/)
      .filter(Boolean)) {
      const v = a.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if ((ALLERGENS as readonly string[]).includes(v)) allergens.push(v as Allergen);
      else errors.push(`linha ${line}: alérgeno "${a}" desconhecido.`);
    }
    gold.items.push({ category: get('categoria'), name, price_cents: price, allergens });
    const obs = get('obs');
    if (obs && obs !== 'conferir' && obs !== 'preencher') {
      gold.notes = gold.notes ? `${gold.notes} | ${obs}` : obs;
    }
  }
  if (errors.length > 0) throw new GoldCsvError(errors.join('\n'));
  return [...byId.values()];
}
