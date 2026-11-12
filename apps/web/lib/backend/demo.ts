/**
 * Modo demo: roda o painel inteiro sem chaves (recrutador, dev offline, testes).
 * Estado em memória por processo; iFood é o mock; o "agente" devolve um rascunho fixo.
 * Escrita na loja continua passando pelo serviço de aprovações de verdade.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createApprovalService,
  createCatalogPublisher,
  createReviewReplyPublisher,
  demoAnalystAnswer,
  demoAnalyzeReview,
  MemoryApprovalStore,
  MemoryConversationStore,
  MemoryReviewSyncStore,
  MemoryRoiStore,
  syncReviews,
} from '@socio/agents';
import {
  createMemoryStore,
  DEMO_MERCHANT_ID,
  demoSeed,
  type IfoodClient,
  MockIfoodClient,
} from '@socio/ifood-client';
import { demoDraft } from './demo-draft.ts';
import { sign, unsign } from './signed-cookie.ts';
import { monthStart, publishedItems } from './stats.ts';
import type { Backend, CookieJar, MemberRole, MenuUpload, MerchantRef } from './types.ts';

export const DEMO_SESSION_COOKIE = 'socio_demo_session';
export const DEMO_OWNER_EMAIL = 'dono@socio.demo';
export const DEMO_STAFF_EMAIL = 'equipe@socio.demo';
export const DEMO_DEFAULT_PASSWORD = 'socio-demo';

/** Custo simulado de uma leitura de cardápio (visão + padronização). */
const DEMO_RUN_COST_USD = 0.0042;

interface DemoUser {
  id: string;
  email: string;
  password: string;
}

export interface DemoState {
  users: DemoUser[];
  merchants: Array<{ id: string; name: string; ifoodMerchantId: string }>;
  members: Array<{ merchantId: string; userId: string; role: MemberRole }>;
  uploads: Map<string, MenuUpload & { photo: Uint8Array }>;
  runs: Array<{ merchantId: string; costUsd: number; at: Date }>;
  approvalStore: MemoryApprovalStore;
  conversationStore: MemoryConversationStore;
  roi: MemoryRoiStore;
  reviews: MemoryReviewSyncStore;
  ifood: IfoodClient;
  secret: string;
}

export function createDemoState(env: Record<string, string | undefined> = process.env): DemoState {
  const password = env.DEMO_PASSWORD || DEMO_DEFAULT_PASSWORD;
  const owner = { id: randomUUID(), email: DEMO_OWNER_EMAIL, password };
  const staff = { id: randomUUID(), email: DEMO_STAFF_EMAIL, password };
  const merchantId = randomUUID();
  return {
    users: [owner, staff],
    merchants: [
      { id: merchantId, name: 'Pizzaria Forno da Vila', ifoodMerchantId: DEMO_MERCHANT_ID },
    ],
    members: [
      { merchantId, userId: owner.id, role: 'owner' },
      { merchantId, userId: staff.id, role: 'staff' },
    ],
    uploads: new Map(),
    runs: [],
    approvalStore: new MemoryApprovalStore(),
    conversationStore: new MemoryConversationStore(),
    roi: new MemoryRoiStore(),
    reviews: new MemoryReviewSyncStore({
      [merchantId]: {
        storeName: 'Pizzaria Forno da Vila',
        tone: 'acolhedor e direto',
        examples: [],
      },
    }),
    ifood: new MockIfoodClient(createMemoryStore(demoSeed)),
    secret: env.SESSION_SECRET || randomBytes(32).toString('hex'),
  };
}

const KEY = Symbol.for('socio.demoState');

/** Um estado por processo (sobrevive ao hot reload do `next dev`). */
export function sharedDemoState(): DemoState {
  const g = globalThis as { [KEY]?: DemoState };
  g[KEY] ??= createDemoState();
  return g[KEY];
}

