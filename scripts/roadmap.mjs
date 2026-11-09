#!/usr/bin/env node
// Estado do roadmap com saída mínima (economiza tokens).
// Uso: node scripts/roadmap.mjs status | next [ID] | set <ID> <todo|doing|done|skip>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROADMAP = path.join(ROOT, 'docs', 'ROADMAP.md');
const TASKS = path.join(ROOT, 'docs', 'tasks');
const STATUSES = ['todo', 'doing', 'done', 'skip'];
const ROW = /^\|\s*(T\d{2})\s*\|/;

export function load() {
  const lines = fs.readFileSync(ROADMAP, 'utf8').split(/\r?\n/);
  const tasks = [];
  lines.forEach((line, i) => {
    if (!ROW.test(line)) return;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    const [id, fase, titulo, depende, quem, status] = cells;
    const deps =
      depende && depende !== '—'
        ? depende
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean)
        : [];
    tasks.push({ id, fase, titulo, deps, quem, status, line: i });
  });
  return { lines, tasks };
}

export function taskFile(id) {
  const f = fs.readdirSync(TASKS).find((n) => n.startsWith(`${id}-`));
  return f ? `docs/tasks/${f}` : '(arquivo não encontrado)';
}

const isClosed = (t) => t && (t.status === 'done' || t.status === 'skip');

export function nextTask(tasks, wanted) {
  if (wanted) return tasks.find((t) => t.id === wanted.toUpperCase()) || null;
  const doing = tasks.find((t) => t.status === 'doing');
  if (doing) return doing;
  const ready = eligible(tasks);
  return ready.find((t) => t.quem !== 'HUMANO') || ready[0] || null;
}

export function eligible(tasks) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  return tasks.filter((t) => t.status === 'todo' && t.deps.every((d) => isClosed(byId[d])));
}

export function humanPending(tasks) {
  return eligible(tasks)
    .filter((t) => t.quem === 'HUMANO')
    .map((t) => `${t.id} ${t.titulo}`);
}

export function summary(tasks) {
  const done = tasks.filter(isClosed).length;
  const fases = {};
  for (const t of tasks) {
    fases[t.fase] ??= { done: 0, total: 0 };
    fases[t.fase].total++;
    if (isClosed(t)) fases[t.fase].done++;
  }
  const porFase = Object.entries(fases)
    .map(([f, v]) => `F${f} ${v.done}/${v.total}`)
    .join(' · ');
  return { done, total: tasks.length, porFase };
}

function describe(t) {
  const human = /HUMANO|AMBOS/.test(t.quem) ? `\nAtenção: tem passos humanos (${t.quem}).` : '';
  return `ID: ${t.id}\nTarefa: ${t.titulo}\nQuem: ${t.quem}\nStatus: ${t.status}\nDepende: ${t.deps.join(', ') || '—'}\nArquivo: ${taskFile(t.id)}${human}`;
}

function main(argv) {
  const [cmd = 'status', a, b] = argv;
  const { lines, tasks } = load();
  if (cmd === 'status') {
    const s = summary(tasks);
    const doing = tasks.filter((t) => t.status === 'doing').map((t) => `${t.id} ${t.titulo}`);
    const n = nextTask(tasks);
    console.log(`Feitas: ${s.done}/${s.total} (${s.porFase})`);
    console.log(`Em andamento: ${doing.join('; ') || 'nenhuma'}`);
    console.log(`Próxima: ${n ? `${n.id} ${n.titulo} [${n.quem}]` : 'nenhuma liberada'}`);
    const hp = humanPending(tasks);
    if (hp.length) console.log(`Pendências suas: ${hp.join('; ')}`);
    return 0;
  }
  if (cmd === 'next') {
    const t = nextTask(tasks, a);
    if (!t) {
      console.log(
        tasks.every(isClosed)
          ? 'Roadmap concluído.'
          : "Nenhuma tarefa liberada: verifique dependências com 'status'.",
      );
      return 0;
    }
    const blocked = t.deps.filter((d) => !isClosed(tasks.find((x) => x.id === d)));
    const hp = humanPending(tasks).filter((x) => !x.startsWith(t.id));
    console.log(
      describe(t) +
        (blocked.length ? `\nBloqueada por: ${blocked.join(', ')}` : '') +
        (hp.length ? `\nPendências suas: ${hp.join('; ')}` : ''),
    );
    return 0;
  }
  if (cmd === 'set') {
    const id = (a || '').toUpperCase();
    if (!STATUSES.includes(b)) {
      console.error(`Status inválido. Use: ${STATUSES.join('|')}`);
      return 1;
    }
    const t = tasks.find((x) => x.id === id);
    if (!t) {
      console.error(`Tarefa ${id} não existe.`);
      return 1;
    }
    const cells = lines[t.line].split('|');
    cells[cells.length - 2] = ` ${b} `;
    lines[t.line] = cells.join('|');
    fs.writeFileSync(ROADMAP, lines.join('\n'));
    console.log(`${id} → ${b}`);
    return 0;
  }
  console.error('Uso: roadmap.mjs status | next [ID] | set <ID> <todo|doing|done|skip>');
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
