/**
 * Publicação do cardápio no catálogo do iFood (kind `catalog.publish`).
 *
 * 1. `proposeCatalogPublish` valida o rascunho e cria a aprovação (nada é escrito).
 * 2. O dono aprova no painel/WhatsApp e o canal recebe o token.
 * 3. `publishCatalog` valida a aprovação (consome o token), converte o MenuDraft
 *    e chama `IfoodClient.upsertItems` item a item; depois grava o `roi_events`.
 *
 * IDs do iFood são derivados do id da aprovação: a mesma aprovação gera sempre os mesmos IDs.
 * O token é consumido antes da escrita (uso único). Se o iFood falhar no meio, o erro diz
 * quantos itens subiram e é preciso uma nova aprovação para o restante.
 */
import { createHash } from 'node:crypto';
import type { IfoodClient, schemas } from '@socio/ifood-client';
import { z } from 'zod';
import type { Approval, ApprovalService } from '../approvals/service.ts';
import { MenuDraft } from '../menu/schema.ts';
import { buildRoiEvent, type RoiConfig, type RoiStore } from '../roi/roi.ts';

export const CATALOG_PUBLISH = 'catalog.publish' as const;

export const MAX_NAME = 80;
export const MAX_DESCRIPTION = 200;
export const MAX_ITEMS = 300;

// biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que bloqueamos.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/;
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|br|io|me|ly)\b)/i;

/** Motivo para recusar um texto do rascunho, ou null se ele pode ir ao iFood. */
export function textProblem(value: string, max: number): string | null {
  if (value.length > max) return `passa de ${max} caracteres.`;
  if (CONTROL_CHARS.test(value)) return 'tem caracteres invisíveis ou de controle.';
  if (LINK.test(value)) return 'não pode ter link ou endereço de site.';
  return null;
}

export const CatalogPublishPayload = z
  .object({
    catalogId: z.string().min(1),
    /** ID da categoria no iFood para cada categoria do rascunho, na mesma ordem. */
    categoryIds: z.array(z.string().min(1)),
    draft: MenuDraft,
  })
  .superRefine((p, ctx) => {
    if (p.categoryIds.length !== p.draft.categories.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['categoryIds'],
        message: 'Cada categoria do rascunho precisa de uma categoria no iFood.',
      });
    }
    // Texto veio de foto de terceiros: limita tamanho e bloqueia controle e links antes do iFood.
    const text = (value: string, max: number, path: Array<string | number>) => {
      const problem = textProblem(value, max);
      if (problem)
        ctx.addIssue({ code: 'custom', path, message: `"${value.slice(0, 40)}": ${problem}` });
    };
    let total = 0;
    p.draft.categories.forEach((cat, ci) => {
      const base = ['draft', 'categories', ci];
      text(cat.name, MAX_NAME, [...base, 'name']);
      cat.items.forEach((item, ii) => {
        total++;
        const at = [...base, 'items', ii];
        text(item.name, MAX_NAME, [...at, 'name']);
        text(item.description, MAX_DESCRIPTION, [...at, 'description']);
        item.complement_groups.forEach((g, gi) => {
          text(g.name, MAX_NAME, [...at, 'complement_groups', gi, 'name']);
          g.options.forEach((o, oi) => {
            text(o.name, MAX_NAME, [...at, 'complement_groups', gi, 'options', oi, 'name']);
          });
        });
        if (item.price_cents === null) {
          ctx.addIssue({
            code: 'custom',
            path: [...at, 'price_cents'],
            message: `"${item.name.slice(0, 40)}" está sem preço.`,
          });
        }
      });
    });
    if (total === 0) {
      ctx.addIssue({ code: 'custom', path: ['draft'], message: 'O rascunho não tem itens.' });
    }
    if (total > MAX_ITEMS) {
      ctx.addIssue({
        code: 'custom',
        path: ['draft'],
        message: `Máximo de ${MAX_ITEMS} itens por publicação.`,
      });
    }
  });
export type CatalogPublishPayload = z.infer<typeof CatalogPublishPayload>;

export class CatalogPublishError extends Error {
  readonly published: number;
  readonly total: number;

  /** Só o tipo do erro do iFood (ex.: "IfoodHttpError"): o erro bruto pode trazer o corpo enviado. */
  readonly reason: string;

  constructor(message: string, published: number, total: number, reason: string) {
    super(message);
    this.name = 'CatalogPublishError';
    this.published = published;
    this.total = total;
    this.reason = reason;
  }
}

function countItems(draft: MenuDraft): number {
  return draft.categories.reduce((n, c) => n + c.items.length, 0);
}

function reais(cents: number): number {
  return Math.round(cents) / 100;
}

