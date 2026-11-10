/**
 * Wrappers do AI SDK: único caminho para chamar modelos no Sócio.
 *
 * Cada chamada: checa tetos de custo → chama o modelo (timeout + retries) → calcula custo →
 * grava agent_runs → manda generation ao Langfuse.
 */

import { createServiceClient } from '@socio/db';
import {
  type ModelMessage,
  Output,
  type StopCondition,
  embed as sdkEmbed,
  generateText as sdkGenerateText,
  streamText as sdkStreamText,
  tool as sdkTool,
  stepCountIs,
  type ToolSet,
} from 'ai';
import type { z } from 'zod';
import { isFakeMode } from './fake.ts';
import { assertWithinBudget, CostLimitError, type CostLimits, readCostLimits } from './limits.ts';
import { embeddingModel, embedProviderOptions, languageModel } from './models.ts';
import { maskPII } from './pii.ts';
import { computeCost, priceFor, type TokenUsage } from './pricing.ts';
import type { Prompt } from './prompts.ts';
import type { ModelRole, ResolvedModel } from './registry.ts';
import { MemoryRunStore, type RunStatus, type RunStore, SupabaseRunStore } from './runs.ts';
import { startGeneration } from './trace.ts';

type Env = Record<string, string | undefined>;

/** Quem está chamando. Obrigatório em toda chamada. */
export interface CallContext {
  merchantId: string;
  agent: string;
  step: string;
  conversationId?: string;
  /** Prompt versionado usado (vai para agent_runs.prompt_version). */
  prompt?: Pick<Prompt, 'id'>;
  /** Fuso da loja para o teto diário. Padrão America/Sao_Paulo. */
  timeZone?: string;
}

export interface CallOptions {
  role: ModelRole;
  ctx: CallContext;
  /** System prompt fixo. Na Anthropic vai marcado para prompt caching. */
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Padrão 60 s. */
  timeoutMs?: number;
  /** Retries do AI SDK (backoff exponencial em 429/5xx). Padrão 2. */
  maxRetries?: number;
}

interface Runtime {
  store: RunStore;
  limits: CostLimits;
  env: Env;
}

let runtime: Runtime | undefined;

/** Troca store, tetos ou env (testes e scripts). Sem chamar, usa o padrão do process.env. */
export function configureLlm(config: Partial<Runtime>): void {
  const env = config.env ?? runtime?.env ?? process.env;
  runtime = {
    env,
    store: config.store ?? runtime?.store ?? defaultStore(env),
    limits: config.limits ?? runtime?.limits ?? readCostLimits(env),
  };
}

function defaultStore(env: Env): RunStore {
  if (!isFakeMode(env) && env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseRunStore(createServiceClient(env));
  }
  return new MemoryRunStore();
}

function rt(): Runtime {
  if (!runtime) configureLlm({});
  return runtime as Runtime;
}

/** Texto de terceiros (avaliação, mensagem, OCR): mascara PII e delimita. Nunca é instrução. */
export function untrusted(tag: string, text: string, names?: readonly string[]): string {
  const safeTag = tag.replace(/[^a-z_]/gi, '');
  const body = maskPII(text, names ? { names } : {}).replaceAll(`</${safeTag}>`, '');
  return `<${safeTag}>\n${body}\n</${safeTag}>`;
}

function buildMessages(opts: CallOptions): ModelMessage[] {
  const messages: ModelMessage[] = [];
  if (opts.messages) messages.push(...opts.messages);
  if (opts.prompt) messages.push({ role: 'user', content: opts.prompt });
  if (messages.length === 0) throw new Error('chamada sem prompt nem messages');
  return messages;
}

/** No ai 7 o system vai em `instructions`; na Anthropic, marcado para prompt caching. */
function buildInstructions(opts: CallOptions, resolved: ResolvedModel) {
  if (!opts.system) return {};
  return {
    instructions: {
      role: 'system' as const,
      content: opts.system,
      ...(resolved.provider === 'anthropic'
        ? { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' as const } } } }
        : {}),
    },
  };
}

interface SdkUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  inputTokenDetails?: {
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
  };
}

function toTokenUsage(usage: SdkUsage | undefined): TokenUsage {
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
  };
}

export interface CallMeta {
  model: string;
  usage: TokenUsage;
  costUsd: number;
  latencyMs: number;
  traceId?: string;
}

