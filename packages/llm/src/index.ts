export const packageName = '@socio/llm' as const;

export {
  type AgentTool,
  type CallContext,
  type CallMeta,
  type CallOptions,
  configureLlm,
  defineTool,
  embed,
  generateObject,
  generateText,
  generateWithTools,
  LlmCallError,
  type LoopStopReason,
  streamText,
  type ToolCallRecord,
  type ToolLoopOptions,
  type ToolLoopResult,
  untrusted,
} from './client.ts';
export {
  type FakeReply,
  type FakeRequest,
  type FakeResponder,
  type FakeToolCall,
  isFakeMode,
  setFakeResponder,
} from './fake.ts';
export {
  assertWithinBudget,
  CostLimitError,
  type CostLimits,
  type CostScope,
  readCostLimits,
  startOfDay,
} from './limits.ts';
export { EMBED_DIMENSIONS } from './models.ts';
export { type MaskOptions, maskPII, PII_TOKENS } from './pii.ts';
export { computeCost, type ModelPrice, PRICING, priceFor, type TokenUsage } from './pricing.ts';
export {
  DEFAULT_PROMPTS_DIR,
  listPromptVersions,
  loadPrompt,
  type Prompt,
  renderPrompt,
} from './prompts.ts';
export { MODEL_ROLES, type ModelRole, type Provider, resolveModel } from './registry.ts';
export {
  type AgentRun,
  MemoryRunStore,
  type RunStatus,
  type RunStore,
  SupabaseRunStore,
} from './runs.ts';
export { flushTracing } from './trace.ts';
