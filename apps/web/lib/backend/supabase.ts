/**
 * Modo supabase: Auth (e-mail + senha), Storage (bucket menu-photos), Postgres com RLS.
 *
 * Leituras do painel usam o cliente do usuário (RLS). Escritas que a RLS não abre ao painel
 * (status do upload, aprovações, roi_events) usam o service role, sempre depois de
 * lib/flows.ts conferir que o usuário é membro/dono da loja.
 */
import { randomUUID } from 'node:crypto';
import {
  ANALYST_MESSAGES,
  type AnalystDb,
  askAnalyst,
  createApprovalService,
  createCatalogPublisher,
  createReviewReplyPublisher,
  extractMenu,
  MenuDraft,
  MenuReadError,
  PostgresAnalystDb,
  SupabaseApprovalStore,
  SupabaseConversationStore,
  SupabaseReviewSyncStore,
  SupabaseRoiStore,
  syncReviews,
} from '@socio/agents';
import { createServerClient, createServiceClient, type DbClient } from '@socio/db';
import { getIfoodClient, type IfoodClient } from '@socio/ifood-client';
import { type RunRow, splitAgent } from '../costs.ts';
import { monthStart, publishedItems } from './stats.ts';
import type { Backend, CookieJar, MenuUpload, MerchantRef, UploadStatus } from './types.ts';

export const MENU_BUCKET = 'menu-photos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lojas que o cron da demo pode limpar (DEMO_MERCHANT_IDS, uuids separados por vírgula). */
export function demoMerchantIds(env: Record<string, string | undefined> = process.env): string[] {
  return (env.DEMO_MERCHANT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID.test(s));
}

/** Conexão do Analista (role analyst_ro), uma por processo. */
let analystDb: AnalystDb | null | undefined;

function getAnalystDb(env: Record<string, string | undefined> = process.env): AnalystDb | null {
  if (analystDb === undefined) {
    const url = env.SUPABASE_DB_URL_ANALYST_RO;
    analystDb = url ? new PostgresAnalystDb(url) : null;
  }
  return analystDb;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Cookies de sessão do Supabase sobre o jar do Next. */
export interface SupabaseCookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options?: object }>): void;
}

// Um cliente do iFood por processo: o mock guarda os itens publicados em memória.
const IFOOD_KEY = Symbol.for('socio.ifoodClient');
function sharedIfood(): IfoodClient {
  const g = globalThis as { [IFOOD_KEY]?: IfoodClient };
  g[IFOOD_KEY] ??= getIfoodClient();
  return g[IFOOD_KEY];
}

function toUpload(r: {
  id: string;
  merchant_id: string;
  status: string;
  draft: unknown;
  error: string | null;
  created_at: string;
}): MenuUpload {
  const draft = r.draft ? MenuDraft.safeParse(r.draft) : null;
  return {
    id: r.id,
    merchantId: r.merchant_id,
    status: r.status as UploadStatus,
    draft: draft?.success ? draft.data : null,
    error: r.error,
    createdAt: new Date(r.created_at),
  };
}

