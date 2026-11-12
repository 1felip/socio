/**
 * Agente Analista: pergunta em português → SQL → resposta curta + gráfico.
 *
 * 1. orchestrator: gera um SELECT nas views v_* e diz como desenhar (sql.v1).
 * 2. código: valida com o parser do Postgres (guard.ts). Recusou → 1 nova tentativa com o motivo.
 * 3. banco: executa como analyst_ro, read only, timeout, escopo da loja (db.ts).
 * 4. fast: resume o resultado em 2–3 frases (answer.v1). As linhas são dado não confiável.
 * 5. código: monta a especificação do gráfico a partir das linhas (não do modelo).
 *
 * Nenhum passo tem tools e nada aqui escreve na loja.
 */
import {
  type CallContext,
  generateObject,
  loadPrompt,
  maskPII,
  type Prompt,
  renderPrompt,
  untrusted,
} from '@socio/llm';
import type { IntentHandler } from '../orchestrator/orchestrator.ts';
import { type AnalystDb, AnalystQueryError, type AnalystRow } from './db.ts';
import { validateAnalystSql } from './guard.ts';
import {
  type AnalystAnswer,
  AnalystReply,
  type ChartSpec,
  MAX_POINTS,
  MAX_QUESTION,
  MAX_TABLE_ROWS,
  SqlPlan,
} from './schema.ts';
import { viewsPrompt } from './views.ts';

export const ANALYST_AGENT = 'analyst';
/** Linhas que vão para o modelo resumir. */
export const MAX_ROWS_TO_MODEL = 50;
/** Caracteres de JSON de resultado que vão para o modelo. */
export const MAX_RESULT_CHARS = 6000;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export interface AnalystOptions {
  merchantId: string;
  db: AnalystDb;
  timeZone?: string;
  conversationId?: string;
  now?: () => Date;
  promptVersions?: { sql?: number; answer?: number };
}

export const ANALYST_MESSAGES = {
  empty: 'Me diz o que você quer saber das vendas ou das avaliações.',
  notAnswerable:
    'Isso eu não consigo responder com os dados que tenho. Posso olhar vendas, itens, preços e avaliações. Quer tentar por aí?',
  failed:
    'Não consegui montar essa análise agora. Tenta perguntar de outro jeito, por exemplo: "quanto vendi em setembro?"',
  timeout: 'Essa consulta ficou pesada demais. Tenta um período menor ou uma pergunta mais direta.',
} as const;

function ctxFor(opts: AnalystOptions, step: string, prompt: Prompt): CallContext {
  return {
    merchantId: opts.merchantId,
    agent: ANALYST_AGENT,
    step,
    prompt,
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  };
}

function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(d);
}

/** Primeiro e último dia com venda (SQL fixo, não vem do modelo). */
async function dataWindow(opts: AnalystOptions): Promise<{ start: string; end: string } | null> {
  const res = await opts.db.query(
    opts.merchantId,
    'select min(day)::text as start, max(day)::text as end from v_sales_daily',
  );
  const r = res.rows[0];
  if (!r?.start || !r?.end) return null;
  return { start: String(r.start), end: String(r.end) };
}

interface Attempt {
  plan: SqlPlan;
  costUsd: number;
}

async function planSql(
  question: string,
  opts: AnalystOptions,
  window: { start: string; end: string } | null,
  previous: { sql: string | null; error: string } | null,
): Promise<Attempt> {
  const v = opts.promptVersions?.sql;
  const prompt = loadPrompt(ANALYST_AGENT, 'sql', v ? { version: v } : {});
  const tz = opts.timeZone ?? DEFAULT_TIMEZONE;
  const today = localDate((opts.now ?? (() => new Date()))(), tz);
  const system = renderPrompt(prompt.body, {
    views: viewsPrompt(),
    today,
    timezone: tz,
    data_start: window?.start ?? 'sem dados',
    data_end: window?.end ?? 'sem dados',
  });
  const parts = [untrusted('pergunta', question)];
  if (previous) {
    parts.push(
      untrusted('sql_anterior', previous.sql ?? '(nenhum)'),
      untrusted('erro_anterior', previous.error.slice(0, 500)),
    );
  }
  const res = await generateObject({
    role: prompt.role,
    system,
    ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
    ctx: ctxFor(opts, previous ? 'sql.retry' : 'sql', prompt),
    schema: SqlPlan,
    schemaName: 'analyst_sql',
    maxOutputTokens: 1200,
    prompt: parts.join('\n\n'),
  });
  return { plan: res.object, costUsd: res.costUsd };
}

