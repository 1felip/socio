/**
 * Gravação de execuções em agent_runs e leitura do gasto para os tetos de custo.
 * O wrapper recebe um RunStore; em teste use MemoryRunStore, em produção SupabaseRunStore.
 */
import type { DbClient, TablesInsert } from '@socio/db';

export type RunStatus = 'ok' | 'error' | 'blocked';

export interface AgentRun {
  merchantId: string;
  conversationId?: string;
  agent: string;
  step: string;
  model: string;
  promptVersion?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: RunStatus;
  error?: string;
  traceId?: string;
  createdAt?: Date;
}

export interface RunStore {
  record(run: AgentRun): Promise<void>;
  /** Gasto em USD da loja desde `since` (início do dia no fuso da loja). */
  spentByMerchantSince(merchantId: string, since: Date): Promise<number>;
  spentByConversation(conversationId: string): Promise<number>;
}

export class MemoryRunStore implements RunStore {
  readonly runs: AgentRun[] = [];

  async record(run: AgentRun): Promise<void> {
    this.runs.push({ ...run, createdAt: run.createdAt ?? new Date() });
  }

  async spentByMerchantSince(merchantId: string, since: Date): Promise<number> {
    return sum(
      this.runs.filter(
        (r) => r.merchantId === merchantId && (r.createdAt?.getTime() ?? 0) >= since.getTime(),
      ),
    );
  }

  async spentByConversation(conversationId: string): Promise<number> {
    return sum(this.runs.filter((r) => r.conversationId === conversationId));
  }
}

function sum(runs: AgentRun[]): number {
  return runs.reduce((acc, r) => acc + r.costUsd, 0);
}

/** Usa o client de service role (servidor). O step entra no prefixo do campo agent ("menu:extract"). */
export class SupabaseRunStore implements RunStore {
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
  }

  async record(run: AgentRun): Promise<void> {
    const row: TablesInsert<'agent_runs'> = {
      merchant_id: run.merchantId,
      conversation_id: run.conversationId ?? null,
      agent: `${run.agent}:${run.step}`,
      model: run.model,
      prompt_version: run.promptVersion ?? null,
      input_tokens: run.inputTokens,
      output_tokens: run.outputTokens,
      cost_usd: Number(run.costUsd.toFixed(6)),
      latency_ms: Math.round(run.latencyMs),
      status: run.status,
      error: run.error?.slice(0, 2000) ?? null,
      trace_id: run.traceId ?? null,
    };
    const { error } = await this.db.from('agent_runs').insert(row);
    if (error) throw new Error(`agent_runs insert: ${error.message}`);
  }

  async spentByMerchantSince(merchantId: string, since: Date): Promise<number> {
    const { data, error } = await this.db
      .from('agent_runs')
      .select('cost_usd')
      .eq('merchant_id', merchantId)
      .gte('created_at', since.toISOString());
    if (error) throw new Error(`agent_runs select: ${error.message}`);
    return (data ?? []).reduce((acc, r) => acc + Number(r.cost_usd), 0);
  }

  async spentByConversation(conversationId: string): Promise<number> {
    const { data, error } = await this.db
      .from('agent_runs')
      .select('cost_usd')
      .eq('conversation_id', conversationId);
    if (error) throw new Error(`agent_runs select: ${error.message}`);
    return (data ?? []).reduce((acc, r) => acc + Number(r.cost_usd), 0);
  }
}