export function createDemoBackend(state: DemoState, jar: CookieJar): Backend {
  const approvals = createApprovalService({ store: state.approvalStore });

  async function resolveIfoodMerchantId(merchantId: string): Promise<string> {
    const m = state.merchants.find((x) => x.id === merchantId);
    if (!m) throw new Error('Loja sem vínculo com o iFood.');
    return m.ifoodMerchantId;
  }

  const publisher = createCatalogPublisher({
    approvals,
    ifood: state.ifood,
    roi: state.roi,
    resolveIfoodMerchantId,
  });
  const reviewPublisher = createReviewReplyPublisher({
    approvals,
    ifood: state.ifood,
    roi: state.roi,
    resolveIfoodMerchantId,
  });

  const publicUpload = (u: MenuUpload & { photo: Uint8Array }): MenuUpload => {
    const { photo: _photo, ...rest } = u;
    return structuredClone(rest);
  };

  return {
    mode: 'demo',
    conversations: state.conversationStore,
    approvals,
    publisher,
    reviewPublisher,

    syncReviews(merchantId) {
      // Sem modelo no demo: classificação por palavra-chave e resposta no modelo seguro.
      return syncReviews(
        {
          ifood: state.ifood,
          approvals,
          store: state.reviews,
          resolveIfoodMerchantId,
          analyze: demoAnalyzeReview,
          lookbackDays: null,
        },
        merchantId,
      );
    },

    async resetDemo() {
      resetDemoState(state);
      return { reset: true, merchants: state.merchants.length };
    },

    async askAnalyst(_merchantId, question) {
      // Sem modelo nem banco no demo: respostas prontas com números ilustrativos.
      return demoAnalystAnswer(question);
    },

    async currentUser() {
      const id = unsign(jar.get(DEMO_SESSION_COOKIE), state.secret);
      const user = id ? state.users.find((u) => u.id === id) : undefined;
      return user ? { id: user.id, email: user.email } : null;
    },

    async signIn(email, password) {
      const user = state.users.find(
        (u) => u.email === email.trim().toLowerCase() && u.password === password,
      );
      if (!user) return false;
      jar.set(DEMO_SESSION_COOKIE, sign(user.id, state.secret), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 8,
      });
      return true;
    },

    async signOut() {
      jar.delete(DEMO_SESSION_COOKIE);
    },

    async merchantsFor(userId) {
      return state.members
        .filter((m) => m.userId === userId)
        .flatMap((m): MerchantRef[] => {
          const merchant = state.merchants.find((x) => x.id === m.merchantId);
          return merchant ? [{ id: merchant.id, name: merchant.name, role: m.role }] : [];
        });
    },

    async createUpload(merchantId, _userId, image) {
      const upload = {
        id: randomUUID(),
        merchantId,
        status: 'drafted' as const,
        draft: demoDraft(),
        error: null,
        createdAt: new Date(),
        photo: image.data,
      };
      state.uploads.set(upload.id, upload);
      state.runs.push({ merchantId, costUsd: DEMO_RUN_COST_USD, at: new Date() });
      return publicUpload(upload);
    },

    async getUpload(id, merchantId) {
      const u = state.uploads.get(id);
      return u && u.merchantId === merchantId ? publicUpload(u) : null;
    },

    async catalogTarget(merchantId) {
      const ifoodId = await resolveIfoodMerchantId(merchantId);
      const [catalog] = await state.ifood.listCatalogs(ifoodId);
      if (!catalog) return null;
      const categories = await state.ifood.listCatalog(ifoodId, catalog.catalogId);
      return {
        catalogId: catalog.catalogId,
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      };
    },

    async monthStats(merchantId, now) {
      const from = monthStart(now).getTime();
      const executed = [...state.approvalStore.rows.values()].filter(
        (a) =>
          a.merchantId === merchantId &&
          a.status === 'executed' &&
          (a.executedAt?.getTime() ?? 0) >= from,
      );
      return {
        itemsPublished: executed.reduce((n, a) => n + publishedItems(a.kind, a.payload), 0),
        // MemoryRoiStore não guarda data: no demo, tudo é "deste mês".
        minutesSaved: state.roi.events
          .filter((e) => e.merchantId === merchantId)
          .reduce((n, e) => n + e.minutesSaved, 0),
        aiCostUsd: state.runs
          .filter((r) => r.merchantId === merchantId && r.at.getTime() >= from)
          .reduce((n, r) => n + r.costUsd, 0),
      };
    },
  };
}

/**
 * Restaura a loja demo (cron diário da T10): apaga uploads, aprovações, conversas, ROI,
 * avaliações sincronizadas e volta o catálogo mock ao seed. Mantém usuários, loja e segredo,
 * então quem está logado continua logado.
 */
export function resetDemoState(
  state: DemoState,
  env: Record<string, string | undefined> = process.env,
): void {
  const fresh = createDemoState(env);
  const reviewsFor = Object.fromEntries(
    state.merchants.map((m) => [
      m.id,
      { storeName: m.name, tone: 'acolhedor e direto', examples: [] },
    ]),
  );
  state.uploads = fresh.uploads;
  state.runs = fresh.runs;
  state.approvalStore = fresh.approvalStore;
  state.conversationStore = fresh.conversationStore;
  state.roi = fresh.roi;
  state.reviews = new MemoryReviewSyncStore(reviewsFor);
  state.ifood = fresh.ifood;
}
