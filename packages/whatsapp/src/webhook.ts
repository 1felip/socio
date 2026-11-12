/**
 * Payload do webhook (POST) → eventos simples para o n8n / orquestrador.
 *
 * object = "whatsapp_business_account" → entry[].changes[].value com messages[], contacts[]
 * e statuses[]. Só mensagens viram evento; statuses (sent/delivered/read/failed) viram status.
 * Texto de mensagem é dado de terceiro (não confiável) até o número ser resolvido para um membro.
 */
import { z } from 'zod';

const Message = z
  .object({
    // wa_id do remetente. Pode faltar: a Meta passou a identificar usuários por BSUID (from_user_id).
    from: z.string().optional(),
    from_user_id: z.string().optional(),
    id: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    interactive: z
      .object({
        type: z.string(),
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
      })
      .optional(),
    button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
    audio: z.object({ id: z.string(), mime_type: z.string().optional() }).optional(),
    image: z
      .object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional() })
      .optional(),
    context: z.object({ id: z.string().optional() }).optional(),
  })
  .passthrough();

const Status = z
  .object({
    id: z.string(),
    status: z.string(),
    recipient_id: z.string().optional(),
    timestamp: z.string().optional(),
    errors: z.array(z.object({ code: z.number(), title: z.string().optional() })).optional(),
  })
  .passthrough();

const Payload = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              metadata: z.object({ phone_number_id: z.string() }).partial().optional(),
              contacts: z
                .array(
                  z.object({
                    wa_id: z.string(),
                    profile: z.object({ name: z.string() }).partial().optional(),
                  }),
                )
                .optional(),
              messages: z.array(Message).optional(),
              statuses: z.array(Status).optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
});

export type InboundKind = 'text' | 'button' | 'audio' | 'image' | 'other';

export interface InboundMessage {
  /** wa_id de quem mandou (E.164 sem +). Ausente quando a Meta só manda o BSUID. */
  from?: string;
  /** BSUID (business-scoped user id), quando vier. */
  fromUserId?: string;
  messageId: string;
  /** Mensagem respondida (botão), se houver. */
  replyTo?: string;
  phoneNumberId?: string;
  at: Date;
  kind: InboundKind;
  text?: string;
  /** id do botão de resposta rápida (ex.: "approve:<approvalId>"). */
  buttonId?: string;
  mediaId?: string;
  mimeType?: string;
  /** Tipo original quando kind = other (sticker, location...). */
  rawType?: string;
}

export interface DeliveryStatus {
  messageId: string;
  status: string;
  recipient?: string;
  errorCodes: number[];
}

export interface ParsedWebhook {
  messages: InboundMessage[];
  statuses: DeliveryStatus[];
}

export class WebhookPayloadError extends Error {
  override readonly name = 'WebhookPayloadError';
}

/** Limite de texto que segue adiante (o resto é cortado). */
export const MAX_INBOUND_TEXT = 4000;

export function parseWebhook(body: unknown): ParsedWebhook {
  const parsed = Payload.safeParse(body);
  if (!parsed.success) throw new WebhookPayloadError('payload do WhatsApp inválido');
  const messages: InboundMessage[] = [];
  const statuses: DeliveryStatus[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const v = change.value;
      for (const m of v.messages ?? []) {
        // Sem nenhum identificador do remetente não há como responder nem achar a loja.
        if (!m.from && !m.from_user_id) continue;
        const base = {
          ...(m.from ? { from: m.from } : {}),
          ...(m.from_user_id ? { fromUserId: m.from_user_id } : {}),
          messageId: m.id,
          at: new Date(Number(m.timestamp) * 1000),
          ...(m.context?.id ? { replyTo: m.context.id } : {}),
          ...(v.metadata?.phone_number_id ? { phoneNumberId: v.metadata.phone_number_id } : {}),
        };
        if (m.type === 'text' && m.text) {
          messages.push({ ...base, kind: 'text', text: m.text.body.slice(0, MAX_INBOUND_TEXT) });
        } else if (m.type === 'interactive' && m.interactive?.button_reply) {
          const b = m.interactive.button_reply;
          messages.push({ ...base, kind: 'button', buttonId: b.id, text: b.title });
        } else if (m.type === 'button' && m.button) {
          // Botão de template (quick reply de template aprovado).
          messages.push({
            ...base,
            kind: 'button',
            ...(m.button.payload ? { buttonId: m.button.payload } : {}),
            ...(m.button.text ? { text: m.button.text } : {}),
          });
        } else if (m.type === 'audio' && m.audio) {
          messages.push({
            ...base,
            kind: 'audio',
            mediaId: m.audio.id,
            ...(m.audio.mime_type ? { mimeType: m.audio.mime_type } : {}),
          });
        } else if (m.type === 'image' && m.image) {
          messages.push({
            ...base,
            kind: 'image',
            mediaId: m.image.id,
            ...(m.image.mime_type ? { mimeType: m.image.mime_type } : {}),
            ...(m.image.caption ? { text: m.image.caption.slice(0, MAX_INBOUND_TEXT) } : {}),
          });
        } else {
          messages.push({ ...base, kind: 'other', rawType: m.type });
        }
      }
      for (const s of v.statuses ?? []) {
        statuses.push({
          messageId: s.id,
          status: s.status,
          ...(s.recipient_id ? { recipient: s.recipient_id } : {}),
          errorCodes: (s.errors ?? []).map((e) => e.code),
        });
      }
    }
  }
  return { messages, statuses };
}
