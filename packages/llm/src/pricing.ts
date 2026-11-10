/**
 * Preços em USD por 1M de tokens (tier padrão, sem batch).
 * Fonte: páginas oficiais de preço, consultadas em 2026-11-10 (doc-researcher):
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - Google:    https://ai.google.dev/gemini-api/docs/pricing
 * - OpenAI:    https://developers.openai.com/api/docs/pricing
 * Revise ao trocar um MODEL_* no env. Modelo sem preço aqui → custo 0 e aviso no log.
 */

export interface ModelPrice {
  input: number;
  output: number;
  /** Leitura de cache de prompt. */
  cacheRead?: number;
  /** Escrita de cache (Anthropic cobra à parte). */
  cacheWrite?: number;
}

export const PRICING: Record<string, ModelPrice> = {
  // Anthropic — escrita de cache = 1,25× input (TTL 5 min).
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  // Haiku 5.5: faixa até 100k tokens de entrada; acima disso o preço sobe ($0.50 / $2.50).
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // Google — preço promocional até 31/12/2026; depois $1.50 / $7.50 / $0.15.
  'gemini-3.8-flash': { input: 0.75, output: 3.75, cacheRead: 0.075 },
  // OpenAI
  'gpt-6-luna': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function priceFor(modelId: string): ModelPrice | undefined {
  return PRICING[modelId];
}

/** Custo em USD. inputTokens inclui os tokens de cache; eles são cobrados pela tarifa própria. */
export function computeCost(modelId: string, usage: TokenUsage): number {
  const price = priceFor(modelId);
  if (!price) return 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const plainInput = Math.max(0, usage.inputTokens - cacheRead - cacheWrite);
  const cost =
    plainInput * price.input +
    cacheRead * (price.cacheRead ?? price.input) +
    cacheWrite * (price.cacheWrite ?? price.input) +
    usage.outputTokens * price.output;
  return cost / 1_000_000;
}
