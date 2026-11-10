/**
 * Serviço de aprovações (skill approvals).
 *
 * create → pending (nada executa) · approve → token de uso único, 24 h, só o hash fica guardado
 * reject → rejected · authorize → valida tudo e consome o token (approved → executed) de forma atômica.
 *
 * O token em texto puro sai só de `approve()` e vai direto ao canal de aprovação (painel/n8n).
 * Nunca passa pelo modelo.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const APPROVAL_KINDS = [
  'catalog.publish',
  'review.reply',
  'promo.create',
  'message.send',
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

export interface ApprovalRecord {
  id: string;
  merchantId: string;
  kind: ApprovalKind;
  payload: unknown;
  payloadHash: string;
  summary: string;
  status: ApprovalStatus;
  tokenHash: string | null;
  expiresAt: Date | null;
  requestedBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
}

export type NewApproval = Pick<
  ApprovalRecord,
  'merchantId' | 'kind' | 'payload' | 'payloadHash' | 'summary' | 'requestedBy'
>;

export type ApprovalPatch = Partial<
  Pick<
    ApprovalRecord,
    'status' | 'tokenHash' | 'expiresAt' | 'approvedBy' | 'approvedAt' | 'executedAt'
  >
>;

/** Condições extras de uma transição (todas verificadas no mesmo UPDATE). */
export interface TransitionGuard {
  tokenHash?: string;
  /** Exige `expires_at > notExpiredAt`. */
  notExpiredAt?: Date;
}

export interface ApprovalStore {
  insert(row: NewApproval): Promise<ApprovalRecord>;
  get(id: string): Promise<ApprovalRecord | null>;
  list(merchantId: string, status?: ApprovalStatus): Promise<ApprovalRecord[]>;
  /**
   * Atualiza só se o status atual for `from` (e o guard bater). Devolve null se outra
   * requisição chegou antes: é o que impede uso duplo do token.
   */
  transition(
    id: string,
    from: ApprovalStatus,
    patch: ApprovalPatch,
    guard?: TransitionGuard,
  ): Promise<ApprovalRecord | null>;
}

export type ApprovalErrorCode =
  | 'missing_approval'
  | 'not_found'
  | 'wrong_kind'
  | 'payload_mismatch'
  | 'not_approved'
  | 'rejected'
  | 'expired'
  | 'already_used'
  | 'invalid_token'
  | 'invalid_state';

