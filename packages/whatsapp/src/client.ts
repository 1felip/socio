/**
 * Cliente da WhatsApp Cloud API (Graph API): enviar texto, botões e áudio; buscar e baixar mídia.
 *
 * Config do env: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION (opcional).
 * O token nunca aparece em erro nem em log. `fetch` é injetável para testes.
 */
import { isWaId, maskPhone } from './phone.ts';

type Env = Record<string, string | undefined>;

export const DEFAULT_API_VERSION = 'v27.0';
export const GRAPH_BASE = 'https://graph.facebook.com';

/** Limites das mensagens interativas com reply buttons. */
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TITLE = 20;
export const MAX_BUTTON_ID = 256;
export const MAX_INTERACTIVE_BODY = 1024;
export const MAX_TEXT_BODY = 4096;
/** Mídia baixada além disso é recusada (áudio de voz e foto de cardápio cabem com folga). */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  apiVersion?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ReplyButton {
  /** Volta no webhook como button_reply.id. Ex.: "approve:<approvalId>". */
  id: string;
  title: string;
}

export interface SendResult {
  messageId: string;
}

export interface MediaInfo {
  url: string;
  mimeType: string;
  size?: number;
  sha256?: string;
}

/** Mensagens em pt-BR para os erros mais comuns da Cloud API. */
export const ERROR_HINTS: Record<number, string> = {
  131047: 'Fora da janela de 24 h: só dá para mandar template aprovado.',
  131030: 'Número não está na lista de destinatários permitidos do número de teste.',
  131026: 'Mensagem não entregue: o número pode não ter WhatsApp.',
  131056: 'Muitas mensagens para o mesmo número em pouco tempo.',
  130429: 'Limite de envio da API atingido. Tente de novo em instantes.',
  190: 'Token do WhatsApp inválido ou expirado.',
  100: 'Parâmetro inválido na chamada à API.',
};

export class WhatsAppApiError extends Error {
  override readonly name = 'WhatsAppApiError';
  readonly status: number;
  readonly code: number | undefined;
  readonly hint: string | undefined;

