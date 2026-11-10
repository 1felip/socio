/**
 * Registry de modelos por papel. IDs vêm sempre do env (MODEL_*), nunca do código.
 */

export const MODEL_ROLES = ['orchestrator', 'fast', 'vision', 'audio', 'judge', 'embed'] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

export type Provider = 'anthropic' | 'google' | 'openai';

export const ROLE_ENV: Record<ModelRole, string> = {
  orchestrator: 'MODEL_ORCHESTRATOR',
  fast: 'MODEL_FAST',
  vision: 'MODEL_VISION',
  audio: 'MODEL_AUDIO',
  judge: 'MODEL_JUDGE',
  embed: 'MODEL_EMBED',
};

export const PROVIDER_KEY_ENV: Record<Provider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export interface ResolvedModel {
  role: ModelRole;
  provider: Provider;
  modelId: string;
}

export function isModelRole(value: string): value is ModelRole {
  return (MODEL_ROLES as readonly string[]).includes(value);
}

/** Aceita "provider:model" explícito ou infere pelo prefixo do ID. */
export function parseModelSpec(spec: string): { provider: Provider; modelId: string } {
  const explicit = /^(anthropic|google|openai):(.+)$/.exec(spec);
  if (explicit) return { provider: explicit[1] as Provider, modelId: explicit[2] as string };
  if (spec.startsWith('claude-')) return { provider: 'anthropic', modelId: spec };
  if (spec.startsWith('gemini-') || spec.startsWith('text-embedding-0'))
    return { provider: 'google', modelId: spec };
  if (/^(gpt-|o\d|text-embedding-|chatgpt-)/.test(spec))
    return { provider: 'openai', modelId: spec };
  throw new Error(`não sei o provedor do modelo "${spec}". Use "provider:modelo" no env.`);
}

export function resolveModel(
  role: ModelRole,
  env: Record<string, string | undefined> = process.env,
): ResolvedModel {
  const name = ROLE_ENV[role];
  const spec = env[name]?.trim();
  if (!spec || spec.startsWith('CONFIRMAR')) {
    throw new Error(`${name} não configurado (papel "${role}"). Veja env.example.`);
  }
  return { role, ...parseModelSpec(spec) };
}

export function hasProviderKey(
  provider: Provider,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env[PROVIDER_KEY_ENV[provider]]?.trim());
}
