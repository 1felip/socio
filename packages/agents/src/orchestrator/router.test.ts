import { readFileSync } from 'node:fs';
import { configureLlm, loadPrompt, MemoryRunStore, setFakeResponder } from '@socio/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalize, routeIntent, scoreRules } from './router.ts';
import type { Intent } from './schema.ts';

interface Case {
  text: string;
  image?: boolean;
  expected: Intent;
}

const cases: Case[] = JSON.parse(
  readFileSync(new URL('../../../../evals/datasets/routing/phrases.json', import.meta.url), 'utf8'),
);

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

describe('roteador', () => {
  it('prompt router v1 usa o papel fast', () => {
    expect(loadPrompt('orchestrator', 'router', { version: 1 })).toMatchObject({ role: 'fast' });
  });

  it('normaliza acento e caixa', () => {
    expect(normalize('PROMOÇÃO de Cardápio')).toBe('promocao de cardapio');
  });

  it('acerta pelo menos 18 de 20 frases (modelo fake inútil: só regras contam)', async () => {
    expect(cases).toHaveLength(20);
    const misses: string[] = [];
    for (const c of cases) {
      const r = await routeIntent({ merchantId: 'm1', text: c.text, hasImage: c.image ?? false });
      if (r.intent !== c.expected) misses.push(`${c.text} → ${r.intent} (esperado ${c.expected})`);
    }
    expect(misses.length, misses.join('\n')).toBeLessThanOrEqual(2);
  });

  it('regras decidem sem chamar modelo', async () => {
    const r = await routeIntent({ merchantId: 'm1', text: 'Quanto eu vendi ontem?' });
    expect(r).toEqual({ intent: 'analista', source: 'rules' });
    expect(store.runs).toHaveLength(0);
  });

  it('sem sinal nas regras, pergunta ao modelo e delimita a mensagem', async () => {
    const prompts: string[] = [];
    setFakeResponder((req) => {
      prompts.push(req.prompt);
      return JSON.stringify({ intent: 'avaliacoes' });
    });
    const r = await routeIntent({
      merchantId: 'm1',
      text: 'Os clientes estão gostando do meu hambúrguer?',
    });
    expect(r).toEqual({ intent: 'avaliacoes', source: 'model' });
    expect(prompts[0]).toContain('<mensagem>');
    expect(store.runs[0]).toMatchObject({ agent: 'orchestrator', step: 'route' });
  });

  it('empate vai para o modelo', () => {
    expect(scoreRules('nota do prato').intent).toBeNull();
  });

  it('foto sem texto vai para cardápio', async () => {
    expect(await routeIntent({ merchantId: 'm1', hasImage: true })).toMatchObject({
      intent: 'cardapio',
    });
  });

  it('resposta inválida do modelo cai em conversa', async () => {
    setFakeResponder(() => JSON.stringify({ intent: 'publicar_tudo' }));
    const r = await routeIntent({ merchantId: 'm1', text: 'hmm' });
    expect(r).toEqual({ intent: 'conversa', source: 'fallback' });
  });
});
