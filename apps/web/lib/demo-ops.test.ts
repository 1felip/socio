import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureLlm, MemoryRunStore } from '@socio/llm';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleAgentPost } from './agent-endpoint.ts';
import {
  createDemoBackend,
  createDemoState,
  DEMO_DEFAULT_PASSWORD,
  DEMO_OWNER_EMAIL,
  type DemoState,
  resetDemoState,
} from './backend/demo.ts';
import { demoMerchantIds } from './backend/supabase.ts';
import type { CookieJar } from './backend/types.ts';
import { cronAuthorized, handleDemoReset } from './demo-reset-endpoint.ts';
import { clientIp, RateLimiter, ruleFor } from './rate-limit.ts';
import { hasSampleMenu, readSampleMenu, SAMPLE_MENU_PATH } from './sample-menu.ts';

function memoryJar(): CookieJar {
  const data = new Map<string, string>();
  return {
    get: (n) => data.get(n),
    set: (n, v) => void data.set(n, v),
    delete: (n) => void data.delete(n),
  };
}

const headers = (h: Record<string, string>) => new Headers(h);

describe('rate limit por IP', () => {
  it('janela deslizante: bloqueia acima do limite e libera depois', () => {
    const rl = new RateLimiter();
    const rule = { limit: 2, windowMs: 1000 };
    expect(rl.check('a', rule, 0).ok).toBe(true);
    expect(rl.check('a', rule, 100).ok).toBe(true);
    const blocked = rl.check('a', rule, 200);
    expect(blocked).toEqual({ ok: false, remaining: 0, retryAfter: 1 });
    expect(rl.check('b', rule, 200).ok).toBe(true);
    expect(rl.check('a', rule, 1001).ok).toBe(true);
  });

  it('IP vem do primeiro x-forwarded-for, depois x-real-ip', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(clientIp(headers({ 'x-real-ip': '5.6.7.8' }))).toBe('5.6.7.8');
    expect(clientIp(headers({}))).toBe('unknown');
  });

  it('limite configurável pelo env, com padrão se inválido', () => {
    expect(ruleFor('model', { RATE_LIMIT_MODEL_PER_10MIN: '3' }).limit).toBe(3);
    expect(ruleFor('model', { RATE_LIMIT_MODEL_PER_10MIN: 'x' }).limit).toBe(20);
  });
});

let state: DemoState;
beforeEach(() => {
  state = createDemoState({});
  configureLlm({
    store: new MemoryRunStore(),
    env: { LLM_FAKE: '1' },
    limits: { perConversationUsd: 1, perMerchantDayUsd: 1 },
  });
});

async function loggedIn() {
  const jar = memoryJar();
  const backend = createDemoBackend(state, jar);
  await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD);
  const merchantId = state.merchants[0]?.id as string;
  return { backend, merchantId };
}

describe('/api/agent pelo painel com rate limit', () => {
  it('passa do limite → 429 com mensagem em pt-BR', async () => {
    const { backend, merchantId } = await loggedIn();
    const limiter = new RateLimiter();
    const env = { RATE_LIMIT_MODEL_PER_10MIN: '1' };
    const req = () =>
      new Request('http://localhost/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9' },
        body: JSON.stringify({ merchantId, channel: 'panel', text: 'oi' }),
      });
    expect((await handleAgentPost(req(), { backend, env, limiter })).status).toBe(200);
    const res = await handleAgentPost(req(), { backend, env, limiter });
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/Muitos pedidos/);
  });
});

describe('cron de restauração da demo', () => {
  const SECRET = 'segredo-do-cron-123456';
  const get = (auth?: string) =>
    new Request('http://localhost/api/cron/demo-reset', {
      headers: auth ? { authorization: auth } : {},
    });

  it('exige Bearer CRON_SECRET; sem segredo configurado fica fechado', () => {
    expect(cronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(cronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(cronAuthorized(null, SECRET)).toBe(false);
    expect(cronAuthorized('Bearer ', undefined)).toBe(false);
    expect(cronAuthorized('Bearer curto', 'curto')).toBe(false);
  });

  it('apaga aprovações e uploads, mantém login e loja', async () => {
    const { backend, merchantId } = await loggedIn();
    await backend.approvals.create({
      merchantId,
      kind: 'review.reply',
      summary: 'resposta de teste',
      payload: { reviewId: 'r1', text: 'Obrigado!' },
      requestedBy: 'test',
    });
    expect(await backend.approvals.list(merchantId)).toHaveLength(1);

    expect((await handleDemoReset(get(), { backend, env: { CRON_SECRET: SECRET } })).status).toBe(
      401,
    );
    const res = await handleDemoReset(get(`Bearer ${SECRET}`), {
      backend,
      env: { CRON_SECRET: SECRET },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'demo', reset: true, merchants: 1 });

    const after = createDemoBackend(state, memoryJar());
    expect(await after.approvals.list(merchantId)).toEqual([]);
    expect(state.merchants[0]?.id).toBe(merchantId);
    expect(await backend.currentUser()).not.toBeNull();
  });

  it('resetDemoState troca os stores sem trocar usuários nem segredo', () => {
    const users = state.users;
    const secret = state.secret;
    const approvals = state.approvalStore;
    resetDemoState(state, {});
    expect(state.users).toBe(users);
    expect(state.secret).toBe(secret);
    expect(state.approvalStore).not.toBe(approvals);
  });

  it('DEMO_MERCHANT_IDS aceita só uuids', () => {
    expect(
      demoMerchantIds({
        DEMO_MERCHANT_IDS: '5e3d0000-0000-4000-8000-000000000001, x; drop, ',
      }),
    ).toEqual(['5e3d0000-0000-4000-8000-000000000001']);
    expect(demoMerchantIds({})).toEqual([]);
  });
});

describe('foto de exemplo', () => {
  it('lê de public/samples quando existe e some quando não existe', () => {
    const dir = mkdtempSync(join(tmpdir(), 'socio-sample-'));
    expect(hasSampleMenu(dir)).toBe(false);
    expect(readSampleMenu(dir)).toBeNull();
    mkdirSync(join(dir, 'public', 'samples'), { recursive: true });
    writeFileSync(join(dir, SAMPLE_MENU_PATH), new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
    expect(hasSampleMenu(dir)).toBe(true);
    expect(readSampleMenu(dir)?.[0]).toBe(0xff);
  });
});
