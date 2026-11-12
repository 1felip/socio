import { DEMO_CATALOG_ID, DEMO_MERCHANT_ID } from '@socio/ifood-client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDemoBackend,
  createDemoState,
  DEMO_DEFAULT_PASSWORD,
  DEMO_OWNER_EMAIL,
  DEMO_STAFF_EMAIL,
  type DemoState,
} from './backend/demo.ts';
import { resolveBackendMode } from './backend/index.ts';
import type { Backend, CookieJar, SessionUser } from './backend/types.ts';
import {
  askAnalystQuestion,
  decide,
  MAX_ANALYST_QUESTION,
  sniffImageType,
  submitDraft,
  uploadMenuPhoto,
} from './flows.ts';
import { buildPublishPayload, draftToForm, type ReviewForm } from './review-form.ts';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

function memoryJar(): CookieJar & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (n) => data.get(n),
    set: (n, v) => void data.set(n, v),
    delete: (n) => void data.delete(n),
  };
}

async function login(state: DemoState, email: string) {
  const backend = createDemoBackend(state, memoryJar());
  expect(await backend.signIn(email, DEMO_DEFAULT_PASSWORD)).toBe(true);
  const user = (await backend.currentUser()) as SessionUser;
  const [merchant] = await backend.merchantsFor(user.id);
  if (!merchant) throw new Error('sem loja');
  return { backend, user, merchantId: merchant.id };
}

async function draftForm(backend: Backend, merchantId: string, uploadId: string) {
  const upload = await backend.getUpload(uploadId, merchantId);
  const target = await backend.catalogTarget(merchantId);
  if (!upload?.draft || !target) throw new Error('sem rascunho');
  const form = draftToForm(upload.draft, target);
  // Corrige o preço sinalizado como fora do padrão, como o dono faria.
  const pizza = form.categories[0]?.items[2];
  if (pizza) pizza.price = '54,90';
  return form;
}

let state: DemoState;
beforeEach(() => {
  state = createDemoState({});
});

describe('login demo', () => {
  it('aceita a senha certa e recusa a errada', async () => {
    const backend = createDemoBackend(state, memoryJar());
    expect(await backend.signIn(DEMO_OWNER_EMAIL, 'errada')).toBe(false);
    expect(await backend.currentUser()).toBeNull();
    expect(await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD)).toBe(true);
    expect((await backend.currentUser())?.email).toBe(DEMO_OWNER_EMAIL);
  });

  it('ignora cookie de sessão adulterado', async () => {
    const jar = memoryJar();
    const backend = createDemoBackend(state, jar);
    await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD);
    const [name, value] = [...jar.data.entries()][0] as [string, string];
    const staff = state.users.find((u) => u.email === DEMO_STAFF_EMAIL);
    jar.data.set(name, value.replace(/^[^.]+/, staff?.id ?? 'x'));
    expect(await backend.currentUser()).toBeNull();
  });
});

