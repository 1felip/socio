/**
 * pnpm eval:menu [--quick] [filtro] — eval do Agente Cardápio sobre evals/datasets/menus.
 *
 * Casos = arquivos em gold/ (gabarito humano, via pnpm menu:gold). A foto vem de images/
 * (fora do git). --quick roda só os ids de index.json "quick" (5 fotos, para o CI).
 *
 * Métricas (score.ts): F1 de itens, preço exato e F1 de alérgenos, somadas em micro.
 * Metas em index.json; não atingir só fica registrado (T09). Sai com 1 só se algum caso der erro.
 * Sem gabarito ou sem fotos: avisa e sai com 0 (o dataset ainda não existe).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureLlm, flushTracing, isFakeMode, MemoryRunStore } from '@socio/llm';
import { useFakeMenu } from '../src/menu/fixtures.ts';
import { extractMenu } from '../src/menu/pipeline.ts';
import { aggregate, type MenuGold, type MenuScore, scoreMenu } from '../src/menu/score.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const DIR = root('evals/datasets/menus');
const CONCURRENCY = 3;

const MEDIA: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

interface Index {
  quick: string[];
  targets: { itemF1: number; priceAccuracy: number; allergenF1?: number };
}

interface Outcome {
  gold: MenuGold;
  score?: MenuScore;
  costUsd?: number;
  error?: string;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main(): Promise<number> {
  const store = new MemoryRunStore();
  configureLlm({
    store,
    limits: {
      perConversationUsd: 100,
      perMerchantDayUsd: Number(process.env.EVAL_COST_LIMIT_USD ?? 5),
    },
  });
  const fake = isFakeMode();
  if (fake) useFakeMenu();

  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as Index;
  const quick = process.argv.includes('--quick');
  const filter = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const goldDir = join(DIR, 'gold');
  const all = existsSync(goldDir)
    ? readdirSync(goldDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(goldDir, f), 'utf8')) as MenuGold)
    : [];
  let cases = quick ? all.filter((g) => index.quick.includes(g.id)) : all;
  if (filter) cases = cases.filter((g) => g.id.includes(filter));
  const missing = cases.filter((g) => !existsSync(join(DIR, 'images', g.image)));
  cases = cases.filter((g) => !missing.includes(g));

  const label = quick ? 'quick' : 'menu';
  if (missing.length > 0) {
    console.error(
      `[eval:${label}] ${missing.length} gabarito(s) sem foto em images/: ${missing.map((g) => g.id).join(', ')}`,
    );
  }
  if (cases.length === 0) {
    console.error(
      `[eval:${label}] nenhum caso com gabarito e foto. Junte as fotos em evals/datasets/menus/images/ e rode pnpm menu:gold template.`,
    );
    return 0;
  }
  console.error(`[eval:${label}] ${cases.length} cardápios${fake ? ' (LLM_FAKE)' : ''}`);

  const results = await pool(cases, CONCURRENCY, async (gold): Promise<Outcome> => {
    try {
      const file = join(DIR, 'images', gold.image);
      const mediaType = MEDIA[extname(file).toLowerCase()];
      if (!mediaType) return { gold, error: `formato não suportado: ${gold.image}` };
      const res = await extractMenu(
        { data: new Uint8Array(readFileSync(file)), mediaType },
        { merchantId: 'eval-menu' },
      );
      return { gold, score: scoreMenu(gold, res.draft), costUsd: res.costUsd };
    } catch (err) {
      return { gold, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  });
  await flushTracing();

  const scored = results.filter((r) => r.score).map((r) => r.score as MenuScore);
  const errors = results.filter((r) => r.error);
  const agg = aggregate(scored);
  const cost = store.runs.reduce((s, r) => s + r.costUsd, 0);
  const t = index.targets;
  const rows: Array<[string, string, string, boolean | null]> = [
    ['F1 de itens', `≥ ${t.itemF1}`, agg.itemF1.toFixed(3), agg.itemF1 >= t.itemF1],
    [
      'preço exato',
      `≥ ${pct(t.priceAccuracy)}`,
      pct(agg.priceAccuracy),
      agg.priceAccuracy >= t.priceAccuracy,
    ],
    [
      'F1 de alérgenos',
      t.allergenF1 !== undefined ? `≥ ${t.allergenF1}` : '—',
      agg.allergenF1.toFixed(3),
      t.allergenF1 !== undefined ? agg.allergenF1 >= t.allergenF1 : null,
    ],
  ];

  const worst = results
    .slice()
    .sort(
      (a, b) =>
        Number(!!b.error) - Number(!!a.error) || (a.score?.itemF1 ?? 0) - (b.score?.itemF1 ?? 0),
    )
    .slice(0, 5);

  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Eval cardápio${quick ? ' (quick)' : ''} — ${date}${fake ? ' (LLM_FAKE, sem valor)' : ''}`,
    '',
    `Cardápios: ${cases.length} · itens no gabarito: ${agg.goldItems} · itens lidos: ${agg.predictedItems} · erros: ${errors.length} · custo: US$ ${cost.toFixed(4)}`,
    '',
    '| Métrica | Meta | Resultado | |',
    '|---|---|---|---|',
    ...rows.map(
      ([m, goal, got, ok]) =>
        `| ${m} | ${goal} | ${got} | ${ok === null ? '' : ok ? 'ok' : 'abaixo'} |`,
    ),
    '',
    'Metas registradas; não atingir não bloqueia a T09.',
    '',
    '## 5 piores',
    '',
    ...worst.map((r) => {
      if (r.error) return `- **${r.gold.id}** — erro: ${r.error}`;
      const s = r.score as MenuScore;
      const prices = s.wrongPrices
        .slice(0, 3)
        .map((w) => `${w.name}: ${w.got ?? '—'} ≠ ${w.gold}`)
        .join('; ');
      return `- **${r.gold.id}** F1 ${s.itemF1.toFixed(2)} · preço ${pct(s.priceAccuracy)} · faltou: ${s.misses.slice(0, 4).join(', ') || '—'} · sobrou: ${s.extras.slice(0, 4).join(', ') || '—'}${prices ? ` · preços: ${prices}` : ''}`;
    }),
    '',
  ];
  const report = lines.join('\n');
  mkdirSync(root('evals/reports'), { recursive: true });
  const out = root(`evals/reports/menu${quick ? '-quick' : ''}-${date}.md`);
  writeFileSync(out, report);
  console.log(report);
  console.error(`[eval:${label}] relatório: ${out}`);
  return errors.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
