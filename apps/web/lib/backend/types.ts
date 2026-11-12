import type {
  ApprovalService,
  ConversationStore,
  createCatalogPublisher,
  createReviewReplyPublisher,
  MenuDraft,
  ReviewSyncResult,
} from '@socio/agents';

export type BackendMode = 'demo' | 'supabase';

export interface SessionUser {
  id: string;
  email: string;
}

export type MemberRole = 'owner' | 'staff';

export interface MerchantRef {
  id: string;
  name: string;
  role: MemberRole;
}

export type UploadStatus = 'pending' | 'processing' | 'drafted' | 'failed';

export interface MenuUpload {
  id: string;
  merchantId: string;
  status: UploadStatus;
  draft: MenuDraft | null;
  /** Mensagem pronta para o dono quando status = failed. */
  error: string | null;
  createdAt: Date;
}

export interface MenuImage {
  data: Uint8Array;
  mediaType: string;
}

export interface CatalogCategoryRef {
  id: string;
  name: string;
}

/** Catálogo real da loja no iFood: de onde vêm catalogId e categoryIds da publicação. */
export interface CatalogTarget {
  catalogId: string;
  categories: CatalogCategoryRef[];
}

export interface MonthStats {
  itemsPublished: number;
  minutesSaved: number;
  aiCostUsd: number;
}

export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, opts?: CookieOptions): void;
  delete(name: string): void;
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict';
  path?: string;
  maxAge?: number;
}

export type CatalogPublisher = ReturnType<typeof createCatalogPublisher>;
export type ReviewReplyPublisher = ReturnType<typeof createReviewReplyPublisher>;

/**
 * Tudo que o painel precisa do mundo lá fora. Duas implementações:
 * `demo` (memória + mock do iFood, sem chaves) e `supabase` (Auth, Storage, Postgres).
 *
 * Autorização (membro/dono da loja) fica em lib/flows.ts, igual para os dois modos.
 */
export interface Backend {
  readonly mode: BackendMode;

  currentUser(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;

  merchantsFor(userId: string): Promise<MerchantRef[]>;

  /** Guarda a foto, roda o Agente Cardápio e salva o rascunho. Não publica nada. */
  createUpload(merchantId: string, userId: string, image: MenuImage): Promise<MenuUpload>;
  getUpload(id: string, merchantId: string): Promise<MenuUpload | null>;

  catalogTarget(merchantId: string): Promise<CatalogTarget | null>;

  readonly approvals: ApprovalService;
  /** Memória curta do orquestrador (POST /api/agent). */
  readonly conversations: ConversationStore;
  readonly publisher: CatalogPublisher;
  /** Publica resposta de avaliação aprovada (kind review.reply). */
  readonly reviewPublisher: ReviewReplyPublisher;
  /** Agente Avaliações sobre as avaliações novas: só cria aprovações e alertas. */
  syncReviews(merchantId: string): Promise<ReviewSyncResult>;

  monthStats(merchantId: string, now: Date): Promise<MonthStats>;
}
