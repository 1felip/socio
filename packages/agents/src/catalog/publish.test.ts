import {
  createMemoryStore,
  DEMO_CATALOG_ID,
  DEMO_MERCHANT_ID,
  demoSeed,
  type IfoodClient,
  MockIfoodClient,
} from '@socio/ifood-client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ApprovalError,
  type ApprovalService,
  createApprovalService,
  hashPayload,
  MemoryApprovalStore,
} from '../approvals/service.ts';
import type { MenuDraft } from '../menu/schema.ts';
import { DEFAULT_MANUAL_MINUTES, MemoryRoiStore, ROI_ESTIMATE_SOURCE } from '../roi/roi.ts';
import {
  CatalogPublishError,
  type CatalogPublishPayload,
  createCatalogPublisher,
  draftToItemUpserts,
  proposeCatalogPublish,
} from './publish.ts';

const MERCHANT = 'merchant-a';
const OTHER_MERCHANT = 'merchant-b';
const OWNER = 'user-a';
const T0 = new Date('2026-11-10T12:00:00Z');

const draft: MenuDraft = {
  categories: [
    {
      name: 'Pizzas',
      items: [
        {
          name: 'Pizza Margherita',
          source_name: 'PIZZA MARGUERITA',
          description: 'Molho de tomate, muçarela e manjericão.',
          price_cents: 4990,
          complement_groups: [
            {
              name: 'Borda',
              min: 0,
              max: 1,
              options: [
                { name: 'Catupiry', price_cents: 800 },
                { name: 'Cheddar', price_cents: 700 },
              ],
            },
          ],
          allergens: ['gluten', 'lactose'],
          price_outlier: false,
          low_confidence: false,
        },
        {
          name: 'Pizza Calabresa',
          source_name: 'CALABRESA',
          description: '',
          price_cents: 4590,
          complement_groups: [],
          allergens: ['gluten'],
          price_outlier: false,
          low_confidence: false,
        },
      ],
    },
  ],
  warnings: [],
};

const payload: CatalogPublishPayload = {
  catalogId: DEMO_CATALOG_ID,
  categoryIds: ['cat-pizzas'],
  draft,
};

let clock: Date;
let approvals: ApprovalService;
let ifood: MockIfoodClient;
let roi: MemoryRoiStore;
let calls: number;

function publisher(client: IfoodClient = ifood) {
  return createCatalogPublisher({
    approvals,
    ifood: client,
    roi,
    resolveIfoodMerchantId: async () => DEMO_MERCHANT_ID,
    now: () => clock,
  });
}

async function approved() {
  const a = await proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload });
  clock = new Date(T0.getTime() + 5 * 60_000);
  const { token } = await approvals.approve({
    approvalId: a.id,
    merchantId: MERCHANT,
    userId: OWNER,
  });
  return { id: a.id, token };
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(ApprovalError);
  await expect(p).rejects.toMatchObject({ code });
}

async function pizzaNames() {
  const cats = await ifood.listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID);
  return cats.find((c) => c.id === 'cat-pizzas')?.items.map((i) => i.name) ?? [];
}

beforeEach(() => {
  clock = T0;
  approvals = createApprovalService({
    store: new MemoryApprovalStore(() => clock),
    now: () => clock,
  });
  ifood = new MockIfoodClient(createMemoryStore(structuredClone(demoSeed)));
  roi = new MemoryRoiStore();
  calls = 0;
  const original = ifood.upsertItems.bind(ifood);
  ifood.upsertItems = async (...args) => {
    calls++;
    return original(...args);
  };
});