/**
 * Resultado em JSON para o modelo: poucas linhas e texto de cliente delimitado.
 * Só valores de texto passam por maskPII (número de 8 dígitos não é telefone);
 * < e > viram < e > (escape unicode do JSON) para nenhum comentário fechar ou abrir tag.
 */
export function resultBlock(rows: AnalystRow[]): string {
  const head = rows
    .slice(0, MAX_ROWS_TO_MODEL)
    .map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? maskPII(v) : v]),
      ),
    );
  let json = JSON.stringify(head).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e');
  if (json.length > MAX_RESULT_CHARS) json = `${json.slice(0, MAX_RESULT_CHARS)}…`;
  const note =
    rows.length > head.length ? `\n(mostrando ${head.length} de ${rows.length} linhas)` : '';
  return `<resultado>\n${json}${note}\n</resultado>`;
}

/**
 * Erro do banco para o modelo corrigir o SQL, sem conteúdo de linha: o Postgres cita o valor
 * que falhou (ex.: invalid input syntax for type integer: "texto"), e esse valor é dado.
 */
export function dbErrorForModel(message: string): string {
  return (message.split('\n')[0] ?? '')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .slice(0, 300);
}

async function summarize(
  question: string,
  sql: string,
  rows: AnalystRow[],
  opts: AnalystOptions,
): Promise<{ answer: string; costUsd: number }> {
  const v = opts.promptVersions?.answer;
  const prompt = loadPrompt(ANALYST_AGENT, 'answer', v ? { version: v } : {});
  const res = await generateObject({
    role: prompt.role,
    system: prompt.body,
    ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
    ctx: ctxFor(opts, 'answer', prompt),
    schema: AnalystReply,
    schemaName: 'analyst_answer',
    maxOutputTokens: 400,
    prompt: [
      untrusted('pergunta', question),
      `<consulta>\n${sql}\n</consulta>`,
      resultBlock(rows),
    ].join('\n\n'),
  });
  return { answer: res.object.answer.trim(), costUsd: res.costUsd };
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function cell(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return v.slice(0, 120);
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return JSON.stringify(v).slice(0, 120);
}

function tableSpec(title: string, columns: string[], rows: AnalystRow[]): ChartSpec {
  return {
    type: 'table',
    title,
    columns,
    rows: rows.slice(0, MAX_TABLE_ROWS).map((r) => columns.map((c) => cell(r[c]))),
  };
}

/**
 * Especificação do gráfico a partir das linhas. O modelo só sugere tipo e colunas;
 * coluna inexistente ou valor não numérico cai para tabela.
 */
export function buildChart(plan: SqlPlan, columns: string[], rows: AnalystRow[]): ChartSpec | null {
  if (rows.length === 0 || columns.length === 0) return null;
  const { type, unit, title } = plan.chart;
  const pick = (name: string | null, fallback: string | undefined) =>
    name && columns.includes(name) ? name : fallback;

  if (type === 'number') {
    const y = pick(
      plan.chart.y,
      columns.find((c) => toNumber(rows[0]?.[c]) !== null),
    );
    const value = y ? toNumber(rows[0]?.[y]) : null;
    if (rows.length === 1 && value !== null) return { type: 'number', title, unit, value };
    return tableSpec(title, columns, rows);
  }

  if (type === 'bar' || type === 'line') {
    const y = pick(
      plan.chart.y,
      [...columns].reverse().find((c) => toNumber(rows[0]?.[c]) !== null),
    );
    const x = pick(
      plan.chart.x,
      columns.find((c) => c !== y),
    );
    if (!x || !y || x === y) return tableSpec(title, columns, rows);
    const points = rows.slice(0, MAX_POINTS).map((r) => ({
      label: String(cell(r[x]) ?? '—'),
      value: toNumber(r[y]),
    }));
    if (points.some((p) => p.value === null)) return tableSpec(title, columns, rows);
    return {
      type,
      title,
      unit,
      xLabel: x,
      yLabel: y,
      points: points as Array<{ label: string; value: number }>,
    };
  }

  return tableSpec(title, columns, rows);
}

function result(
  question: string,
  partial: Partial<AnalystAnswer> & Pick<AnalystAnswer, 'status' | 'answer'>,
): AnalystAnswer {
  return {
    question,
    chart: null,
    sql: null,
    rowCount: 0,
    rows: [],
    columns: [],
    costUsd: 0,
    attempts: 0,
    ...partial,
  };
}

export async function askAnalyst(
  rawQuestion: string,
  opts: AnalystOptions,
): Promise<AnalystAnswer> {
  const question = rawQuestion.trim().slice(0, MAX_QUESTION);
  if (!question)
    return result(question, { status: 'not_answerable', answer: ANALYST_MESSAGES.empty });

  let costUsd = 0;
  let attempts = 0;
  let previous: { sql: string | null; error: string } | null = null;
  const window = await dataWindow(opts).catch(() => null);

  // Até 2 tentativas: SQL recusado pelo validador ou com erro no banco volta ao modelo.
  while (attempts < 2) {
    attempts += 1;
    const { plan, costUsd: c } = await planSql(question, opts, window, previous);
    costUsd += c;

    if (!plan.answerable || !plan.sql) {
      return result(question, {
        status: 'not_answerable',
        answer: ANALYST_MESSAGES.notAnswerable,
        costUsd,
        attempts,
        ...(plan.reason ? { error: plan.reason } : {}),
      });
    }

    const guard = await validateAnalystSql(plan.sql);
    if (!guard.ok) {
      previous = { sql: plan.sql, error: `recusado pelo validador: ${guard.reason}` };
      continue;
    }

    let data: { columns: string[]; rows: AnalystRow[] };
    try {
      data = await opts.db.query(opts.merchantId, guard.sql);
    } catch (err) {
      const e = err instanceof AnalystQueryError ? err : new AnalystQueryError(String(err));
      if (e.timeout) {
        return result(question, {
          status: 'failed',
          answer: ANALYST_MESSAGES.timeout,
          sql: guard.sql,
          costUsd,
          attempts,
          error: e.message,
        });
      }
      previous = { sql: guard.sql, error: `erro do banco: ${dbErrorForModel(e.message)}` };
      continue;
    }

    const { answer, costUsd: c2 } = await summarize(question, guard.sql, data.rows, opts);
    costUsd += c2;
    return result(question, {
      status: 'ok',
      answer,
      chart: buildChart(plan, data.columns, data.rows),
      sql: guard.sql,
      rowCount: data.rows.length,
      rows: data.rows,
      columns: data.columns,
      costUsd,
      attempts,
    });
  }

  return result(question, {
    status: 'failed',
    answer: ANALYST_MESSAGES.failed,
    costUsd,
    attempts,
    ...(previous ? { error: previous.error } : {}),
  });
}

/**
 * Handler da intenção `analista` no orquestrador (WhatsApp e painel).
 * `ask` é o backend: escolhe a conexão analyst_ro (ou o demo) para a loja da requisição.
 */
export function analystIntentHandler(
  ask: (merchantId: string, question: string) => Promise<AnalystAnswer>,
): IntentHandler {
  return async ({ request }) => {
    if (!request.text) return { text: ANALYST_MESSAGES.empty };
    const a = await ask(request.merchantId, request.text);
    return { text: a.answer };
  };
}
