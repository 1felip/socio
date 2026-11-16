import {
  createMemoryStore,
  DEMO_MERCHANT_ID,
  demoSeed,
  MissingApprovalError,
  MockIfoodClient,
} from '@socio/ifood-client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApprovalError,
  type ApprovalService,
  createApprovalService,
  MemoryApprovalStore,
} from '../approvals/service.ts';
import {
  createPromoPublisher,
  type PromoCreatePayload,
  PromoMarginError,
  type PromoStoreData,
  proposePromoCreate,
} from './create.ts';
import { ELASTICITY, MAX_UPLIFT, promoPrice, simulatePromo } from './simulate.ts';

const MERCHANT = 'merchant-a';
const OWNER = 'user-a';
const T0 = new Date('2026-11-16T12:00:00Z');

describe('promo.simulate', () => {
  const item = { id: 'i1', name: 'Pizza', priceCents: 5000, costCents: 2000, weeklyUnits: 100 };

  it('calcula margem antes e depois, volume suposto e empate', () => {
    const sim = simulatePromo({ items: [item], discountPct: 20, minMarginPct: 30 });
    const r = sim.items[0];
    expect(r?.promoPriceCents).toBe(4000);
    expect(r?.marginPctBefore).toBe(60);
    expect(r?.marginPctAfter).toBe(50);
    expect(r?.expectedUpliftPct).toBe(ELASTICITY * 20);
    // Lucro por unidade 3000 → 2000: precisa vender 50% a mais para empatar.
    expect(r?.breakEvenUpliftPct).toBe(50);
    expect(r?.weeklyProfitBeforeCents).toBe(300_000);
    expect(r?.weeklyProfitAfterCents).toBe(Math.round(100 * 1.3 * 2000));
    expect(sim.ok).toBe(true);
  });

  it('desconta a comissão da margem', () => {
    const sim = simulatePromo({
      items: [item],
      discountPct: 20,
      minMarginPct: 30,
      commissionPct: 25,
    });
    // (4000 - 2000 - 1000) / 4000
    expect(sim.items[0]?.marginPctAfter).toBe(25);
    expect(sim.items[0]?.status).toBe('below_min_margin');
    expect(sim.ok).toBe(false);
  });

  it('bloqueia item sem custo e respeita o teto de volume', () => {
    const sim = simulatePromo({
      items: [{ ...item, costCents: null }],
      discountPct: 70,
      minMarginPct: 0,
    });
    expect(sim.items[0]?.status).toBe('missing_cost');
    expect(sim.items[0]?.expectedUpliftPct).toBe(MAX_UPLIFT * 100);
    expect(sim.ok).toBe(false);
  });

  it('marca margem negativa e recusa desconto inválido', () => {
    const sim = simulatePromo({
      items: [{ ...item, costCents: 4500 }],
      discountPct: 20,
      minMarginPct: 0,
    });
    expect(sim.items[0]?.marginPctAfter).toBe(-12.5);
    expect(sim.items[0]?.breakEvenUpliftPct).toBeNull();
    expect(() => simulatePromo({ items: [item], discountPct: 0, minMarginPct: 30 })).toThrow();
    expect(() => simulatePromo({ items: [item], discountPct: 71, minMarginPct: 30 })).toThrow();
    expect(promoPrice(4990, 15)).toBe(4242);
  });
});

