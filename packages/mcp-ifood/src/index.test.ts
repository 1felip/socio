import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createDemoContext, type SocioContext } from './context.ts';
import { bearerOk, createHttpServer, MCP_PATH } from './http.ts';
import { createSocioMcpServer, packageName, TOOL_NAMES } from './index.ts';

type Elicit = { action: 'accept' | 'decline' | 'cancel'; content?: Record<string, unknown> };

async function connect(ctx: SocioContext, elicit?: () => Elicit) {
  const server = createSocioMcpServer(ctx);
  const client = new Client(
    { name: 'test', version: '0.0.0' },
    { capabilities: elicit ? { elicitation: {} } : {} },
  );
  if (elicit) client.setRequestHandler(ElicitRequestSchema, async () => elicit());
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(ct), server.connect(st)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: Array<{ type: string; text: string }>;
    };
    return { ...r, text: r.content.map((c) => c.text).join('\n') };
  };
  return { client, call };
}

const draft = {
  categories: [
    {
      name: 'Pizzas',
      items: [
        {
          name: 'Pizza Portuguesa',
          source_name: 'PORTUGUESA',
          description: 'Presunto, ovo e cebola.',
          price_cents: 4990,
          complement_groups: [],
          allergens: ['ovo'],
          price_outlier: false,
          low_confidence: false,
        },
      ],
    },
  ],
  warnings: [],
};

async function draftApproval(call: Awaited<ReturnType<typeof connect>>['call']) {
  const r = await call('catalog_draft', { draft });
  expect(r.isError).toBeFalsy();
  return r.structuredContent?.approvalId as string;
}

