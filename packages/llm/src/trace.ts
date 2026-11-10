/**
 * Tracing no Langfuse (SDK v4+ sobre OpenTelemetry).
 * Só liga com LANGFUSE_PUBLIC_KEY e LANGFUSE_SECRET_KEY; sem chaves (ou em LLM_FAKE) vira no-op.
 * Usa um TracerProvider próprio (não registra global) para não interferir em outro OTel do app.
 */
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { setLangfuseTracerProvider, startObservation } from '@langfuse/tracing';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { isFakeMode } from './fake.ts';

type Env = Record<string, string | undefined>;

export interface GenerationStart {
  name: string;
  model: string;
  input: unknown;
  metadata: Record<string, unknown>;
}

export interface GenerationEnd {
  output?: unknown;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error?: string;
}

export interface GenerationTrace {
  traceId?: string;
  end(result: GenerationEnd): void;
}

let provider: NodeTracerProvider | undefined;

export function tracingEnabled(env: Env = process.env): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY) && !isFakeMode(env);
}

function ensureProvider(env: Env): void {
  if (provider) return;
  provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY as string,
        secretKey: env.LANGFUSE_SECRET_KEY as string,
        ...(env.LANGFUSE_HOST ? { baseUrl: env.LANGFUSE_HOST } : {}),
      }),
    ],
  });
  setLangfuseTracerProvider(provider);
}

const noop: GenerationTrace = { end() {} };

export function startGeneration(start: GenerationStart, env: Env = process.env): GenerationTrace {
  if (!tracingEnabled(env)) return noop;
  try {
    ensureProvider(env);
    const generation = startObservation(
      start.name,
      { model: start.model, input: start.input, metadata: start.metadata },
      { asType: 'generation' },
    );
    return {
      traceId: generation.traceId,
      end(result) {
        generation.update({
          output: result.output,
          usageDetails: { input: result.inputTokens, output: result.outputTokens },
          costDetails: { total: result.costUsd },
          ...(result.error ? { level: 'ERROR' as const, statusMessage: result.error } : {}),
        });
        generation.end();
      },
    };
  } catch {
    // Tracing nunca derruba uma chamada.
    return noop;
  }
}

/** Chame no fim de scripts e rotas serverless para não perder spans. */
export async function flushTracing(): Promise<void> {
  await provider?.forceFlush();
}
