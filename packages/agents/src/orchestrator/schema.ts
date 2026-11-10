/**
 * Contrato da porta de entrada única (POST /api/agent): painel e n8n falam a mesma língua.
 */
import { z } from 'zod';
import { APPROVAL_KINDS } from '../approvals/service.ts';

export const CHANNELS = ['whatsapp', 'panel'] as const;
export type Channel = (typeof CHANNELS)[number];

export const INTENTS = ['cardapio', 'avaliacoes', 'analista', 'campanhas', 'conversa'] as const;
export type Intent = (typeof INTENTS)[number];

const httpsUrl = z.url({ protocol: /^https$/ }).max(2048);

export const AgentRequest = z
  .object({
    merchantId: z.string().trim().min(1).max(64),
    channel: z.enum(CHANNELS),
    text: z.string().trim().min(1).max(4000).optional(),
    audioUrl: httpsUrl.optional(),
    imageUrl: httpsUrl.optional(),
    /** Identifica a conversa dentro do canal (telefone mascarado no n8n, usuário no painel). */
    externalRef: z.string().trim().min(1).max(128).optional(),
  })
  .strict()
  .refine((r) => r.text || r.audioUrl || r.imageUrl, {
    message: 'mande text, audioUrl ou imageUrl',
  });
export type AgentRequest = z.infer<typeof AgentRequest>;

export const ApprovalRef = z.object({
  id: z.string(),
  kind: z.enum(APPROVAL_KINDS),
  summary: z.string(),
});
export type ApprovalRef = z.infer<typeof ApprovalRef>;

export const Attachment = z.object({
  type: z.enum(['image', 'audio', 'link']),
  url: z.string(),
  label: z.string().optional(),
});
export type Attachment = z.infer<typeof Attachment>;

export const AgentResponse = z.object({
  text: z.string(),
  /** Aprovações propostas nesta resposta (o dono decide no painel ou no botão). */
  approvals: z.array(ApprovalRef),
  attachments: z.array(Attachment),
  intent: z.enum(INTENTS),
});
export type AgentResponse = z.infer<typeof AgentResponse>;
