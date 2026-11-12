/** Respostas sem modelo do Agente Avaliações: testes (LLM_FAKE=1) e modo demo. */
import { type FakeRequest, setFakeResponder } from '@socio/llm';
import { fallbackReply, type ReviewAnalysis } from './pipeline.ts';
import type { ReviewCause, ReviewClassification, ReviewInput } from './schema.ts';

const RULES: Array<[RegExp, ReviewCause]> = [
  [/frio|fria|gelad|morn/i, 'temperatura'],
  [/atras|demor|esperei/i, 'atraso'],
  [/embalagem|vazou|amassad/i, 'embalagem'],
  [/errado|faltou|outro sabor/i, 'pedido_errado'],
  [/caro|pre[cç]o/i, 'preco'],
  [/sem sal|sem sabor|gorduros/i, 'sabor'],
];

/** Classificação por palavra-chave. Não é o agente: serve para testes e demo. */
export function keywordClassify(rating: number, comment: string): ReviewClassification {
  const cause = RULES.find(([re]) => re.test(comment))?.[1] ?? (rating >= 4 ? 'nenhuma' : 'outro');
  return {
    sentiment: rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative',
    cause,
    item: /pizza/i.test(comment) ? 'pizza' : null,
    severity: rating <= 2 ? 'media' : 'baixa',
    injection_suspected: /ignore|\[sistema\]|instru[cç]/i.test(comment),
  };
}

/** Lê o bloco <review> do prompt fake. O system prompt também cita "<review>", sem quebra de linha. */
export function fakeClassify(prompt: string): ReviewClassification {
  const text = prompt.replaceAll('\\n', '\n');
  const block = /<review>\n([\s\S]*?)\n<\/review>/.exec(text)?.[1] ?? '';
  const rating = Number(/Nota: (\d)/.exec(block)?.[1] ?? '3');
  return keywordClassify(rating, block.replace(/^Nota: .*$/m, ''));
}

export const FAKE_REPLY =
  'Obrigado pelo retorno! Sentimos muito pelo problema e vamos ajustar isso na cozinha.';

export function fakeReviewsResponder(req: FakeRequest): string {
  if (req.role === 'fast') return JSON.stringify(fakeClassify(req.prompt));
  return JSON.stringify({ text: FAKE_REPLY });
}

export function useFakeReviews(): void {
  setFakeResponder(fakeReviewsResponder);
}

/** Análise do modo demo: sem modelo, resposta = modelo seguro por causa. */
export async function demoAnalyzeReview(review: ReviewInput): Promise<ReviewAnalysis> {
  const classification = keywordClassify(review.rating, review.comment);
  return {
    review,
    classification,
    reply: {
      text: fallbackReply(classification.cause),
      fallback: true,
      problem: null,
      costUsd: 0,
      prompt: 'demo',
    },
    costUsd: 0,
  };
}
