/**
 * Agente Cardápio: foto → rascunho revisável (`MenuDraft`).
 *
 * 1. vision: transcreve a foto (MenuExtraction).
 * 2. orchestrator: padroniza nomes, descrições e alérgenos por índice (MenuRefinement).
 * 3. código: junta tudo, calcula `price_outlier` e `low_confidence` e gera avisos.
 *
 * Nada é publicado aqui. Publicar exige aprovação (T07).
 */
import {
  type CallContext,
  type CallOptions,
  generateObject,
  loadPrompt,
  type Prompt,
  untrusted,
} from '@socio/llm';
import {
  type DraftItem,
  type ExtractedItem,
  MenuDraft,
  MenuExtraction,
  MenuRefinement,
  type RefinedItem,
} from './schema.ts';

export const MENU_AGENT = 'menu';

/** Abaixo disso o item vai marcado para o dono conferir. */
export const LOW_CONFIDENCE_BELOW = 0.6;
/** Preço fora de [mediana × LOW, mediana × HIGH] da categoria é sinalizado. */
export const OUTLIER_LOW = 0.4;
export const OUTLIER_HIGH = 2.5;
/** Com menos itens com preço que isso, a mediana não diz nada. */
export const OUTLIER_MIN_ITEMS = 3;

export class MenuReadError extends Error {
  override readonly name = 'MenuReadError';
  /** Mensagem pronta para o dono (tom-socio). */
  readonly userMessage = 'Não consegui ler a foto. Manda outra mais de perto?';
}

export interface MenuImage {
  data: Uint8Array;
  mediaType: string;
}

export interface ExtractMenuOptions {
  merchantId: string;
  conversationId?: string;
  /** Versões fixas dos prompts (evals). Sem elas, usa a maior. */
  promptVersions?: { extract?: number; refine?: number };
}

export interface ExtractMenuResult {
  draft: MenuDraft;
  extraction: MenuExtraction;
  costUsd: number;
  prompts: { extract: string; refine: string };
}

function ctxFor(opts: ExtractMenuOptions, step: string, prompt: Prompt): CallContext {
  return {
    merchantId: opts.merchantId,
    agent: MENU_AGENT,
    step,
    prompt,
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
  };
}

function promptCall(prompt: Prompt): Pick<CallOptions, 'role' | 'system' | 'temperature'> {
  return {
    role: prompt.role,
    system: prompt.body,
    ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
  };
}

export async function extractMenu(
  image: MenuImage,
  opts: ExtractMenuOptions,
): Promise<ExtractMenuResult> {
  const v = opts.promptVersions ?? {};
  const extractPrompt = loadPrompt(MENU_AGENT, 'extract', v.extract ? { version: v.extract } : {});
  const refinePrompt = loadPrompt(MENU_AGENT, 'refine', v.refine ? { version: v.refine } : {});

  const step1 = await generateObject({
    ...promptCall(extractPrompt),
    ctx: ctxFor(opts, 'extract', extractPrompt),
    schema: MenuExtraction,
    schemaName: 'menu_extraction',
    maxOutputTokens: 8000,
    timeoutMs: 120_000,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcreva o cardápio desta foto.' },
          { type: 'file', data: image.data, mediaType: image.mediaType },
        ],
      },
    ],
  });
  const extraction = step1.object;
  const itemCount = extraction.categories.reduce((n, c) => n + c.items.length, 0);
  if (!extraction.is_menu || itemCount === 0) throw new MenuReadError(extraction.notes ?? '');

  const step2 = await refineExtraction(extraction, opts, refinePrompt);

  return {
    draft: step2.draft,
    extraction,
    costUsd: step1.costUsd + step2.costUsd,
    prompts: { extract: extractPrompt.id, refine: refinePrompt.id },
  };
}

/**
 * Etapa 2 sozinha: transcrição (texto da foto, não confiável) → rascunho.
 * Exposta para o eval de injeção testar texto malicioso "escrito na foto" sem precisar de imagem.
 */
export async function refineExtraction(
  extraction: MenuExtraction,
  opts: ExtractMenuOptions,
  prompt?: ReturnType<typeof loadPrompt>,
): Promise<{ draft: MenuDraft; costUsd: number }> {
  const v = opts.promptVersions ?? {};
  const refinePrompt =
    prompt ?? loadPrompt(MENU_AGENT, 'refine', v.refine ? { version: v.refine } : {});
  const res = await generateObject({
    ...promptCall(refinePrompt),
    ctx: ctxFor(opts, 'refine', refinePrompt),
    schema: MenuRefinement,
    schemaName: 'menu_refinement',
    maxOutputTokens: 8000,
    prompt: untrusted('menu_extraction', JSON.stringify(indexed(extraction), null, 1)),
  });
  return { draft: buildDraft(extraction, res.object), costUsd: res.costUsd };
}

/** O que vai para a etapa 2: só o necessário, com índices explícitos. */
function indexed(extraction: MenuExtraction) {
  return extraction.categories.map((c, ci) => ({
    category_index: ci,
    category: c.name,
    items: c.items.map((it, ii) => ({
      item_index: ii,
      name: it.name,
      description: it.description,
    })),
  }));
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Índices dos preços muito fora da mediana da categoria. */
export function priceOutliers(prices: readonly (number | null)[]): Set<number> {
  const known = prices.filter((p): p is number => p !== null && p > 0);
  const out = new Set<number>();
  const m = median(known);
  if (m === undefined || known.length < OUTLIER_MIN_ITEMS) return out;
  prices.forEach((p, i) => {
    if (p !== null && (p < m * OUTLIER_LOW || p > m * OUTLIER_HIGH)) out.add(i);
  });
  return out;
}

function brl(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** Junta extração + refino. Preços e complementos vêm sempre da extração. */
export function buildDraft(extraction: MenuExtraction, refinement: MenuRefinement): MenuDraft {
  const refined = new Map<string, RefinedItem>();
  for (const r of refinement.items) refined.set(`${r.category_index}:${r.item_index}`, r);
  const catNames = new Map(refinement.categories.map((c) => [c.index, c.name]));
  const warnings: string[] = [];

  const categories = extraction.categories.map((cat, ci) => {
    const name = catNames.get(ci) ?? cat.name;
    const outliers = priceOutliers(cat.items.map((it) => it.price_cents));
    const prices = cat.items.map((it) => it.price_cents).filter((p): p is number => p !== null);
    const m = median(prices);

    const items = cat.items.map((it: ExtractedItem, ii): DraftItem => {
      const r = refined.get(`${ci}:${ii}`);
      const lowConfidence =
        it.confidence < LOW_CONFIDENCE_BELOW || it.price_cents === null || r === undefined;
      const item: DraftItem = {
        name: r?.name ?? it.name,
        source_name: it.name,
        description: r?.description ?? it.description ?? '',
        price_cents: it.price_cents,
        complement_groups: it.complement_groups,
        allergens: r ? [...new Set(r.allergens)] : [],
        price_outlier: outliers.has(ii),
        low_confidence: lowConfidence,
      };
      if (it.price_cents === null) warnings.push(`${item.name}: não achei o preço na foto.`);
      else if (item.price_outlier && m !== undefined)
        warnings.push(
          `${item.name}: ${brl(it.price_cents)} está bem fora dos outros de ${name} (mediana ${brl(m)}). Confere?`,
        );
      else if (lowConfidence) warnings.push(`${item.name}: a foto estava difícil de ler. Confere?`);
      return item;
    });
    return { name, items };
  });

  return MenuDraft.parse({ categories, warnings });
}
