/**
 * Criação de promoção (kind `promo.create`), hoje só no mock do iFood.
 *
 * 1. `proposePromoCreate` simula com custo e margem mínima vindos do banco (nunca do payload)
 *    e só cria a aprovação se todos os itens ficarem na margem mínima da loja.
 * 2. O dono aprova no painel/WhatsApp e o canal recebe o token.
 * 3. `createPromoPublisher().create` refaz a simulação com os dados atuais ANTES de consumir
 *    o token (custo ou margem mínima podem ter mudado), valida a aprovação e chama
 *    `IfoodClient.createPromotion` com um id derivado da aprovação (idempotente).
 */
import type { IfoodClient, schemas } from '@socio/ifood-client';
import { z } from 'zod';
import type { Approval, ApprovalService } from '../approvals/service.ts';
import { MAX_NAME, stableId, textProblem } from '../catalog/publish.ts';
import {
  MAX_DISCOUNT_PCT,
  type PromoItemInput,
  type SimulateResult,
  simulatePromo,
} from './simulate.ts';

export const PROMO_CREATE = 'promo.create' as const;
export const MAX_PROMO_DAYS = 30;
export const MAX_PROMO_ITEMS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;
const IsoDate = z.iso.date();

export const PromoCreatePayload = z
  .strictObject({
    name: z.string().trim().min(1),
    discountPct: z.number().int().min(1).max(MAX_DISCOUNT_PCT),
    itemIds: z.array(z.string().min(1)).min(1).max(MAX_PROMO_ITEMS),
    startDate: IsoDate,
    endDate: IsoDate,
  })
  .superRefine((p, ctx) => {
    const problem = textProblem(p.name, MAX_NAME);
    if (problem) ctx.addIssue({ code: 'custom', path: ['name'], message: `Nome ${problem}` });
    if (new Set(p.itemIds).size !== p.itemIds.length) {
      ctx.addIssue({ code: 'custom', path: ['itemIds'], message: 'Item repetido na promoção.' });
    }
    const days = (Date.parse(p.endDate) - Date.parse(p.startDate)) / DAY_MS + 1;
    if (days < 1) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'O fim vem antes do início.' });
    } else if (days > MAX_PROMO_DAYS) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: `Promoção de no máximo ${MAX_PROMO_DAYS} dias.`,
      });
    }
  });
export type PromoCreatePayload = z.infer<typeof PromoCreatePayload>;

/** Dados confiáveis da loja (banco), nunca do payload ou do modelo. */
export interface PromoStoreData {
  /** Itens com preço e custo atuais. Item ausente = não existe na loja. */
  resolveItems(merchantId: string, itemIds: string[]): Promise<PromoItemInput[]>;
  /** `merchants.min_margin_pct`. */
  resolveMinMarginPct(merchantId: string): Promise<number>;
  /** % de comissão para a margem (opcional; padrão 0). */
  resolveCommissionPct?(merchantId: string): Promise<number>;
}

