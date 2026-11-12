/**
 * Validador do SQL gerado pelo Analista, com o parser real do Postgres (libpg-query).
 *
 * Regras:
 * - um único comando, e ele é SELECT (sem INTO, sem FOR UPDATE, sem CTE que escreve);
 * - relações só da lista v_* (ou CTEs declaradas antes, sem sombrear tabela);
 * - funções só de uma lista branca (nada de set_config, pg_sleep, dblink, lo_*...);
 * - LIMIT constante ≤ 1000; sem LIMIT, o validador acrescenta LIMIT 1000.
 *
 * É a primeira barreira. A segunda é o banco: role analyst_ro só lê v_*, transação read only,
 * statement_timeout e escopo da loja fixado pelo servidor, nunca pelo modelo.
 */
import { parse } from 'libpg-query';
import { ANALYST_VIEW_NAMES } from './views.ts';

export const MAX_ROWS = 1000;
export const MAX_SQL_LENGTH = 4000;

/** Funções que o Analista pode chamar. Nome sem schema, minúsculo. */
export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // agregação
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'string_agg',
  'array_agg',
  'bool_and',
  'bool_or',
  'every',
  'stddev',
  'stddev_pop',
  'stddev_samp',
  'variance',
  'var_pop',
  'var_samp',
  'corr',
  'percentile_cont',
  'percentile_disc',
  'mode',
  'any_value',
  // janela
  'row_number',
  'rank',
  'dense_rank',
  'percent_rank',
  'cume_dist',
  'ntile',
  'lag',
  'lead',
  'first_value',
  'last_value',
  'nth_value',
  // número
  'round',
  'trunc',
  'floor',
  'ceil',
  'ceiling',
  'abs',
  'sign',
  'mod',
  'div',
  'power',
  'sqrt',
  'ln',
  'log',
  'exp',
  'width_bucket',
  // data
  'extract',
  'date_part',
  'date_trunc',
  'timezone',
  'to_char',
  'to_date',
  'make_date',
  'make_interval',
  'age',
  'now',
  'generate_series',
  'isfinite',
  'justify_days',
  // texto
  'lower',
  'upper',
  'initcap',
  'length',
  'char_length',
  'substring',
  'substr',
  'left',
  'right',
  'split_part',
  'position',
  'strpos',
  'replace',
  'concat',
  'concat_ws',
  'trim',
  'btrim',
  'ltrim',
  'rtrim',
  'regexp_replace',
  'regexp_like',
  'regexp_count',
  'like_escape',
  'similar_to_escape',
  'to_number',
  // array
  'array_length',
  'cardinality',
  'unnest',
  'array_to_string',
]);

/** Tipos que não fazem sentido no Analista e servem para sondar o catálogo. */
const DENIED_TYPE = /^reg|^pg_|^(oid|xid|cid|tid|txid_snapshot)$/i;

export type GuardResult = { ok: true; sql: string; limit: number } | { ok: false; reason: string };

class Reject extends Error {}

type Node = Record<string, unknown>;

function isObject(v: unknown): v is Node {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((n) => (isObject(n) && isObject(n.String) ? String(n.String.sval ?? '') : ''));
}

interface Scope {
  /** CTEs visíveis neste ponto. */
  ctes: ReadonlySet<string>;
}

function checkRangeVar(rv: Node, scope: Scope): void {
  // Exato: o parser já põe em minúsculas o que veio sem aspas. Com aspas, "Orders" ≠ orders.
  const rel = String(rv.relname ?? '');
  if (rv.catalogname || (rv.schemaname && String(rv.schemaname) !== 'public')) {
    throw new Reject(`fonte fora do schema permitido: ${String(rv.schemaname)}.${rel}`);
  }
  if (rv.schemaname) {
    // public.v_x é ok, mas public.<cte> não é a CTE: é tabela.
    if (!ANALYST_VIEW_NAMES.has(rel)) throw new Reject(`fonte não permitida: ${rel}`);
    return;
  }
  if (scope.ctes.has(rel)) return;
  if (!ANALYST_VIEW_NAMES.has(rel)) throw new Reject(`fonte não permitida: ${rel}`);
}

function checkFunc(fc: Node): void {
  const name = strings(fc.funcname);
  const fn = (name.at(-1) ?? '').toLowerCase();
  const schema = name.length > 1 ? (name[0] ?? '').toLowerCase() : null;
  if (schema && schema !== 'pg_catalog')
    throw new Reject(`função não permitida: ${name.join('.')}`);
  if (!ALLOWED_FUNCTIONS.has(fn)) throw new Reject(`função não permitida: ${fn}`);
}

function checkTypeName(tn: Node): void {
  const name = strings(tn.names).at(-1) ?? '';
  if (DENIED_TYPE.test(name)) throw new Reject(`tipo não permitido: ${name}`);
}

