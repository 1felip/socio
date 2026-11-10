/**
 * Tetos de custo: COST_LIMIT_USD_PER_CONVERSATION e COST_LIMIT_USD_PER_MERCHANT_DAY.
 * Checados antes de cada chamada; estourou → CostLimitError com mensagem pronta para o dono.
 */
import type { RunStore } from './runs.ts';

export interface CostLimits {
  perConversationUsd: number;
  perMerchantDayUsd: number;
}

export const DEFAULT_LIMITS: CostLimits = { perConversationUsd: 0.2, perMerchantDayUsd: 2 };

export function readCostLimits(env: Record<string, string | undefined> = process.env): CostLimits {
  return {
    perConversationUsd: parseLimit(
      env.COST_LIMIT_USD_PER_CONVERSATION,
      DEFAULT_LIMITS.perConversationUsd,
    ),
    perMerchantDayUsd: parseLimit(
      env.COST_LIMIT_USD_PER_MERCHANT_DAY,
      DEFAULT_LIMITS.perMerchantDayUsd,
    ),
  };
}

function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`teto de custo inválido: "${raw}"`);
  return n;
}

export type CostScope = 'conversation' | 'merchant_day';

export class CostLimitError extends Error {
  override readonly name = 'CostLimitError';
  readonly scope: CostScope;
  readonly spentUsd: number;
  readonly limitUsd: number;

  constructor(scope: CostScope, spentUsd: number, limitUsd: number) {
    super(`teto de custo atingido (${scope}): US$ ${spentUsd.toFixed(4)} de ${limitUsd}`);
    this.scope = scope;
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }

  /** Texto para o dono do restaurante (pt-BR, sem jargão). */
  get userMessage(): string {
    return this.scope === 'conversation'
      ? 'Essa conversa ficou longa demais pra mim. Pode começar um assunto novo?'
      : 'Hoje já usei todo o limite de análises da sua loja. Amanhã cedo eu volto com tudo.';
  }
}

/** Início do dia (00:00) no fuso informado, como instante UTC. */
export function startOfDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offsetMs);
}

export interface BudgetContext {
  merchantId: string;
  conversationId?: string;
  timeZone?: string;
  now?: Date;
}

export async function assertWithinBudget(
  store: RunStore,
  limits: CostLimits,
  ctx: BudgetContext,
): Promise<void> {
  if (ctx.conversationId) {
    const spent = await store.spentByConversation(ctx.conversationId);
    if (spent >= limits.perConversationUsd) {
      throw new CostLimitError('conversation', spent, limits.perConversationUsd);
    }
  }
  const since = startOfDay(ctx.now ?? new Date(), ctx.timeZone ?? 'America/Sao_Paulo');
  const spent = await store.spentByMerchantSince(ctx.merchantId, since);
  if (spent >= limits.perMerchantDayUsd) {
    throw new CostLimitError('merchant_day', spent, limits.perMerchantDayUsd);
  }
}