export class PromoMarginError extends Error {
  readonly simulation: SimulateResult | null;
  constructor(message: string, simulation: SimulateResult | null = null) {
    super(message);
    this.name = 'PromoMarginError';
    this.simulation = simulation;
  }
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

const pct = (n: number | null) => (n === null ? '?' : `${String(n).replace('.', ',')}%`);

/** Simula com os dados do banco e lança se algum item fura a margem ou não tem custo. */
export async function checkPromoMargin(
  data: PromoStoreData,
  merchantId: string,
  payload: PromoCreatePayload,
): Promise<SimulateResult> {
  const items = await data.resolveItems(merchantId, payload.itemIds);
  const found = new Set(items.map((i) => i.id));
  const missing = payload.itemIds.filter((id) => !found.has(id));
  if (missing.length > 0 || items.length !== payload.itemIds.length) {
    throw new PromoMarginError(`Item não encontrado na loja: ${missing.join(', ') || '?'}.`);
  }
  const sim = simulatePromo({
    items,
    discountPct: payload.discountPct,
    minMarginPct: await data.resolveMinMarginPct(merchantId),
    commissionPct: (await data.resolveCommissionPct?.(merchantId)) ?? 0,
  });
  if (!sim.ok) {
    const noCost = sim.items.filter((i) => i.status === 'missing_cost').map((i) => i.name);
    const low = sim.items
      .filter((i) => i.status === 'below_min_margin')
      .map((i) => `${i.name} (${pct(i.marginPctAfter)})`);
    const parts = [
      noCost.length > 0 ? `sem custo cadastrado: ${noCost.join(', ')}` : null,
      low.length > 0
        ? `abaixo da margem mínima de ${pct(sim.minMarginPct)}: ${low.join(', ')}`
        : null,
    ].filter(Boolean);
    throw new PromoMarginError(`Não dá para fazer essa promoção: ${parts.join('; ')}.`, sim);
  }
  return sim;
}

export interface ProposePromoInput {
  merchantId: string;
  payload: PromoCreatePayload;
  requestedBy?: string;
  now?: Date;
}

/** Valida, simula e cria a aprovação pendente. Não escreve nada na loja. */
export async function proposePromoCreate(
  approvals: ApprovalService,
  data: PromoStoreData,
  input: ProposePromoInput,
): Promise<{ approval: Approval; simulation: SimulateResult }> {
  const payload = PromoCreatePayload.parse(input.payload);
  if (payload.startDate < today(input.now ?? new Date())) {
    throw new PromoMarginError('A promoção não pode começar no passado.');
  }
  const simulation = await checkPromoMargin(data, input.merchantId, payload);
  const margins = simulation.items
    .slice(0, 5)
    .map((i) => `${i.name} ${pct(i.marginPctAfter)}`)
    .join(', ');
  const more = simulation.items.length > 5 ? ` e mais ${simulation.items.length - 5}` : '';
  const n = payload.itemIds.length;
  const approval = await approvals.create({
    merchantId: input.merchantId,
    kind: PROMO_CREATE,
    payload,
    summary: `Promoção "${payload.name}": ${payload.discountPct}% off em ${n} ${n === 1 ? 'item' : 'itens'}, de ${payload.startDate} a ${payload.endDate}. Margem com desconto: ${margins}${more} (mínimo ${pct(simulation.minMarginPct)}).`,
    requestedBy: input.requestedBy ?? 'agent:promo',
  });
  return { approval, simulation };
}

export interface PromoPublisherDeps {
  approvals: ApprovalService;
  ifood: IfoodClient;
  data: PromoStoreData;
  /** merchants.ifood_merchant_id da loja: vem do banco, nunca do payload. */
  resolveIfoodMerchantId: (merchantId: string) => Promise<string>;
  now?: () => Date;
}

export interface CreatePromoInput {
  merchantId: string;
  approvalId: string | undefined;
  approvalToken: string | undefined;
  /** O payload que o canal executa: precisa bater com o hash aprovado. */
  payload: unknown;
}

export interface CreatePromoResult {
  approvalId: string;
  promotion: schemas.Promotion;
}

export function createPromoPublisher(deps: PromoPublisherDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async create(input: CreatePromoInput): Promise<CreatePromoResult> {
      // Tudo que pode recusar roda antes de consumir o token.
      const requested = PromoCreatePayload.parse(input.payload);
      if (requested.endDate < today(now())) {
        throw new PromoMarginError('O período da promoção já terminou. Gere uma nova.');
      }
      await checkPromoMargin(deps.data, input.merchantId, requested);
      const ifoodMerchantId = await deps.resolveIfoodMerchantId(input.merchantId);

      const approval = await deps.approvals.authorize({
        approvalId: input.approvalId,
        approvalToken: input.approvalToken,
        merchantId: input.merchantId,
        kind: PROMO_CREATE,
        payload: input.payload,
      });

      const payload = PromoCreatePayload.parse(approval.payload);
      const promotion = await deps.ifood.createPromotion(
        ifoodMerchantId,
        {
          id: stableId(approval.id, 'promo'),
          name: payload.name,
          type: 'PERCENTAGE',
          discountPercent: payload.discountPct,
          itemIds: payload.itemIds,
          startDate: payload.startDate,
          endDate: payload.endDate,
        },
        { approvalId: approval.id },
      );
      return { approvalId: approval.id, promotion };
    },
  };
}
