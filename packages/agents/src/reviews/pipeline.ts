/**
 * Agente Avaliações: avaliação → classificação + resposta sugerida.
 *
 * 1. fast: classifica (sentimento, causa, item, gravidade, suspeita de injeção).
 * 2. orchestrator: redige a resposta no tom da loja, com respostas já aprovadas como exemplos.
 * 3. código: confere a resposta (tamanho, links, PII, promessas de dinheiro). Reprovou → modelo
 *    seguro por causa.
 *
 * Os dois passos leem texto de terceiros, então nenhum tem tools: só generateObject.
 * Nada é publicado aqui. Publicar exige aprovação (reply.ts).
 */
import {
  type CallContext,
  type CallOptions,
  generateObject,
  loadPrompt,
  type Prompt,
  untrusted,
} from '@socio/llm';
import { textProblem } from '../catalog/publish.ts';
import {
  MAX_REPLY,
  type ReviewCause,
  ReviewClassification,
  type ReviewInput,
  ReviewReplyDraft,
  type StoreVoice,
} from './schema.ts';

export const REVIEWS_AGENT = 'reviews';
/** Exemplos aprovados que entram no prompt. */
export const MAX_EXAMPLES = 3;
/** Comentário maior que isso é cortado antes do modelo. */
export const MAX_COMMENT = 2000;

export interface ReviewAgentOptions {
  merchantId: string;
  promptVersions?: { classify?: number; reply?: number };
}

function ctxFor(opts: ReviewAgentOptions, step: string, prompt: Prompt): CallContext {
  return { merchantId: opts.merchantId, agent: REVIEWS_AGENT, step, prompt };
}

function promptCall(prompt: Prompt): Pick<CallOptions, 'role' | 'system' | 'temperature'> {
  return {
    role: prompt.role,
    system: prompt.body,
    ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
  };
}

/** Bloco <review> delimitado e mascarado. */
export function reviewBlock(review: Pick<ReviewInput, 'rating' | 'comment'>): string {
  const comment = review.comment.slice(0, MAX_COMMENT).trim() || '(sem comentário)';
  return untrusted('review', `Nota: ${review.rating} de 5\nComentário: ${comment}`);
}

export async function classifyReview(
  review: ReviewInput,
  opts: ReviewAgentOptions,
): Promise<{ classification: ReviewClassification; costUsd: number; prompt: string }> {
  const v = opts.promptVersions?.classify;
  const prompt = loadPrompt(REVIEWS_AGENT, 'classify', v ? { version: v } : {});
  const res = await generateObject({
    ...promptCall(prompt),
    ctx: ctxFor(opts, 'classify', prompt),
    schema: ReviewClassification,
    schemaName: 'review_classification',
    maxOutputTokens: 400,
    prompt: reviewBlock(review),
  });
  return { classification: res.object, costUsd: res.costUsd, prompt: prompt.id };
}

// Promessas que só o dono pode fazer: desconto, cupom, reembolso, brinde, valores.
const MONEY_PROMISE =
  /(desconto|cupom|cupon|reembols|estorn|brinde|gr[aá]tis|de gra[cç]a|cortesia|\d+\s*%|r\$\s*\d)/i;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PII_TOKEN = /\[(nome|telefone|email|cpf)[^\]]*\]/i;

/** Motivo para não usar a resposta do modelo, ou null se ela pode ir ao dono. */
export function replyProblem(text: string): string | null {
  const base = textProblem(text, MAX_REPLY);
  if (base) return base;
  if (MONEY_PROMISE.test(text)) return 'promete desconto, brinde ou dinheiro.';
  if (PHONE.test(text) || EMAIL.test(text) || PII_TOKEN.test(text)) {
    return 'tem dado pessoal (telefone, e-mail ou nome mascarado).';
  }
  return null;
}