  constructor(status: number, code: number | undefined, message: string) {
    const hint = code !== undefined ? ERROR_HINTS[code] : undefined;
    super(`WhatsApp ${status}${code !== undefined ? ` (${code})` : ''}: ${hint ?? message}`);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

export class WhatsAppConfigError extends Error {
  override readonly name = 'WhatsAppConfigError';
}

export function configFromEnv(env: Env = process.env): WhatsAppConfig {
  const token = env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    throw new WhatsAppConfigError('Defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID no .env.');
  }
  if (!/^\d{5,30}$/.test(phoneNumberId)) {
    throw new WhatsAppConfigError('WHATSAPP_PHONE_NUMBER_ID deve ter só dígitos.');
  }
  const apiVersion = env.WHATSAPP_API_VERSION?.trim();
  if (apiVersion && !/^v\d{1,3}\.\d$/.test(apiVersion)) {
    throw new WhatsAppConfigError('WHATSAPP_API_VERSION no formato vNN.N (ex.: v27.0).');
  }
  return { token, phoneNumberId, ...(apiVersion ? { apiVersion } : {}) };
}

function assertRecipient(to: string): void {
  if (!isWaId(to)) throw new WhatsAppConfigError(`destinatário inválido: ${maskPhone(to)}`);
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export class WhatsAppClient {
  private readonly config: WhatsAppConfig;
  private readonly fetchFn: typeof fetch;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    this.fetchFn = config.fetch ?? fetch;
  }

  private url(path: string): string {
    return `${GRAPH_BASE}/${this.config.apiVersion ?? DEFAULT_API_VERSION}/${path}`;
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await this.fetchFn(this.url(path), {
      ...init,
      headers: { authorization: `Bearer ${this.config.token}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: number; message?: string };
    };
    if (!res.ok) {
      // A mensagem da Meta não traz o token; mesmo assim, só o essencial sobe.
      throw new WhatsAppApiError(
        res.status,
        body.error?.code,
        body.error?.message?.slice(0, 200) ?? 'erro',
      );
    }
    return body as T;
  }

  private async send(to: string, payload: Record<string, unknown>): Promise<SendResult> {
    assertRecipient(to);
    const res = await this.call<{ messages?: Array<{ id: string }> }>(
      `${this.config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...payload,
        }),
      },
    );
    const id = res.messages?.[0]?.id;
    if (!id) throw new WhatsAppApiError(200, undefined, 'resposta sem id de mensagem');
    return { messageId: id };
  }

  sendText(to: string, body: string, opts: { previewUrl?: boolean } = {}): Promise<SendResult> {
    const text = body.trim();
    if (!text) throw new WhatsAppConfigError('mensagem vazia');
    return this.send(to, {
      type: 'text',
      text: { body: clip(text, MAX_TEXT_BODY), preview_url: opts.previewUrl ?? false },
    });
  }

  /** Até 3 botões de resposta rápida. Título até 20 caracteres; ids únicos. */
  sendButtons(
    to: string,
    body: string,
    buttons: readonly ReplyButton[],
    opts: { footer?: string } = {},
  ): Promise<SendResult> {
    if (buttons.length === 0 || buttons.length > MAX_BUTTONS) {
      throw new WhatsAppConfigError(`use de 1 a ${MAX_BUTTONS} botões`);
    }
    const ids = new Set(buttons.map((b) => b.id));
    if (ids.size !== buttons.length) throw new WhatsAppConfigError('ids de botão repetidos');
    for (const b of buttons) {
      if (!b.id || b.id.length > MAX_BUTTON_ID)
        throw new WhatsAppConfigError('id de botão inválido');
      if (!b.title.trim()) throw new WhatsAppConfigError('título de botão vazio');
    }
    return this.send(to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: clip(body.trim(), MAX_INTERACTIVE_BODY) },
        ...(opts.footer ? { footer: { text: clip(opts.footer, 60) } } : {}),
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: clip(b.title.trim(), MAX_BUTTON_TITLE) },
          })),
        },
      },
    });
  }

  /** Áudio por id de mídia já enviada (uploadMedia) ou por link público https. */
  sendAudio(to: string, audio: { mediaId: string } | { link: string }): Promise<SendResult> {
    if ('link' in audio && !/^https:\/\//.test(audio.link)) {
      throw new WhatsAppConfigError('link de áudio precisa ser https');
    }
    return this.send(to, {
      type: 'audio',
      audio: 'mediaId' in audio ? { id: audio.mediaId } : { link: audio.link },
    });
  }

  /** Template aprovado (fora da janela de 24 h). */
  sendTemplate(
    to: string,
    name: string,
    language = 'pt_BR',
    components: unknown[] = [],
  ): Promise<SendResult> {
    return this.send(to, {
      type: 'template',
      template: {
        name,
        language: { code: language },
        ...(components.length ? { components } : {}),
      },
    });
  }

  /** Metadados da mídia recebida: URL temporária (curta validade) e tipo. */
  async getMedia(mediaId: string): Promise<MediaInfo> {
    if (!/^\d{1,40}$/.test(mediaId)) throw new WhatsAppConfigError('id de mídia inválido');
    const r = await this.call<{
      url?: string;
      mime_type?: string;
      file_size?: number;
      sha256?: string;
    }>(mediaId, { method: 'GET' });
    if (!r.url || !r.mime_type) throw new WhatsAppApiError(200, undefined, 'mídia sem url');
    return {
      url: r.url,
      mimeType: r.mime_type,
      ...(r.file_size !== undefined ? { size: r.file_size } : {}),
      ...(r.sha256 ? { sha256: r.sha256 } : {}),
    };
  }

  /**
   * Baixa a mídia (precisa do token). Só aceita URL https de domínio da Meta, para o token
   * não ir parar em outro host.
   */
  async downloadMedia(info: MediaInfo): Promise<{ data: Uint8Array; mimeType: string }> {
    const host = new URL(info.url).hostname;
    if (
      new URL(info.url).protocol !== 'https:' ||
      !/(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net)$/.test(host)
    ) {
      throw new WhatsAppConfigError(`host de mídia inesperado: ${host}`);
    }
    if (info.size !== undefined && info.size > MAX_MEDIA_BYTES) {
      throw new WhatsAppConfigError('mídia grande demais');
    }
    const res = await this.fetchFn(info.url, {
      headers: { authorization: `Bearer ${this.config.token}` },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
    });
    if (!res.ok) throw new WhatsAppApiError(res.status, undefined, 'falha ao baixar mídia');
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.byteLength > MAX_MEDIA_BYTES) throw new WhatsAppConfigError('mídia grande demais');
    return { data, mimeType: info.mimeType };
  }

  /** Sobe mídia (ex.: áudio do briefing) e devolve o id para sendAudio. */
  async uploadMedia(data: Uint8Array, mimeType: string, filename = 'audio.ogg'): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), filename);
    const r = await this.call<{ id?: string }>(`${this.config.phoneNumberId}/media`, {
      method: 'POST',
      body: form,
    });
    if (!r.id) throw new WhatsAppApiError(200, undefined, 'upload sem id');
    return r.id;
  }
}
