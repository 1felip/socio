/**
 * `reviews:sync`: o n8n chama de hora em hora (POST /api/reviews/sync).
 *
 * Lê avaliações novas no iFood, classifica, redige a resposta e cria uma aprovação
 * `review.reply` por avaliação. Nota 1–2 (ou gravidade alta) vira alerta imediato para o dono.
 * Nunca publica: publicar é `createReviewReplyPublisher` depois da aprovação.
 */
import type { IfoodClient, schemas } from '@socio/ifood-client';
import { CostLimitError } from '@socio/llm';
import type { ApprovalService } from '../approvals/service.ts';
import { textProblem } from '../catalog/publish.ts';
import { analyzeReview, type ReviewAgentOptions } from './pipeline.ts';
import { proposeReviewReply } from './reply.ts';
import type { ReviewClassification, ReviewInput, StoreVoice } from './schema.ts';

/** Avaliações mais antigas que isso não entram (dias). */
export const SYNC_LOOKBACK_DAYS = 7;
export const SYNC_PAGE_SIZE = 50;
export const SYNC_MAX_PAGES = 5;
/** Teto de avaliações processadas por execução (custo). O resto fica para a próxima hora. */
export const SYNC_MAX_REVIEWS = 30;
/** Nota até aqui gera alerta imediato. */
export const ALERT_MAX_RATING = 2;

export interface SavedReview {
  review: ReviewInput;
  classification: ReviewClassification;
  replyText: string;
  approvalId: string;
}

/** Estado local das avaliações (reviews + review_replies no Supabase). */
export interface ReviewSyncStore {
  /** Quais destes IDs do iFood já foram processados. */
  processed(merchantId: string, reviewIds: readonly string[]): Promise<Set<string>>;
  voice(merchantId: string): Promise<StoreVoice>;
  save(merchantId: string, saved: SavedReview): Promise<void>;
}

export class MemoryReviewSyncStore implements ReviewSyncStore {
  readonly saved = new Map<string, SavedReview[]>();
  constructor(private readonly voices: Record<string, StoreVoice> = {}) {}

  async processed(merchantId: string, reviewIds: readonly string[]): Promise<Set<string>> {
    const done = new Set((this.saved.get(merchantId) ?? []).map((s) => s.review.id));
    return new Set(reviewIds.filter((id) => done.has(id)));
  }

  async voice(merchantId: string): Promise<StoreVoice> {
    return (
      this.voices[merchantId] ?? { storeName: 'a loja', tone: 'acolhedor e direto', examples: [] }
    );
  }

  async save(merchantId: string, saved: SavedReview): Promise<void> {
    const list = this.saved.get(merchantId) ?? [];
    list.push(saved);
    this.saved.set(merchantId, list);
  }
}

export interface ReviewAlert {
  reviewId: string;
  rating: number;
  cause: ReviewClassification['cause'];
  severity: ReviewClassification['severity'];
  approvalId: string;
  injectionSuspected: boolean;
  /** Pronta para o WhatsApp do dono (tom-socio). */
  message: string;
}

export interface ReviewSyncResult {
  merchantId: string;
  scanned: number;
  processed: number;
  skipped: number;
  failed: number;
  /** true se parou no teto de custo ou de quantidade; o resto vai na próxima execução. */
  truncated: boolean;
  approvals: string[];
  alerts: ReviewAlert[];
  costUsd: number;
}

export interface ReviewSyncDeps {
  ifood: IfoodClient;
  approvals: ApprovalService;
  store: ReviewSyncStore;
  resolveIfoodMerchantId: (merchantId: string) => Promise<string>;
  now?: () => Date;
  maxReviews?: number;
  promptVersions?: ReviewAgentOptions['promptVersions'];
  /** Troca o agente (modo demo sem modelo). Padrão: analyzeReview. */
  analyze?: typeof analyzeReview;
  /** Janela em dias. null = sem filtro de data (demo, fixtures com data fixa). */
  lookbackDays?: number | null;
}

const CAUSE_LABEL: Record<ReviewClassification['cause'], string> = {
  atraso: 'atraso',
  temperatura: 'comida fria',
  embalagem: 'embalagem',
  sabor: 'sabor',
  preco: 'preço',
  atendimento: 'atendimento',
  pedido_errado: 'pedido errado',
  outro: 'outro problema',
  nenhuma: 'sem queixa clara',
};

