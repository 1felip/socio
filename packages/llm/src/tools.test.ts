import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  configureLlm,
  defineTool,
  generateWithTools,
  MemoryRunStore,
  setFakeResponder,
} from './index.ts';

const ctx = { merchantId: 'm1', agent: 'test', step: 'loop' };
let store: MemoryRunStore;

beforeEach(() => {
  store = new MemoryRunStore();
  configureLlm({
    store,
    env: { LLM_FAKE: '1' },
    limits: { perConversationUsd: 1, perMerchantDayUsd: 1 },
  });
});

afterEach(() => setFakeResponder(undefined));

const seen: number[] = [];
const double = defineTool({
  description: 'Dobra um número',
  input: z.object({ n: z.number() }),
  execute: async ({ n }) => {
    seen.push(n);
    return { result: n * 2 };
  },
});

describe('generateWithTools', () => {
  it('executa a tool pedida e termina com texto', async () => {
    seen.length = 0;
    setFakeResponder((req) =>
      req.toolResults === 0 ? { toolCalls: [{ name: 'double', input: { n: 21 } }] } : 'deu 42',
    );
    const r = await generateWithTools({
      role: 'orchestrator',
      ctx,
      prompt: 'quanto é 21 x 2?',
      tools: { double },
    });
    expect(r.text).toBe('deu 42');
    expect(r.steps).toBe(2);
    expect(r.stopReason).toBe('done');
    expect(r.toolCalls).toEqual([{ name: 'double', input: { n: 21 }, output: { result: 42 } }]);
    expect(seen).toEqual([21]);
    expect(store.runs).toHaveLength(1);
  });

  it('para no teto de passos', async () => {
    setFakeResponder(() => ({ toolCalls: [{ name: 'double', input: { n: 1 } }] }));
    const r = await generateWithTools({
      role: 'orchestrator',
      ctx,
      prompt: 'loop',
      tools: { double },
      maxSteps: 3,
    });
    expect(r.steps).toBe(3);
    expect(r.stopReason).toBe('max_steps');
  });

  it('para no teto de custo do loop', async () => {
    setFakeResponder(() => ({ toolCalls: [{ name: 'double', input: { n: 1 } }] }));
    const r = await generateWithTools({
      role: 'orchestrator',
      ctx,
      prompt: 'loop',
      tools: { double },
      maxSteps: 5,
      maxCostUsd: 0,
    });
    expect(r.steps).toBe(1);
    expect(r.stopReason).toBe('cost_limit');
  });

  it('input inválido não chega na tool', async () => {
    seen.length = 0;
    setFakeResponder((req) =>
      req.toolResults === 0 ? { toolCalls: [{ name: 'double', input: { n: 'x' } }] } : 'ok',
    );
    const r = await generateWithTools({
      role: 'orchestrator',
      ctx,
      prompt: 'x',
      tools: { double },
    });
    expect(seen).toEqual([]);
    expect(r.text).toBe('ok');
  });
});
