/**
 * Tela de revisão ↔ payload de `catalog.publish`.
 *
 * O formulário manda JSON (preço como texto digitado e a categoria do iFood escolhida
 * para cada categoria do rascunho). Aqui o servidor valida tudo de novo: categorias
 * precisam existir no catálogo real e o resultado passa pelo schema do T07.
 */
import { Allergen, CatalogPublishPayload, ComplementGroup, type MenuDraft } from '@socio/agents';
import { z } from 'zod';
import type { CatalogTarget } from './backend/types.ts';
import { formatBRL, parsePriceToCents } from './money.ts';

const FormItem = z.object({
  name: z.string().trim(),
  source_name: z.string().max(200),
  description: z.string().trim(),
  price: z.string().max(30),
  complement_groups: z.array(ComplementGroup).max(30),
  allergens: z.array(Allergen),
  price_outlier: z.boolean(),
  low_confidence: z.boolean(),
});
export type FormItem = z.infer<typeof FormItem>;

const FormCategory = z.object({
  name: z.string().trim(),
  targetCategoryId: z.string(),
  items: z.array(FormItem).max(300),
});
export type FormCategory = z.infer<typeof FormCategory>;

export const ReviewForm = z.object({ categories: z.array(FormCategory).max(50) });
export type ReviewForm = z.infer<typeof ReviewForm>;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

/** Estado inicial da tela: preço formatado e categoria do iFood com o mesmo nome, se houver. */
export function draftToForm(draft: MenuDraft, target: CatalogTarget | null): ReviewForm {
  return {
    categories: draft.categories.map((c) => ({
      name: c.name,
      targetCategoryId: target?.categories.find((t) => norm(t.name) === norm(c.name))?.id ?? '',
      items: c.items.map((i) => ({
        name: i.name,
        source_name: i.source_name,
        description: i.description,
        price: i.price_cents === null ? '' : formatBRL(i.price_cents).replace('R$ ', ''),
        complement_groups: i.complement_groups,
        allergens: i.allergens,
        price_outlier: i.price_outlier,
        low_confidence: i.low_confidence,
      })),
    })),
  };
}

export type BuildResult = { ok: true; value: CatalogPublishPayload } | { ok: false; error: string };

export function buildPublishPayload(
  formJson: string,
  target: CatalogTarget,
  warnings: string[] = [],
): BuildResult {
  let raw: unknown;
  try {
    raw = JSON.parse(formJson);
  } catch {
    return { ok: false, error: 'Formulário inválido. Recarregue a página.' };
  }
  const form = ReviewForm.safeParse(raw);
  if (!form.success) return { ok: false, error: 'Formulário inválido. Recarregue a página.' };

  const known = new Set(target.categories.map((c) => c.id));
  const problems: string[] = [];
  const draft: MenuDraft = { categories: [], warnings };
  const categoryIds: string[] = [];

  for (const cat of form.data.categories) {
    if (cat.items.length === 0) continue;
    if (!known.has(cat.targetCategoryId)) {
      problems.push(`Escolha onde "${cat.name || 'sem nome'}" entra no cardápio.`);
      continue;
    }
    const items = cat.items.map((item) => {
      const cents = parsePriceToCents(item.price);
      if (cents === null) problems.push(`Preço inválido em "${item.name || 'sem nome'}".`);
      if (!item.name) problems.push('Tem item sem nome.');
      const { price: _price, ...rest } = item;
      return { ...rest, price_cents: cents };
    });
    draft.categories.push({ name: cat.name || 'Sem nome', items });
    categoryIds.push(cat.targetCategoryId);
  }
  if (problems.length > 0) return { ok: false, error: problems.slice(0, 5).join(' ') };

  const parsed = CatalogPublishPayload.safeParse({
    catalogId: target.catalogId,
    categoryIds,
    draft,
  });
  if (!parsed.success) {
    const msgs = [...new Set(parsed.error.issues.map((i) => i.message))].slice(0, 5);
    return { ok: false, error: msgs.join(' ') };
  }
  return { ok: true, value: parsed.data };
}
