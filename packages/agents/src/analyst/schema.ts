import { z } from 'zod';

export const CHART_TYPES = ['bar', 'line', 'number', 'table'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

/** Como formatar os valores do eixo y. */
export const VALUE_UNITS = ['cents', 'count', 'percent', 'number'] as const;
export type ValueUnit = (typeof VALUE_UNITS)[number];

export const MAX_QUESTION = 500;
export const MAX_ANSWER = 500;
/** Pontos no gráfico de barra/linha. */
export const MAX_POINTS = 100;
/** Linhas na tabela mostrada no painel. */
export const MAX_TABLE_ROWS = 20;

/** Saída do passo 1 (modelo): SQL + como desenhar o resultado. */
export const SqlPlan = z.object({
  answerable: z
    .boolean()
    .describe('false se as views não têm dado para responder (ex.: clientes, estoque, clima).'),
  sql: z.string().max(4000).nullable().describe('Um único SELECT nas views v_*. null se não dá.'),
  chart: z.object({
    type: z.enum(CHART_TYPES),
    x: z.string().max(64).nullable().describe('Coluna do rótulo (eixo x). null em number.'),
    y: z.string().max(64).nullable().describe('Coluna numérica (eixo y ou o número).'),
    unit: z.enum(VALUE_UNITS),
    title: z.string().max(80),
  }),
  reason: z.string().max(300).nullable().describe('Por que não dá para responder, se for o caso.'),
});
export type SqlPlan = z.infer<typeof SqlPlan>;

/** Saída do passo 2 (modelo): a resposta curta ao dono. */
export const AnalystReply = z.object({
  answer: z.string().min(1).max(MAX_ANSWER).describe('2 a 3 frases curtas em português.'),
});
export type AnalystReply = z.infer<typeof AnalystReply>;

export const ChartPoint = z.object({ label: z.string(), value: z.number() });
export type ChartPoint = z.infer<typeof ChartPoint>;

/** Especificação de gráfico que o painel desenha. Montada por código a partir das linhas. */
export const ChartSpec = z.discriminatedUnion('type', [
  z.object({
    type: z.enum(['bar', 'line']),
    title: z.string(),
    unit: z.enum(VALUE_UNITS),
    xLabel: z.string(),
    yLabel: z.string(),
    points: z.array(ChartPoint).max(MAX_POINTS),
  }),
  z.object({
    type: z.literal('number'),
    title: z.string(),
    unit: z.enum(VALUE_UNITS),
    value: z.number(),
  }),
  z.object({
    type: z.literal('table'),
    title: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).max(MAX_TABLE_ROWS),
  }),
]);
export type ChartSpec = z.infer<typeof ChartSpec>;

export type AnalystStatus = 'ok' | 'not_answerable' | 'failed';

export interface AnalystAnswer {
  status: AnalystStatus;
  question: string;
  /** Texto pronto para o dono (2–3 frases). */
  answer: string;
  chart: ChartSpec | null;
  /** SQL executado (já validado). null quando não executou. */
  sql: string | null;
  rowCount: number;
  /** Linhas devolvidas (para o eval e a tabela). */
  rows: Array<Record<string, unknown>>;
  columns: string[];
  costUsd: number;
  /** Tentativas de gerar SQL (1 ou 2). */
  attempts: number;
  /** Motivo técnico da falha (log, não vai ao dono). */
  error?: string;
}
