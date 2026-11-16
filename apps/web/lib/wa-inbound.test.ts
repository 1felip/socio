import { configureLlm, MemoryRunStore } from '@socio/llm';
import { signPayload } from '@socio/whatsapp';
import { beforeEach, describe, expect, it } from 'vitest';
import { signBody } from './agent-auth.ts';
import { createDemoBackend, createDemoState, type DemoState } from './backend/demo.ts';
import type { CookieJar } from './backend/types.ts';
import { RateLimiter } from './rate-limit.ts';
import {
  conversationRef,
  handleWhatsAppInbound,
  handleWhatsAppVerify,
  type InboundResult,
  TEXTS,
} from './wa-inbound.ts';
import { handleWhatsAppReviews } from './wa-reviews.ts';
import { linkCodeHash } from './whatsapp-link.ts';

const N8N = 'segredo-de-teste-com-32-caracteres!';
const APP = 'app-secret-da-meta';
const PHONE_ID = '123456789';
const NOW = new Date('2026-11-16T12:00:00Z');
const TS = String(Math.floor(NOW.getTime() / 1000));
const OWNER = '5511988887777';
const STAFF = '5511977776666';
const STRANGER = '5521911112222';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

function memoryJar(): CookieJar {
  const data = new Map<string, string>();
  return {
    get: (n) => data.get(n),
    set: (n, v) => void data.set(n, v),
    delete: (n) => void data.delete(n),
  };
}

let state: DemoState;
let seq = 0;
beforeEach(() => {
  state = createDemoState({});
  seq = 0;
  configureLlm({
    store: new MemoryRunStore(),
    env: { LLM_FAKE: '1' },
    limits: { perConversationUsd: 1, perMerchantDayUsd: 1 },
  });
  const [owner, staff] = state.members;
  Object.assign(owner as object, { whatsappPhone: OWNER, whatsappVerifiedAt: NOW });
  Object.assign(staff as object, { whatsappPhone: STAFF, whatsappVerifiedAt: NOW });
});

const env = {
  N8N_WEBHOOK_SECRET: N8N,
  WHATSAPP_APP_SECRET: APP,
  WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
  WHATSAPP_VERIFY_TOKEN: 'vt-123',
  SOCIO_APP_URL: 'https://socio.example.com/',
};
const deps = (extra = {}) => ({
  backend: createDemoBackend(state, memoryJar()),
  env,
  now: () => NOW,
  fetchMedia: async () => ({ data: JPEG, mimeType: 'image/jpeg' }),
  ...extra,
});

type Msg = Record<string, unknown>;
const text = (from: string, body: string): Msg => ({ from, type: 'text', text: { body } });
const button = (from: string, id: string): Msg => ({
  from,
  type: 'interactive',
  interactive: { type: 'button_reply', button_reply: { id, title: 'x' } },
});
const image = (from: string): Msg => ({
  from,
  type: 'image',
  image: { id: '654', mime_type: 'image/jpeg' },
});

function metaBody(messages: Msg[], phoneNumberId = PHONE_ID): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: phoneNumberId },
              messages: messages.map((m) => ({
                id: (m.id as string) ?? `wamid.${++seq}`,
                timestamp: TS,
                ...m,
              })),
            },
          },
        ],
      },
    ],
  });
}

function req(raw: string, opts: { meta?: string | null; n8n?: string | null; ts?: string } = {}) {
  const ts = opts.ts ?? TS;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const meta = opts.meta === undefined ? signPayload(APP, raw) : opts.meta;
  const n8n = opts.n8n === undefined ? signBody(N8N, ts, raw) : opts.n8n;
  if (meta !== null) headers['x-hub-signature-256'] = meta;
  if (n8n !== null) {
    headers['x-socio-signature'] = n8n;
    headers['x-socio-timestamp'] = ts;
  }
  return new Request('http://localhost/api/whatsapp/inbound', {
    method: 'POST',
    headers,
    body: raw,
  });
}

async function send(messages: Msg[], d = deps()): Promise<InboundResult> {
  const res = await handleWhatsAppInbound(req(metaBody(messages)), d);
  expect(res.status).toBe(200);
  return (await res.json()) as InboundResult;
}

