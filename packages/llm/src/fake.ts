/**
 * Provider fake (LLM_FAKE=1): nenhum teste chama API real.
 * Respostas determinísticas; troque com setFakeResponder() dentro do teste.
 */
import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test';
import type { ModelRole } from './registry.ts';

export interface FakeRequest {
  role: ModelRole;
  /** Texto do prompt (todas as mensagens concatenadas). */
  prompt: string;
  /** true quando o chamador espera JSON (generateObject). */
  json: boolean;
}

export type FakeResponder = (req: FakeRequest) => string;

const defaultResponder: FakeResponder = (req) =>
  req.json ? '{}' : `[fake:${req.role}] ok (${req.prompt.length} chars)`;

let responder: FakeResponder = defaultResponder;

export function setFakeResponder(fn: FakeResponder | undefined): void {
  responder = fn ?? defaultResponder;
}

export function isFakeMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.LLM_FAKE === '1' || env.LLM_FAKE === 'true';
}

export const FAKE_MODEL_ID = 'fake-model';

function promptText(prompt: unknown): string {
  return JSON.stringify(prompt);
}

/** ~4 caracteres por token: o suficiente para custo e tetos se comportarem nos testes. */
function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function createFakeLanguageModel(role: ModelRole) {
  const respond = (options: { prompt: unknown; responseFormat?: { type: string } }) => {
    const prompt = promptText(options.prompt);
    const text = responder({ role, prompt, json: options.responseFormat?.type === 'json' });
    const usage = {
      inputTokens: {
        total: approxTokens(prompt),
        noCache: approxTokens(prompt),
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: approxTokens(text), text: approxTokens(text), reasoning: 0 },
    };
    return { text, usage };
  };

  return new MockLanguageModelV4({
    provider: 'fake',
    modelId: FAKE_MODEL_ID,
    doGenerate: async (options) => {
      const { text, usage } = respond(options);
      return {
        content: [{ type: 'text', text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      };
    },
    doStream: async (options) => {
      const { text, usage } = respond(options);
      const words = text.split(/(?<=\s)/);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 't0' });
          for (const delta of words) controller.enqueue({ type: 'text-delta', id: 't0', delta });
          controller.enqueue({ type: 'text-end', id: 't0' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          });
          controller.close();
        },
      });
      return { stream };
    },
  });
}

/** Vetor determinístico a partir do texto (hash), normalizado. */
export function fakeEmbedding(text: string, dimensions: number): number[] {
  let h = 2166136261;
  const v: number[] = [];
  for (let i = 0; i < dimensions; i++) {
    for (let j = 0; j < text.length; j++) h = Math.imul(h ^ (text.charCodeAt(j) + i), 16777619);
    v.push(((h >>> 0) / 4294967295) * 2 - 1);
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export function createFakeEmbeddingModel(dimensions: number) {
  return new MockEmbeddingModelV4({
    provider: 'fake',
    modelId: FAKE_MODEL_ID,
    doEmbed: async ({ values }) => ({
      embeddings: values.map((t) => fakeEmbedding(t, dimensions)),
      usage: { tokens: values.reduce((acc, t) => acc + approxTokens(t), 0) },
      warnings: [],
    }),
  });
}
