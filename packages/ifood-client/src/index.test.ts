import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  createMemoryStore,
  DEMO_CATALOG_ID,
  DEMO_MERCHANT_ID,
  DEMO_ORDER_ID,
  demoSeed,
  getIfoodClient,
  IfoodNotFoundError,
  MissingApprovalError,
  MockIfoodClient,
  NotConfiguredError,
  RealIfoodClient,
  schemas,
} from './index';

interface OpenApiObject {
  type?: string;
  required?: string[];
  properties?: Record<string, unknown>;
}
const openapi = parseYaml(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as {
  components: { schemas: Record<string, OpenApiObject> };
};
const zodSchemas = schemas as unknown as Record<string, z.ZodType>;

const newClient = () =>
  new MockIfoodClient(createMemoryStore(demoSeed), () => new Date('2026-11-09T12:00:00-03:00'));
const approval = { approvalId: 'appr-test-1' };

describe('contrato: openapi.yaml × schemas Zod', () => {
  const objectComponents = Object.entries(openapi.components.schemas).filter(
    ([, s]) => s.type === 'object',
  );

  it('openapi tem componentes de objeto', () => {
    expect(objectComponents.length).toBeGreaterThan(15);
  });

  it.each(objectComponents)('%s: mesmos campos e obrigatórios', (name, component) => {
    const zod = zodSchemas[name];
    expect(zod, `schema Zod ${name} ausente`).toBeInstanceOf(z.ZodObject);
    const shape = (zod as z.ZodObject).shape as Record<string, z.ZodType>;
    expect(Object.keys(shape).sort()).toEqual(Object.keys(component.properties ?? {}).sort());
    const requiredInZod = Object.entries(shape)
      .filter(([, field]) => !field.safeParse(undefined).success)
      .map(([key]) => key)
      .sort();
    expect(requiredInZod).toEqual([...(component.required ?? [])].sort());
  });
});

describe('MockIfoodClient: respostas validam no contrato', () => {
  it('merchant', async () => {
    const c = newClient();
    expect(schemas.MerchantSummary.array().parse(await c.listMerchants())).toHaveLength(1);
    const status = await c.getMerchantStatus(DEMO_MERCHANT_ID);
    expect(schemas.MerchantStatus.array().parse(status)[0]?.available).toBe(true);
  });

  it('catálogo', async () => {
    const c = newClient();
    const catalogs = schemas.Catalog.array().parse(await c.listCatalogs(DEMO_MERCHANT_ID));
    expect(catalogs[0]?.catalogId).toBe(DEMO_CATALOG_ID);
    const cats = schemas.Category.array().parse(
      await c.listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID),
    );
    expect(cats.flatMap((x) => x.items).length).toBe(3);
  });

  it('avaliações: paginação, filtro por data e ordem decrescente', async () => {
    const c = newClient();
    const page = schemas.ReviewPage.parse(await c.listReviews(DEMO_MERCHANT_ID, { pageSize: 2 }));
    expect(page).toMatchObject({ total: 3, pageCount: 2, size: 2 });
    expect(page.reviews.map((r) => r.id)).toEqual(['rev-001', 'rev-002']);
    const filtered = await c.listReviews(DEMO_MERCHANT_ID, {
      dateFrom: '2026-11-05',
      dateTo: '2026-11-06',
    });
    expect(filtered.reviews.map((r) => r.id)).toEqual(['rev-002']);
  });

  it('pedidos: polling, acknowledgment e detalhe', async () => {
    const c = newClient();
    const events = schemas.OrderEvent.array().parse(await c.pollOrderEvents([DEMO_MERCHANT_ID]));
    expect(events.map((e) => e.code)).toEqual(['PLC', 'CON']);
    await c.acknowledgeOrderEvents(['evt-001']);
    expect((await c.pollOrderEvents()).map((e) => e.id)).toEqual(['evt-002']);
    expect(await c.pollOrderEvents(['outra-loja'])).toEqual([]);
    const order = schemas.Order.parse(await c.getOrder(DEMO_ORDER_ID));
    expect(order.total.orderAmount).toBe(63.88);
    await expect(c.getOrder('nao-existe')).rejects.toBeInstanceOf(IfoodNotFoundError);
  });

  it('financeiro: resumo agregado ignora cancelados', async () => {
    const c = newClient();
    const summary = schemas.FinancialSummary.parse(
      await c.getFinancialSummary(DEMO_MERCHANT_ID, {
        beginDate: '2026-11-01',
        endDate: '2026-11-08',
      }),
    );
    expect(summary).toMatchObject({
      orders: 2,
      cancelledOrders: 1,
      grossRevenue: 176.68,
      netRevenue: 138.02,
      averageTicket: 88.34,
    });
  });

  it('mock rejeita dado fora do contrato vindo da store', async () => {
    const bad = structuredClone(demoSeed);
    (bad.merchants[0] as { name: unknown }).name = 42;
    const c = new MockIfoodClient(createMemoryStore(bad));
    await expect(c.listMerchants()).rejects.toThrow();
  });
});