/** CTEs de um WITH: cada corpo vê as anteriores (ou todas, se RECURSIVE). */
function walkWith(withClause: Node, outer: Scope): Scope {
  const ctes = Array.isArray(withClause.ctes) ? withClause.ctes : [];
  const recursive = withClause.recursive === true;
  const names = ctes.map((c) =>
    isObject(c) && isObject(c.CommonTableExpr) ? String(c.CommonTableExpr.ctename ?? '') : '',
  );
  if (names.some((n) => !n)) throw new Reject('CTE inválida.');
  // Nome simples e minúsculo: nada de "Pg_Class" entre aspas parecendo outra coisa.
  const bad = names.find((n) => !/^[a-z_][a-z0-9_]{0,62}$/.test(n));
  if (bad !== undefined) throw new Reject(`nome de CTE não permitido: ${bad}`);
  const all = new Set([...outer.ctes, ...names]);
  const visible = new Set(outer.ctes);
  ctes.forEach((c, i) => {
    const cte = (c as Node).CommonTableExpr as Node;
    walk(cte.ctequery, { ctes: recursive ? all : new Set(visible) });
    visible.add(names[i] as string);
  });
  return { ctes: all };
}

function walk(node: unknown, scope: Scope): void {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, scope);
    return;
  }
  if (!isObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (key.endsWith('Stmt') && key !== 'SelectStmt') {
      throw new Reject(`só SELECT é permitido (achei ${key}).`);
    }
    if (!isObject(value) && !Array.isArray(value)) continue;

    switch (key) {
      // Pontas de UNION/INTERSECT/EXCEPT vêm sem o invólucro SelectStmt.
      case 'larg':
      case 'rarg':
        walk({ SelectStmt: value }, scope);
        continue;
      case 'SelectStmt': {
        const s = value as Node;
        if (s.intoClause) throw new Reject('SELECT INTO não é permitido.');
        if (s.lockingClause) throw new Reject('FOR UPDATE/SHARE não é permitido.');
        const inner = isObject(s.withClause) ? walkWith(s.withClause, scope) : scope;
        for (const [k, v] of Object.entries(s)) {
          if (k !== 'withClause') walk(v, inner);
        }
        continue;
      }
      case 'RangeVar':
        checkRangeVar(value as Node, scope);
        continue;
      case 'FuncCall':
        checkFunc(value as Node);
        break;
      // TypeCast guarda o tipo em `typeName` (sem o invólucro TypeName).
      case 'TypeName':
      case 'typeName':
        checkTypeName(value as Node);
        break;
      case 'ParamRef':
        throw new Reject('parâmetros ($1) não são permitidos.');
      default:
        break;
    }
    walk(value, scope);
  }
}

function limitOf(stmt: Node): number | null | 'invalid' {
  if (stmt.limitOption === 'LIMIT_OPTION_WITH_TIES') return 'invalid';
  const lc = stmt.limitCount;
  if (lc === undefined || lc === null) return null;
  if (!isObject(lc) || !isObject(lc.A_Const)) return 'invalid';
  const c = lc.A_Const;
  if (c.isnull) return null; // LIMIT NULL = sem limite
  const ival = isObject(c.ival) ? Number(c.ival.ival ?? 0) : undefined;
  return ival === undefined || !Number.isInteger(ival) ? 'invalid' : ival;
}

async function parseOne(sql: string): Promise<Node> {
  let tree: { stmts?: Array<{ stmt?: unknown }> };
  try {
    tree = (await parse(sql)) as typeof tree;
  } catch (err) {
    throw new Reject(`SQL inválido: ${(err as Error).message}`);
  }
  const stmts = tree.stmts ?? [];
  if (stmts.length !== 1) throw new Reject('mande um único comando SELECT.');
  const stmt = stmts[0]?.stmt;
  if (!isObject(stmt) || !isObject(stmt.SelectStmt)) throw new Reject('só SELECT é permitido.');
  return stmt;
}

/**
 * Valida o SQL e devolve a versão que pode ir ao banco (com LIMIT garantido).
 * Nunca lança: erro vira `{ ok: false, reason }`, que volta ao modelo para corrigir.
 */
export async function validateAnalystSql(input: string): Promise<GuardResult> {
  try {
    const raw = input.trim().replace(/;\s*$/, '');
    if (!raw) throw new Reject('SQL vazio.');
    if (raw.length > MAX_SQL_LENGTH)
      throw new Reject(`SQL maior que ${MAX_SQL_LENGTH} caracteres.`);

    const stmt = await parseOne(raw);
    walk(stmt, { ctes: new Set() });

    const limit = limitOf(stmt.SelectStmt as Node);
    if (limit === 'invalid') throw new Reject('LIMIT precisa ser um número inteiro.');
    if (limit !== null && (limit < 0 || limit > MAX_ROWS)) {
      throw new Reject(`LIMIT precisa ser no máximo ${MAX_ROWS}.`);
    }
    if (limit !== null) return { ok: true, sql: raw, limit };

    // Quebra de linha: um comentário "-- ..." no fim não engole o LIMIT.
    const sql = `${raw}\nlimit ${MAX_ROWS}`;
    const again = await parseOne(sql);
    if (limitOf(again.SelectStmt as Node) !== MAX_ROWS) {
      throw new Reject('não consegui aplicar o LIMIT.');
    }
    return { ok: true, sql, limit: MAX_ROWS };
  } catch (err) {
    if (err instanceof Reject) return { ok: false, reason: err.message };
    return { ok: false, reason: 'não consegui validar o SQL.' };
  }
}
