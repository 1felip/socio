/**
 * ReviewSyncStore sobre o Supabase (service role, só no servidor).
 * reviews guarda a classificação; review_replies guarda o rascunho ligado à aprovação.
 */
import type { DbClient } from '@socio/db';
import { MAX_EXAMPLES } from './pipeline.ts';
import type { StoreVoice } from './schema.ts';
import type { ReviewSyncStore, SavedReview } from './sync.ts';

export class SupabaseReviewSyncStore implements ReviewSyncStore {
  private readonly db: DbClient;
  constructor(db: DbClient) {
    this.db = db;
  }

  async processed(merchantId: string, reviewIds: readonly string[]): Promise<Set<string>> {
    if (reviewIds.length === 0) return new Set();
    // Classificada = já passou pelo agente (sentiment só é gravado aqui).
    const { data, error } = await this.db
      .from('reviews')
      .select('external_id')
      .eq('merchant_id', merchantId)
      .in('external_id', [...reviewIds])
      .not('sentiment', 'is', null);
    if (error) throw new Error(`reviews: ${error.message}`);
    return new Set((data ?? []).flatMap((r) => (r.external_id ? [r.external_id] : [])));
  }

  async voice(merchantId: string): Promise<StoreVoice> {
    const m = await this.db
      .from('merchants')
      .select('name, voice_tone')
      .eq('id', merchantId)
      .maybeSingle();
    if (m.error || !m.data) throw new Error('Loja não encontrada.');

    const replies = await this.db
      .from('review_replies')
      .select('review_id, body')
      .eq('merchant_id', merchantId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(MAX_EXAMPLES);
    if (replies.error) throw new Error(`review_replies: ${replies.error.message}`);
    const rows = replies.data ?? [];
    let examples: StoreVoice['examples'] = [];
    if (rows.length > 0) {
      const reviews = await this.db
        .from('reviews')
        .select('id, comment')
        .eq('merchant_id', merchantId)
        .in(
          'id',
          rows.map((r) => r.review_id),
        );
      if (reviews.error) throw new Error(`reviews: ${reviews.error.message}`);
      examples = rows.flatMap((r) => {
        const rv = reviews.data?.find((x) => x.id === r.review_id);
        return rv?.comment ? [{ review: rv.comment, reply: r.body }] : [];
      });
    }
    return { storeName: m.data.name, tone: m.data.voice_tone, examples };
  }

  async save(merchantId: string, saved: SavedReview): Promise<void> {
    const c = saved.classification;
    const up = await this.db
      .from('reviews')
      .upsert(
        {
          merchant_id: merchantId,
          external_id: saved.review.id,
          rating: saved.review.rating,
          comment: saved.review.comment || null,
          reviewed_at: saved.review.createdAt,
          sentiment: c.sentiment,
          topics: c.cause === 'nenhuma' ? [] : [c.cause],
        },
        { onConflict: 'merchant_id,external_id' },
      )
      .select('id')
      .single();
    if (up.error || !up.data) throw new Error(`reviews: ${up.error?.message ?? 'sem id'}`);

    const ins = await this.db.from('review_replies').insert({
      review_id: up.data.id,
      merchant_id: merchantId,
      body: saved.replyText,
      status: 'draft',
      approval_id: saved.approvalId,
    });
    if (ins.error) throw new Error(`review_replies: ${ins.error.message}`);
  }
}
