/**
 * Instancia o modelo do AI SDK para um papel. Único lugar que importa @ai-sdk/*.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  createFakeEmbeddingModel,
  createFakeLanguageModel,
  FAKE_MODEL_ID,
  isFakeMode,
} from './fake.ts';
import {
  type ModelRole,
  PROVIDER_KEY_ENV,
  type Provider,
  type ResolvedModel,
  resolveModel,
} from './registry.ts';

type Env = Record<string, string | undefined>;

/** Dimensão das colunas vector(768) do schema. */
export const EMBED_DIMENSIONS = 768;

function apiKey(provider: Provider, env: Env): string {
  const key = env[PROVIDER_KEY_ENV[provider]]?.trim();
  if (!key) throw new Error(`${PROVIDER_KEY_ENV[provider]} ausente para o provedor ${provider}`);
  return key;
}

function providerFor(provider: Provider, env: Env) {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey: apiKey(provider, env) });
    case 'google':
      return createGoogleGenerativeAI({ apiKey: apiKey(provider, env) });
    case 'openai':
      return createOpenAI({ apiKey: apiKey(provider, env) });
  }
}

export interface ModelHandle<M> {
  resolved: ResolvedModel;
  model: M;
}

export function languageModel(role: ModelRole, env: Env = process.env) {
  if (isFakeMode(env)) {
    return {
      resolved: { role, provider: 'anthropic', modelId: FAKE_MODEL_ID } as ResolvedModel,
      model: createFakeLanguageModel(role),
    };
  }
  const resolved = resolveModel(role, env);
  return { resolved, model: providerFor(resolved.provider, env).languageModel(resolved.modelId) };
}

export function embeddingModel(env: Env = process.env) {
  if (isFakeMode(env)) {
    return {
      resolved: { role: 'embed', provider: 'openai', modelId: FAKE_MODEL_ID } as ResolvedModel,
      model: createFakeEmbeddingModel(EMBED_DIMENSIONS),
    };
  }
  const resolved = resolveModel('embed', env);
  if (resolved.provider === 'anthropic') throw new Error('Anthropic não tem modelo de embedding');
  return {
    resolved,
    model: providerFor(resolved.provider, env).embeddingModel(resolved.modelId),
  };
}

/** Opções por provedor para devolver vetores de 768 dimensões. */
export function embedProviderOptions(provider: Provider) {
  if (provider === 'openai') return { openai: { dimensions: EMBED_DIMENSIONS } };
  if (provider === 'google') return { google: { outputDimensionality: EMBED_DIMENSIONS } };
  return {};
}