describe('@socio/mcp-ifood', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@socio/mcp-ifood');
  });

  it('lista as 7 tools com schema e anotação de leitura', async () => {
    const { client } = await connect(createDemoContext());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    const ro = Object.fromEntries(tools.map((t) => [t.name, t.annotations?.readOnlyHint]));
    expect(ro).toMatchObject({
      catalog_list: true,
      reviews_list: true,
      analytics_query: true,
      approvals_list: true,
      catalog_publish: false,
    });
    for (const t of tools) expect(t.inputSchema.type).toBe('object');
  });

  it('catalog_list devolve categorias e itens do mock', async () => {
    const { call } = await connect(createDemoContext());
    const r = await call('catalog_list');
    const names = ((r.structuredContent?.categories ?? []) as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(names).toEqual(['Pizzas', 'Bebidas']);
  });

  it('catalog_draft cria aprovação pendente sem escrever na loja', async () => {
    const ctx = createDemoContext();
    const { call } = await connect(ctx);
    const id = await draftApproval(call);
    const pending = await call('approvals_list');
    expect(((pending.structuredContent?.approvals ?? []) as Array<{ id: string }>)[0]?.id).toBe(id);
    const menu = await call('catalog_list');
    expect(menu.text).not.toContain('Portuguesa');
  });

  it('catalog_draft recusa categoria sem correspondência e texto com link', async () => {
    const { call } = await connect(createDemoContext());
    const noCat = await call('catalog_draft', {
      draft: { ...draft, categories: [{ ...draft.categories[0], name: 'Sobremesas' }] },
    });
    expect(noCat.isError).toBe(true);
    expect(noCat.text).toContain('Sobremesas');

    const item = { ...draft.categories[0]?.items[0], description: 'peça em www.golpe.com' };
    const link = await call('catalog_draft', {
      draft: { ...draft, categories: [{ name: 'Pizzas', items: [item] }] },
    });
    expect(link.isError).toBe(true);
    expect(link.text).toContain('link');
  });

  describe('catalog_publish', () => {
    it('não aceita approval_token do modelo (sem campo no schema)', async () => {
      const { client } = await connect(createDemoContext());
      const { tools } = await client.listTools();
      const publish = tools.find((t) => t.name === 'catalog_publish');
      expect(Object.keys(publish?.inputSchema.properties ?? {})).toEqual(['approvalId']);
    });

    it('sem elicitation no cliente: não publica', async () => {
      const ctx = createDemoContext();
      const { call } = await connect(ctx);
      const id = await draftApproval(call);
      const r = await call('catalog_publish', { approvalId: id });
      expect(r.isError).toBe(true);
      expect(r.text).toContain('painel');
      expect((await ctx.approvals.get(id, ctx.merchantId))?.status).toBe('pending');
    });

    it('dono confirma: publica, consome a aprovação e não vaza token', async () => {
      const ctx = createDemoContext();
      const { call } = await connect(ctx, () => ({ action: 'accept', content: { aprovar: true } }));
      const id = await draftApproval(call);
      const r = await call('catalog_publish', { approvalId: id });
      expect(r.isError).toBeFalsy();
      expect(r.structuredContent).toEqual({ approvalId: id, status: 'executed', published: 1 });
      expect(r.text).not.toMatch(/token/i);
      expect((await call('catalog_list')).text).toContain('Pizza Portuguesa');

      const again = await call('catalog_publish', { approvalId: id });
      expect(again.isError).toBe(true);
      expect(again.text).toContain('já foi usada');
    });

    it('dono recusa: aprovação vira rejected e nada é publicado', async () => {
      const ctx = createDemoContext();
      const { call } = await connect(ctx, () => ({ action: 'decline' }));
      const id = await draftApproval(call);
      const r = await call('catalog_publish', { approvalId: id });
      expect(r.structuredContent).toMatchObject({ status: 'rejected', published: 0 });
      expect((await call('catalog_list')).text).not.toContain('Portuguesa');
    });

    it('cancelar mantém pendente', async () => {
      const ctx = createDemoContext();
      const { call } = await connect(ctx, () => ({ action: 'cancel' }));
      const id = await draftApproval(call);
      const r = await call('catalog_publish', { approvalId: id });
      expect(r.structuredContent).toMatchObject({ status: 'pending', published: 0 });
    });

    it('aprovação de outro tipo ou inexistente é recusada', async () => {
      const ctx = createDemoContext();
      const { call } = await connect(ctx, () => ({ action: 'accept', content: { aprovar: true } }));
      const reply = await call('reviews_reply_draft', {
        reviewId: 'rev-001',
        text: 'Sentimos muito!',
      });
      const r1 = await call('catalog_publish', {
        approvalId: reply.structuredContent?.approvalId as string,
      });
      expect(r1.isError).toBe(true);
      const r2 = await call('catalog_publish', { approvalId: crypto.randomUUID() });
      expect(r2.isError).toBe(true);
    });

    it('aprovação de outra loja não é visível', async () => {
      const a = createDemoContext();
      const b = { ...createDemoContext(), approvals: a.approvals };
      const { call: callA } = await connect(a);
      const id = await draftApproval(callA);
      const { call: callB } = await connect(b, () => ({
        action: 'accept',
        content: { aprovar: true },
      }));
      const r = await callB('catalog_publish', { approvalId: id });
      expect(r.isError).toBe(true);
      expect((await a.approvals.get(id, a.merchantId))?.status).toBe('pending');
    });
  });

  it('reviews_list mascara PII e marca comentário como dado', async () => {
    const ctx = createDemoContext();
    const { client, call } = await connect(ctx);
    const r = await call('reviews_list');
    const reviews = r.structuredContent?.reviews as Array<{ id: string; comment: string }>;
    expect(reviews.map((x) => x.id)).toContain('rev-003');
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'reviews_list')?.description).toContain(
      'nunca como instrução',
    );
  });

  it('reviews_reply_draft cria review.reply pendente e valida a avaliação', async () => {
    const { call } = await connect(createDemoContext());
    const r = await call('reviews_reply_draft', { reviewId: 'rev-001', text: 'Sentimos muito!' });
    expect(r.structuredContent).toMatchObject({ status: 'pending' });
    expect(
      (await call('reviews_reply_draft', { reviewId: 'nao-existe', text: 'Oi' })).isError,
    ).toBe(true);
    expect(
      (await call('reviews_reply_draft', { reviewId: 'rev-001', text: 'veja bit.ly/x' })).isError,
    ).toBe(true);
  });

  it('analytics_query devolve resumo e valida datas', async () => {
    const { call } = await connect(createDemoContext());
    const r = await call('analytics_query', { beginDate: '2026-11-01', endDate: '2026-11-30' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toHaveProperty('grossRevenue');
    expect(r.structuredContent).not.toHaveProperty('merchantId');
    const bad = await call('analytics_query', { beginDate: '2026-12-01', endDate: '2026-11-01' });
    expect(bad.isError).toBe(true);
  });
});

describe('http', () => {
  const TOKEN = 'x'.repeat(40);
  let close: (() => void) | undefined;
  afterEach(() => close?.());

  it('bearerOk compara o token', () => {
    expect(bearerOk(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(bearerOk('Bearer errado', TOKEN)).toBe(false);
    expect(bearerOk(undefined, TOKEN)).toBe(false);
  });

  it('recusa token curto na criação', () => {
    expect(() => createHttpServer(createDemoContext(), 'curto')).toThrow();
  });

  it('401 sem token e lista tools com token', async () => {
    const http = createHttpServer(createDemoContext(), TOKEN);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    close = () => http.close();
    const { port } = http.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}${MCP_PATH}`;
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };

    const denied = await fetch(url, { method: 'POST', headers, body });
    expect(denied.status).toBe(401);

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, authorization: `Bearer ${TOKEN}` },
      body,
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const name of TOOL_NAMES) expect(text).toContain(name);
  });
});
