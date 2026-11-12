import { DEMO_MERCHANT_ID } from '@socio/ifood-client';
import { beforeEach, describe, expect, it } from 'vitest';
import { signBody } from './agent-auth.ts';
import {
  createDemoBackend,
  createDemoState,
  DEMO_DEFAULT_PASSWORD,
  DEMO_OWNER_EMAIL,
  type DemoState,
} from './backend/demo.ts';
import type { CookieJar } from './backend/types.ts';
import { decide } from './flows.ts';
import { handleReviewsSyncPost } from './reviews-sync-endpoint.ts';

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
});
const merchantId = () => state.merchants[0]?.id as string;

const deps = (backend = createDemoBackend(state, memoryJar())) => ({
  backend,
  env: { N8N_WEBHOOK_SECRET: SECRET },
  now: () => NOW,
});

function post(raw: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/reviews/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  });
}

function signed(body: unknown, secret = SECRET) {
  const raw = JSON.stringify(body);
  return post(raw, { 'x-socio-timestamp': TS, 'x-socio-signature': signBody(secret, TS, raw) });
}

describe('POST /api/reviews/sync', () => {
  it('n8n assinado: cria aprovações e alerta notas baixas', async () => {
    const res = await handleReviewsSyncPost(signed({ merchantId: merchantId() }), deps());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(3);
    expect(body.alerts.map((a: { rating: number }) => a.rating).sort()).toEqual([1, 2]);
    const pending = await createDemoBackend(state, memoryJar()).approvals.list(
      merchantId(),
      'pending',
    );
    expect(pending.every((a) => a.kind === 'review.reply')).toBe(true);
  });

  it('assinatura errada ou ausente sem sessão: 401', async () => {
    const bad = await handleReviewsSyncPost(
      signed({ merchantId: merchantId() }, 'outro-segredo-qualquer-123456'),
      deps(),
    );
    expect(bad.status).toBe(401);
    const anon = await handleReviewsSyncPost(
      post(JSON.stringify({ merchantId: merchantId() })),
      deps(),
    );
    expect(anon.status).toBe(401);
  });

  it('painel: membro de outra loja recebe 403', async () => {
    const backend = createDemoBackend(state, memoryJar());
    await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD);
    const res = await handleReviewsSyncPost(
      post(JSON.stringify({ merchantId: 'outra-loja' })),
      deps(backend),
    );
    expect(res.status).toBe(403);
  });

  it('dono aprova no painel e a resposta é publicada uma vez', async () => {
    const backend = createDemoBackend(state, memoryJar());
    await backend.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD);
    const user = await backend.currentUser();
    if (!user) throw new Error('sem sessão');
    const sync = await backend.syncReviews(merchantId());
    const approvalId = sync.approvals[0] as string;

    const out = await decide(backend, user, merchantId(), approvalId, 'approve');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.approval.status).toBe('executed');
    const page = await state.ifood.listReviews(DEMO_MERCHANT_ID, { pageSize: 50 });
    expect(page.reviews.filter((r) => (r.replies ?? []).length > 0)).toHaveLength(1);
    expect(state.roi.events.filter((e) => e.kind === 'review.reply')).toHaveLength(1);

    const again = await decide(backend, user, merchantId(), approvalId, 'approve');
    expect(again.ok).toBe(false);
  });
});