/** Envelope comum: teto → chamada → custo → agent_runs → trace. */
async function run<T>(
  opts: Pick<CallOptions, 'role' | 'ctx' | 'timeoutMs'>,
  resolved: ResolvedModel,
  input: unknown,
  call: (
    signal: AbortSignal,
  ) => Promise<{ value: T; usage: SdkUsage | undefined; output: unknown }>,
): Promise<{ value: T; meta: CallMeta }> {
  const { store, limits, env } = rt();
  const { ctx } = opts;
  const budget = {
    merchantId: ctx.merchantId,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    ...(ctx.timeZone ? { timeZone: ctx.timeZone } : {}),
  };
  const base = {
    merchantId: ctx.merchantId,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
    ...(ctx.prompt ? { promptVersion: ctx.prompt.id } : {}),
    agent: ctx.agent,
    step: ctx.step,
    model: resolved.modelId,
  };

  try {
    await assertWithinBudget(store, limits, budget);
  } catch (err) {
    if (err instanceof CostLimitError) {
      await store.record({
        ...base,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        status: 'blocked',
        error: err.message,
      });
    }
    throw err;
  }

  if (!isFakeMode(env) && !priceFor(resolved.modelId)) {
    console.warn(`[llm] sem preço para ${resolved.modelId}; custo gravado como 0 (pricing.ts)`);
  }

  const trace = startGeneration(
    {
      name: `${ctx.agent}.${ctx.step}`,
      model: resolved.modelId,
      input,
      metadata: { merchantId: ctx.merchantId, role: opts.role, prompt: ctx.prompt?.id },
    },
    env,
  );
  const started = performance.now();
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 60_000);

  let status: RunStatus = 'ok';
  let errorMsg: string | undefined;
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let output: unknown;
  let value: T | undefined;
  try {
    const result = await call(signal);
    value = result.value;
    output = result.output;
    usage = toTokenUsage(result.usage);
  } catch (err) {
    status = 'error';
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const latencyMs = performance.now() - started;
  const costUsd = computeCost(resolved.modelId, usage);
  trace.end({
    output,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
    ...(errorMsg ? { error: errorMsg } : {}),
  });
  await store.record({
    ...base,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd,
    latencyMs,
    status,
    ...(errorMsg ? { error: errorMsg } : {}),
    ...(trace.traceId ? { traceId: trace.traceId } : {}),
  });

  if (status === 'error') throw new LlmCallError(`${ctx.agent}.${ctx.step}: ${errorMsg}`);
  return {
    value: value as T,
    meta: {
      model: resolved.modelId,
      usage,
      costUsd,
      latencyMs,
      ...(trace.traceId ? { traceId: trace.traceId } : {}),
    },
  };
}

export class LlmCallError extends Error {
  override readonly name = 'LlmCallError';
}

/** Claude 5.x não aceita temperature/top_p (Sonnet devolve 400). Omitimos em silêncio. */
function acceptsTemperature(resolved: ResolvedModel): boolean {
  return !(
    resolved.provider === 'anthropic' && /^claude-(opus|sonnet|haiku)-5/.test(resolved.modelId)
  );
}

function sdkCommon(opts: CallOptions, resolved: ResolvedModel, signal: AbortSignal) {
  return {
    ...buildInstructions(opts, resolved),
    messages: buildMessages(opts),
    maxRetries: opts.maxRetries ?? 2,
    abortSignal: signal,
    ...(opts.temperature !== undefined && acceptsTemperature(resolved)
      ? { temperature: opts.temperature }
      : {}),
    ...(opts.maxOutputTokens !== undefined ? { maxOutputTokens: opts.maxOutputTokens } : {}),
  };
}

export async function generateText(opts: CallOptions): Promise<{ text: string } & CallMeta> {
  const { resolved, model } = languageModel(opts.role, rt().env);
  const { value, meta } = await run(
    opts,
    resolved,
    opts.prompt ?? opts.messages,
    async (signal) => {
      const r = await sdkGenerateText({ model, ...sdkCommon(opts, resolved, signal) });
      return { value: r.text, usage: r.totalUsage, output: r.text };
    },
  );
  return { text: value, ...meta };
}

export async function generateObject<S extends z.ZodType>(
  opts: CallOptions & { schema: S; schemaName?: string },
): Promise<{ object: z.infer<S> } & CallMeta> {
  const { resolved, model } = languageModel(opts.role, rt().env);
  const { value, meta } = await run(
    opts,
    resolved,
    opts.prompt ?? opts.messages,
    async (signal) => {
      // ai 7: saída estruturada via generateText + Output.object (generateObject está deprecado).
      const r = await sdkGenerateText({
        model,
        output: Output.object({
          schema: opts.schema,
          ...(opts.schemaName ? { name: opts.schemaName } : {}),
        }),
        ...sdkCommon(opts, resolved, signal),
      });
      // Validação explícita com Zod: nunca confie no formato devolvido pelo modelo.
      const object = opts.schema.parse(r.output) as z.infer<S>;
      return { value: object, usage: r.totalUsage, output: object };
    },
  );
  return { object: value, ...meta };
}

/**
 * Tool que o modelo pode chamar no loop. Só leitura ou proposta de aprovação: tool de
 * escrita na loja nunca entra aqui (ela exige approval_token, que o modelo não vê).
 */
export interface AgentTool<S extends z.ZodType = z.ZodType> {
  description: string;
  input: S;
  execute(input: z.infer<S>): Promise<unknown>;
}

