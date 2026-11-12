/**
 * Rate limit por IP para as rotas que chamam modelo (foto do cardápio, Analista, /api/agent,
 * sync de avaliações pelo painel).
 *
 * Janela deslizante em memória, por processo. Na Vercel cada instância tem o seu contador:
 * é uma trava contra abuso da demo, não um limite exato. O teto de custo em dinheiro continua
 * sendo o de packages/llm (COST_LIMIT_USD_PER_MERCHANT_DAY), que vale para todas as instâncias.
 */

type Env = Record<string, string | undefined>;

export type RateBucket = 'model' | 'upload';

export interface RateRule {
  limit: number;
  windowMs: number;
}

/** Padrões: 20 chamadas de modelo e 5 fotos por IP a cada 10 min. */
export const DEFAULT_RULES: Record<RateBucket, RateRule> = {
  model: { limit: 20, windowMs: 10 * 60_000 },
  upload: { limit: 5, windowMs: 10 * 60_000 },
};

const ENV_KEYS: Record<RateBucket, string> = {
  model: 'RATE_LIMIT_MODEL_PER_10MIN',
  upload: 'RATE_LIMIT_UPLOAD_PER_10MIN',
};

export function ruleFor(bucket: RateBucket, env: Env = process.env): RateRule {
  const base = DEFAULT_RULES[bucket];
  const raw = Number(env[ENV_KEYS[bucket]]);
  return Number.isInteger(raw) && raw > 0 ? { ...base, limit: raw } : base;
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  /** Segundos até liberar a próxima chamada (0 se ok). */
  retryAfter: number;
}

/** Máximo de chaves guardadas; passou disso, limpa as expiradas (e no pior caso tudo). */
const MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(key: string, rule: RateRule, now = Date.now()): RateResult {
    const since = now - rule.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= rule.limit) {
      this.hits.set(key, list);
      const oldest = list[0] ?? now;
      return {
        ok: false,
        remaining: 0,
        retryAfter: Math.ceil((oldest + rule.windowMs - now) / 1000),
      };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > MAX_KEYS) this.prune(since);
    return { ok: true, remaining: rule.limit - list.length, retryAfter: 0 };
  }

  private prune(since: number): void {
    for (const [k, v] of this.hits) {
      if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    if (this.hits.size > MAX_KEYS) this.hits.clear();
  }

  reset(): void {
    this.hits.clear();
  }
}

const KEY = Symbol.for('socio.rateLimiter');

export function sharedLimiter(): RateLimiter {
  const g = globalThis as { [KEY]?: RateLimiter };
  g[KEY] ??= new RateLimiter();
  return g[KEY];
}

/**
 * IP do cliente. Na Vercel, x-forwarded-for é montado pela própria plataforma (o primeiro é o
 * cliente); x-real-ip é o reserva. Sem nenhum, tudo cai no mesmo balde "unknown".
 */
export function clientIp(headers: Pick<Headers, 'get'>): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || headers.get('x-real-ip')?.trim() || 'unknown';
  return ip.slice(0, 64);
}

export function rateLimitMessage(retryAfter: number): string {
  const min = Math.max(1, Math.ceil(retryAfter / 60));
  return `Muitos pedidos seguidos. Tente de novo em ${min} min.`;
}

/** Atalho: confere o balde para o IP dos headers. */
export function limitByIp(
  headers: Pick<Headers, 'get'>,
  bucket: RateBucket,
  opts: { env?: Env; limiter?: RateLimiter; now?: number } = {},
): RateResult {
  const limiter = opts.limiter ?? sharedLimiter();
  return limiter.check(`${bucket}:${clientIp(headers)}`, ruleFor(bucket, opts.env), opts.now);
}
