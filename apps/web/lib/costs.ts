/**
 * Custos e latência a partir de agent_runs (T20): por dia, por agente, p50/p95 e últimas execuções.
 * Puro (sem banco): os backends só entregam as linhas.
 */

export type RunStatus = 'ok' | 'error' | 'blocked';

export interface RunRow {
  /** "menu", "reviews", "analyst", "orchestrator"... */
  agent: string;
  /** "extract", "sql", "answer"... (vazio quando não registrado). */
  step: string;
  model: string;
  costUsd: number;
  latencyMs: number | null;
  status: RunStatus;
  traceId: string | null;
  createdAt: Date;
}

/** agent_runs.agent guarda "agente:step" (SupabaseRunStore). */
export function splitAgent(raw: string): { agent: string; step: string } {
  const i = raw.indexOf(':');
  return i < 0 ? { agent: raw, step: '' } : { agent: raw.slice(0, i), step: raw.slice(i + 1) };
}

export const AGENT_LABEL: Record<string, string> = {
  menu: 'Cardápio',
  reviews: 'Avaliações',
  analyst: 'Analista',
  orchestrator: 'Conversa',
  eval: 'Eval',
};

export function agentLabel(agent: string): string {
  return AGENT_LABEL[agent] ?? agent;
}

/** Percentil por interpolação linear (p em 0–1). null sem dados. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = s[lo] as number;
  const b = s[hi] as number;
  return a + (b - a) * (pos - lo);
}

/** Dia local (YYYY-MM-DD) no fuso da loja. */
export function localDay(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(d);
}

export interface LatencyStats {
  runs: number;
  costUsd: number;
  p50: number | null;
  p95: number | null;
  errors: number;
  blocked: number;
}

function stats(rows: readonly RunRow[]): LatencyStats {
  // Latência só de chamadas que foram ao modelo (bloqueadas pelo teto têm 0 ms).
  const lat = rows
    .filter((r) => r.status !== 'blocked' && r.latencyMs !== null)
    .map((r) => r.latencyMs as number);
  return {
    runs: rows.length,
    costUsd: rows.reduce((n, r) => n + r.costUsd, 0),
    p50: percentile(lat, 0.5),
    p95: percentile(lat, 0.95),
    errors: rows.filter((r) => r.status === 'error').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
  };
}

export interface CostReport {
  total: LatencyStats;
  /** Um item por dia do período (inclusive dias sem uso), do mais antigo ao mais novo. */
  byDay: Array<{ day: string; costUsd: number; runs: number }>;
  /** Do mais caro ao mais barato. */
  byAgent: Array<{ agent: string } & LatencyStats>;
  recent: RunRow[];
  today: { day: string; costUsd: number };
}

export function buildCostReport(
  rows: readonly RunRow[],
  opts: { now: Date; days: number; timeZone: string; recent?: number },
): CostReport {
  const { now, days, timeZone } = opts;
  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dayList.push(localDay(new Date(now.getTime() - i * 86_400_000), timeZone));
  }
  const inRange = new Set(dayList);
  const scoped = rows.filter((r) => inRange.has(localDay(r.createdAt, timeZone)));

  const perDay = new Map(dayList.map((d) => [d, { day: d, costUsd: 0, runs: 0 }]));
  for (const r of scoped) {
    const d = perDay.get(localDay(r.createdAt, timeZone));
    if (d) {
      d.costUsd += r.costUsd;
      d.runs += 1;
    }
  }

  const agents = new Map<string, RunRow[]>();
  for (const r of scoped) agents.set(r.agent, [...(agents.get(r.agent) ?? []), r]);

  const today = localDay(now, timeZone);
  return {
    total: stats(scoped),
    byDay: [...perDay.values()],
    byAgent: [...agents]
      .map(([agent, list]) => ({ agent, ...stats(list) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    recent: [...scoped]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, opts.recent ?? 20),
    today: { day: today, costUsd: perDay.get(today)?.costUsd ?? 0 },
  };
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

/** Aviso do painel: 80% do teto diário = atenção; 100% = bloqueado. */
export function budgetLevel(spentUsd: number, limitUsd: number): BudgetLevel {
  if (limitUsd <= 0) return 'over';
  if (spentUsd >= limitUsd) return 'over';
  if (spentUsd >= limitUsd * 0.8) return 'warn';
  return 'ok';
}

/**
 * Link do trace no Langfuse. Precisa de LANGFUSE_PROJECT_ID (está na URL do projeto no Langfuse);
 * sem ele, ou sem traceId, não há link.
 */
export function traceUrl(
  traceId: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const project = env.LANGFUSE_PROJECT_ID?.trim();
  if (!traceId || !project || !/^[\w-]{1,128}$/.test(traceId) || !/^[\w-]{1,128}$/.test(project)) {
    return null;
  }
  const host = (env.LANGFUSE_HOST?.trim() || 'https://cloud.langfuse.com').replace(/\/+$/, '');
  if (!/^https:\/\//.test(host)) return null;
  return `${host}/project/${project}/traces/${traceId}`;
}

/** US$ com 4 casas (chamadas custam frações de centavo). */
export function formatUsdPrecise(usd: number): string {
  return `US$ ${usd.toFixed(4).replace('.', ',')}`;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${Math.round(ms)} ms`;
}
