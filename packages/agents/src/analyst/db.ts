/**
 * Execução do SQL do Analista como `analyst_ro`.
 *
 * Toda consulta roda numa transação read only com:
 * - `app.merchant_id` fixado pelo servidor (as views v_* filtram por ele);
 * - `statement_timeout` local (padrão 5 s, igual ao da role);
 * - rollback no fim, sempre.
 *
 * O SQL chega já validado (guard.ts). Isto é a segunda barreira, não a única.
 */
import postgres from 'postgres';

export const ANALYST_TIMEOUT_MS = 5000;

/** Sinal para desfazer a transação depois de ler o resultado. */
const ROLLBACK = Symbol('rollback');

export type AnalystRow = Record<string, unknown>;

export interface AnalystQueryResult {
  columns: string[];
  rows: AnalystRow[];
}

export interface AnalystDb {
  query(merchantId: string, sql: string): Promise<AnalystQueryResult>;
}

export class AnalystQueryError extends Error {
  readonly timeout: boolean;
  constructor(message: string, timeout = false) {
    super(message);
    this.timeout = timeout;
    this.name = 'AnalystQueryError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertMerchant(merchantId: string): void {
  if (!UUID.test(merchantId)) throw new AnalystQueryError('loja inválida.');
}

function timeoutMs(ms: number | undefined): number {
  const v = Math.floor(ms ?? ANALYST_TIMEOUT_MS);
  return Math.min(Math.max(v, 100), 30_000);
}

function wrapError(err: unknown): AnalystQueryError {
  const msg = err instanceof Error ? err.message : String(err);
  const timeout = /statement timeout|canceling statement/i.test(msg);
  return new AnalystQueryError(timeout ? 'a consulta demorou demais.' : msg, timeout);
}

/** Texto maior que isso é cortado (comentários longos, string_agg). */
export const MAX_CELL_CHARS = 1000;

/** OIDs do Postgres que chegam como texto e são número: int8 e numeric. */
export const NUMERIC_TYPE_OIDS: ReadonlySet<number> = new Set([20, 1700]);

/** bigint e numeric viram number; datas viram ISO. Assim o resultado vira JSON sem surpresa. */
export function normalizeValue(v: unknown, numeric = false): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) {
    // date do Postgres chega como meia-noite UTC: mostra só o dia.
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
  }
  if (typeof v === 'string' && v.length > MAX_CELL_CHARS) return `${v.slice(0, MAX_CELL_CHARS)}…`;
  if (numeric && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function normalizeRows(rows: AnalystRow[], numericCols: ReadonlySet<string>): AnalystRow[] {
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, normalizeValue(v, numericCols.has(k))]),
    ),
  );
}

function numericColumns(fields: ReadonlyArray<{ name: string; type: number }>): Set<string> {
  return new Set(fields.filter((f) => NUMERIC_TYPE_OIDS.has(f.type)).map((f) => f.name));
}

/** Mínimo do PGlite que o Analista usa (testes e eval, sem rede). */
interface PgliteLike {
  transaction<T>(fn: (tx: PgliteTx) => Promise<T>): Promise<T>;
}
interface PgliteTx {
  query<R>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; fields: Array<{ name: string; dataTypeID: number }> }>;
  exec(sql: string): Promise<unknown>;
  rollback(): Promise<void>;
}

/** PGlite com as migrations e o seed: mesmo SQL, mesma role, sem Supabase. */
export class PgliteAnalystDb implements AnalystDb {
  private readonly db: PgliteLike;
  private readonly opts: { timeoutMs?: number };
  constructor(db: PgliteLike, opts: { timeoutMs?: number } = {}) {
    this.db = db;
    this.opts = opts;
  }

  async query(merchantId: string, sql: string): Promise<AnalystQueryResult> {
    assertMerchant(merchantId);
    const ms = timeoutMs(this.opts.timeoutMs);
    try {
      return await this.db.transaction(async (tx) => {
        try {
          await tx.query(`select set_config('app.merchant_id', $1, true)`, [merchantId]);
          await tx.exec(
            `set local statement_timeout = ${ms}; set transaction read only; set local role analyst_ro`,
          );
          const res = await tx.query<AnalystRow>(sql);
          const numeric = numericColumns(
            res.fields.map((f) => ({ name: f.name, type: f.dataTypeID })),
          );
          return { columns: res.fields.map((f) => f.name), rows: normalizeRows(res.rows, numeric) };
        } finally {
          await tx.rollback();
        }
      });
    } catch (err) {
      throw wrapError(err);
    }
  }
}

/**
 * Postgres de verdade (Supabase) via SUPABASE_DB_URL_ANALYST_RO.
 * O usuário da URL é a própria analyst_ro (ou um login com `set role` permitido só para ela).
 */
export class PostgresAnalystDb implements AnalystDb {
  private readonly sql: postgres.Sql;
  private readonly opts: { timeoutMs?: number; max?: number };

  constructor(url: string, opts: { timeoutMs?: number; max?: number } = {}) {
    this.opts = opts;
    this.sql = postgres(url, {
      max: opts.max ?? 3,
      idle_timeout: 30,
      connect_timeout: 10,
      prepare: false, // pooler do Supabase (transaction mode)
      types: { bigint: postgres.BigInt },
    });
  }

  async query(merchantId: string, sql: string): Promise<AnalystQueryResult> {
    assertMerchant(merchantId);
    const ms = timeoutMs(this.opts.timeoutMs);
    try {
      let out: AnalystQueryResult | undefined;
      await this.sql
        .begin('read only', async (tx) => {
          await tx`select set_config('app.merchant_id', ${merchantId}, true)`;
          await tx.unsafe(`set local statement_timeout = ${ms}`);
          await tx.unsafe('set local role analyst_ro');
          const res = await tx.unsafe(sql);
          out = {
            columns: res.columns?.map((c) => c.name) ?? [],
            rows: normalizeRows(res as unknown as AnalystRow[], numericColumns(res.columns ?? [])),
          };
          throw ROLLBACK;
        })
        .catch((err: unknown) => {
          if (err !== ROLLBACK) throw err;
        });
      if (!out) throw new AnalystQueryError('consulta sem resultado.');
      return out;
    } catch (err) {
      throw err instanceof AnalystQueryError ? err : wrapError(err);
    }
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
