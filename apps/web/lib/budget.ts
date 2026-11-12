import { readCostLimits, startOfDay } from '@socio/llm';
import type { Backend } from './backend/types.ts';
import { type BudgetLevel, budgetLevel } from './costs.ts';

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export interface TodayBudget {
  spentUsd: number;
  limitUsd: number;
  level: BudgetLevel;
}

/** Gasto de hoje (fuso da loja) contra COST_LIMIT_USD_PER_MERCHANT_DAY, o mesmo teto do packages/llm. */
export async function todayBudget(
  backend: Backend,
  merchantId: string,
  opts: { now?: Date; env?: Record<string, string | undefined>; timeZone?: string } = {},
): Promise<TodayBudget> {
  const now = opts.now ?? new Date();
  const limitUsd = readCostLimits(opts.env ?? process.env).perMerchantDayUsd;
  const runs = await backend.listRuns(
    merchantId,
    startOfDay(now, opts.timeZone ?? DEFAULT_TIME_ZONE),
  );
  const spentUsd = runs.reduce((n, r) => n + r.costUsd, 0);
  return { spentUsd, limitUsd, level: budgetLevel(spentUsd, limitUsd) };
}

export function budgetMessage(b: TodayBudget): string | null {
  const pct = Math.round((b.spentUsd / Math.max(b.limitUsd, 1e-9)) * 100);
  if (b.level === 'over') {
    return `O custo de IA de hoje bateu o teto (US$ ${b.limitUsd.toFixed(2).replace('.', ',')}). As tarefas com IA voltam amanhã.`;
  }
  if (b.level === 'warn') {
    return `O custo de IA de hoje já está em ${pct}% do teto diário.`;
  }
  return null;
}
