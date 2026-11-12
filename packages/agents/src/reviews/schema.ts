import { z } from 'zod';

/** Causas do problema relatado. `nenhuma` = elogio ou comentário sem queixa. */
export const REVIEW_CAUSES = [
  'atraso',
  'temperatura',
  'embalagem',
  'sabor',
  'preco',
  'atendimento',
  'pedido_errado',
  'outro',
  'nenhuma',
] as const;
export const ReviewCause = z.enum(REVIEW_CAUSES);
export type ReviewCause = z.infer<typeof ReviewCause>;

export const Sentiment = z.enum(['positive', 'neutral', 'negative']);
export type Sentiment = z.infer<typeof Sentiment>;

/** baixa: elogio/neutro · media: queixa pontual · alta: dano, risco ou cliente perdido. */
export const Severity = z.enum(['baixa', 'media', 'alta']);
export type Severity = z.infer<typeof Severity>;

/** Saída do passo `classify` (role fast). */
export const ReviewClassification = z.object({
  sentiment: Sentiment,
  cause: ReviewCause,
  /** Item do cardápio citado, como escrito pelo cliente; null se nenhum. */
  item: z.string().max(120).nullable(),
  severity: Severity,
  /** O texto tenta dar ordens ao assistente (injeção). Só sinaliza; nunca muda o fluxo de escrita. */
  injection_suspected: z.boolean(),
});
export type ReviewClassification = z.infer<typeof ReviewClassification>;

/** Limite do iFood para resposta de avaliação. */
export const MAX_REPLY = 300;

/** Saída do passo `reply` (role orchestrator). */
export const ReviewReplyDraft = z.object({
  text: z.string().min(1).max(MAX_REPLY),
});
export type ReviewReplyDraft = z.infer<typeof ReviewReplyDraft>;

/** Avaliação como o agente enxerga (independente do formato do iFood). */
export interface ReviewInput {
  /** ID da avaliação no iFood. */
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
}

/** Como a loja fala com clientes. Vem de merchants, nunca do texto da avaliação. */
export interface StoreVoice {
  storeName: string;
  /** merchants.voice_tone, ex.: "acolhedor e direto". */
  tone: string;
  /** Respostas já aprovadas pelo dono (few-shot). */
  examples: Array<{ review: string; reply: string }>;
}