describe('promo.create', () => {
  let clock: Date;
  let approvals: ApprovalService;
  let ifood: MockIfoodClient;
  let calls: number;
  let costs: Record<string, number | null>;
  let minMargin: number;

  const catalog: Record<string, { name: string; priceCents: number }> = {
    'item-margherita': { name: 'Pizza Margherita', priceCents: 5490 },
    'item-calabresa': { name: 'Pizza Calabresa', priceCents: 4990 },
  };

  const data: PromoStoreData = {
    async resolveItems(merchantId, ids) {
      if (merchantId !== MERCHANT) return [];
      return ids.flatMap((id) => {
        const c = catalog[id];
        return c ? [{ id, ...c, costCents: costs[id] ?? null }] : [];
      });
    },
    async resolveMinMarginPct() {
      return minMargin;
    },
  };

  const payload: PromoCreatePayload = {
    name: 'Semana da pizza',
    discountPct: 15,
    itemIds: ['item-margherita', 'item-calabresa'],
    startDate: '2026-11-18',
    endDate: '2026-11-24',
  };

  function publisher() {
    return createPromoPublisher({
      approvals,
      ifood,
      data,
      resolveIfoodMerchantId: async () => DEMO_MERCHANT_ID,
      now: () => clock,
    });
  }

  async function approved(p: PromoCreatePayload = payload) {
    const { approval } = await proposePromoCreate(approvals, data, {
      merchantId: MERCHANT,
      payload: p,
      now: clock,
    });
    clock = new Date(T0.getTime() + 5 * 60_000);
    const { token } = await approvals.approve({
      approvalId: approval.id,
      merchantId: MERCHANT,
      userId: OWNER,
    });
    return { id: approval.id, token };
  }

  async function expectCode(p: Promise<unknown>, code: string) {
    await expect(p).rejects.toBeInstanceOf(ApprovalError);
    await expect(p).rejects.toMatchObject({ code });
  }

  beforeEach(() => {
    clock = T0;
    approvals = createApprovalService({
      store: new MemoryApprovalStore(() => clock),
      now: () => clock,
    });
    ifood = new MockIfoodClient(createMemoryStore(structuredClone(demoSeed)), () => clock);
    costs = { 'item-margherita': 2200, 'item-calabresa': 2000 };
    minMargin = 30;
    calls = 0;
    const original = ifood.createPromotion.bind(ifood);
    ifood.createPromotion = async (...args) => {
      calls++;
      return original(...args);
    };
  });

  it('cria a promoção com aprovação válida e é idempotente pelo id', async () => {
    const { id, token } = await approved();
    const res = await publisher().create({
      merchantId: MERCHANT,
      approvalId: id,
      approvalToken: token,
      payload,
    });
    expect(res.promotion).toMatchObject({
      discountPercent: 15,
      itemIds: payload.itemIds,
      status: 'SCHEDULED',
    });
    expect(await ifood.listPromotions(DEMO_MERCHANT_ID)).toHaveLength(1);
    expect((await approvals.get(id, MERCHANT))?.status).toBe('executed');
  });

  it('o resumo da aprovação mostra a margem com desconto', async () => {
    const { approval } = await proposePromoCreate(approvals, data, {
      merchantId: MERCHANT,
      payload,
      now: clock,
    });
    expect(approval.summary).toContain('15% off em 2 itens');
    expect(approval.summary).toContain('mínimo 30%');
  });

  it('não cria aprovação abaixo da margem mínima ou sem custo', async () => {
    minMargin = 55;
    await expect(
      proposePromoCreate(approvals, data, { merchantId: MERCHANT, payload, now: clock }),
    ).rejects.toThrow(/abaixo da margem mínima de 55%/);
    minMargin = 30;
    costs['item-calabresa'] = null;
    await expect(
      proposePromoCreate(approvals, data, { merchantId: MERCHANT, payload, now: clock }),
    ).rejects.toThrow(/sem custo cadastrado: Pizza Calabresa/);
    expect(await approvals.list(MERCHANT)).toHaveLength(0);
  });

  it('recusa item que não é da loja, período inválido e nome com link', async () => {
    await expect(
      proposePromoCreate(approvals, data, {
        merchantId: MERCHANT,
        payload: { ...payload, itemIds: ['item-margherita', 'item-x'] },
        now: clock,
      }),
    ).rejects.toThrow(/não encontrado.*item-x/);
    await expect(
      proposePromoCreate(approvals, data, {
        merchantId: MERCHANT,
        payload: { ...payload, startDate: '2026-11-10' },
        now: clock,
      }),
    ).rejects.toBeInstanceOf(PromoMarginError);
    await expect(
      proposePromoCreate(approvals, data, {
        merchantId: MERCHANT,
        payload: { ...payload, endDate: '2026-12-31' },
        now: clock,
      }),
    ).rejects.toThrow(/no máximo 30 dias/);
    await expect(
      proposePromoCreate(approvals, data, {
        merchantId: MERCHANT,
        payload: { ...payload, name: 'Veja www.golpe.com' },
        now: clock,
      }),
    ).rejects.toThrow(/link/);
  });

  it('falha sem aprovação (serviço e client)', async () => {
    await expectCode(
      publisher().create({
        merchantId: MERCHANT,
        approvalId: undefined,
        approvalToken: undefined,
        payload,
      }),
      'missing_approval',
    );
    await expect(
      ifood.createPromotion(
        DEMO_MERCHANT_ID,
        {
          id: 'p1',
          name: 'x',
          type: 'PERCENTAGE',
          discountPercent: 10,
          itemIds: ['item-margherita'],
          startDate: '2026-11-18',
          endDate: '2026-11-20',
        },
        { approvalId: '' },
      ),
    ).rejects.toBeInstanceOf(MissingApprovalError);
    expect(await ifood.listPromotions(DEMO_MERCHANT_ID)).toHaveLength(0);
  });

  it('falha com token reutilizado', async () => {
    const { id, token } = await approved();
    const input = { merchantId: MERCHANT, approvalId: id, approvalToken: token, payload };
    await publisher().create(input);
    await expectCode(publisher().create(input), 'already_used');
    expect(calls).toBe(1);
  });

  it('falha com token expirado', async () => {
    const { id, token } = await approved();
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    await expectCode(
      publisher().create({ merchantId: MERCHANT, approvalId: id, approvalToken: token, payload }),
      'expired',
    );
    expect(calls).toBe(0);
  });

  it('falha com payload alterado depois da aprovação', async () => {
    const { id, token } = await approved();
    await expectCode(
      publisher().create({
        merchantId: MERCHANT,
        approvalId: id,
        approvalToken: token,
        payload: { ...payload, discountPct: 10 },
      }),
      'payload_mismatch',
    );
    expect(calls).toBe(0);
  });

  it('se o custo subir depois da aprovação, recusa sem consumir o token', async () => {
    const { id, token } = await approved();
    costs['item-margherita'] = 4000;
    const input = { merchantId: MERCHANT, approvalId: id, approvalToken: token, payload };
    await expect(publisher().create(input)).rejects.toBeInstanceOf(PromoMarginError);
    expect(calls).toBe(0);
    expect((await approvals.get(id, MERCHANT))?.status).toBe('approved');

    costs['item-margherita'] = 2200;
    await publisher().create(input);
    expect(calls).toBe(1);
  });

  it('aprovação de outra loja não serve', async () => {
    const { id, token } = await approved();
    await expect(
      publisher().create({
        merchantId: 'merchant-b',
        approvalId: id,
        approvalToken: token,
        payload,
      }),
    ).rejects.toBeInstanceOf(PromoMarginError);
    expect(calls).toBe(0);
  });
});
