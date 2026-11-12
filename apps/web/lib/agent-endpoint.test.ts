import { demoAnalystAnswer } from '@socio/agents';
import { configureLlm, MemoryRunStore } from '@socio/llm';
import { beforeEach, describe, expect, it } from 'vitest';
import { signBody, verifySignature } from './agent-auth.ts';
import { handleAgentPost } from './agent-endpoint.ts';
import {
  createDemoBackend,
  createDemoState,
  DEMO_DEFAULT_PASSWORD,
  DEMO_OWNER_EMAIL,
  type DemoState,
} from './backend/demo.ts';
import type { CookieJar } from './backend/types.ts';

const SECRET = 'segredo-de-teste-com-32-caracteres!';
const NOW = new Date('2026-11-10T12:00:00Z');
const TS = String(Math.floor(NOW.getTime() / 1000));

function memoryJar(): CookieJar {
  const data = new Map<string, string>();
  return {
    get: (n) => data.get(n),
    set: (n, v) => void data.set(n, v),
    delete: (n) => void data.delete(n),
  };
}

let state: DemoState;
beforeEach(() => {
  state = createDemoState({});
  configureLlm({
    store: new MemoryRunStore(),
    env: { LLM_FAKE: '1' },
    limits: { perConversationUsd: 1, perMerchantDayUsd: 1 },
  });
});

const deps = (backend = createDemoBackend(state, memoryJar())) => ({
  backend,
  env: { N8N_WEBHOOK_SECRET: SECRET },
  now: () => NOW,
});

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function signed(body: unknown, ts = TS, secret = SECRET) {
  const raw = JSON.stringify(body);
  return post(raw, { 'x-socio-timestamp': ts, 'x-socio-signature': signBody(secret, ts, raw) });
}

const merchantId = () => state.merchants[0]?.id as string;

describe('verifySignature', () => {
  const base = { secret: SECRET, timestamp: TS, body: '{"a":1}', now: NOW };
  it('aceita assinatura certa, com ou sem prefixo', () => {
    const sig = signBody(SECRET, TS, base.body);
    expect(verifySignature({ ...base, signature: sig })).toEqual({ ok: true });
    expect(verifySignature({ ...base, signature: `sha256=${sig}` })).toEqual({ ok: true });
  });
  it('recusa corpo alterado, timestamp velho e segredo ausente', () => {
    const sig = signBody(SECRET, TS, base.body);
    expect(verifySignature({ ...base, body: '{"a":2}', signature: sig }).ok).toBe(false);
    const old = String(Number(TS) - 600);
    expect(
      verifySignature({ ...base, timestamp: old, signature: signBody(SECRET, old, base.body) }),
    ).toEqual({ ok: false, reason: 'stale' });
    expect(verifySignature({ ...base, secret: undefined, signature: sig })).toEqual({
      ok: false,
      reason: 'no_secret',
    });
    expect(verifySignature({ ...base, signature: 'zz' }).ok).toBe(false);
  });
});

describe('POST /api/agent', () => {
  it('n8n assinado: intenção analista responde pelo Agente Analista', async () => {
    const res = await handleAgentPost(
      signed({ merchantId: merchantId(), channel: 'whatsapp', text: 'Quanto eu vendi ontem?' }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      intent: 'analista',
      text: demoAnalystAnswer('Quanto eu vendi ontem?').answer,
      approvals: [],
      attachments: [],
    });
  });

  it('assinatura errada ou de outro segredo → 401', async () => {
    const body = { merchantId: merchantId(), channel: 'whatsapp', text: 'oi' };
    expect(
      (await handleAgentPost(signed(body, TS, 'outro-segredo-qualquer-123'), deps())).status,
    ).toBe(401);
    const raw = JSON.stringify(body);
    const tampered = post(raw.replace('oi', 'tchau'), {
      'x-socio-timestamp': TS,
      'x-socio-signature': signBody(SECRET, TS, raw),
    });
    expect((await handleAgentPost(tampered, deps())).status).toBe(401);
  });

  it('sem sessão e sem assinatura → 401', async () => {
    const res = await handleAgentPost(
      post({ merchantId: merchantId(), channel: 'panel', text: 'oi' }),
      deps(),
    );
    expect(res.status).toBe(401);
  });

  it('sessão do painel: só lojas do usuário, canal forçado para panel', async () => {
    const backend = createDemoBackend(state, memoryJar());
    expect(await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD)).toBe(true);

    const other = await handleAgentPost(
      post({ merchantId: 'loja-de-outro', channel: 'panel', text: 'oi' }),
      deps(backend),
    );
    expect(other.status).toBe(403);

    const ok = await handleAgentPost(
      post({ merchantId: merchantId(), channel: 'whatsapp', text: 'Quanto eu vendi ontem?' }),
      deps(backend),
    );
    expect(ok.status).toBe(200);
    const user = await backend.currentUser();
    const conv = await state.conversationStore.open({
      merchantId: merchantId(),
      channel: 'panel',
      externalRef: user?.id as string,
    });
    expect(conv.history).toHaveLength(2);
  });

  it('JSON inválido, campos extras e corpo grande → 400/413', async () => {
    const backend = createDemoBackend(state, memoryJar());
    await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD);
    expect((await handleAgentPost(post('{x'), deps(backend))).status).toBe(400);
    const extra = await handleAgentPost(
      post({ merchantId: merchantId(), channel: 'panel', text: 'oi', approvalToken: 'x' }),
      deps(backend),
    );
    expect(extra.status).toBe(400);
    const big = await handleAgentPost(
      post({ merchantId: merchantId(), channel: 'panel', text: 'a'.repeat(20_000) }),
      deps(backend),
    );
    expect(big.status).toBe(413);
  });
});