describe('fluxo do cardápio (demo)', () => {
  it('upload → revisão → aprovação → item no catálogo mock', async () => {
    const { backend, user, merchantId } = await login(state, DEMO_OWNER_EMAIL);

    const up = await uploadMenuPhoto(backend, user, merchantId, JPEG);
    expect(up.ok).toBe(true);
    if (!up.ok) return;

    const form = await draftForm(backend, merchantId, up.value.uploadId);
    expect(form.categories.map((c) => c.targetCategoryId)).toEqual(['cat-pizzas', 'cat-bebidas']);

    const sent = await submitDraft(
      backend,
      user,
      merchantId,
      up.value.uploadId,
      JSON.stringify(form),
    );
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.value.status).toBe('pending');

    // Nada publicado antes da aprovação.
    const before = await state.ifood.listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID);
    expect(before.flatMap((c) => c.items).some((i) => i.name === 'Pizza Portuguesa')).toBe(false);

    const res = await decide(backend, user, merchantId, sent.value.id, 'approve');
    expect(res).toMatchObject({ ok: true, value: { itemsPublished: 5 } });
    if (res.ok) expect(res.value.approval.status).toBe('executed');

    const after = await state.ifood.listCatalog(DEMO_MERCHANT_ID, DEMO_CATALOG_ID);
    const pizzas = after.find((c) => c.id === 'cat-pizzas')?.items ?? [];
    const frango = pizzas.find((i) => i.name === 'Pizza Frango com Catupiry');
    expect(frango?.price.value).toBe(54.9);

    const stats = await backend.monthStats(merchantId, new Date());
    expect(stats.itemsPublished).toBe(5);
    expect(stats.minutesSaved).toBeGreaterThan(0);
    expect(stats.aiCostUsd).toBeGreaterThan(0);

    // Uso único: aprovar de novo não publica outra vez.
    const again = await decide(backend, user, merchantId, sent.value.id, 'approve');
    expect(again.ok).toBe(false);
  });

  it('rejeitar não publica nada', async () => {
    const { backend, user, merchantId } = await login(state, DEMO_OWNER_EMAIL);
    const up = await uploadMenuPhoto(backend, user, merchantId, JPEG);
    if (!up.ok) throw new Error(up.error);
    const form = await draftForm(backend, merchantId, up.value.uploadId);
    const sent = await submitDraft(
      backend,
      user,
      merchantId,
      up.value.uploadId,
      JSON.stringify(form),
    );
    if (!sent.ok) throw new Error(sent.error);

    const res = await decide(backend, user, merchantId, sent.value.id, 'reject');
    expect(res.ok && res.value.approval.status).toBe('rejected');
    expect((await backend.monthStats(merchantId, new Date())).itemsPublished).toBe(0);
  });

  it('equipe pode enviar, mas só o dono aprova', async () => {
    const staff = await login(state, DEMO_STAFF_EMAIL);
    const up = await uploadMenuPhoto(staff.backend, staff.user, staff.merchantId, JPEG);
    if (!up.ok) throw new Error(up.error);
    const form = await draftForm(staff.backend, staff.merchantId, up.value.uploadId);
    const sent = await submitDraft(
      staff.backend,
      staff.user,
      staff.merchantId,
      up.value.uploadId,
      JSON.stringify(form),
    );
    if (!sent.ok) throw new Error(sent.error);

    const res = await decide(staff.backend, staff.user, staff.merchantId, sent.value.id, 'approve');
    expect(res).toEqual({ ok: false, error: 'Só o dono da loja pode aprovar ou recusar.' });
    expect((await staff.backend.approvals.get(sent.value.id, staff.merchantId))?.status).toBe(
      'pending',
    );
  });

  it('quem não é membro não vê nem mexe na loja', async () => {
    const { backend, merchantId } = await login(state, DEMO_OWNER_EMAIL);
    const stranger = { id: 'outro-usuario', email: 'x@y.z' };
    const up = await uploadMenuPhoto(backend, stranger, merchantId, JPEG);
    expect(up).toEqual({ ok: false, error: 'Loja não encontrada.' });
    const res = await decide(backend, stranger, merchantId, 'qualquer', 'approve');
    expect(res).toEqual({ ok: false, error: 'Loja não encontrada.' });
  });

  it('recusa arquivo que não é imagem', async () => {
    const { backend, user, merchantId } = await login(state, DEMO_OWNER_EMAIL);
    const res = await uploadMenuPhoto(
      backend,
      user,
      merchantId,
      new TextEncoder().encode('<svg/>'),
    );
    expect(res).toEqual({ ok: false, error: 'Use uma foto em JPG, PNG ou WEBP.' });
  });
});

