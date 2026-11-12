/**
 * Modo supabase: Auth (e-mail + senha), Storage (bucket menu-photos), Postgres com RLS.
 *
 * Leituras do painel usam o cliente do usuário (RLS). Escritas que a RLS não abre ao painel
 * (status do upload, aprovações, roi_events) usam o service role, sempre depois de
 * lib/flows.ts conferir que o usuário é membro/dono da loja.
 */
import { randomUUID } from 'node:crypto';
import {
  createApprovalService,
  createCatalogPublisher,
  createReviewReplyPublisher,
  extractMenu,
  MenuDraft,
  MenuReadError,
  SupabaseApprovalStore,
  SupabaseConversationStore,
  SupabaseReviewSyncStore,
  SupabaseRoiStore,
  syncReviews,
} from '@socio/agents';
import { createServerClient, createServiceClient, type DbClient } from '@socio/db';
import { getIfoodClient, type IfoodClient } from '@socio/ifood-client';
import { monthStart, publishedItems } from './stats.ts';
import type { Backend, CookieJar, MenuUpload, MerchantRef, UploadStatus } from './types.ts';

export const MENU_BUCKET = 'menu-photos';

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