/** UUID estável derivado de uma semente (formato v5-like). */
export function stableId(...parts: Array<string | number>): string {
  const h = createHash('sha256').update(parts.join(':')).digest('hex');
  const variant = ((Number.parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Converte o rascunho aprovado em corpos de PUT /items (um por item). */
export function draftToItemUpserts(
  payload: CatalogPublishPayload,
  seed: string,
): schemas.ItemUpsert[] {
  const out: schemas.ItemUpsert[] = [];
  payload.draft.categories.forEach((cat, ci) => {
    const categoryId = payload.categoryIds[ci] as string;
    cat.items.forEach((item, ii) => {
      const id = (kind: string, ...rest: number[]) => stableId(seed, kind, ci, ii, ...rest);
      const productId = id('product');
      const products: schemas.Product[] = [];
      const optionGroups: NonNullable<schemas.ItemUpsert['optionGroups']> = [];
      const options: NonNullable<schemas.ItemUpsert['options']> = [];
      const groupRefs: Array<{ id: string; min: number; max: number }> = [];

      item.complement_groups.forEach((group, gi) => {
        const groupId = id('group', gi);
        const optionIds: string[] = [];
        group.options.forEach((opt, oi) => {
          const optionId = id('option', gi, oi);
          const optionProductId = id('option-product', gi, oi);
          products.push({ id: optionProductId, name: opt.name });
          options.push({
            id: optionId,
            status: 'AVAILABLE',
            productId: optionProductId,
            price: { value: reais(opt.price_cents) },
            index: oi,
          });
          optionIds.push(optionId);
        });
        optionGroups.push({ id: groupId, name: group.name, status: 'AVAILABLE', optionIds });
        groupRefs.push({ id: groupId, min: group.min, max: group.max });
      });

      products.unshift({
        id: productId,
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        ...(groupRefs.length > 0 ? { optionGroups: groupRefs } : {}),
      });

      out.push({
        item: {
          id: id('item'),
          type: 'DEFAULT',
          categoryId,
          status: 'AVAILABLE',
          price: { value: reais(item.price_cents ?? 0) },
          index: ii,
          productId,
        },
        products,
        ...(optionGroups.length > 0 ? { optionGroups, options } : {}),
      });
    });
  });
  return out;
}

export interface ProposeCatalogPublishInput {
  merchantId: string;
  payload: CatalogPublishPayload;
  requestedBy?: string;
}

/** Valida o rascunho e cria a aprovação pendente. Não escreve nada na loja. */
export async function proposeCatalogPublish(
  approvals: ApprovalService,
  input: ProposeCatalogPublishInput,
): Promise<Approval> {
  const payload = CatalogPublishPayload.parse(input.payload);
  const n = countItems(payload.draft);
  const items = payload.draft.categories.flatMap((c) => c.items);
  const outliers = items.filter((i) => i.price_outlier).length;
  const unsure = items.filter((i) => i.low_confidence).length;
  const alerts = [
    outliers > 0 ? `${outliers} com preço fora do padrão` : null,
    unsure > 0 ? `${unsure} lidos com pouca confiança` : null,
    payload.draft.warnings.length > 0 ? `${payload.draft.warnings.length} aviso(s)` : null,
  ].filter(Boolean);
  return approvals.create({
    merchantId: input.merchantId,
    kind: CATALOG_PUBLISH,
    payload,
    summary: `Publicar ${n} ${n === 1 ? 'item' : 'itens'} em ${payload.draft.categories.length} categoria(s) no cardápio.${alerts.length > 0 ? ` Confira antes: ${alerts.join(', ')}.` : ''}`,
    requestedBy: input.requestedBy ?? 'agent:menu',
  });
}

export interface CatalogPublisherDeps {
  approvals: ApprovalService;
  ifood: IfoodClient;
  roi: RoiStore;
  /** merchants.ifood_merchant_id da loja: vem do banco, nunca do payload. */
  resolveIfoodMerchantId: (merchantId: string) => Promise<string>;
  roiConfig?: RoiConfig;
  now?: () => Date;
}

export interface PublishInput {
  merchantId: string;
  approvalId: string | undefined;
  approvalToken: string | undefined;
  /** O payload que o canal mostra/executa: precisa bater com o hash aprovado. */
  payload: unknown;
}

export interface PublishResult {
  approvalId: string;
  itemsPublished: number;
  roiRecorded: boolean;
}

export function createCatalogPublisher(deps: CatalogPublisherDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async publish(input: PublishInput): Promise<PublishResult> {
      // Tudo que pode falhar antes da escrita roda antes de consumir o token.
      CatalogPublishPayload.parse(input.payload);
      const ifoodMerchantId = await deps.resolveIfoodMerchantId(input.merchantId);

      const approval = await deps.approvals.authorize({
        approvalId: input.approvalId,
        approvalToken: input.approvalToken,
        merchantId: input.merchantId,
        kind: CATALOG_PUBLISH,
        payload: input.payload,
      });

      // Executa o payload guardado (idêntico ao pedido: o hash já foi comparado).
      const payload = CatalogPublishPayload.parse(approval.payload);
      const bodies = draftToItemUpserts(payload, approval.id);
      const ref = { approvalId: approval.id };

      let published = 0;
      for (const body of bodies) {
        try {
          await deps.ifood.upsertItems(ifoodMerchantId, body, ref);
        } catch (err) {
          throw new CatalogPublishError(
            `Falha ao publicar no iFood: ${published} de ${bodies.length} itens subiram. Gere uma nova aprovação para o restante.`,
            published,
            bodies.length,
            err instanceof Error ? err.name : 'unknown',
          );
        }
        published++;
      }

      let roiRecorded = true;
      try {
        await deps.roi.record(
          buildRoiEvent({
            merchantId: input.merchantId,
            kind: CATALOG_PUBLISH,
            refId: approval.id,
            units: published,
            flowDurationMs: now().getTime() - approval.createdAt.getTime(),
            ...(deps.roiConfig ? { config: deps.roiConfig } : {}),
          }),
        );
      } catch {
        // A escrita na loja já aconteceu: falha de métrica não desfaz nem bloqueia.
        roiRecorded = false;
      }

      return { approvalId: approval.id, itemsPublished: published, roiRecorded };
    },
  };
}
