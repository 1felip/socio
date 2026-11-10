/**
 * Schemas do Agente Cardápio.
 *
 * Etapa 1 (vision) devolve `MenuExtraction`: o que está escrito na foto, sem embelezar.
 * Etapa 2 (orchestrator) devolve `MenuRefinement`: só nome, descrição e alérgenos por índice.
 * Preço, complementos e flags nunca passam pelo modelo na etapa 2: o código monta o `MenuDraft`.
 *
 * Campos do modelo usam `nullable` em vez de `optional` (saída estruturada estrita exige todos).
 */
import { z } from 'zod';

export const ALLERGENS = [
  'gluten',
  'lactose',
  'ovo',
  'amendoim',
  'castanhas',
  'soja',
  'peixe',
  'crustaceos',
] as const;
export const Allergen = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof Allergen>;

const cents = z.number().int().min(0).max(10_000_000);

export const ComplementOption = z.object({
  name: z.string().min(1),
  /** Acréscimo em centavos (0 quando grátis ou sem preço na foto). */
  price_cents: cents,
});

export const ComplementGroup = z.object({
  name: z.string().min(1),
  min: z.number().int().min(0),
  max: z.number().int().min(0),
  options: z.array(ComplementOption),
});
export type ComplementGroup = z.infer<typeof ComplementGroup>;

// ---- Etapa 1: extração ----

export const ExtractedItem = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  /** Preço como aparece na foto ("R$ 32,90"), para auditoria. */
  price_text: z.string().nullable(),
  price_cents: cents.nullable(),
  complement_groups: z.array(ComplementGroup),
  /** 0–1: quão legível estava o item na foto. */
  confidence: z.number().min(0).max(1),
});
export type ExtractedItem = z.infer<typeof ExtractedItem>;

export const MenuExtraction = z.object({
  /** false quando a imagem não é um cardápio (ou está ilegível). */
  is_menu: z.boolean(),
  categories: z.array(
    z.object({
      name: z.string().min(1),
      items: z.array(ExtractedItem),
    }),
  ),
  notes: z.string().nullable(),
});
export type MenuExtraction = z.infer<typeof MenuExtraction>;

// ---- Etapa 2: padronização ----

export const RefinedItem = z.object({
  category_index: z.number().int().min(0),
  item_index: z.number().int().min(0),
  name: z.string().min(1).max(80),
  description: z.string().max(200),
  allergens: z.array(Allergen),
});
export type RefinedItem = z.infer<typeof RefinedItem>;

export const MenuRefinement = z.object({
  categories: z.array(z.object({ index: z.number().int().min(0), name: z.string().min(1) })),
  items: z.array(RefinedItem),
});
export type MenuRefinement = z.infer<typeof MenuRefinement>;

// ---- Saída final ----

export const DraftItem = z.object({
  name: z.string().min(1),
  /** Nome como estava na foto, para o dono conferir. */
  source_name: z.string(),
  description: z.string(),
  price_cents: cents.nullable(),
  complement_groups: z.array(ComplementGroup),
  /** Possíveis alérgenos (inferidos pelo nome/descrição): o dono confirma. */
  allergens: z.array(Allergen),
  price_outlier: z.boolean(),
  low_confidence: z.boolean(),
});
export type DraftItem = z.infer<typeof DraftItem>;

export const MenuDraft = z.object({
  categories: z.array(
    z.object({
      name: z.string().min(1),
      items: z.array(DraftItem),
    }),
  ),
  /** Avisos em pt-BR para o dono (item ilegível, preço estranho...). */
  warnings: z.array(z.string()),
});
export type MenuDraft = z.infer<typeof MenuDraft>;
