/**
 * Planilha do gabarito do cardápio (T09).
 *
 *   pnpm menu:gold template [--prefill]   → evals/datasets/menus/gabarito.csv
 *   pnpm menu:gold import [arquivo.csv]   → evals/datasets/menus/gold/<foto_id>.json
 *
 * template lista as fotos de images/ que ainda não têm gold. Com --prefill, roda o Agente
 * Cardápio em cada foto e preenche a planilha com a leitura dele (marcada "conferir"):
 * você só corrige. Sem --prefill, uma linha vazia por foto.
 *
 * import valida tudo antes de gravar (preço, alérgenos, id) e não sobrescreve gold existente
 * sem --force: gabarito é verdade e só muda de propósito.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureLlm, flushTracing, isFakeMode, MemoryRunStore } from '@socio/llm';
import { useFakeMenu } from '../src/menu/fixtures.ts';
import { GoldCsvError, goldFromCsv, templateRows } from '../src/menu/gold-csv.ts';
import { extractMenu } from '../src/menu/pipeline.ts';
import type { MenuDraft } from '../src/menu/schema.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const DIR = root('evals/datasets/menus');
const IMAGES = join(DIR, 'images');
const GOLD = join(DIR, 'gold');
const CSV = join(DIR, 'gabarito.csv');

export const MEDIA: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const photoId = (file: string) =>
  basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-');

function photos(): Array<{ id: string; file: string }> {
  if (!existsSync(IMAGES)) return [];
  return readdirSync(IMAGES)
    .filter((f) => MEDIA[extname(f).toLowerCase()])
    .sort()
    .map((file) => ({ id: photoId(file), file }));
}

async function template(prefill: boolean): Promise<number> {
  const todo = photos().filter((p) => !existsSync(join(GOLD, `${p.id}.json`)));
  if (todo.length === 0) {
    console.error(`Nenhuma foto sem gabarito em ${IMAGES}.`);
    return 0;
  }
  if (prefill) {
    configureLlm({ store: new MemoryRunStore() });
    if (isFakeMode()) useFakeMenu();
  }
  const rows: Array<{ id: string; file: string; draft?: MenuDraft | null }> = [];
  for (const p of todo) {
    let draft: MenuDraft | null = null;
    if (prefill) {
      try {
        const data = new Uint8Array(readFileSync(join(IMAGES, p.file)));
        const mediaType = MEDIA[extname(p.file).toLowerCase()] as string;
        const res = await extractMenu({ data, mediaType }, { merchantId: 'eval-menu' });
        draft = res.draft;
        console.error(
          `[menu:gold] ${p.file}: ${draft.categories.flatMap((c) => c.items).length} itens`,
        );
      } catch (err) {
        console.error(`[menu:gold] ${p.file}: ${err instanceof Error ? err.message : err}`);
      }
    }
    rows.push({ ...p, draft });
  }
  if (prefill) await flushTracing();
  if (existsSync(CSV) && !process.argv.includes('--force')) {
    console.error(`${CSV} já existe. Use --force para gerar de novo.`);
    return 1;
  }
  writeFileSync(CSV, `﻿${templateRows(rows)}`);
  console.log(`Planilha: ${CSV} (${todo.length} fotos). Preencha e rode: pnpm menu:gold import`);
  return 0;
}

function importCsv(file: string): number {
  let golds: ReturnType<typeof goldFromCsv>;
  try {
    golds = goldFromCsv(readFileSync(file, 'utf8'));
  } catch (err) {
    if (err instanceof GoldCsvError) {
      console.error(`Planilha com problemas, nada foi gravado:\n${err.message}`);
      return 1;
    }
    throw err;
  }
  mkdirSync(GOLD, { recursive: true });
  const force = process.argv.includes('--force');
  let written = 0;
  for (const g of golds) {
    const out = join(GOLD, `${g.id}.json`);
    if (existsSync(out) && !force) {
      console.error(`${g.id}: já tem gabarito (use --force para trocar).`);
      continue;
    }
    if (g.image && !existsSync(join(IMAGES, g.image))) {
      console.error(`${g.id}: aviso, a foto ${g.image} não está em images/.`);
    }
    writeFileSync(out, `${JSON.stringify(g, null, 2)}\n`);
    written += 1;
  }
  console.log(`${written} gabarito(s) gravado(s) em ${GOLD}.`);
  return 0;
}

async function main(): Promise<number> {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === 'template') return template(process.argv.includes('--prefill'));
  if (cmd === 'import') {
    const file =
      arg && !arg.startsWith('--') ? resolve(process.env.INIT_CWD ?? process.cwd(), arg) : CSV;
    return importCsv(file);
  }
  console.error(
    'uso: pnpm menu:gold template [--prefill] [--force] | import [arquivo.csv] [--force]',
  );
  return 2;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
