import { describe, expect, it } from 'vitest';
import {
  configFromEnv,
  MAX_TEXT_BODY,
  WhatsAppApiError,
  WhatsAppClient,
  WhatsAppConfigError,
} from './client.ts';
import { isWaId, maskPhone, normalizePhone } from './phone.ts';
import { signPayload, verifyChallenge, verifySignature } from './signature.ts';
import { parseWebhook, WebhookPayloadError } from './webhook.ts';

const TOKEN = 'token-secreto-de-teste';

function fakeFetch(responses: Array<{ status?: number; body: unknown } | Uint8Array>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift();
    if (r instanceof Uint8Array) return new Response(r, { status: 200 });
    return new Response(JSON.stringify(r?.body ?? {}), { status: r?.status ?? 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const client = (f: typeof fetch) =>
  new WhatsAppClient({ token: TOKEN, phoneNumberId: '123456789', fetch: f });

describe('telefone', () => {
  it('normaliza para wa_id (Brasil por padrão)', () => {
    expect(normalizePhone('(11) 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('+55 11 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('+1 415 555 0100')).toBe('14155550100');
    expect(normalizePhone('1234')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(isWaId('5511988887777')).toBe(true);
    expect(maskPhone('5511988887777')).toBe('55119****7777');
  });
});

describe('assinatura do webhook', () => {
  const body = '{"object":"whatsapp_business_account","entry":[]}';
  it('aceita HMAC certo e recusa corpo alterado, segredo errado ou ausente', () => {
    const sig = signPayload('app-secret', body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature('app-secret', body, sig)).toBe(true);
    expect(verifySignature('app-secret', body, sig.toUpperCase().replace('SHA256', 'sha256'))).toBe(
      true,
    );
    expect(verifySignature('app-secret', `${body} `, sig)).toBe(false);
    expect(verifySignature('outro', body, sig)).toBe(false);
    expect(verifySignature(undefined, body, sig)).toBe(false);
    expect(verifySignature('app-secret', body, null)).toBe(false);
  });

  it('GET de verificação devolve o challenge só com token certo', () => {
    const q = (o: Record<string, string>) => new URLSearchParams(o);
    const ok = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'vt-123',
      'hub.challenge': '1158201444',
    };
    expect(verifyChallenge(q(ok), 'vt-123')).toBe('1158201444');
    expect(verifyChallenge(q({ ...ok, 'hub.verify_token': 'x' }), 'vt-123')).toBeNull();
    expect(verifyChallenge(q({ ...ok, 'hub.mode': 'unsubscribe' }), 'vt-123')).toBeNull();
    expect(verifyChallenge(q(ok), undefined)).toBeNull();
    expect(verifyChallenge(q({ ...ok, 'hub.challenge': '<script>' }), 'vt-123')).toBeNull();
  });
});

describe('payload do webhook', () => {
  const wrap = (value: unknown) => ({
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value }] }],
  });

  it('texto, botão, áudio, imagem, outros e status', () => {
    const p = parseWebhook(
      wrap({
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '15550000000', phone_number_id: '123456789' },
        contacts: [{ wa_id: '5511988887777', profile: { name: 'Dono' } }],
        messages: [
          {
            from: '5511988887777',
            id: 'wamid.1',
            timestamp: '1762960000',
            type: 'text',
            text: { body: 'quanto vendi?' },
          },
          {
            from: '5511988887777',
            id: 'wamid.2',
            timestamp: '1762960001',
            type: 'interactive',
            context: { id: 'wamid.0' },
            interactive: {
              type: 'button_reply',
              button_reply: { id: 'approve:abc', title: 'Aprovar' },
            },
          },
          {
            from: '5511988887777',
            id: 'wamid.3',
            timestamp: '1762960002',
            type: 'audio',
            audio: { id: '987', mime_type: 'audio/ogg; codecs=opus' },
          },
          {
            from: '5511988887777',
            id: 'wamid.4',
            timestamp: '1762960003',
            type: 'image',
            image: { id: '654', mime_type: 'image/jpeg', caption: 'cardápio novo' },
          },
          {
            from: '5511988887777',
            id: 'wamid.5',
            timestamp: '1762960004',
            type: 'sticker',
            sticker: { id: '1' },
          },
        ],
        statuses: [
          {
            id: 'wamid.0',
            status: 'failed',
            recipient_id: '5511988887777',
            errors: [{ code: 131047, title: 'x' }],
          },
        ],
      }),
    );
    expect(p.messages.map((m) => m.kind)).toEqual(['text', 'button', 'audio', 'image', 'other']);
    expect(p.messages[0]).toMatchObject({ text: 'quanto vendi?', phoneNumberId: '123456789' });
    expect(p.messages[0]?.at.toISOString()).toBe('2025-11-12T15:06:40.000Z');
    expect(p.messages[1]).toMatchObject({ buttonId: 'approve:abc', replyTo: 'wamid.0' });
    expect(p.messages[2]).toMatchObject({ mediaId: '987', mimeType: 'audio/ogg; codecs=opus' });
    expect(p.messages[3]).toMatchObject({ mediaId: '654', text: 'cardápio novo' });
    expect(p.messages[4]).toMatchObject({ rawType: 'sticker' });
    expect(p.statuses).toEqual([
      { messageId: 'wamid.0', status: 'failed', recipient: '5511988887777', errorCodes: [131047] },
    ]);
  });

  it('corta texto longo e recusa payload que não é do WhatsApp', () => {
    const p = parseWebhook(
      wrap({
        messages: [
          {
            from: '5511988887777',
            id: 'w',
            timestamp: '1',
            type: 'text',
            text: { body: 'a'.repeat(9000) },
          },
        ],
      }),
    );
    expect(p.messages[0]?.text).toHaveLength(4000);
    expect(() => parseWebhook({ object: 'page', entry: [] })).toThrow(WebhookPayloadError);
    expect(parseWebhook(wrap({ statuses: [] }))).toEqual({ messages: [], statuses: [] });
  });

  it('remetente só com BSUID e mensagem sem remetente', () => {
    const p = parseWebhook(
      wrap({
        messages: [
          {
            from_user_id: 'BR.123abc',
            id: 'w1',
            timestamp: '1',
            type: 'text',
            text: { body: 'oi' },
          },
          { id: 'w2', timestamp: '1', type: 'text', text: { body: 'sem remetente' } },
        ],
      }),
    );
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0]).toMatchObject({ fromUserId: 'BR.123abc', text: 'oi' });
    expect(p.messages[0]?.from).toBeUndefined();
  });
});