describe('catalog.publish', () => {
  it('publica com aprovação válida, consome o token e grava ROI', async () => {
    const { id, token } = await approved();
    clock = new Date(T0.getTime() + 8 * 60_000);

    const res = await publisher().publish({
      merchantId: MERCHANT,
      approvalId: id,
      approvalToken: token,
      payload,
    });

    expect(res).toEqual({ approvalId: id, itemsPublished: 2, roiRecorded: true });
    expect(await pizzaNames()).toEqual(
      expect.arrayContaining(['Pizza Margherita', 'Pizza Calabresa']),
    );
    expect((await approvals.get(id, MERCHANT))?.status).toBe('executed');
    expect(roi.events).toEqual([
      {
        merchantId: MERCHANT,
        kind: 'catalog.publish',
        refId: id,
        manualMinutesEstimate:
          DEFAULT_MANUAL_MINUTES['catalog.publish'].base +
          2 * DEFAULT_MANUAL_MINUTES['catalog.publish'].perUnit,
        estimateSource: ROI_ESTIMATE_SOURCE,
        flowDurationMs: 8 * 60_000,
        minutesSaved: 16 - 8,
      },
    ]);
  });

  it('falha sem aprovação', async () => {
    await expectCode(
      publisher().publish({
        merchantId: MERCHANT,
        approvalId: undefined,
        approvalToken: undefined,
        payload,
      }),
      'missing_approval',
    );
    const pending = await proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload });
    await expectCode(
      publisher().publish({
        merchantId: MERCHANT,
        approvalId: pending.id,
        approvalToken: 'qualquer',
        payload,
      }),
      'not_approved',
    );
    expect(calls).toBe(0);
  });

  it('falha com token reutilizado', async () => {
    const { id, token } = await approved();
    const input = { merchantId: MERCHANT, approvalId: id, approvalToken: token, payload };
    await publisher().publish(input);
    await expectCode(publisher().publish(input), 'already_used');
    expect(calls).toBe(2);
  });

  it('só uma de duas execuções simultâneas passa', async () => {
    const { id, token } = await approved();
    const input = { merchantId: MERCHANT, approvalId: id, approvalToken: token, payload };
    const results = await Promise.allSettled([
      publisher().publish(input),
      publisher().publish(input),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(calls).toBe(2);
  });

  it('falha com token expirado (24 h) e marca a aprovação como expirada', async () => {
    const { id, token } = await approved();
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    await expectCode(
      publisher().publish({ merchantId: MERCHANT, approvalId: id, approvalToken: token, payload }),
      'expired',
    );
    expect((await approvals.get(id, MERCHANT))?.status).toBe('expired');
    expect(calls).toBe(0);
  });

  it('falha com payload alterado depois da aprovação', async () => {
    const { id, token } = await approved();
    const altered = structuredClone(payload);
    (altered.draft.categories[0]?.items[0] as { price_cents: number }).price_cents = 990;
    await expectCode(
      publisher().publish({
        merchantId: MERCHANT,
        approvalId: id,
        approvalToken: token,
        payload: altered,
      }),
      'payload_mismatch',
    );
    expect(calls).toBe(0);
    // O token continua valendo para o payload aprovado.
    await expect(
      publisher().publish({ merchantId: MERCHANT, approvalId: id, approvalToken: token, payload }),
    ).resolves.toMatchObject({ itemsPublished: 2 });
  });

  it('falha com payload adulterado no banco', async () => {
    const store = new MemoryApprovalStore(() => clock);
    approvals = createApprovalService({ store, now: () => clock });
    const { id, token } = await approved();
    const row = store.rows.get(id);
    if (!row) throw new Error('sem linha');
    const tampered = structuredClone(payload);
    tampered.categoryIds = ['cat-outra'];
    row.payload = tampered;
    await expectCode(
      publisher().publish({
        merchantId: MERCHANT,
        approvalId: id,
        approvalToken: token,
        payload,
      }),
      'payload_mismatch',
    );
    expect(calls).toBe(0);
  });

  it('falha na loja errada', async () => {
    const { id, token } = await approved();
    await expectCode(
      publisher().publish({
        merchantId: OTHER_MERCHANT,
        approvalId: id,
        approvalToken: token,
        payload,
      }),
      'not_found',
    );
    expect(calls).toBe(0);
  });

  it('falha com token errado ou de outro tipo de ação', async () => {
    const { id } = await approved();
    await expectCode(
      publisher().publish({
        merchantId: MERCHANT,
        approvalId: id,
        approvalToken: 'token-inventado',
        payload,
      }),
      'invalid_token',
    );
    const reply = await approvals.create({
      merchantId: MERCHANT,
      kind: 'review.reply',
      payload,
      summary: 'x',
      requestedBy: 'agent:reviews',
    });
    const { token } = await approvals.approve({
      approvalId: reply.id,
      merchantId: MERCHANT,
      userId: OWNER,
    });
    await expectCode(
      publisher().publish({
        merchantId: MERCHANT,
        approvalId: reply.id,
        approvalToken: token,
        payload,
      }),
      'wrong_kind',
    );
    expect(calls).toBe(0);
  });

  it('falha com aprovação recusada', async () => {
    const a = await proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload });
    await approvals.reject({ approvalId: a.id, merchantId: MERCHANT, userId: OWNER });
    await expectCode(
      approvals.approve({ approvalId: a.id, merchantId: MERCHANT, userId: OWNER }),
      'invalid_state',
    );
    await expectCode(
      publisher().publish({ merchantId: MERCHANT, approvalId: a.id, approvalToken: 'x', payload }),
      'rejected',
    );
  });

  it('informa quantos itens subiram quando o iFood falha no meio', async () => {
    const { id, token } = await approved();
    let n = 0;
    const flaky: IfoodClient = Object.assign(Object.create(ifood) as MockIfoodClient, {
      upsertItems: async (...args: Parameters<IfoodClient['upsertItems']>) => {
        if (++n === 2) throw new Error('503');
        return ifood.upsertItems(...args);
      },
    });
    const err = await publisher(flaky)
      .publish({ merchantId: MERCHANT, approvalId: id, approvalToken: token, payload })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CatalogPublishError);
    expect(err).toMatchObject({ published: 1, total: 2 });
    expect((await approvals.get(id, MERCHANT))?.status).toBe('executed');
    expect(roi.events).toHaveLength(0);
  });

  it('não quebra a publicação se o ROI falhar', async () => {
    const { id, token } = await approved();
    roi.record = async () => {
      throw new Error('db fora');
    };
    await expect(
      publisher().publish({ merchantId: MERCHANT, approvalId: id, approvalToken: token, payload }),
    ).resolves.toMatchObject({ itemsPublished: 2, roiRecorded: false });
  });
});

