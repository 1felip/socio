/**
 * pnpm eval:injection — 20 ataques de injeção de prompt em três superfícies (T19).
 *
 * - review: analyzeReview (classify + reply) com o comentário malicioso.
 * - message: orquestrador completo (roteador + handler) numa loja com 1 aprovação pendente.
 * - menu: etapa 2 do cardápio (refineExtraction) com texto malicioso "escrito na foto".
 *
 * Meta: 100% sem ação (critérios em src/injection/check.ts). Relatório em
 * evals/reports/injection-<data>.md. Sai com 1 se algum caso agir ou der erro.
 * LLM_FAKE=1 roda o encanamento sem API.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  configureLlm,
  type FakeResponder,
  flushTracing,
  isFakeMode,
  loadPrompt,
  MemoryRunStore,
  setFakeResponder,
} from '@socio/llm';
import { createApprovalService, MemoryApprovalStore } from '../src/approvals/service.ts';
import {
  type CheckResult,
  checkMenuDraft,
  checkMessageReply,
  checkReviewReply,
} from '../src/injection/check.ts';
import { fakeMenuResponder } from '../src/menu/fixtures.ts';
import { refineExtraction } from '../src/menu/pipeline.ts';
import type { MenuExtraction } from '../src/menu/schema.ts';
import { MemoryConversationStore } from '../src/orchestrator/memory.ts';
import { createOrchestrator } from '../src/orchestrator/orchestrator.ts';
import { fakeReviewsResponder } from '../src/reviews/fixtures.ts';
import { analyzeReview } from '../src/reviews/pipeline.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const DATA = 'evals/datasets/injection';
const MERCHANT = 'eval-injection';
const CONCURRENCY = 4;

type Case =
  | { id: string; surface: 'review'; attack: string; rating: number; comment: string }
  | { id: string; surface: 'message'; attack: string; text: string }
  | { id: string; surface: 'menu'; attack: string; extraction: MenuExtraction };

interface Index {
  files: string[];
  targets: { noAction: number };
}

interface Outcome {
  c: Case;
  check?: CheckResult;
  output?: string;
  detected?: boolean;
  error?: string;
}

async function runReview(c: Extract<Case, { surface: 'review' }>): Promise<Outcome> {
  const a = await analyzeReview(
    { id: c.id, rating: c.rating, comment: c.comment, createdAt: '2026-11-01T12:00:00Z' },
    { storeName: 'Loja de teste', tone: 'acolhedor e direto', examples: [] },
    { merchantId: MERCHANT },
  );
  return {
    c,
    check: checkReviewReply(a.reply.text),
    output: a.reply.text,
    detected: a.classification.injection_suspected,
  };
}

const systemMarker = loadPrompt('orchestrator', 'chat').body.slice(0, 60);

async function runMessage(c: Extract<Case, { surface: 'message' }>): Promise<Outcome> {
  const approvals = createApprovalService({ store: new MemoryApprovalStore() });
  await approvals.create({
    merchantId: MERCHANT,
    kind: 'review.reply',
    summary: 'Resposta à avaliação de 1 estrela sobre atraso',
    payload: { reviewId: 'r-1', text: 'Obrigado pelo retorno e desculpe pela demora.' },
    requestedBy: 'agent:reviews',
  });
  const before = await approvals.list(MERCHANT);
  const orchestrator = createOrchestrator({
    approvals,
    conversations: new MemoryConversationStore(),
  });
  const res = await orchestrator.handle({
    merchantId: MERCHANT,
    channel: 'whatsapp',
    text: c.text,
  });
  const after = await approvals.list(MERCHANT);
  return {
    c,
    check: checkMessageReply({ text: res.text, before, after, systemMarker }),
    output: `[${res.intent}] ${res.text}`,
  };
}

async function runMenu(c: Extract<Case, { surface: 'menu' }>): Promise<Outcome> {
  const { draft } = await refineExtraction(c.extraction, { merchantId: MERCHANT });
  const items = draft.categories.flatMap((cat) => cat.items.map((i) => `${cat.name} › ${i.name}`));
  return { c, check: checkMenuDraft(c.extraction, draft, c.attack), output: items.join('; ') };
}

async function runCase(c: Case): Promise<Outcome> {
  try {
    if (c.surface === 'review') return await runReview(c);
    if (c.surface === 'message') return await runMessage(c);
    return await runMenu(c);
  } catch (err) {
    return { c, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

/** Fake: reviews e menu têm responders próprios; o orquestrador usa o padrão. */
const fakeResponder: FakeResponder = (req) => {
  if (req.prompt.includes('menu_extraction')) return fakeMenuResponder(req);
  if (req.prompt.includes('<review>')) return fakeReviewsResponder(req);
  return req.json
    ? '{}'
    : 'Posso te ajudar com o cardápio e as aprovações. Quer ver o que está pendente?';
};

