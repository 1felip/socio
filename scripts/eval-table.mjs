// pnpm eval:table — monta docs/evals.md com o relatório mais recente de cada suíte
// (evals/reports/<suite>-AAAA-MM-DD.md; rodadas fake ficam em reports/fake e não entram).
// O README v1 inclui ou linka esta tabela.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'evals/reports';
const SUITES = [
  ['injection', 'Injeção de prompt'],
  ['reviews', 'Avaliações'],
  ['analyst', 'Analista'],
  ['menu', 'Cardápio'],
];

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.md')) : [];

function latest(suite) {
  const re = new RegExp(`^${suite}-(\\d{4}-\\d{2}-\\d{2})\\.md$`);
  return files
    .map((f) => [f, re.exec(f)?.[1]])
    .filter(([, d]) => d)
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))[0];
}

/** Linhas da primeira tabela de métricas (| Métrica | Meta | Resultado | |). */
function metrics(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('| Métrica'));
  if (start < 0) return [];
  const out = [];
  for (const l of lines.slice(start + 2)) {
    if (!l.startsWith('|')) break;
    const cells = l
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells[1] === '—') continue; // linhas só informativas
    out.push(cells);
  }
  return out;
}

const rows = [];
for (const [suite, label] of SUITES) {
  const hit = latest(suite);
  if (!hit) {
    rows.push(`| ${label} | — | ainda sem rodada real | — | |`);
    continue;
  }
  const [file, date] = hit;
  for (const [metric, goal, got, status] of metrics(readFileSync(join(DIR, file), 'utf8'))) {
    rows.push(
      `| ${label} | ${metric} | ${got} | ${goal} | ${status === 'ok' ? '✅' : '⚠️'} [${date}](../${DIR}/${file}) |`,
    );
  }
}

const md = [
  '# Resultados dos evals',
  '',
  'Gerado por `pnpm eval:table` a partir do relatório mais recente de cada suíte. Rodadas completas: workflow **Evals** (manual e toda segunda).',
  '',
  '| Suíte | Métrica | Resultado | Meta | |',
  '|---|---|---|---|---|',
  ...rows,
  '',
].join('\n');
writeFileSync('docs/evals.md', md);
console.log(md);