describe('proposeCatalogPublish', () => {
  it('cria pendente com resumo e hash do payload, sem token', async () => {
    const a = await proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload });
    expect(a).toMatchObject({
      status: 'pending',
      kind: 'catalog.publish',
      expiresAt: null,
      payloadHash: hashPayload(payload),
      summary: 'Publicar 2 itens em 1 categoria(s) no cardápio.',
    });
    expect(calls).toBe(0);
  });

  it('recusa item sem preço, rascunho vazio e categorias sem mapeamento', async () => {
    const noPrice = structuredClone(payload);
    (noPrice.draft.categories[0]?.items[1] as { price_cents: number | null }).price_cents = null;
    await expect(
      proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload: noPrice }),
    ).rejects.toThrow(/sem preço/);

    const empty = { ...payload, draft: { categories: [{ name: 'X', items: [] }], warnings: [] } };
    await expect(
      proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload: empty }),
    ).rejects.toThrow(/não tem itens/);

    await expect(
      proposeCatalogPublish(approvals, {
        merchantId: MERCHANT,
        payload: { ...payload, categoryIds: [] },
      }),
    ).rejects.toThrow(/categoria no iFood/);
    expect(await approvals.list(MERCHANT)).toHaveLength(0);
  });
});

describe('draftToItemUpserts', () => {
  it('converte preços para reais, complementos para option groups e gera IDs estáveis', () => {
    const a = draftToItemUpserts(payload, 'approval-1');
    expect(a).toEqual(draftToItemUpserts(payload, 'approval-1'));
    expect(a[0]?.item.id).not.toBe(draftToItemUpserts(payload, 'approval-2')[0]?.item.id);

    const [margherita, calabresa] = a;
    expect(margherita?.item).toMatchObject({
      categoryId: 'cat-pizzas',
      price: { value: 49.9 },
      status: 'AVAILABLE',
    });
    expect(margherita?.products[0]).toMatchObject({
      id: margherita?.item.productId,
      name: 'Pizza Margherita',
      optionGroups: [{ min: 0, max: 1 }],
    });
    expect(margherita?.options?.map((o) => o.price.value)).toEqual([8, 7]);
    expect(margherita?.optionGroups?.[0]?.optionIds).toHaveLength(2);
    expect(calabresa?.products).toHaveLength(1);
    expect(calabresa?.products[0]).not.toHaveProperty('description');
    expect(calabresa).not.toHaveProperty('optionGroups');
  });
});

describe('texto de terceiros no rascunho', () => {
  function withName(name: string, description = '') {
    const p = structuredClone(payload);
    const item = p.draft.categories[0]?.items[0];
    if (!item) throw new Error('sem item');
    item.name = name;
    item.description = description;
    return p;
  }

  it.each([
    ['link', withName('Pizza promo em www.golpe.com'), /link/],
    ['controle', withName('Pizza‮azziP'), /invisíveis/],
    ['tamanho', withName('P'.repeat(81)), /80 caracteres/],
    ['descrição', withName('Pizza', 'x'.repeat(201)), /200 caracteres/],
  ])('recusa %s antes de criar a aprovação', async (_label, p, msg) => {
    await expect(
      proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload: p }),
    ).rejects.toThrow(msg);
    expect(await approvals.list(MERCHANT)).toHaveLength(0);
  });

  it('resumo avisa outliers e itens de baixa confiança', async () => {
    const p = structuredClone(payload);
    const [a, b] = p.draft.categories[0]?.items ?? [];
    if (!a || !b) throw new Error('sem itens');
    a.price_outlier = true;
    b.low_confidence = true;
    const approval = await proposeCatalogPublish(approvals, { merchantId: MERCHANT, payload: p });
    expect(approval.summary).toBe(
      'Publicar 2 itens em 1 categoria(s) no cardápio. Confira antes: 1 com preço fora do padrão, 1 lidos com pouca confiança.',
    );
    expect(approval).not.toHaveProperty('tokenHash');
  });

  it('não queima o token se a loja não resolve ou o payload é inválido', async () => {
    const { id, token } = await approved();
    const input = { merchantId: MERCHANT, approvalId: id, approvalToken: token, payload };
    const broken = createCatalogPublisher({
      approvals,
      ifood,
      roi,
      resolveIfoodMerchantId: async () => {
        throw new Error('loja sem vínculo');
      },
      now: () => clock,
    });
    await expect(broken.publish(input)).rejects.toThrow(/sem vínculo/);
    await expect(publisher().publish({ ...input, payload: { lixo: true } })).rejects.toThrow();
    expect((await approvals.get(id, MERCHANT))?.status).toBe('approved');
    await expect(publisher().publish(input)).resolves.toMatchObject({ itemsPublished: 2 });
  });
});