export function alertMessage(a: Omit<ReviewAlert, 'message'>, item: string | null): string {
  // `item` vem do modelo a partir de texto de terceiro e vai ao WhatsApp: só se for limpo e curto.
  const safeItem = item && item.length <= 60 && textProblem(item, 60) === null ? item : null;
  const about = safeItem ? ` (${safeItem})` : '';
  const warn = a.injectionSuspected
    ? ' Atenção: o comentário tenta dar ordens ao assistente; ignorei.'
    : '';
  return `Avaliação nota ${a.rating} agora: ${CAUSE_LABEL[a.cause]}${about}.${warn} Deixei uma resposta pronta. Quer que eu publique?`;
}

function toInput(r: schemas.Review): ReviewInput {
  return { id: r.id, rating: r.score, comment: r.comment ?? '', createdAt: r.createdAt };
}

function isOpen(r: schemas.Review): boolean {
  return !r.discarded && (r.replies ?? []).length === 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function syncReviews(
  deps: ReviewSyncDeps,
  merchantId: string,
): Promise<ReviewSyncResult> {
  const now = deps.now ?? (() => new Date());
  const max = deps.maxReviews ?? SYNC_MAX_REVIEWS;
  const ifoodMerchantId = await deps.resolveIfoodMerchantId(merchantId);
  const days = deps.lookbackDays === undefined ? SYNC_LOOKBACK_DAYS : deps.lookbackDays;
  const range =
    days === null
      ? {}
      : {
          dateFrom: isoDate(new Date(now().getTime() - days * 86_400_000)),
          dateTo: isoDate(now()),
        };

  const open: schemas.Review[] = [];
  let scanned = 0;
  for (let page = 1; page <= SYNC_MAX_PAGES; page++) {
    const res = await deps.ifood.listReviews(ifoodMerchantId, {
      page,
      pageSize: SYNC_PAGE_SIZE,
      ...range,
    });
    scanned += res.reviews.length;
    open.push(...res.reviews.filter(isOpen));
    if (page >= res.pageCount || res.reviews.length === 0) break;
  }

  const done = await deps.store.processed(
    merchantId,
    open.map((r) => r.id),
  );
  // Aprovação pendente sem registro no store (save falhou depois do create): não duplica.
  for (const a of await deps.approvals.list(merchantId, 'pending')) {
    const reviewId = (a.payload as { reviewId?: unknown } | null)?.reviewId;
    if (a.kind === 'review.reply' && typeof reviewId === 'string') done.add(reviewId);
  }
  // Mais graves primeiro: se bater no teto, as notas baixas já foram tratadas.
  const todo = open
    .filter((r) => !done.has(r.id))
    .sort((a, b) => a.score - b.score || a.createdAt.localeCompare(b.createdAt));

  const result: ReviewSyncResult = {
    merchantId,
    scanned,
    processed: 0,
    skipped: done.size,
    failed: 0,
    truncated: todo.length > max,
    approvals: [],
    alerts: [],
    costUsd: 0,
  };
  const voice = await deps.store.voice(merchantId);
  const opts: ReviewAgentOptions = {
    merchantId,
    ...(deps.promptVersions ? { promptVersions: deps.promptVersions } : {}),
  };

  for (const raw of todo.slice(0, max)) {
    const review = toInput(raw);
    try {
      const a = await (deps.analyze ?? analyzeReview)(review, voice, opts);
      result.costUsd += a.costUsd;
      const approval = await proposeReviewReply(deps.approvals, {
        merchantId,
        rating: review.rating,
        payload: { reviewId: review.id, text: a.reply.text },
      });
      await deps.store.save(merchantId, {
        review,
        classification: a.classification,
        replyText: a.reply.text,
        approvalId: approval.id,
      });
      result.processed++;
      result.approvals.push(approval.id);

      if (review.rating <= ALERT_MAX_RATING || a.classification.severity === 'alta') {
        const base = {
          reviewId: review.id,
          rating: review.rating,
          cause: a.classification.cause,
          severity: a.classification.severity,
          approvalId: approval.id,
          injectionSuspected: a.classification.injection_suspected,
        };
        result.alerts.push({ ...base, message: alertMessage(base, a.classification.item) });
      }
    } catch (err) {
      if (err instanceof CostLimitError) {
        result.truncated = true;
        break;
      }
      result.failed++;
      console.error('[reviews:sync]', review.id, err instanceof Error ? err.name : 'unknown');
    }
  }
  return result;
}