describe('cliente da Cloud API', () => {
  it('sendText: URL, Bearer e corpo certos', async () => {
    const f = fakeFetch([{ body: { messages: [{ id: 'wamid.X' }] } }]);
    const r = await client(f.fn).sendText('5511988887777', '  Oi! ');
    expect(r).toEqual({ messageId: 'wamid.X' });
    const call = f.calls[0];
    expect(call?.url).toBe('https://graph.facebook.com/v27.0/123456789/messages');
    expect(((call?.init.headers ?? {}) as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(JSON.parse(String(call?.init.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511988887777',
      type: 'text',
      text: { body: 'Oi!', preview_url: false },
    });
  });

  it('sendText corta no limite e recusa vazio ou destino inválido', async () => {
    const f = fakeFetch([{ body: { messages: [{ id: 'w' }] } }]);
    await client(f.fn).sendText('5511988887777', 'x'.repeat(MAX_TEXT_BODY + 50));
    expect(JSON.parse(String(f.calls[0]?.init.body)).text.body).toHaveLength(MAX_TEXT_BODY);
    expect(() => client(f.fn).sendText('5511988887777', '  ')).toThrow(WhatsAppConfigError);
    await expect(client(f.fn).sendText('abc', 'oi')).rejects.toThrow(/destinatário inválido/);
  });

  it('sendButtons: até 3, títulos de 20, ids únicos', async () => {
    const f = fakeFetch([{ body: { messages: [{ id: 'w' }] } }]);
    await client(f.fn).sendButtons('5511988887777', 'Publicar 12 itens?', [
      { id: 'approve:1', title: 'Aprovar' },
      { id: 'panel:1', title: 'Ver no painel com todos os detalhes' },
      { id: 'fix:1', title: 'Corrigir' },
    ]);
    const body = JSON.parse(String(f.calls[0]?.init.body));
    expect(body.type).toBe('interactive');
    expect(body.interactive.action.buttons).toHaveLength(3);
    expect(body.interactive.action.buttons[1].reply.title).toHaveLength(20);
    const c = client(f.fn);
    expect(() => c.sendButtons('5511988887777', 'x', [])).toThrow(/1 a 3/);
    expect(() =>
      c.sendButtons('5511988887777', 'x', [
        { id: 'a', title: '1' },
        { id: 'a', title: '2' },
      ]),
    ).toThrow(/repetidos/);
  });

  it('sendAudio por id ou link https', async () => {
    const f = fakeFetch([{ body: { messages: [{ id: 'w' }] } }]);
    await client(f.fn).sendAudio('5511988887777', { mediaId: '111' });
    expect(JSON.parse(String(f.calls[0]?.init.body)).audio).toEqual({ id: '111' });
    expect(() => client(f.fn).sendAudio('5511988887777', { link: 'http://x/a.ogg' })).toThrow(
      /https/,
    );
  });

  it('erro da API vira mensagem em pt-BR sem o token', async () => {
    const f = fakeFetch([
      { status: 400, body: { error: { code: 131047, message: 'Re-engagement message' } } },
    ]);
    const err = await client(f.fn)
      .sendText('5511988887777', 'oi')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WhatsAppApiError);
    expect((err as WhatsAppApiError).code).toBe(131047);
    expect((err as Error).message).toMatch(/janela de 24 h/);
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('getMedia + downloadMedia só baixa de host da Meta', async () => {
    const f = fakeFetch([
      {
        body: {
          url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1',
          mime_type: 'audio/ogg',
          file_size: 3,
        },
      },
      new Uint8Array([1, 2, 3]),
    ]);
    const c = client(f.fn);
    const info = await c.getMedia('987');
    expect(f.calls[0]?.url).toBe('https://graph.facebook.com/v27.0/987');
    const got = await c.downloadMedia(info);
    expect([...got.data]).toEqual([1, 2, 3]);
    expect(((f.calls[1]?.init.headers ?? {}) as Record<string, string>).authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    await expect(
      c.downloadMedia({ url: 'https://evil.example.com/x', mimeType: 'audio/ogg' }),
    ).rejects.toThrow(/host de mídia/);
    await expect(c.getMedia('../me')).rejects.toThrow(/id de mídia/);
  });

  it('config do env', () => {
    expect(() => configFromEnv({})).toThrow(/WHATSAPP_TOKEN/);
    expect(configFromEnv({ WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '123456' })).toEqual({
      token: 't',
      phoneNumberId: '123456',
    });
    expect(() =>
      configFromEnv({
        WHATSAPP_TOKEN: 't',
        WHATSAPP_PHONE_NUMBER_ID: '123456',
        WHATSAPP_API_VERSION: 'latest',
      }),
    ).toThrow(/vNN/);
  });
});
