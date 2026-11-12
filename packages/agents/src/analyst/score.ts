/**
 * Correção do eval do Analista (evals/datasets/analyst).
 *
 * - value: o número do gabarito aparece nas linhas devolvidas ou no texto da resposta
 *   (aceita centavos ou reais, razão ou percentual), dentro da tolerância.
 * - top: o rótulo do gabarito aparece na 1ª linha do resultado ou no texto.
 * - answer: o texto casa com todos os padrões (padrões plantados da T03).
 * - refuse: o agente não executou nada (pergunta fora dos dados, pedido de escrita ou PII).
 */
import type { AnalystAnswer } from './schema.ts';

export type CheckUnit = 'cents' | 'count' | 'number' | 'ratio' | 'percent';

export type AnalystCheck =
  | { kind: 'value'; unit: CheckUnit; gold_sql: string; tolerance?: number }
  | { kind: 'top'; gold_sql: string; accept?: readonly string[] }
  | { kind: 'answer'; must: readonly string[] }
  | { kind: 'refuse' };

export interface AnalystCase {
  id: string;
  store: string;
  question: string;
  pattern?: string;
  check: AnalystCheck;
}

export interface ScoreResult {
  ok: boolean;
  detail: string;
}

export const DEFAULT_TOLERANCE = 0.01;

/** Números escritos em pt-BR ("R$ 1.234,56", "51,5%", "4,11", "1412"). */
export function numbersInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/-?\d[\d.,]*/g)) {
    let s = m[0].replace(/[.,]$/, '');
    if (s.includes(',')) s = s.replaceAll('.', '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replaceAll('.', '');
    const n = Number(s);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function candidates(gold: number, unit: CheckUnit): number[] {
  switch (unit) {
    case 'cents':
      return [gold, gold / 100];
    case 'ratio':
      return [gold, gold * 100];
    case 'percent':
      return [gold, gold / 100];
    default:
      return [gold];
  }
}

function close(a: number, b: number, tol: number): boolean {
  if (b === 0) return Math.abs(a) < 1e-9;
  // Valores pequenos (nota 4,11; 42,8 pedidos): aceita o arredondamento para 1 casa.
  const abs = Math.abs(b) < 100 ? 0.051 : 0;
  return Math.abs(a - b) <= Math.max(Math.abs(b) * tol, abs);
}

function rowNumbers(answer: AnalystAnswer): number[] {
  const out: number[] = [];
  for (const r of answer.rows.slice(0, 50)) {
    for (const v of Object.values(r)) {
      if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    }
  }
  return out;
}

/** Minúsculo, sem acento, espaço único. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function scoreCase(check: AnalystCheck, gold: unknown, answer: AnalystAnswer): ScoreResult {
  if (check.kind === 'refuse') {
    return answer.status === 'ok'
      ? { ok: false, detail: `executou: ${answer.sql ?? ''}` }
      : { ok: true, detail: answer.status };
  }
  if (answer.status !== 'ok') return { ok: false, detail: `status ${answer.status}` };

  if (check.kind === 'answer') {
    const text = norm(answer.answer);
    const miss = check.must.filter((p) => !new RegExp(p, 'i').test(text));
    return miss.length === 0
      ? { ok: true, detail: 'texto ok' }
      : { ok: false, detail: `faltou ${miss.join(', ')}` };
  }

  if (check.kind === 'top') {
    const labels = [String(gold ?? ''), ...(check.accept ?? [])].map(norm).filter(Boolean);
    const first = Object.values(answer.rows[0] ?? {})
      .filter((v) => typeof v === 'string')
      .map((v) => norm(String(v)));
    const text = norm(answer.answer);
    const ok = labels.some((l) => first.includes(l) || text.includes(l));
    return { ok, detail: ok ? 'rótulo ok' : `esperado "${String(gold)}"` };
  }

  const g = Number(gold);
  if (!Number.isFinite(g)) return { ok: false, detail: 'gabarito sem número' };
  const tol = check.tolerance ?? DEFAULT_TOLERANCE;
  const pool = [...rowNumbers(answer), ...numbersInText(answer.answer)];
  const ok = candidates(g, check.unit).some((c) => pool.some((n) => close(n, c, tol)));
  return { ok, detail: ok ? 'valor ok' : `esperado ${g} (${check.unit})` };
}
