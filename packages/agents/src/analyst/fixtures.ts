/**
 * Fixtures do Analista: responder do modelo fake (testes e LLM_FAKE=1) e respostas do modo demo.
 */
import type { FakeResponder } from '@socio/llm';
import { buildChart } from './pipeline.ts';
import type { AnalystAnswer, SqlPlan } from './schema.ts';

interface FakeRule {
  match: RegExp;
  plan: SqlPlan;
}

const FAKE_RULES: FakeRule[] = [
  {
    match: /fatur|vend[ie]/i,
    plan: {
      answerable: true,
      sql: 'select sum(total_cents) as total_cents from v_sales_daily',
      chart: { type: 'number', x: null, y: 'total_cents', unit: 'cents', title: 'Faturamento' },
      reason: null,
    },
  },
  {
    match: /dia da semana/i,
    plan: {
      answerable: true,
      sql: 'select extract(dow from day)::int as dow, sum(orders_count)::int as pedidos from v_sales_daily group by 1 order by 1',
      chart: { type: 'bar', x: 'dow', y: 'pedidos', unit: 'count', title: 'Pedidos por dia' },
      reason: null,
    },
  },
  {
    match: /atras/i,
    plan: {
      answerable: true,
      sql: "select count(*)::int as atrasos from v_reviews where comment ilike '%atras%'",
      chart: {
        type: 'number',
        x: null,
        y: 'atrasos',
        unit: 'count',
        title: 'Avaliações com atraso',
      },
      reason: null,
    },
  },
  {
    match: /telefone|cliente/i,
    plan: {
      answerable: false,
      sql: null,
      chart: { type: 'table', x: null, y: null, unit: 'number', title: 'Sem dados' },
      reason: 'As views não têm dados de cliente.',
    },
  },
];

const DEFAULT_PLAN: SqlPlan = {
  answerable: true,
  sql: 'select count(*)::int as avaliacoes from v_reviews',
  chart: { type: 'number', x: null, y: 'avaliacoes', unit: 'count', title: 'Avaliações' },
  reason: null,
};

function questionOf(prompt: string): string {
  const m = /<pergunta>\\n([\s\S]*?)\\n<\/pergunta>/.exec(prompt);
  return m?.[1] ?? '';
}

/** Responder fake: escolhe um SQL fixo pela pergunta; o resumo cita o JSON do resultado. */
export function fakeAnalystResponder(next?: FakeResponder): FakeResponder {
  return (req) => {
    if (req.json && req.prompt.includes('analista de dados')) {
      const q = questionOf(req.prompt);
      const rule = FAKE_RULES.find((r) => r.match.test(q));
      return JSON.stringify(rule?.plan ?? DEFAULT_PLAN);
    }
    if (req.json && req.prompt.includes('<resultado>')) {
      return JSON.stringify({
        answer: 'Resposta de teste do analista. Quer ver por dia da semana?',
      });
    }
    return next ? next(req) : req.json ? '{}' : 'ok';
  };
}

interface DemoCase {
  match: RegExp;
  plan: SqlPlan;
  answer: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

const DOW = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const DEMO_CASES: DemoCase[] = [
  {
    match: /dia da semana|qual dia|melhor dia/i,
    plan: {
      answerable: true,
      sql: 'select … from v_sales_daily group by dia',
      chart: {
        type: 'bar',
        x: 'dia',
        y: 'pedidos',
        unit: 'count',
        title: 'Pedidos por dia da semana',
      },
      reason: null,
    },
    answer:
      'Sábado é o seu dia mais forte, com 612 pedidos nos últimos 90 dias, seguido da sexta com 571. Segunda é o mais fraco, com 289. Quer que eu sugira uma promoção para segunda?',
    columns: ['dia', 'pedidos'],
    rows: [289, 301, 318, 352, 571, 612, 447].map((n, i) => ({
      dia: DOW[(i + 1) % 7],
      pedidos: n,
    })),
  },
  {
    match: /atras|demor/i,
    plan: {
      answerable: true,
      sql: 'select … from v_reviews where comment ilike …',
      chart: {
        type: 'bar',
        x: 'periodo',
        y: 'avaliacoes',
        unit: 'count',
        title: 'Reclamações de atraso',
      },
      reason: null,
    },
    answer:
      'De 92 reclamações de atraso, 87 são de pedidos de sexta à noite, entre 19h e 22h. Nos outros dias quase não aparece. Vale reforçar a cozinha ou o entregador nesse horário.',
    columns: ['periodo', 'avaliacoes'],
    rows: [
      { periodo: 'sexta 19h–23h', avaliacoes: 87 },
      { periodo: 'outros horários', avaliacoes: 5 },
    ],
  },
  {
    match: /item|prato|mais vend|campe/i,
    plan: {
      answerable: true,
      sql: 'select … from v_item_performance order by units_sold desc limit 5',
      chart: { type: 'bar', x: 'item', y: 'unidades', unit: 'count', title: 'Itens mais vendidos' },
      reason: null,
    },
    answer:
      'A Calabresa grande é a campeã, com 1.204 unidades em 90 dias. Margherita e Frango com catupiry vêm logo atrás. Quer ver a margem de cada uma?',
    columns: ['item', 'unidades'],
    rows: [
      { item: 'Calabresa grande', unidades: 1204 },
      { item: 'Margherita grande', unidades: 987 },
      { item: 'Frango com catupiry grande', unidades: 910 },
      { item: 'Portuguesa grande', unidades: 655 },
      { item: 'Refrigerante 2 L', unidades: 1520 },
    ],
  },
];

const DEMO_DEFAULT: DemoCase = {
  match: /.*/,
  plan: {
    answerable: true,
    sql: 'select … from v_sales_daily group by semana',
    chart: {
      type: 'line',
      x: 'semana',
      y: 'faturamento_cents',
      unit: 'cents',
      title: 'Faturamento por semana',
    },
    reason: null,
  },
  answer:
    'Você faturou R$ 21.480,90 na última semana, 6% a mais que na anterior. Sexta e sábado puxaram o resultado. Quer ver quais itens mais venderam?',
  columns: ['semana', 'faturamento_cents'],
  rows: [1810000, 1922050, 1876030, 1950400, 2025060, 2148090].map((v, i) => ({
    semana: `sem ${i + 1}`,
    faturamento_cents: v,
  })),
};

/** Modo demo: resposta pronta, sem modelo nem banco. Números ilustrativos. */
export function demoAnalystAnswer(question: string): AnalystAnswer {
  const q = question.trim();
  const c = DEMO_CASES.find((d) => d.match.test(q)) ?? DEMO_DEFAULT;
  return {
    status: 'ok',
    question: q,
    answer: c.answer,
    chart: buildChart(c.plan, c.columns, c.rows),
    sql: c.plan.sql,
    rowCount: c.rows.length,
    rows: c.rows,
    columns: c.columns,
    costUsd: 0,
    attempts: 1,
  };
}
