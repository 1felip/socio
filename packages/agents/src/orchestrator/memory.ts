/**
 * Memória curta por loja: as últimas N mensagens ficam em `conversations.state.messages`.
 * Uma conversa por (loja, canal, externalRef). Sem tabela nova: o schema já tem `state jsonb`.
 */
import type { DbClient, Json } from '@socio/db';
import type { Channel } from './schema.ts';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** ISO 8601. */
  at: string;
}

export interface Conversation {
  id: string;
  history: ChatTurn[];
}

export interface ConversationKey {
  merchantId: string;
  channel: Channel;
  externalRef?: string;
}

export interface ConversationStore {
  /** Abre (ou cria) a conversa e devolve o histórico curto. */
  open(key: ConversationKey): Promise<Conversation>;
  /** Acrescenta turnos e mantém só os últimos `keep`. */
  append(conversationId: string, turns: ChatTurn[], keep: number): Promise<void>;
}

export const DEFAULT_HISTORY = 12;
const MAX_TURN_CHARS = 2000;

function clip(turn: ChatTurn): ChatTurn {
  return turn.text.length > MAX_TURN_CHARS
    ? { ...turn, text: `${turn.text.slice(0, MAX_TURN_CHARS)}…` }
    : turn;
}

function isTurn(v: unknown): v is ChatTurn {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return (
    (t.role === 'user' || t.role === 'assistant') &&
    typeof t.text === 'string' &&
    typeof t.at === 'string'
  );
}

/** Lê `state.messages` tolerando lixo (estado antigo, edição manual). */
export function historyFromState(state: unknown): ChatTurn[] {
  if (!state || typeof state !== 'object') return [];
  const messages = (state as Record<string, unknown>).messages;
  return Array.isArray(messages) ? messages.filter(isTurn) : [];
}

export function mergeHistory(history: ChatTurn[], turns: ChatTurn[], keep: number): ChatTurn[] {
  return [...history, ...turns.map(clip)].slice(-Math.max(0, keep));
}

export class MemoryConversationStore implements ConversationStore {
  private readonly rows = new Map<string, { key: string; history: ChatTurn[] }>();
  private seq = 0;

  async open(key: ConversationKey): Promise<Conversation> {
    const k = `${key.merchantId}|${key.channel}|${key.externalRef ?? ''}`;
    for (const [id, row] of this.rows) {
      if (row.key === k) return { id, history: [...row.history] };
    }
    const id = `conv-${++this.seq}`;
    this.rows.set(id, { key: k, history: [] });
    return { id, history: [] };
  }

  async append(conversationId: string, turns: ChatTurn[], keep: number): Promise<void> {
    const row = this.rows.get(conversationId);
    if (!row) throw new Error(`conversa ${conversationId} não existe`);
    row.history = mergeHistory(row.history, turns, keep);
  }
}

/**
 * Sobre o Supabase, com cliente service role (a rota já autenticou e conferiu a loja).
 * append é ler-alterar-gravar: duas mensagens simultâneas na mesma conversa podem perder
 * um turno do histórico curto. Aceitável para memória de contexto; nada de negócio depende.
 */
export class SupabaseConversationStore implements ConversationStore {
  private readonly db: DbClient;
  constructor(db: DbClient) {
    this.db = db;
  }

  async open(key: ConversationKey): Promise<Conversation> {
    let q = this.db
      .from('conversations')
      .select('id, state')
      .eq('merchant_id', key.merchantId)
      .eq('channel', key.channel);
    q = key.externalRef ? q.eq('external_ref', key.externalRef) : q.is('external_ref', null);
    const { data, error } = await q
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`conversations.open: ${error.message}`);
    if (data) return { id: data.id, history: historyFromState(data.state) };

    const { data: created, error: insErr } = await this.db
      .from('conversations')
      .insert({
        merchant_id: key.merchantId,
        channel: key.channel,
        external_ref: key.externalRef ?? null,
        state: { messages: [] },
      })
      .select('id')
      .single();
    if (insErr || !created) throw new Error(`conversations.insert: ${insErr?.message}`);
    return { id: created.id, history: [] };
  }

  async append(conversationId: string, turns: ChatTurn[], keep: number): Promise<void> {
    const { data, error } = await this.db
      .from('conversations')
      .select('state')
      .eq('id', conversationId)
      .single();
    if (error || !data) throw new Error(`conversations.read: ${error?.message}`);
    const base = data.state && typeof data.state === 'object' ? data.state : {};
    const messages = mergeHistory(historyFromState(data.state), turns, keep);
    const { error: upErr } = await this.db
      .from('conversations')
      .update({
        state: { ...(base as Record<string, Json>), messages } as unknown as Json,
        last_message_at: turns.at(-1)?.at ?? new Date().toISOString(),
      })
      .eq('id', conversationId);
    if (upErr) throw new Error(`conversations.update: ${upErr.message}`);
  }
}