export function createSupabaseBackend(cookies: SupabaseCookieAdapter, _jar: CookieJar): Backend {
  const user: DbClient = createServerClient(cookies);
  let service: DbClient | undefined;
  const admin = () => {
    service ??= createServiceClient();
    return service;
  };

  const approvals = createApprovalService({ store: new SupabaseApprovalStore(admin()) });
  const ifood = sharedIfood();

  async function resolveIfoodMerchantId(merchantId: string): Promise<string> {
    const { data, error } = await admin()
      .from('merchants')
      .select('ifood_merchant_id')
      .eq('id', merchantId)
      .maybeSingle();
    if (error || !data?.ifood_merchant_id) throw new Error('Loja sem vínculo com o iFood.');
    return data.ifood_merchant_id;
  }

  const publisher = createCatalogPublisher({
    approvals,
    ifood,
    roi: new SupabaseRoiStore(admin()),
    resolveIfoodMerchantId,
  });
  const reviewPublisher = createReviewReplyPublisher({
    approvals,
    ifood,
    roi: new SupabaseRoiStore(admin()),
    resolveIfoodMerchantId,
  });

  return {
    mode: 'supabase',
    get conversations() {
      return new SupabaseConversationStore(admin());
    },
    approvals,
    publisher,
    reviewPublisher,

    syncReviews(merchantId) {
      return syncReviews(
        {
          ifood,
          approvals,
          store: new SupabaseReviewSyncStore(admin()),
          resolveIfoodMerchantId,
        },
        merchantId,
      );
    },

    async resetDemo() {
      const ids = demoMerchantIds();
      if (ids.length === 0) return { reset: false, merchants: 0 };
      // Ordem respeita as FKs: respostas e ROI apontam para aprovações.
      for (const table of [
        'review_replies',
        'roi_events',
        'approvals',
        'menu_uploads',
        'conversations',
      ] as const) {
        const { error } = await admin().from(table).delete().in('merchant_id', ids);
        if (error) throw new Error(`reset demo: ${table}: ${error.message}`);
      }
      return { reset: true, merchants: ids.length };
    },

    async askAnalyst(merchantId, question) {
      const db = getAnalystDb();
      if (!db) {
        console.error('[analyst] SUPABASE_DB_URL_ANALYST_RO não configurada');
        return {
          status: 'failed',
          question,
          answer: ANALYST_MESSAGES.failed,
          chart: null,
          sql: null,
          rowCount: 0,
          rows: [],
          columns: [],
          costUsd: 0,
          attempts: 0,
          error: 'SUPABASE_DB_URL_ANALYST_RO ausente',
        };
      }
      return askAnalyst(question, { merchantId, db });
    },

    async currentUser() {
      const { data } = await user.auth.getUser();
      return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
    },

    async signIn(email, password) {
      const { error } = await user.auth.signInWithPassword({ email: email.trim(), password });
      return !error;
    },

    async signOut() {
      await user.auth.signOut();
    },

    async memberByWhatsApp(waId) {
      // Servidor resolve número → loja (service role): o webhook não tem usuário logado.
      // Só número com posse comprovada (verified_at) é reconhecido.
      const { data, error } = await admin()
        .from('merchant_members')
        .select('merchant_id, user_id, role')
        .eq('whatsapp_phone', waId)
        .not('whatsapp_verified_at', 'is', null)
        .maybeSingle();
      if (error) throw new Error(`merchant_members: ${error.message}`);
      return data
        ? {
            merchantId: data.merchant_id,
            userId: data.user_id,
            role: data.role === 'owner' ? 'owner' : 'staff',
          }
        : null;
    },

    async whatsAppStatusFor(userId, merchantId) {
      const { data, error } = await user
        .from('merchant_members')
        .select('whatsapp_phone, whatsapp_verified_at')
        .eq('user_id', userId)
        .eq('merchant_id', merchantId)
        .maybeSingle();
      if (error) throw new Error(`merchant_members: ${error.message}`);
      return { phone: data?.whatsapp_phone ?? null, verified: Boolean(data?.whatsapp_verified_at) };
    },

    async startWhatsAppLink(userId, merchantId, link) {
      // Painel não tem UPDATE em merchant_members: service role, depois de flows conferir o membro.
      const { error } = await admin()
        .from('merchant_members')
        .update({
          whatsapp_phone: link?.waId ?? null,
          whatsapp_verified_at: null,
          whatsapp_code_hash: link?.codeHash ?? null,
          whatsapp_code_expires_at: link?.expiresAt.toISOString() ?? null,
        })
        .eq('user_id', userId)
        .eq('merchant_id', merchantId);
      if (error) throw new Error(`merchant_members: ${error.message}`);
    },

    async confirmWhatsAppLink(waId, codeHash, now) {
      const { data, error } = await admin()
        .from('merchant_members')
        .select('merchant_id, user_id, role')
        .eq('whatsapp_phone', waId)
        .eq('whatsapp_code_hash', codeHash)
        .is('whatsapp_verified_at', null)
        .gt('whatsapp_code_expires_at', now.toISOString())
        .maybeSingle();
      if (error) throw new Error(`merchant_members: ${error.message}`);
      if (!data) return null;
      const upd = await admin()
        .from('merchant_members')
        .update({
          whatsapp_verified_at: now.toISOString(),
          whatsapp_code_hash: null,
          whatsapp_code_expires_at: null,
        })
        .eq('user_id', data.user_id)
        .eq('merchant_id', data.merchant_id)
        .is('whatsapp_verified_at', null);
      // Índice único entre verificados: o número já é de outro membro.
      if (upd.error?.code === '23505') return 'taken';
      if (upd.error) throw new Error(`merchant_members: ${upd.error.message}`);
      return {
        merchantId: data.merchant_id,
        userId: data.user_id,
        role: data.role === 'owner' ? 'owner' : 'staff',
      };
    },

    async merchantsFor(userId) {
      // Duas consultas: os tipos escritos à mão ainda não declaram a relação (até `pnpm db:types`).
      const members = await user
        .from('merchant_members')
        .select('merchant_id, role')
        .eq('user_id', userId);
      if (members.error) throw new Error(`merchant_members: ${members.error.message}`);
      const rows = members.data ?? [];
      if (rows.length === 0) return [];
      const merchants = await user
        .from('merchants')
        .select('id, name')
        .in(
          'id',
          rows.map((r) => r.merchant_id),
        );
      if (merchants.error) throw new Error(`merchants: ${merchants.error.message}`);
      return rows.flatMap((row): MerchantRef[] => {
        const m = merchants.data?.find((x) => x.id === row.merchant_id);
        return m
          ? [{ id: m.id, name: m.name, role: row.role === 'owner' ? 'owner' : 'staff' }]
          : [];
      });
    },

    async createUpload(merchantId, userId, image) {
      const id = randomUUID();
      const path = `${merchantId}/${id}.${EXT[image.mediaType] ?? 'jpg'}`;
      const up = await user.storage
        .from(MENU_BUCKET)
        .upload(path, image.data, { contentType: image.mediaType, upsert: false });
      if (up.error) throw new Error(`storage: ${up.error.message}`);

      const ins = await user
        .from('menu_uploads')
        .insert({ id, merchant_id: merchantId, storage_path: path, created_by: userId })
        .select('id, merchant_id, status, draft, error, created_at')
        .single();
      if (ins.error) throw new Error(`menu_uploads: ${ins.error.message}`);

      await admin().from('menu_uploads').update({ status: 'processing' }).eq('id', id);
      let patch: { status: UploadStatus; draft?: MenuDraft; error?: string };
      try {
        const result = await extractMenu(image, { merchantId });
        patch = { status: 'drafted', draft: result.draft };
      } catch (err) {
        patch = {
          status: 'failed',
          error:
            err instanceof MenuReadError
              ? err.userMessage
              : 'Deu um problema ao ler o cardápio. Tenta de novo em instantes.',
        };
      }
      const upd = await admin()
        .from('menu_uploads')
        .update(patch)
        .eq('id', id)
        .select('id, merchant_id, status, draft, error, created_at')
        .single();
      if (upd.error) throw new Error(`menu_uploads: ${upd.error.message}`);
      return toUpload(upd.data);
    },

    async getUpload(id, merchantId) {
      const { data } = await user
        .from('menu_uploads')
        .select('id, merchant_id, status, draft, error, created_at')
        .eq('id', id)
        .eq('merchant_id', merchantId)
        .maybeSingle();
      return data ? toUpload(data) : null;
    },

    async catalogTarget(merchantId) {
      const ifoodId = await resolveIfoodMerchantId(merchantId);
      const [catalog] = await ifood.listCatalogs(ifoodId);
      if (!catalog) return null;
      const categories = await ifood.listCatalog(ifoodId, catalog.catalogId);
      return {
        catalogId: catalog.catalogId,
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      };
    },

    async listRuns(merchantId, since) {
      // RLS: membro lê os runs da loja. Teto de linhas para a página não pesar.
      const { data, error } = await user
        .from('agent_runs')
        .select('agent, model, cost_usd, latency_ms, status, trace_id, created_at')
        .eq('merchant_id', merchantId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw new Error(`agent_runs: ${error.message}`);
      return (data ?? []).map((r) => ({
        ...splitAgent(r.agent),
        model: r.model,
        costUsd: Number(r.cost_usd),
        latencyMs: r.latency_ms,
        status: r.status as RunRow['status'],
        traceId: r.trace_id,
        createdAt: new Date(r.created_at),
      }));
    },

    async monthStats(merchantId, now) {
      const from = monthStart(now).toISOString();
      const [roi, runs, executed] = await Promise.all([
        user
          .from('roi_events')
          .select('minutes_saved')
          .eq('merchant_id', merchantId)
          .gte('created_at', from),
        user
          .from('agent_runs')
          .select('cost_usd')
          .eq('merchant_id', merchantId)
          .gte('created_at', from),
        user
          .from('approvals')
          .select('kind, payload')
          .eq('merchant_id', merchantId)
          .eq('status', 'executed')
          .gte('executed_at', from),
      ]);
      return {
        minutesSaved: (roi.data ?? []).reduce((n, r) => n + r.minutes_saved, 0),
        aiCostUsd: (runs.data ?? []).reduce((n, r) => n + Number(r.cost_usd), 0),
        itemsPublished: (executed.data ?? []).reduce(
          (n, a) => n + publishedItems(a.kind, a.payload),
          0,
        ),
      };
    },
  };
}