/** Ajuda a inferir o tipo do input a partir do schema. */
export function defineTool<S extends z.ZodType>(t: AgentTool<S>): AgentTool<S> {
  return t;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
}

export type LoopStopReason = 'done' | 'max_steps' | 'cost_limit';

export interface ToolLoopOptions extends CallOptions {
  // biome-ignore lint/suspicious/noExplicitAny: cada tool tem seu próprio schema.
  tools: Record<string, AgentTool<any>>;
  /** Teto de passos (chamadas ao modelo). Padrão 5. */
  maxSteps?: number;
  /** Teto de custo deste loop em US$. Para no fim do passo que estourou. Padrão 0,05. */
  maxCostUsd?: number;
}

export interface ToolLoopResult extends CallMeta {
  text: string;
  steps: number;
  toolCalls: ToolCallRecord[];
  stopReason: LoopStopReason;
}

/**
 * Loop de tools do AI SDK com teto de passos, de custo e timeout (o timeout cobre o loop
 * inteiro). Os tetos diários/por conversa são checados antes do primeiro passo.
 */
export async function generateWithTools(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const { resolved, model } = languageModel(opts.role, rt().env);
  const maxSteps = opts.maxSteps ?? 5;
  const maxCostUsd = opts.maxCostUsd ?? 0.05;

  const tools: ToolSet = {};
  for (const [name, t] of Object.entries(opts.tools)) {
    tools[name] = sdkTool({
      description: t.description,
      inputSchema: t.input,
      execute: async (input: unknown) => t.execute(t.input.parse(input)),
    });
  }

  let costStop = false;
  const overBudget: StopCondition<ToolSet> = ({ steps }) => {
    const spent = steps.reduce(
      (acc, s) => acc + computeCost(resolved.modelId, toTokenUsage(s.usage)),
      0,
    );
    costStop = spent >= maxCostUsd;
    return costStop;
  };

  const { value, meta } = await run(
    opts,
    resolved,
    opts.prompt ?? opts.messages,
    async (signal) => {
      const r = await sdkGenerateText({
        model,
        tools,
        stopWhen: [stepCountIs(maxSteps), overBudget],
        ...sdkCommon(opts, resolved, signal),
      });
      const toolCalls: ToolCallRecord[] = [];
      for (const step of r.steps) {
        for (const res of step.toolResults) {
          toolCalls.push({ name: res.toolName, input: res.input, output: res.output });
        }
      }
      const last = r.steps.at(-1);
      const pendingTools = (last?.toolCalls.length ?? 0) > 0;
      const stopReason: LoopStopReason = costStop
        ? 'cost_limit'
        : pendingTools && r.steps.length >= maxSteps
          ? 'max_steps'
          : 'done';
      return {
        value: { text: r.text, steps: r.steps.length, toolCalls, stopReason },
        usage: r.totalUsage,
        output: { text: r.text, toolCalls },
      };
    },
  );
  return { ...value, ...meta };
}

/**
 * Streaming: devolve o textStream na hora; custo e agent_runs são gravados quando o stream
 * termina (`done` resolve com os metadados).
 */
export function streamText(opts: CallOptions): {
  textStream: AsyncIterable<string>;
  done: Promise<{ text: string } & CallMeta>;
} {
  const { resolved, model } = languageModel(opts.role, rt().env);
  let resolveStream!: (s: AsyncIterable<string>) => void;
  let rejectStream!: (e: unknown) => void;
  const streamReady = new Promise<AsyncIterable<string>>((res, rej) => {
    resolveStream = res;
    rejectStream = rej;
  });

  const done = run(opts, resolved, opts.prompt ?? opts.messages, async (signal) => {
    const r = sdkStreamText({ model, ...sdkCommon(opts, resolved, signal) });
    resolveStream(r.textStream);
    const [text, usage] = await Promise.all([r.text, r.totalUsage]);
    return { value: text, usage, output: text };
  }).then(({ value, meta }) => ({ text: value, ...meta }));
  done.catch(rejectStream);

  return {
    textStream: {
      async *[Symbol.asyncIterator]() {
        yield* await streamReady;
      },
    },
    done,
  };
}

export async function embed(opts: {
  ctx: CallContext;
  value: string;
  timeoutMs?: number;
  maxRetries?: number;
}): Promise<{ embedding: number[] } & CallMeta> {
  const { resolved, model } = embeddingModel(rt().env);
  const { value, meta } = await run(
    { role: 'embed', ctx: opts.ctx, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) },
    resolved,
    opts.value,
    async (signal) => {
      const r = await sdkEmbed({
        model,
        value: opts.value,
        maxRetries: opts.maxRetries ?? 2,
        abortSignal: signal,
        providerOptions: embedProviderOptions(resolved.provider),
      });
      return { value: r.embedding, usage: { inputTokens: r.usage.tokens }, output: undefined };
    },
  );
  return { embedding: value, ...meta };
}
