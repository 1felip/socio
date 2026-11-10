import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertWithinBudget, CostLimitError, readCostLimits, startOfDay } from './limits.ts';
import { listPromptVersions, loadPrompt, parseFrontmatter, renderPrompt } from './prompts.ts';
import { parseModelSpec, resolveModel } from './registry.ts';
import { MemoryRunStore } from './runs.ts';

describe('registry', () => {
  it('resolve papel pelo env e infere o provedor', () => {
    const env = {
      MODEL_FAST: 'claude-haiku-5-5',
      MODEL_VISION: 'gemini-x-flash',
      MODEL_JUDGE: 'gpt-x-mini',
      MODEL_EMBED: 'openai:custom-embed',
    };
    expect(resolveModel('fast', env)).toEqual({
      role: 'fast',
      provider: 'anthropic',
      modelId: 'claude-haiku-5-5',
    });
    expect(resolveModel('vision', env).provider).toBe('google');
    expect(resolveModel('judge', env).provider).toBe('openai');
    expect(resolveModel('embed', env)).toMatchObject({
      provider: 'openai',
      modelId: 'custom-embed',
    });
  });

  it('falha com papel sem env ou com placeholder', () => {
    expect(() => resolveModel('audio', {})).toThrow(/MODEL_AUDIO/);
    expect(() => resolveModel('audio', { MODEL_AUDIO: 'CONFIRMAR_GEMINI_FLASH' })).toThrow();
  });

  it('rejeita modelo de provedor desconhecido', () => {
    expect(() => parseModelSpec('llama-3')).toThrow(/provedor/);
  });
});

describe('prompts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prompts-'));
  mkdirSync(join(dir, 'menu'));
  writeFileSync(
    join(dir, 'menu', 'extract.v1.md'),
    '---\nrole: vision\nversion: 1\ntemperature: 0\n---\nLeia o cardápio de {{loja}}.',
  );
  writeFileSync(
    join(dir, 'menu', 'extract.v2.md'),
    '---\nrole: vision\nversion: 2\ndescription: "com preços"\n---\nV2 de {{ loja }}.',
  );
  writeFileSync(join(dir, 'menu', 'bad.v1.md'), '---\nrole: chef\nversion: 1\n---\nx');

  it('carrega a última versão por padrão e uma exata quando pedida', () => {
    expect(listPromptVersions('menu', 'extract', dir)).toEqual([1, 2]);
    const latest = loadPrompt('menu', 'extract', { dir });
    expect(latest).toMatchObject({
      id: 'menu/extract@v2',
      role: 'vision',
      description: 'com preços',
    });
    const v1 = loadPrompt('menu', 'extract', { dir, version: 1 });
    expect(v1).toMatchObject({ version: 1, temperature: 0, body: 'Leia o cardápio de {{loja}}.' });
  });

  it('valida role e versão inexistente', () => {
    expect(() => loadPrompt('menu', 'bad', { dir })).toThrow(/role/);
    expect(() => loadPrompt('menu', 'extract', { dir, version: 9 })).toThrow(/não encontrado/);
  });

  it('renderiza variáveis e falha se faltar alguma', () => {
    expect(renderPrompt('Oi {{ nome }}, {{n}} itens', { nome: 'Zé', n: 3 })).toBe('Oi Zé, 3 itens');
    expect(() => renderPrompt('{{x}}')).toThrow(/x/);
  });

  it('exige frontmatter', () => {
    expect(() => parseFrontmatter('sem cabeçalho')).toThrow();
  });
});

describe('tetos de custo', () => {
  it('lê do env com padrão', () => {
    expect(readCostLimits({ COST_LIMIT_USD_PER_CONVERSATION: '0.5' })).toEqual({
      perConversationUsd: 0.5,
      perMerchantDayUsd: 2,
    });
    expect(() => readCostLimits({ COST_LIMIT_USD_PER_MERCHANT_DAY: 'abc' })).toThrow();
  });

  it('calcula início do dia no fuso da loja', () => {
    // 02:30 UTC de 10/11 = 23:30 de 09/11 em São Paulo (UTC-3).
    const since = startOfDay(new Date('2026-11-10T02:30:00Z'), 'America/Sao_Paulo');
    expect(since.toISOString()).toBe('2026-11-09T03:00:00.000Z');
  });

  it('bloqueia por conversa e por loja/dia', async () => {
    const store = new MemoryRunStore();
    const base = {
      merchantId: 'm1',
      agent: 'a',
      step: 's',
      model: 'x',
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      status: 'ok' as const,
    };
    const limits = { perConversationUsd: 0.1, perMerchantDayUsd: 0.3 };
    await store.record({ ...base, conversationId: 'c1', costUsd: 0.1 });
    await expect(
      assertWithinBudget(store, limits, { merchantId: 'm1', conversationId: 'c1' }),
    ).rejects.toMatchObject({ scope: 'conversation' });
    await expect(
      assertWithinBudget(store, limits, { merchantId: 'm1', conversationId: 'c2' }),
    ).resolves.toBeUndefined();

    await store.record({ ...base, costUsd: 0.25 });
    const err = await assertWithinBudget(store, limits, { merchantId: 'm1' }).catch((e) => e);
    expect(err).toBeInstanceOf(CostLimitError);
    expect(err.scope).toBe('merchant_day');
    expect(err.userMessage).toMatch(/limite/);
    await expect(assertWithinBudget(store, limits, { merchantId: 'm2' })).resolves.toBeUndefined();
  });
});
