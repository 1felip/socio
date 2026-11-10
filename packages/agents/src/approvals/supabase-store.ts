/**
 * ApprovalStore sobre o Supabase. Use só com o cliente service role, no servidor:
 * o painel não tem UPDATE em `approvals` (RLS) e nunca lê `token_hash`.
 */
import type { DbClient, Json, Tables, TablesUpdate } from '@socio/db';
import type {
  ApprovalPatch,
  ApprovalRecord,
  ApprovalStatus,
  ApprovalStore,
  NewApproval,
  TransitionGuard,
} from './service.ts';

type Row = Tables<'approvals'>;

function toDate(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

function fromRow(r: Row): ApprovalRecord {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    kind: r.kind,
    payload: r.payload,
    payloadHash: r.payload_hash,
    summary: r.summary,
    status: r.status,
    tokenHash: r.token_hash,
    expiresAt: toDate(r.expires_at),
    requestedBy: r.requested_by,
    approvedBy: r.approved_by,
    approvedAt: toDate(r.approved_at),
    executedAt: toDate(r.executed_at),
    createdAt: new Date(r.created_at),
  };
}

function toUpdate(p: ApprovalPatch): TablesUpdate<'approvals'> {
  const u: TablesUpdate<'approvals'> = {};
  if (p.status !== undefined) u.status = p.status;
  if (p.tokenHash !== undefined) u.token_hash = p.tokenHash;
  if (p.expiresAt !== undefined) u.expires_at = p.expiresAt?.toISOString() ?? null;
  if (p.approvedBy !== undefined) u.approved_by = p.approvedBy;
  if (p.approvedAt !== undefined) u.approved_at = p.approvedAt?.toISOString() ?? null;
  if (p.executedAt !== undefined) u.executed_at = p.executedAt?.toISOString() ?? null;
  return u;
}

export class SupabaseApprovalStore implements ApprovalStore {
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
  }

  async insert(row: NewApproval): Promise<ApprovalRecord> {
    const { data, error } = await this.db
      .from('approvals')
      .insert({
        merchant_id: row.merchantId,
        kind: row.kind,
        payload: row.payload as Json,
        payload_hash: row.payloadHash,
        summary: row.summary,
        requested_by: row.requestedBy,
      })
      .select()
      .single();
    if (error) throw new Error(`approvals insert: ${error.message}`);
    return fromRow(data);
  }

  async get(id: string): Promise<ApprovalRecord | null> {
    const { data, error } = await this.db.from('approvals').select().eq('id', id).maybeSingle();
    if (error) throw new Error(`approvals get: ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async list(merchantId: string, status?: ApprovalStatus): Promise<ApprovalRecord[]> {
    let q = this.db.from('approvals').select().eq('merchant_id', merchantId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(`approvals list: ${error.message}`);
    return data.map(fromRow);
  }

  /** Um único UPDATE condicional: duas execuções simultâneas não consomem o mesmo token. */
  async transition(
    id: string,
    from: ApprovalStatus,
    patch: ApprovalPatch,
    guard: TransitionGuard = {},
  ): Promise<ApprovalRecord | null> {
    let q = this.db.from('approvals').update(toUpdate(patch)).eq('id', id).eq('status', from);
    if (guard.tokenHash !== undefined) q = q.eq('token_hash', guard.tokenHash);
    if (guard.notExpiredAt !== undefined) q = q.gt('expires_at', guard.notExpiredAt.toISOString());
    const { data, error } = await q.select().maybeSingle();
    if (error) throw new Error(`approvals transition: ${error.message}`);
    return data ? fromRow(data) : null;
  }
}