const MESSAGES: Record<ApprovalErrorCode, string> = {
  missing_approval: 'Ação de escrita sem aprovação.',
  not_found: 'Aprovação não encontrada.',
  wrong_kind: 'A aprovação é de outro tipo de ação.',
  payload_mismatch: 'O conteúdo mudou depois da aprovação. Peça uma nova aprovação.',
  not_approved: 'A aprovação ainda está pendente.',
  rejected: 'A aprovação foi recusada.',
  expired: 'A aprovação expirou.',
  already_used: 'Esta aprovação já foi usada.',
  invalid_token: 'Token de aprovação inválido.',
  invalid_state: 'A aprovação não está mais pendente.',
};

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;

  constructor(code: ApprovalErrorCode) {
    super(MESSAGES[code]);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

// ---------- hash ----------

/** JSON com chaves ordenadas: o mesmo objeto sempre gera o mesmo hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashPayload(payload: unknown): string {
  return sha256(canonicalJson(payload));
}

function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ---------- serviço ----------

export const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** O que sai do serviço: nunca inclui `tokenHash` (nem para o painel, nem para o modelo). */
export type Approval = Omit<ApprovalRecord, 'tokenHash'>;

function redact(row: ApprovalRecord): Approval {
  const { tokenHash: _omit, ...rest } = row;
  return rest;
}

export interface ApprovalServiceOptions {
  store: ApprovalStore;
  now?: () => Date;
  /** Validade do token depois de aprovado (padrão 24 h). */
  ttlMs?: number;
  /** Quanto tempo uma proposta pendente pode ser aprovada (padrão 7 dias). */
  pendingTtlMs?: number;
}

export interface AuthorizeInput {
  approvalId: string | undefined;
  approvalToken: string | undefined;
  merchantId: string;
  kind: ApprovalKind;
  /** Payload que a tool vai executar: precisa ser idêntico ao aprovado. */
  payload: unknown;
}

/** Quem decide. A rota (painel/n8n) confere antes que `userId` é dono de `merchantId`. */
export interface Decision {
  approvalId: string;
  merchantId: string;
  userId: string;
}

export interface ApprovalService {
  create(input: NewApprovalInput): Promise<Approval>;
  approve(d: Decision): Promise<{ approval: Approval; token: string }>;
  reject(d: Decision): Promise<Approval>;
  list(merchantId: string, status?: ApprovalStatus): Promise<Approval[]>;
  get(id: string, merchantId: string): Promise<Approval | null>;
  /** Valida e consome o token. Devolve a aprovação já `executed`. */
  authorize(input: AuthorizeInput): Promise<Approval>;
}

export interface NewApprovalInput {
  merchantId: string;
  kind: ApprovalKind;
  payload: unknown;
  summary: string;
  /** Quem propôs, ex.: "agent:menu". */
  requestedBy: string;
}

export function createApprovalService(opts: ApprovalServiceOptions): ApprovalService {
  const { store } = opts;
  const now = opts.now ?? (() => new Date());
  const ttlMs = opts.ttlMs ?? APPROVAL_TTL_MS;
  const pendingTtlMs = opts.pendingTtlMs ?? PENDING_TTL_MS;

  /** Aprovação de outra loja responde igual a inexistente (sem enumeração de ids). */
  async function load(id: string, merchantId: string): Promise<ApprovalRecord> {
    const row = await store.get(id);
    if (!row || row.merchantId !== merchantId) throw new ApprovalError('not_found');
    return row;
  }

  async function loadPending(d: Decision): Promise<ApprovalRecord> {
    const row = await load(d.approvalId, d.merchantId);
    if (row.status !== 'pending') throw new ApprovalError('invalid_state');
    if (now().getTime() - row.createdAt.getTime() >= pendingTtlMs) {
      await store.transition(row.id, 'pending', { status: 'expired' });
      throw new ApprovalError('expired');
    }
    return row;
  }

  return {
    async create(input) {
      if (!APPROVAL_KINDS.includes(input.kind)) throw new ApprovalError('wrong_kind');
      // Congela o payload: o que for aprovado é exatamente isto.
      const payload = JSON.parse(canonicalJson(input.payload)) as unknown;
      const row = await store.insert({
        merchantId: input.merchantId,
        kind: input.kind,
        payload,
        payloadHash: hashPayload(payload),
        summary: input.summary.slice(0, 500),
        requestedBy: input.requestedBy,
      });
      return redact(row);
    },

    async approve(d) {
      const current = await loadPending(d);
      const token = randomBytes(32).toString('base64url');
      const at = now();
      const approval = await store.transition(current.id, 'pending', {
        status: 'approved',
        tokenHash: sha256(token),
        expiresAt: new Date(at.getTime() + ttlMs),
        approvedBy: d.userId,
        approvedAt: at,
      });
      if (!approval) throw new ApprovalError('invalid_state');
      return { approval: redact(approval), token };
    },

    async reject(d) {
      const current = await loadPending(d);
      const row = await store.transition(current.id, 'pending', {
        status: 'rejected',
        approvedBy: d.userId,
        approvedAt: now(),
      });
      if (!row) throw new ApprovalError('invalid_state');
      return redact(row);
    },

    list: async (merchantId, status) => (await store.list(merchantId, status)).map(redact),
    get: async (id, merchantId) => {
      const row = await store.get(id);
      return row && row.merchantId === merchantId ? redact(row) : null;
    },

    async authorize(input) {
      const id = input.approvalId?.trim();
      const token = input.approvalToken?.trim();
      if (!id || !token) throw new ApprovalError('missing_approval');

      const row = await load(id, input.merchantId);
      if (row.kind !== input.kind) throw new ApprovalError('wrong_kind');
      // Payload pedido = payload aprovado, e o guardado não foi adulterado.
      if (
        !sameHash(hashPayload(input.payload), row.payloadHash) ||
        !sameHash(hashPayload(row.payload), row.payloadHash)
      ) {
        throw new ApprovalError('payload_mismatch');
      }

      switch (row.status) {
        case 'pending':
          throw new ApprovalError('not_approved');
        case 'rejected':
          throw new ApprovalError('rejected');
        case 'expired':
          throw new ApprovalError('expired');
        case 'executed':
          throw new ApprovalError('already_used');
        case 'approved':
          break;
      }

      const tokenHash = sha256(token);
      if (!row.tokenHash || !sameHash(tokenHash, row.tokenHash)) {
        throw new ApprovalError('invalid_token');
      }

      const at = now();
      if (!row.expiresAt || row.expiresAt.getTime() <= at.getTime()) {
        await store.transition(id, 'approved', { status: 'expired' });
        throw new ApprovalError('expired');
      }

      const consumed = await store.transition(
        id,
        'approved',
        { status: 'executed', executedAt: at },
        { tokenHash, notExpiredAt: at },
      );
      if (!consumed) throw new ApprovalError('already_used');
      return redact(consumed);
    },
  };
}

// ---------- store em memória (testes, demo offline) ----------

export class MemoryApprovalStore implements ApprovalStore {
  readonly rows = new Map<string, ApprovalRecord>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async insert(row: NewApproval): Promise<ApprovalRecord> {
    const record: ApprovalRecord = {
      ...row,
      id: crypto.randomUUID(),
      status: 'pending',
      tokenHash: null,
      expiresAt: null,
      approvedBy: null,
      approvedAt: null,
      executedAt: null,
      createdAt: this.now(),
    };
    this.rows.set(record.id, record);
    return structuredClone(record);
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : null;
  }

  async list(merchantId: string, status?: ApprovalStatus): Promise<ApprovalRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.merchantId === merchantId && (!status || r.status === status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => structuredClone(r));
  }

  async transition(
    id: string,
    from: ApprovalStatus,
    patch: ApprovalPatch,
    guard: TransitionGuard = {},
  ): Promise<ApprovalRecord | null> {
    const row = this.rows.get(id);
    if (!row || row.status !== from) return null;
    if (guard.tokenHash !== undefined && row.tokenHash !== guard.tokenHash) return null;
    if (
      guard.notExpiredAt !== undefined &&
      (!row.expiresAt || row.expiresAt.getTime() <= guard.notExpiredAt.getTime())
    ) {
      return null;
    }
    Object.assign(row, patch);
    return structuredClone(row);
  }
}
