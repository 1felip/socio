import { describe, expect, it } from 'vitest';
import { createDemoBackend, createDemoState, demoRunHistory } from './backend/demo.ts';
import type { CookieJar } from './backend/types.ts';
import { budgetMessage, todayBudget } from './budget.ts';
import {
  budgetLevel,
  buildCostReport,
  formatMs,
  formatUsdPrecise,
  percentile,
  type RunRow,
  splitAgent,
  traceUrl,
} from './costs.ts';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-11-12T15:00:00Z'); // 12h em Brasília

const run = (over: Partial<RunRow>): RunRow => ({
  agent: 'menu',
  step: 'extract',
  model: 'm',
  costUsd: 0.01,
  latencyMs: 1000,
  status: 'ok',
  traceId: null,
  createdAt: NOW,
  ...over,
});

const jar: CookieJar = { get: () => undefined, set: () => {}, delete: () => {} };

describe('agregação de custos', () => {
  it('separa agente e passo de agent_runs.agent', () => {
    expect(splitAgent('analyst:sql.retry')).toEqual({ agent: 'analyst', step: 'sql.retry' });
    expect(splitAgent('menu')).toEqual({ agent: 'menu', step: '' });
  });

  it('percentil com interpolação', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([100], 0.95)).toBe(100);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.95)).toBeCloseTo(95.5);
  });

  it('por dia (fuso da loja, inclui dias vazios), por agente e últimas', () => {
    const rows = [
      run({ costUsd: 0.02, latencyMs: 2000 }),
      run({ agent: 'analyst', step: 'sql', costUsd: 0.05, latencyMs: 4000 }),
      // 01h UTC do dia 12 = 22h do dia 11 em Brasília
      run({ createdAt: new Date('2026-11-12T01:00:00Z'), costUsd: 0.01, latencyMs: 500 }),
      run({ status: 'blocked', costUsd: 0, latencyMs: 0 }),
      run({ status: 'error', costUsd: 0, latencyMs: 300 }),
      // fora da janela de 3 dias
      run({ createdAt: new Date('2026-11-01T12:00:00Z'), costUsd: 9 }),
    ];
    const r = buildCostReport(rows, { now: NOW, days: 3, timeZone: TZ });
    expect(r.byDay.map((d) => d.day)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(r.byDay.map((d) => d.costUsd)).toEqual([0, 0.01, expect.closeTo(0.07)]);
    expect(r.total.runs).toBe(5);
    expect(r.total.costUsd).toBeCloseTo(0.08);
    expect(r.total.blocked).toBe(1);
    expect(r.total.errors).toBe(1);
    // bloqueada (0 ms) fica fora da latência
    expect(r.total.p50).toBe(1250);
    expect(r.byAgent[0]).toMatchObject({ agent: 'analyst', runs: 1, p50: 4000 });
    expect(r.today).toEqual({ day: '2026-11-12', costUsd: expect.closeTo(0.07) });
    expect(r.recent).toHaveLength(5);
    expect(r.recent.at(-1)?.createdAt.toISOString()).toBe('2026-11-12T01:00:00.000Z');
  });

  it('nível do teto e mensagens', () => {
    expect(budgetLevel(0.5, 2)).toBe('ok');
    expect(budgetLevel(1.6, 2)).toBe('warn');
    expect(budgetLevel(2, 2)).toBe('over');
    expect(budgetMessage({ spentUsd: 1.7, limitUsd: 2, level: 'warn' })).toMatch(/85% do teto/);
    expect(budgetMessage({ spentUsd: 2.1, limitUsd: 2, level: 'over' })).toMatch(/bateu o teto/);
    expect(budgetMessage({ spentUsd: 0.1, limitUsd: 2, level: 'ok' })).toBeNull();
  });

  it('formatação', () => {
    expect(formatUsdPrecise(0.0042)).toBe('US$ 0,0042');
    expect(formatMs(1500)).toBe('1,5 s');
    expect(formatMs(320)).toBe('320 ms');
    expect(formatMs(null)).toBe('—');
  });
});

describe('link do trace no Langfuse', () => {
  it('só com projeto e trace id seguros', () => {
    const env = { LANGFUSE_PROJECT_ID: 'proj_1' };
    expect(traceUrl('abc-123', env)).toBe(
      'https://cloud.langfuse.com/project/proj_1/traces/abc-123',
    );
    expect(traceUrl('abc', { ...env, LANGFUSE_HOST: 'https://lf.exemplo.com/' })).toBe(
      'https://lf.exemplo.com/project/proj_1/traces/abc',
    );
    expect(traceUrl(null, env)).toBeNull();
    expect(traceUrl('abc', {})).toBeNull();
    expect(traceUrl('../x', env)).toBeNull();
    expect(traceUrl('abc', { ...env, LANGFUSE_HOST: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('demo', () => {
  it('histórico de exemplo determinístico de 14 dias', () => {
    const a = demoRunHistory('m', NOW);
    expect(a).toEqual(demoRunHistory('m', NOW));
    const r = buildCostReport(a, { now: NOW, days: 14, timeZone: TZ });
    expect(r.byDay.every((d) => d.runs > 0)).toBe(true);
    expect(new Set(r.byAgent.map((x) => x.agent))).toEqual(
      new Set(['menu', 'reviews', 'analyst', 'orchestrator']),
    );
  });

  it('listRuns filtra loja e data; teto de hoje vem do env', async () => {
    const state = createDemoState({});
    const backend = createDemoBackend(state, jar);
    const merchantId = state.merchants[0]?.id as string;
    const all = await backend.listRuns(merchantId, new Date(0));
    expect(all.length).toBe(state.runs.length);
    expect(await backend.listRuns('outra-loja', new Date(0))).toEqual([]);
    expect(all[0]).not.toHaveProperty('merchantId');

    const now = new Date();
    const b = await todayBudget(backend, merchantId, {
      now,
      env: { COST_LIMIT_USD_PER_MERCHANT_DAY: '0.000001' },
    });
    expect(b.limitUsd).toBe(0.000001);
    expect(b.level).toBe(b.spentUsd > 0 ? 'over' : 'ok');
  });
});