describe('autenticação do webhook', () => {
  it('exige as duas assinaturas sobre o corpo cru', async () => {
    const raw = metaBody([text(OWNER, 'oi')]);
    const d = deps();
    expect((await handleWhatsAppInbound(req(raw, { meta: null }), d)).status).toBe(403);
    expect((await handleWhatsAppInbound(req(raw, { n8n: null }), d)).status).toBe(403);
    expect(
      (await handleWhatsAppInbound(req(raw, { meta: signPayload('outro', raw) }), d)).status,
    ).toBe(403);
    const old = String(Number(TS) - 600);
    expect(
      (await handleWhatsAppInbound(req(raw, { ts: old, n8n: signBody(N8N, old, raw) }), d)).status,
    ).toBe(403);
    // Corpo alterado depois de assinado.
    const tampered = new Request('http://localhost/x', {
      method: 'POST',
      headers: Object.fromEntries(req(raw).headers),
      body: raw.replace('oi', 'ok'),
    });
    expect((await handleWhatsAppInbound(tampered, d)).status).toBe(403);
  });

  it('falha fechada sem segredos configurados', async () => {
    const raw = metaBody([text(OWNER, 'oi')]);
    const d = { ...deps(), env: { ...env, WHATSAPP_APP_SECRET: undefined } };
    expect((await handleWhatsAppInbound(req(raw), d)).status).toBe(403);
  });

  it('recusa corpo acima de 1 MB e payload inválido', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    expect((await handleWhatsAppInbound(req(big), deps())).status).toBe(413);
    expect((await handleWhatsAppInbound(req('{"object":"x"}'), deps())).status).toBe(400);
    expect((await handleWhatsAppInbound(req('nada'), deps())).status).toBe(400);
  });

  it('GET de verificação devolve o challenge só com o token certo', async () => {
    const ok = handleWhatsAppVerify(
      new Request(
        'http://localhost/api/whatsapp/inbound?hub.mode=subscribe&hub.verify_token=vt-123&hub.challenge=42',
      ),
      env,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('42');
    const bad = handleWhatsAppVerify(
      new Request(
        'http://localhost/api/whatsapp/inbound?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42',
      ),
      env,
    );
    expect(bad.status).toBe(403);
  });
});

describe('remetente', () => {
  it('número desconhecido recebe sempre a mesma resposta genérica', async () => {
    const r = await send([
      text(STRANGER, 'quanto vendi ontem?'),
      text(STRANGER, 'SOCIO 123456'),
      image(STRANGER),
      button(STRANGER, `approve:${'a'.repeat(8)}`),
    ]);
    expect(r.replies).toHaveLength(4);
    for (const reply of r.replies) expect(reply).toEqual({ to: STRANGER, text: TEXTS.unknown });
  });

  it('confirma o número com o código do painel', async () => {
    const member = state.members[0] as DemoState['members'][number];
    Object.assign(member, {
      whatsappPhone: STRANGER,
      whatsappVerifiedAt: null,
      whatsappCode: { hash: linkCodeHash(STRANGER, '654321'), expiresAt: new Date(+NOW + 60_000) },
    });
    const r = await send([text(STRANGER, 'Sócio: 654321')]);
    expect(r.replies).toEqual([{ to: STRANGER, text: TEXTS.linked }]);
    expect(member.whatsappVerifiedAt).toEqual(NOW);
  });

  it('ignora mensagem para outro número da Meta e mensagem repetida (wamid)', async () => {
    const d = deps();
    const other = metaBody([text(OWNER, 'oi')], '999999');
    const res = await handleWhatsAppInbound(req(other), d);
    expect(((await res.json()) as InboundResult).replies).toEqual([]);

    const raw = metaBody([{ ...text(OWNER, 'oi'), id: 'wamid.repetida' }]);
    const first = (await (await handleWhatsAppInbound(req(raw), d)).json()) as InboundResult;
    const again = (await (await handleWhatsAppInbound(req(raw), d)).json()) as InboundResult;
    expect(first.received).toBe(1);
    expect(again).toMatchObject({ received: 0, duplicates: 1, replies: [] });
  });
});

