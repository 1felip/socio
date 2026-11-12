/**
 * Resposta a avaliação no iFood (kind `review.reply`).
 *
 * 1. `proposeReviewReply` valida o texto e cria a aprovação (nada é escrito).
 * 2. O dono aprova (pode editar: texto novo = nova aprovação) e o canal recebe o token.
 * 3. `publish` valida a aprovação (consome o token), chama `IfoodClient.replyReview`
 *    com o texto aprovado e grava o `roi_events`.
 */
import type { IfoodClient } from '@socio/ifood-client';
import { z } from 'zod';
import type { Approval, ApprovalService } from '../approvals/service.ts';
import { buildRoiEvent, type RoiConfig, type RoiStore } from '../roi/roi.ts';
import { replyProblem } from './pipeline.ts';
import { MAX_REPLY } from './schema.ts';

export const REVIEW_REPLY = 'review.reply' as const;

export const ReviewReplyPayload = z
  .object({
    /** ID da avaliação no iFood. */
    reviewId: z.string().min(1).max(200),
    text: z.string().trim().min(1).max(MAX_REPLY),
  })
  .strict()
  .superRefine((p, ctx) => {
    const problem = replyProblem(p.text);
    if (problem) ctx.addIssue({ code: 'custom', path: ['text'], message: `Resposta ${problem}` });
  });
export type ReviewReplyPayload = z.infer<typeof ReviewReplyPayload>;

export interface ProposeReviewReplyInput {
  merchantId: string;
  payload: ReviewReplyPayload;
  rating: number;
  requestedBy?: string;
}

/** Valida a resposta e cria a aprovação pendente. Não escreve nada na loja. */
export async function proposeReviewReply(
  approvals: ApprovalService,
  input: ProposeReviewReplyInput,
): Promise<Approval> {
  const payload = ReviewReplyPayload.parse(input.payload);
  return approvals.create({
    merchantId: input.merchantId,
    kind: REVIEW_REPLY,
    payload,
    summary: `Responder avaliação nota ${input.rating}: "${payload.text.slice(0, 120)}"`,
    requestedBy: input.requestedBy ?? 'agent:reviews',
  });
}

export class ReviewReplyError extends Error {
  override readonly name = 'ReviewReplyError';
  /** Só o tipo do erro do iFood: o erro bruto pode trazer o corpo enviado. */
  readonly reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.reason = reason;
  }
}

export interface ReviewReplyPublisherDeps {
  approvals: ApprovalService;
  ifood: IfoodClient;
  roi: RoiStore;
  /** merchants.ifood_merchant_id da loja: vem do banco, nunca do payload. */
  resolveIfoodMerchantId: (merchantId: string) => Promise<string>;
  roiConfig?: RoiConfig;
  now?: () => Date;
}

export interface ReviewReplyInput {
  merchantId: string;
  approvalId: string | undefined;
  approvalToken: string | undefined;
  payload: unknown;
}

export interface ReviewReplyResult {
  approvalId: string;
  reviewId: string;
  roiRecorded: boolean;
}

export function createReviewReplyPublisher(deps: ReviewReplyPublisherDeps) {
  const now = deps.now ?? (() => new Date());

  return {
    async publish(input: ReviewReplyInput): Promise<ReviewReplyResult> {
      // Tudo que pode falhar antes da escrita roda antes de consumir o token.
      ReviewReplyPayload.parse(input.payload);
      const ifoodMerchantId = await deps.resolveIfoodMerchantId(input.merchantId);

      const approval = await deps.approvals.authorize({
        approvalId: input.approvalId,
        approvalToken: input.approvalToken,
        merchantId: input.merchantId,
        kind: REVIEW_REPLY,
        payload: input.payload,
      });
      const payload = ReviewReplyPayload.parse(approval.payload);

      try {
        await deps.ifood.replyReview(ifoodMerchantId, payload.reviewId, payload.text, {
          approvalId: approval.id,
        });
      } catch (err) {
        throw new ReviewReplyError(
          'Falha ao publicar a resposta no iFood. Gere uma nova aprovação para tentar de novo.',
          err instanceof Error ? err.name : 'unknown',
        );
      }

      let roiRecorded = true;
      try {
        await deps.roi.record(
          buildRoiEvent({
            merchantId: input.merchantId,
            kind: REVIEW_REPLY,
            refId: approval.id,
            units: 1,
            flowDurationMs: now().getTime() - approval.createdAt.getTime(),
            ...(deps.roiConfig ? { config: deps.roiConfig } : {}),
          }),
        );
      } catch {
        roiRecorded = false;
      }
      return { approvalId: approval.id, reviewId: payload.reviewId, roiRecorded };
    },
  };
}