describe('analista (demo)', () => {
  it('membro pergunta e recebe resposta com gráfico; nada vai para aprovação', async () => {
    const { backend, user, merchantId } = await login(state, DEMO_STAFF_EMAIL);
    const res = await askAnalystQuestion(
      backend,
      user,
      merchantId,
      'Qual dia da semana vende mais?',
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.status).toBe('ok');
      expect(res.value.answer).toMatch(/Sábado/);
      expect(res.value.chart?.type).toBe('bar');
    }
    expect(await backend.approvals.list(merchantId)).toEqual([]);
  });

  it('valida pergunta e acesso à loja', async () => {
    const { backend, user, merchantId } = await login(state, DEMO_OWNER_EMAIL);
    expect(await askAnalystQuestion(backend, user, merchantId, '  ')).toEqual({
      ok: false,
      error: 'Escreva sua pergunta.',
    });
    const long = 'a'.repeat(MAX_ANALYST_QUESTION + 1);
    expect((await askAnalystQuestion(backend, user, merchantId, long)).ok).toBe(false);
    const stranger = { id: 'outro-usuario', email: 'x@y.z' };
    expect(await askAnalystQuestion(backend, stranger, merchantId, 'Quanto vendi?')).toEqual({
      ok: false,
      error: 'Loja não encontrada.',
    });
  });
});

describe('buildPublishPayload', () => {
  const target = {
    catalogId: 'cat-1',
    categories: [{ id: 'c1', name: 'Pizzas' }],
  };
  const base: ReviewForm = {
    categories: [
      {
        name: 'Pizzas',
        targetCategoryId: 'c1',
        items: [
          {
            name: 'Margherita',
            source_name: 'MARGHERITA',
            description: '',
            price: '40,00',
            complement_groups: [],
            allergens: [],
            price_outlier: false,
            low_confidence: false,
          },
        ],
      },
    ],
  };
  const withPatch = (patch: Partial<ReviewForm['categories'][number]['items'][number]>) =>
    JSON.stringify({
      categories: [
        { ...base.categories[0], items: [{ ...base.categories[0]?.items[0], ...patch }] },
      ],
    });

  it('monta o payload com catalogId e categoryIds do catálogo real', () => {
    const res = buildPublishPayload(JSON.stringify(base), target, ['aviso']);
    expect(res.ok && res.value).toMatchObject({
      catalogId: 'cat-1',
      categoryIds: ['c1'],
      draft: { warnings: ['aviso'], categories: [{ items: [{ price_cents: 4000 }] }] },
    });
  });

  it('recusa categoria que não existe no catálogo', () => {
    const form = { categories: [{ ...base.categories[0], targetCategoryId: 'inventada' }] };
    const res = buildPublishPayload(JSON.stringify(form), target);
    expect(res.ok).toBe(false);
  });

  it('recusa preço inválido, link e JSON quebrado', () => {
    expect(buildPublishPayload(withPatch({ price: 'abc' }), target).ok).toBe(false);
    expect(
      buildPublishPayload(withPatch({ description: 'peça em www.golpe.com' }), target).ok,
    ).toBe(false);
    expect(buildPublishPayload('{', target).ok).toBe(false);
  });

  it('ignora categorias que ficaram vazias', () => {
    const form = {
      categories: [...base.categories, { name: 'Vazia', targetCategoryId: '', items: [] }],
    };
    const res = buildPublishPayload(JSON.stringify(form), target);
    expect(res.ok && res.value.categoryIds).toEqual(['c1']);
  });
});

describe('sniffImageType', () => {
  it('reconhece JPEG, PNG e WEBP pelo conteúdo', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('image/png');
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('resolveBackendMode', () => {
  it('escolhe pelo ambiente e exige escolha explícita em produção', () => {
    expect(resolveBackendMode({})).toBe('demo');
    expect(resolveBackendMode({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toBe(
      'supabase',
    );
    expect(resolveBackendMode({ SOCIO_BACKEND: 'demo', NODE_ENV: 'production' })).toBe('demo');
    expect(() => resolveBackendMode({ NODE_ENV: 'production' })).toThrow();
    expect(() => resolveBackendMode({ SOCIO_BACKEND: 'outro' })).toThrow();
  });
});