describe('dono pelo WhatsApp', () => {
  it('texto vai para o orquestrador com conversa por hash do número', async () => {
    const r = await send([text(OWNER, 'oi, tudo bem?')]);
    expect(r.replies[0]?.to).toBe(OWNER);
    expect(r.replies[0]?.text.length).toBeGreaterThan(0);
    expect(conversationRef(OWNER, N8N)).not.toContain(OWNER);
    expect(conversationRef(OWNER, N8N)).toMatch(/^wa:[0-9a-f]{32}$/);
    expect(conversationRef(OWNER, 'outro-segredo')).not.toBe(conversationRef(OWNER, N8N));
  });

  it('foto → resumo com Aprovar → publica no mock só depois do botão', async () => {
    const d = deps();
    const photo = await send([image(OWNER)], d);
    const reply = photo.replies[0];
    expect(reply?.text).toMatch(/Publicar \d+ ite/);
    expect(reply?.text).toContain('https://socio.example.com/cardapio/');
    // Lista itens e preços lidos, para o dono não aprovar às cegas.
    expect(reply?.text).toMatch(/• .+ — (R\$|sem preço)/);
    expect(reply?.text.length).toBeLessThanOrEqual(1024);
    const approve = reply?.buttons?.find((b) => b.title === 'Aprovar');
    expect(approve?.id).toMatch(/^approve:/);

    const pending = await d.backend.approvals.list(state.merchants[0]?.id as string, 'pending');
    expect(pending).toHaveLength(1);

    const done = await send([button(OWNER, approve?.id as string)], d);
    expect(done.replies[0]?.text).toMatch(/^Feito: publiquei \d+ ite/);
    const executed = await d.backend.approvals.list(state.merchants[0]?.id as string, 'executed');
    expect(executed).toHaveLength(1);

    // Segundo clique no mesmo botão não publica de novo.
    const again = await send([button(OWNER, approve?.id as string)], d);
    expect(again.replies[0]?.text).not.toMatch(/^Feito/);
  });

  it('Recusar não publica nada', async () => {
    const d = deps();
    const photo = await send([image(OWNER)], d);
    const reject = photo.replies[0]?.buttons?.find((b) => b.title === 'Recusar');
    const r = await send([button(OWNER, reject?.id as string)], d);
    expect(r.replies[0]?.text).toMatch(/recusei/);
    const mid = state.merchants[0]?.id as string;
    expect(await d.backend.approvals.list(mid, 'executed')).toHaveLength(0);
  });

  it('foto que não é imagem é recusada pelo conteúdo', async () => {
    const d = deps({
      fetchMedia: async () => ({ data: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' }),
    });
    const r = await send([image(OWNER)], d);
    expect(r.replies).toEqual([{ to: OWNER, text: TEXTS.photoBad }]);
  });

  it('botão com id estranho ou de outra loja não decide nada', async () => {
    const r = await send([button(OWNER, 'approve:../../x'), button(OWNER, 'approve:nao-existe')]);
    expect(r.replies[0]?.text).toBe(TEXTS.unsupported);
    expect(r.replies[1]?.text).toBe('Aprovação não encontrada.');
  });

  it('erro inesperado vira resposta genérica, sem derrubar o lote', async () => {
    const d = deps({
      fetchMedia: async () => {
        throw new Error('rede caiu');
      },
    });
    const r = await send([image(OWNER), text(STRANGER, 'oi')], d);
    expect(r.replies).toEqual([
      { to: OWNER, text: TEXTS.failed },
      { to: STRANGER, text: TEXTS.unknown },
    ]);
  });
});

describe('funcionário pelo WhatsApp', () => {
  it('foto da equipe vai para o dono aprovar; funcionário não aprova', async () => {
    const d = deps();
    const r = await send([image(STAFF)], d);
    expect(r.replies[0]).toEqual({ to: STAFF, text: TEXTS.staffQueued });
    const toOwner = r.replies[1];
    expect(toOwner?.to).toBe(OWNER);
    const approve = toOwner?.buttons?.find((b) => b.title === 'Aprovar')?.id as string;

    const staffTry = await send([button(STAFF, approve)], d);
    expect(staffTry.replies[0]?.text).toBe(TEXTS.approveOnlyOwner);
    const ownerOk = await send([button(OWNER, approve)], d);
    expect(ownerOk.replies[0]?.text).toMatch(/^Feito/);
  });
});

describe('POST /api/whatsapp/reviews', () => {
  function reviewsReq(body: unknown, sig?: string) {
    const raw = JSON.stringify(body);
    return new Request('http://localhost/api/whatsapp/reviews', {
      method: 'POST',
      headers: {
        'x-socio-timestamp': TS,
        'x-socio-signature': sig ?? signBody(N8N, TS, raw),
      },
      body: raw,
    });
  }

  it('só aceita chamada assinada', async () => {
    const r = await handleWhatsAppReviews(reviewsReq({ merchantId: 'x' }, 'f'.repeat(64)), deps());
    expect(r.status).toBe(403);
  });

  it('sincroniza e devolve avisos com botões só para os donos', async () => {
    const mid = state.merchants[0]?.id as string;
    const res = await handleWhatsAppReviews(reviewsReq({ merchantId: mid }), deps());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      approvals: number;
      replies: Array<{ to: string; buttons?: unknown[] }>;
    };
    expect(body.replies.every((r) => r.to === OWNER)).toBe(true);
    if (body.approvals > 0) expect(body.replies.length).toBeGreaterThan(0);
  });
});

describe('limite por loja', () => {
  it('a 6ª foto em 10 min recebe aviso e não roda o Agente Cardápio', async () => {
    const d = deps({ limiter: new RateLimiter() });
    const r = await send(
      Array.from({ length: 6 }, () => image(OWNER)),
      d,
    );
    expect(r.replies).toHaveLength(6);
    expect(r.replies[5]?.text).toMatch(/^Muitos pedidos seguidos/);
    expect(r.replies[4]?.text).not.toMatch(/^Muitos pedidos/);
  });

  it('falha libera o wamid para o reenvio da Meta', async () => {
    const d = deps({
      fetchMedia: async () => {
        throw new Error('meta fora do ar 5511988887777');
      },
    });
    const raw = metaBody([{ ...image(OWNER), id: 'wamid.falhou' }]);
    await handleWhatsAppInbound(req(raw), d);
    expect(state.inboundSeen.has('wamid.falhou')).toBe(false);
  });
});
