/**
 * pnpm eval:analyst — eval do Agente Analista sobre evals/datasets/analyst.
 *
 * Banco: PGlite com as migrations + supabase/seed.sql (T03), consultado como analyst_ro.
 * O gabarito de cada caso é um gold_sql recalculado a cada rodada (score.ts explica a correção).
 *
 * Meta em index.json (pelo menos 34 de 40). Relatório em evals/reports/analyst-<data>.md.
 * Sai com 1 se a meta falhar. LLM_FAKE=1 roda o encanamento sem API (acerto sem valor).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createTestDb } from '@socio/db/testing';
import {
  configureLlm,
  flushTracing,
  isFakeMode,
  MemoryRunStore,
  setFakeResponder,
} from '@socio/llm';
import { PgliteAnalystDb } from '../src/analyst/db.ts';
import { fakeAnalystResponder } from '../src/analyst/fixtures.ts';
import { askAnalyst } from '../src/analyst/pipeline.ts';
import type { AnalystAnswer } from '../src/analyst/schema.ts';
import { type AnalystCase, type ScoreResult, scoreCase } from '../src/analyst/score.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const DATA = 'evals/datasets/analyst';
const CONCURRENCY = 4;

interface Index {
  files: string[];
  targets: { minCorrect: number; accuracy: number };
  stores: Record<string, string>;
  today: string;
}

interface Outcome {
  c: AnalystCase;
  gold?: unknown;
  a?: AnalystAnswer;
  score?: ScoreResult;
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
  if (fake) setFakeResponder(fakeAnalystResponder());

  const index = JSON.parse(readFileSync(root(`${DATA}/index.json`), 'utf8')) as Index;
  const cases = index.files.flatMap(
    (f) => JSON.parse(readFileSync(root(`${DATA}/${f}`), 'utf8')) as AnalystCase[],
  );
  const filter = process.argv[2];
  const selected = filter ? cases.filter((c) => c.id.includes(filter)) : cases;
  console.error(`[eval:analyst] ${selected.length} casos${fake ? ' (LLM_FAKE)' : ''}`);

  console.error('[eval:analyst] carregando migrations + seed no PGlite…');
  const pg = await createTestDb();
  await pg.exec(readFileSync(root('supabase/seed.sql'), 'utf8'));
  const db = new PgliteAnalystDb(pg, { timeoutMs: 10_000 });
  const today = new Date(index.today);

  const runCase = async (c: AnalystCase): Promise<Outcome> => {
    const merchantId = index.stores[c.store];
    if (!merchantId) return { c, error: `loja desconhecida: ${c.store}` };
    try {
      let gold: unknown;
      if ('gold_sql' in c.check) {
        const g = await db.query(merchantId, c.check.gold_sql);
        gold = Object.values(g.rows[0] ?? {})[0];
      }
      const a = await askAnalyst(c.question, { merchantId, db, now: () => today });
      return { c, gold, a, score: scoreCase(c.check, gold, a) };
    } catch (err) {
      return { c, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
    }
  };

  const results = await pool(selected, CONCURRENCY, runCase);
  await flushTracing();
  await pg.close();

  const correct = results.filter((r) => r.score?.ok).length;
  const errors = results.filter((r) => r.error);
  const accuracy = correct / Math.max(1, selected.length);
  const retries = results.filter((r) => (r.a?.attempts ?? 0) > 1).length;
  const cost = store.runs.reduce((s, r) => s + r.costUsd, 0);
  const t = index.targets;
  // Meta absoluta vale para a suíte inteira; com filtro, usa a proporção.
  const pass = filter ? accuracy >= t.accuracy : correct >= t.minCorrect;

  const byKind = new Map<string, { n: number; ok: number }>();
  for (const r of results) {
    const k = r.c.check.kind;
    const s = byKind.get(k) ?? { n: 0, ok: 0 };
    s.n += 1;
    if (r.score?.ok) s.ok += 1;
    byKind.set(k, s);
  }

  const worst = results
    .filter((r) => !r.score?.ok)
    .sort((a, b) => Number(!!b.error) - Number(!!a.error))
    .slice(0, 5);

  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Eval analista — ${date}${fake ? ' (LLM_FAKE, sem valor)' : ''}`,
    '',
    `Casos: ${selected.length} · erros: ${errors.length} · com 2ª tentativa de SQL: ${retries} · custo: US$ ${cost.toFixed(4)}`,
    '',
    '| Métrica | Meta | Resultado | |',
    '|---|---|---|---|',
    `| acertos | ≥ ${t.minCorrect} de 40 | ${correct} de ${selected.length} (${(accuracy * 100).toFixed(1)}%) | ${pass ? 'ok' : 'FALHOU'} |`,
    ...[...byKind].map(([k, s]) => `| ${k} | — | ${s.ok}/${s.n} | |`),
    '',
    '## 5 piores',
    '',
    ...worst.map((r) => {
      const why = r.error ?? r.score?.detail ?? '';
      const sql = r.a?.sql ? ` · SQL: \`${r.a.sql.replace(/\s+/g, ' ').slice(0, 220)}\`` : '';
      return `- **${r.c.id}** "${r.c.question}" → "${r.a?.answer ?? ''}" — ${why}${sql}`;
    }),
    '',
  ];
  const report = lines.join('\n');
  mkdirSync(root('evals/reports'), { recursive: true });
  const out = root(`evals/reports/analyst-${date}.md`);
  writeFileSync(out, report);
  console.log(report);
  console.error(`[eval:analyst] relatório: ${out}`);

  if (fake) return errors.length === 0 ? 0 : 1;
  return pass ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