const FALLBACK: Record<ReviewCause, string> = {
  atraso:
    'Obrigado pelo retorno e desculpe pela demora no seu pedido. Vamos rever nosso tempo de preparo e entrega para isso não se repetir.',
  temperatura:
    'Obrigado pelo retorno e desculpe por seu pedido ter chegado frio. Vamos reforçar a embalagem térmica e o tempo de saída dos pedidos.',
  embalagem:
    'Obrigado pelo retorno e desculpe pelo problema com a embalagem. Vamos revisar como fechamos e acomodamos os pedidos.',
  sabor:
    'Obrigado pelo retorno sincero. Vamos conversar com a cozinha sobre o que você apontou para acertar o sabor.',
  preco:
    'Obrigado pelo retorno. Vamos rever as porções e os preços com carinho para entregar mais valor no seu pedido.',
  atendimento:
    'Obrigado pelo retorno e desculpe pelo atendimento. Vamos conversar com a equipe para melhorar isso.',
  pedido_errado:
    'Obrigado pelo retorno e desculpe pelo erro no seu pedido. Vamos reforçar a conferência antes de cada entrega.',
  outro:
    'Obrigado pelo retorno. Anotamos o que você contou e vamos trabalhar para melhorar sua próxima experiência.',
  nenhuma: 'Muito obrigado pela avaliação! Ficamos felizes que você gostou. Volte sempre!',
};

export function fallbackReply(cause: ReviewCause): string {
  return FALLBACK[cause];
}

export interface DraftReplyResult {
  text: string;
  /** true quando a resposta do modelo foi trocada pelo modelo seguro. */
  fallback: boolean;
  /** Por que a resposta do modelo foi recusada. */
  problem: string | null;
  costUsd: number;
  prompt: string;
}

export async function draftReply(
  review: ReviewInput,
  classification: ReviewClassification,
  voice: StoreVoice,
  opts: ReviewAgentOptions,
): Promise<DraftReplyResult> {
  const v = opts.promptVersions?.reply;
  const prompt = loadPrompt(REVIEWS_AGENT, 'reply', v ? { version: v } : {});
  const examples = voice.examples.slice(0, MAX_EXAMPLES);
  const parts = [
    `<loja>\nNome: ${voice.storeName}\nTom: ${voice.tone}\n</loja>`,
    // Exemplos vêm de respostas aprovadas pelo dono, mas a avaliação original é de terceiro.
    examples.length > 0
      ? `<exemplos>\n${examples
          .map(
            (e, i) =>
              `${i + 1}.\n${untrusted('review', e.review.slice(0, 500))}\nResposta aprovada: ${e.reply}`,
          )
          .join('\n')}\n</exemplos>`
      : '<exemplos>\n(nenhum ainda)\n</exemplos>',
    `<classificacao>\n${JSON.stringify({
      sentiment: classification.sentiment,
      cause: classification.cause,
      severity: classification.severity,
    })}\n</classificacao>`,
    reviewBlock(review),
  ];
  const res = await generateObject({
    ...promptCall(prompt),
    ctx: ctxFor(opts, 'reply', prompt),
    schema: ReviewReplyDraft,
    schemaName: 'review_reply',
    maxOutputTokens: 400,
    prompt: parts.join('\n\n'),
  });
  const text = res.object.text.trim();
  const problem = replyProblem(text);
  return {
    text: problem ? fallbackReply(classification.cause) : text,
    fallback: problem !== null,
    problem,
    costUsd: res.costUsd,
    prompt: prompt.id,
  };
}

export interface ReviewAnalysis {
  review: ReviewInput;
  classification: ReviewClassification;
  reply: DraftReplyResult;
  costUsd: number;
}

export async function analyzeReview(
  review: ReviewInput,
  voice: StoreVoice,
  opts: ReviewAgentOptions,
): Promise<ReviewAnalysis> {
  const c = await classifyReview(review, opts);
  const reply = await draftReply(review, c.classification, voice, opts);
  return {
    review,
    classification: c.classification,
    reply,
    costUsd: c.costUsd + reply.costUsd,
  };
}