describe('MockIfoodClient: escrita exige aprovação', () => {
  const body = {
    item: {
      id: 'item-portuguesa',
      type: 'DEFAULT',
      categoryId: 'cat-pizzas',
      status: 'AVAILABLE' as const,
      price: { value: 58 },
      productId: 'prod-portuguesa',
    },
    products: [{ id: 'prod-portuguesa', name: 'Pizza Portuguesa' }],
  };

  it('upsertItems sem approvalId falha e não grava', async () => {
    const c = newClient();
    await expect(c.upsertItems(DEMO_MERCHANT_ID, body, { approvalId: ' ' })).rejects.toBeInstanceOf(
      MissingApprovalError,
    );
    // @ts-expect-error — chamada sem aprovação
    await expect(c.upsertItems(DEMO_MERCHANT_ID, body)).rejects.toBeInstanceOf(
      MissingApprovalError,
    );
    const items = (await c.listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID)).flatMap((x) => x.items);
    expect(items.some((i) => i.id === 'item-portuguesa')).toBe(false);
  });

  it('upsertItems com aprovação cria e depois atualiza o item', async () => {
    const c = newClient();
    await c.upsertItems(DEMO_MERCHANT_ID, body, approval);
    await c.upsertItems(
      DEMO_MERCHANT_ID,
      { ...body, item: { ...body.item, price: { value: 60 } } },
      approval,
    );
    const items = (await c.listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID)).flatMap((x) => x.items);
    expect(items.filter((i) => i.id === 'item-portuguesa').map((i) => i.price.value)).toEqual([60]);
  });

  it('upsertItems rejeita corpo fora do contrato', async () => {
    const c = newClient();
    await expect(
      c.upsertItems(DEMO_MERCHANT_ID, { ...body, products: [] }, approval),
    ).rejects.toThrow();
  });

  it('replyReview sem aprovação falha; com aprovação grava a resposta', async () => {
    const c = newClient();
    await expect(
      c.replyReview(DEMO_MERCHANT_ID, 'rev-001', 'Oi', { approvalId: '' }),
    ).rejects.toBeInstanceOf(MissingApprovalError);
    const answer = schemas.ReviewAnswer.parse(
      await c.replyReview(DEMO_MERCHANT_ID, 'rev-001', 'Sentimos muito, vamos melhorar!', approval),
    );
    expect(answer.reviewId).toBe('rev-001');
    const page = await c.listReviews(DEMO_MERCHANT_ID);
    expect(page.reviews.find((r) => r.id === 'rev-001')?.replies?.[0]?.text).toBe(
      'Sentimos muito, vamos melhorar!',
    );
    await expect(
      c.replyReview(DEMO_MERCHANT_ID, 'nao-existe', 'Oi', approval),
    ).rejects.toBeInstanceOf(IfoodNotFoundError);
    await expect(
      c.replyReview(DEMO_MERCHANT_ID, 'rev-001', 'x'.repeat(301), approval),
    ).rejects.toThrow();
  });

  it('a store em memória não vaza escritas para o seed', async () => {
    await newClient().upsertItems(DEMO_MERCHANT_ID, body, approval);
    const items = (await newClient().listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID)).flatMap(
      (x) => x.items,
    );
    expect(items).toHaveLength(3);
  });
});

describe('getIfoodClient e RealIfoodClient', () => {
  it('escolhe por modo, com mock como padrão', () => {
    expect(getIfoodClient({ mode: 'mock' }).mode).toBe('mock');
    expect(getIfoodClient({ mode: ' REAL ' })).toBeInstanceOf(RealIfoodClient);
    expect(() => getIfoodClient({ mode: 'prod' })).toThrow(/IFOOD_MODE/);
  });

  it('lê IFOOD_MODE do ambiente', () => {
    const prev = process.env.IFOOD_MODE;
    try {
      process.env.IFOOD_MODE = 'real';
      expect(getIfoodClient().mode).toBe('real');
      delete process.env.IFOOD_MODE;
      expect(getIfoodClient().mode).toBe('mock');
    } finally {
      if (prev === undefined) delete process.env.IFOOD_MODE;
      else process.env.IFOOD_MODE = prev;
    }
  });

  it('RealIfoodClient lança NotConfiguredError em todos os métodos', async () => {
    const real = new RealIfoodClient();
    const methods = Object.getOwnPropertyNames(RealIfoodClient.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.length).toBe(11);
    for (const m of methods) {
      const fn = (real as unknown as Record<string, () => Promise<unknown>>)[m];
      await expect(fn?.call(real)).rejects.toBeInstanceOf(NotConfiguredError);
    }
  });
});