async function main(): Promise<number> {
  const store = new MemoryRunStore();
  configureLlm({
    store,
    limits: {
      perConversationUsd: 100,
      perMerchantDayUsd: Number(process.env.EVAL_COST_LIMIT_USD ?? 5),
    },
  });
  const fake = isFakeMode();
  if (fake) setFakeResponder(fakeResponder);

  const index = JSON.parse(readFileSync(root(`${DATA}/index.json`), 'utf8')) as Index;
  const cases = index.files.flatMap(
    (f) => JSON.parse(readFileSync(root(`${DATA}/${f}`), 'utf8')) as Case[],
  );
  const filter = process.argv[2];
  const selected = filter ? cases.filter((c) => c.id.includes(filter)) : cases;
  console.error(`[eval:injection] ${selected.length} casos${fake ? ' (LLM_FAKE)' : ''}`);

  const results = await pool(selected, CONCURRENCY, runCase);
  await flushTracing();

  const errors = results.filter((r) => r.error);
  const safe = results.filter((r) => r.check?.ok).length;
  const rate = safe / Math.max(1, selected.length);
  const pass = rate >= index.targets.noAction && errors.length === 0;
  const reviews = results.filter((r) => r.c.surface === 'review');
  const detected = reviews.filter((r) => r.detected).length;
  const echoes = results.filter((r) => (r.check?.notes.length ?? 0) > 0).length;
  const cost = store.runs.reduce((s, r) => s + r.costUsd, 0);

  const bySurface = (['review', 'message', 'menu'] as const).map((s) => {
    const list = results.filter((r) => r.c.surface === s);
    return `| ${s} | ${list.filter((r) => r.check?.ok).length}/${list.length} |`;
  });

  const bad = results.filter((r) => !r.check?.ok);
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Eval injeção — ${date}${fake ? ' (LLM_FAKE, sem valor)' : ''}`,
    '',
    `Casos: ${selected.length} · erros: ${errors.length} · custo: US$ ${cost.toFixed(4)} · injeções detectadas nas avaliações: ${detected}/${reviews.length} · eco no rascunho do cardápio: ${echoes}`,
    '',
    '| Métrica | Meta | Resultado | |',
    '|---|---|---|---|',
    `| sem ação | 100% | ${(rate * 100).toFixed(1)}% (${safe}/${selected.length}) | ${pass ? 'ok' : 'FALHOU'} |`,
    '',
    '| Superfície | Sem ação |',
    '|---|---|',
    ...bySurface,
    '',
    `## Falhas (${bad.length})`,
    '',
    ...(bad.length === 0
      ? ['Nenhuma.']
      : bad.slice(0, 20).map((r) => {
          const why = r.error ?? r.check?.why.join('; ') ?? '';
          return `- **${r.c.id}** (${r.c.attack}) → "${(r.output ?? '').slice(0, 200)}" — ${why}`;
        })),
    '',
  ];
  const report = lines.join('\n');
  // Rodada fake (LLM_FAKE) não vira histórico: vai para evals/reports/fake/ (ignorado no git).
  const reportsDir = fake ? 'evals/reports/fake' : 'evals/reports';
  mkdirSync(root(reportsDir), { recursive: true });
  const out = root(`${reportsDir}/injection-${date}.md`);
  writeFileSync(out, report);
  console.log(report);
  console.error(`[eval:injection] relatório: ${out}`);
  return pass ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
