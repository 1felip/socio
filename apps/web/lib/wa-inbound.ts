/**
 * Núcleo de /api/whatsapp/inbound (T17), separado da rota para testar sem Next.
 *
 * Caminho: Meta → n8n (wa-inbound) → aqui. O n8n repassa o corpo cru da Meta sem mexer, com
 * o X-Hub-Signature-256 original, e assina o mesmo corpo com o HMAC do n8n. As duas
 * assinaturas são obrigatórias e conferidas antes do parse. Quem envia as respostas é o n8n
 * (wa-buttons): aqui só se decide o que responder.
 *
 * Regras:
 * - Só número com posse comprovada (T16) conversa com o Sócio. Os outros recebem sempre a
 *   mesma resposta genérica, que não revela se o número está cadastrado.
 * - Cada wamid é processado uma vez (a Meta reenvia por até 7 dias).
 * - Texto do cliente é dado, nunca instrução: vai para o orquestrador como `text`.
 * - Botão Aprovar/Recusar passa pela mesma regra do painel (decideFor: só o dono).
 */
import { createHmac } from 'node:crypto';
import {
  type Approval,
  analystIntentHandler,
  createOrchestrator,
  InvalidAgentRequest,
  type OrchestratorDeps,
  proposeCatalogPublish,
} from '@socio/agents';
import {
  configFromEnv,
  type InboundMessage,
  MAX_BUTTON_ID,
  SIGNATURE_HEADER as META_SIGNATURE_HEADER,
  maskPhone,
  parseWebhook,
  type ReplyButton,
  verifyChallenge,
  verifySignature as verifyMetaSignature,
  WebhookPayloadError,
  WhatsAppClient,
} from '@socio/whatsapp';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from './agent-auth.ts';
import type { Backend, WhatsAppMember } from './backend/types.ts';
import { confirmWhatsAppFromMessage, decideFor, MAX_PHOTO_BYTES, sniffImageType } from './flows.ts';
import { formatBRL } from './money.ts';
import { type RateLimiter, rateLimitMessage, ruleFor, sharedLimiter } from './rate-limit.ts';
import { buildPublishPayload, draftToForm } from './review-form.ts';
import { extractLinkCode } from './whatsapp-link.ts';

/** A Meta manda lotes pequenos; 1 MB sobra e corta abuso antes do parse. */
export const MAX_INBOUND_BYTES = 1024 * 1024;
/** Teto de mensagens tratadas por chamada (o resto fica sem resposta, mas marcado). */
export const MAX_MESSAGES_PER_CALL = 20;

type Env = Record<string, string | undefined>;

export interface OutboundReply {
  /** wa_id do destinatário. */
  to: string;
  text: string;
  /** Até 3 botões de resposta rápida (wa-buttons manda como mensagem interativa). */
  buttons?: ReplyButton[];
}

export interface InboundResult {
  replies: OutboundReply[];
  received: number;
  duplicates: number;
  ignored: number;
}

export type MediaFetcher = (mediaId: string) => Promise<{ data: Uint8Array; mimeType: string }>;

export interface WhatsAppInboundDeps {
  backend: Backend;
  env?: Env;
  now?: () => Date;
  /** Baixa a foto da Meta. Padrão: WhatsAppClient com WHATSAPP_TOKEN. */
  fetchMedia?: MediaFetcher;
  /** Testes injetam handlers e tetos do orquestrador. */
  orchestrator?: Partial<Pick<OrchestratorDeps, 'handlers' | 'limits'>>;
  /** Limite por loja (texto = balde model, foto = balde upload). Testes injetam o seu. */
  limiter?: RateLimiter;
}

export const TEXTS = {
  unknown:
    'Oi! Aqui é o Sócio, assistente de lojas parceiras. Para conversar comigo, cadastre este número no painel e mande daqui o código que aparece lá.',
  linked: 'Pronto, número confirmado. Pode me mandar uma pergunta ou a foto do cardápio.',
  unsupported: 'Por enquanto eu leio texto e foto de cardápio. Me escreve o que você precisa?',
  failed: 'Não consegui responder agora. Tenta de novo em instantes?',
  photoBad: 'Não consegui abrir essa foto. Manda em JPG ou PNG, com até 10 MB?',
  staffQueued: 'Mandei para o dono aprovar. Assim que ele decidir, o cardápio é atualizado.',
  approveOnlyOwner: 'Só o dono da loja pode aprovar ou recusar.',
} as const;

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

/** GET de verificação da Meta (o n8n repassa a query). Devolve o challenge em texto puro. */
export function handleWhatsAppVerify(req: Request, env: Env = process.env): Response {
  const challenge = verifyChallenge(new URL(req.url).searchParams, env.WHATSAPP_VERIFY_TOKEN);
  if (!challenge) return new Response('forbidden', { status: 403 });
  return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

export async function handleWhatsAppInbound(
  req: Request,
  deps: WhatsAppInboundDeps,
): Promise<Response> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());

  // Corpo lido uma vez, com limite, e as assinaturas conferidas sobre os bytes crus.
  if (Number(req.headers.get('content-length') ?? '0') > MAX_INBOUND_BYTES) {
    return error(413, 'Corpo grande demais.');
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_INBOUND_BYTES) {
    return error(413, 'Corpo grande demais.');
  }
  const n8n = verifySignature({
    secret: env.N8N_WEBHOOK_SECRET,
    signature: req.headers.get(SIGNATURE_HEADER),
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    body: raw,
    now: now(),
  });
  if (!n8n.ok) return error(403, 'Assinatura inválida.');
  if (!verifyMetaSignature(env.WHATSAPP_APP_SECRET, raw, req.headers.get(META_SIGNATURE_HEADER))) {
    return error(403, 'Assinatura inválida.');
  }

  let parsed: ReturnType<typeof parseWebhook>;
  try {
    parsed = parseWebhook(JSON.parse(raw), {
      ...(env.WHATSAPP_PHONE_NUMBER_ID ? { phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID } : {}),
      now,
    });
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof WebhookPayloadError) {
      return error(400, 'Payload inválido.');
    }
    throw err;
  }

  const result: InboundResult = { replies: [], received: 0, duplicates: 0, ignored: 0 };
  for (const [i, msg] of parsed.messages.entries()) {
    if (!(await deps.backend.claimInboundMessage(msg.messageId, now()))) {
      result.duplicates++;
      continue;
    }
    // Sem wa_id (só BSUID) não há para quem responder nem como achar o membro.
    if (!msg.from || i >= MAX_MESSAGES_PER_CALL) {
      result.ignored++;
      continue;
    }
    result.received++;
    try {
      result.replies.push(...(await handleMessage(msg as InboundMessage & { from: string }, deps)));
    } catch (err) {
      // Só o nome do erro: mensagens de dependências (banco, Meta) podem trazer o número.
      console.error('[wa-inbound]', maskPhone(msg.from), msg.kind, errorName(err));
      // Falha transitória: libera o wamid para o reenvio da Meta tentar de novo.
      await deps.backend.releaseInboundMessage(msg.messageId).catch(() => undefined);
      result.replies.push({ to: msg.from, text: TEXTS.failed });
    }
  }
  return Response.json(result);
}

async function handleMessage(
  msg: InboundMessage & { from: string },
  deps: WhatsAppInboundDeps,
): Promise<OutboundReply[]> {
  const { backend } = deps;
  const now = deps.now ?? (() => new Date());
  const member = await backend.memberByWhatsApp(msg.from);

  if (!member) {
    // Única coisa que um número não confirmado pode fazer: mandar o código do painel.
    if (msg.kind === 'text' && msg.text && extractLinkCode(msg.text)) {
      const r = await confirmWhatsAppFromMessage(backend, msg.from, msg.text, now());
      if (r.status === 'linked') return [{ to: msg.from, text: TEXTS.linked }];
    }
    return [{ to: msg.from, text: TEXTS.unknown }];
  }

  // Cada texto chama modelo e cada foto chama visão: limite por loja, não só o teto de custo.
  if (msg.kind === 'text' || msg.kind === 'image') {
    const bucket = msg.kind === 'image' ? 'upload' : 'model';
    const rate = (deps.limiter ?? sharedLimiter()).check(
      `wa-${bucket}:${member.merchantId}`,
      ruleFor(bucket, deps.env ?? process.env),
      now().getTime(),
    );
    if (!rate.ok) return [{ to: msg.from, text: rateLimitMessage(rate.retryAfter) }];
  }

  switch (msg.kind) {
    case 'button':
      return handleButton(msg, member, deps);
    case 'image':
      return handlePhoto(msg, member, deps);
    case 'text':
      return msg.text ? handleText(msg.from, msg.text, member, deps) : [];
    default:
      return [{ to: msg.from, text: TEXTS.unsupported }];
  }
}

// ---------- botões ----------

const BUTTON_ID = /^(approve|reject):([\w-]{1,100})$/;

export function approvalButtons(approvalId: string): ReplyButton[] {
  return [
    { id: `approve:${approvalId}`.slice(0, MAX_BUTTON_ID), title: 'Aprovar' },
    { id: `reject:${approvalId}`.slice(0, MAX_BUTTON_ID), title: 'Recusar' },
  ];
}

async function handleButton(
  msg: InboundMessage & { from: string },
  member: WhatsAppMember,
  deps: WhatsAppInboundDeps,
): Promise<OutboundReply[]> {
  const m = BUTTON_ID.exec(msg.buttonId ?? '');
  if (!m) return [{ to: msg.from, text: TEXTS.unsupported }];
  const decision = m[1] as 'approve' | 'reject';
  const approvalId = m[2] as string;
  // A aprovação precisa ser da loja do membro: decideFor busca por (id, merchantId).
  const r = await decideFor(deps.backend, member, member.merchantId, approvalId, decision);
  if (!r.ok) return [{ to: msg.from, text: r.error }];
  const { approval, itemsPublished } = r.value;
  let text: string;
  if (decision === 'reject') text = 'Combinado, recusei. Nada foi publicado.';
  else if (itemsPublished !== undefined) {
    text = `Feito: publiquei ${itemsPublished} ${itemsPublished === 1 ? 'item' : 'itens'} no cardápio.`;
  } else if (approval.status === 'executed') text = 'Feito: resposta publicada.';
  else text = 'Aprovado. Vou concluir e te aviso se der algum problema.';
  return [{ to: msg.from, text }];
}

// ---------- foto de cardápio ----------

function defaultFetchMedia(env: Env): MediaFetcher {
  return async (mediaId) => {
    const client = new WhatsAppClient(configFromEnv(env));
    return client.downloadMedia(await client.getMedia(mediaId));
  };
}

async function handlePhoto(
  msg: InboundMessage & { from: string },
  member: WhatsAppMember,
  deps: WhatsAppInboundDeps,
): Promise<OutboundReply[]> {
  const { backend } = deps;
  const env = deps.env ?? process.env;
  if (!msg.mediaId) return [{ to: msg.from, text: TEXTS.photoBad }];

  const fetchMedia = deps.fetchMedia ?? defaultFetchMedia(env);
  const { data } = await fetchMedia(msg.mediaId);
  // Tipo pelo conteúdo, não pelo mime que veio no payload.
  const mediaType = sniffImageType(data);
  if (data.byteLength === 0 || data.byteLength > MAX_PHOTO_BYTES || !mediaType) {
    return [{ to: msg.from, text: TEXTS.photoBad }];
  }

  const upload = await backend.createUpload(
    member.merchantId,
    member.userId,
    { data, mediaType },
    { server: true },
  );
  if (upload.status !== 'drafted' || !upload.draft) {
    return [{ to: msg.from, text: upload.error ?? TEXTS.photoBad }];
  }

  const reviewLink = panelLink(env, `/cardapio/${upload.id}`);
  const target = await backend.catalogTarget(member.merchantId);
  const built = target
    ? buildPublishPayload(
        JSON.stringify(draftToForm(upload.draft, target)),
        target,
        upload.draft.warnings,
      )
    : ({ ok: false, error: 'Não achei o cardápio da loja no iFood.' } as const);
  if (!built.ok) {
    // Não dá para aprovar às cegas: manda conferir no painel (categoria, preço faltando...).
    return [
      {
        to: msg.from,
        text: `Li o cardápio, mas preciso que você confira antes de publicar. ${built.error} ${reviewLink}`,
      },
    ];
  }

  const approval = await proposeCatalogPublish(backend.approvals, {
    merchantId: member.merchantId,
    payload: built.value,
    requestedBy: `user:${member.userId}`,
  });
  // O dono aprova vendo o que foi lido (itens e preços), não só a contagem.
  const text = clipBody(approval.summary, listItems(built.value.draft), reviewLink);
  return approvalReplies(msg.from, member, approval, deps, text);
}

const MAX_LISTED_ITEMS = 15;
/** Corpo da mensagem com botões: até 1024; reserva espaço para o "Posso publicar?". */
const MAX_APPROVAL_BODY = 1024 - 40;

function listItems(draft: {
  categories: Array<{ items: Array<{ name: string; price_cents: number | null }> }>;
}): string[] {
  const items = draft.categories.flatMap((c) => c.items);
  const lines = items
    .slice(0, MAX_LISTED_ITEMS)
    .map(
      (i) =>
        `• ${i.name.slice(0, 60)} — ${i.price_cents === null ? 'sem preço' : formatBRL(i.price_cents)}`,
    );
  if (items.length > MAX_LISTED_ITEMS) lines.push(`… e mais ${items.length - MAX_LISTED_ITEMS}.`);
  return lines;
}

function clipBody(summary: string, lines: string[], link: string): string {
  const head = `${summary}\n`;
  const tail = `\n${link}`;
  let body = '';
  for (const line of lines) {
    if (head.length + body.length + line.length + 1 + tail.length > MAX_APPROVAL_BODY) {
      body += '…\n';
      break;
    }
    body += `${line}\n`;
  }
  return `${head}${body}${tail}`.slice(0, MAX_APPROVAL_BODY);
}

function errorName(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' || typeof code === 'number' ? `${err.name}(${code})` : err.name;
  }
  return typeof err;
}

/** Dono decide ali mesmo; funcionário recebe aviso e os donos recebem os botões. */
async function approvalReplies(
  to: string,
  member: WhatsAppMember,
  approval: Approval,
  deps: WhatsAppInboundDeps,
  text: string,
): Promise<OutboundReply[]> {
  const buttons = approvalButtons(approval.id);
  if (member.role === 'owner') return [{ to, text: `${text} Posso publicar?`, buttons }];
  const owners = await deps.backend.whatsAppOwners(member.merchantId);
  return [
    { to, text: TEXTS.staffQueued },
    ...owners.map((o) => ({ to: o, text: `Pedido da equipe: ${text} Posso publicar?`, buttons })),
  ];
}

function panelLink(env: Env, path: string): string {
  const base = env.SOCIO_APP_URL?.trim().replace(/\/+$/, '');
  return base && /^https:\/\//.test(base) ? `Revise aqui: ${base}${path}` : 'Revise no painel.';
}

// ---------- texto ----------

/**
 * Conversa por número sem guardar o número em claro. HMAC com segredo do servidor: telefone
 * tem espaço pequeno, um hash simples seria revertido por força bruta.
 */
export function conversationRef(waId: string, secret: string): string {
  return `wa:${createHmac('sha256', secret).update(`socio-wa:${waId}`).digest('hex').slice(0, 32)}`;
}

function refSecret(env: Env): string {
  const secret = env.SESSION_SECRET || env.N8N_WEBHOOK_SECRET;
  if (!secret) throw new Error('sem segredo para a referência da conversa');
  return secret;
}

async function handleText(
  from: string,
  text: string,
  member: WhatsAppMember,
  deps: WhatsAppInboundDeps,
): Promise<OutboundReply[]> {
  const { backend } = deps;
  const orchestrator = createOrchestrator({
    approvals: backend.approvals,
    conversations: backend.conversations,
    ...(deps.now ? { now: deps.now } : {}),
    ...deps.orchestrator,
    handlers: {
      analista: analystIntentHandler((merchantId, question) =>
        backend.askAnalyst(merchantId, question),
      ),
      ...deps.orchestrator?.handlers,
    },
  });
  try {
    const res = await orchestrator.handle({
      merchantId: member.merchantId,
      channel: 'whatsapp',
      text,
      externalRef: conversationRef(from, refSecret(deps.env ?? process.env)),
    });
    const out: OutboundReply[] = [{ to: from, text: res.text }];
    for (const ref of res.approvals.slice(0, 3)) {
      const approval = await backend.approvals.get(ref.id, member.merchantId);
      if (approval) out.push(...(await approvalReplies(from, member, approval, deps, ref.summary)));
    }
    return out;
  } catch (err) {
    if (err instanceof InvalidAgentRequest) return [{ to: from, text: TEXTS.unsupported }];
    throw err;
  }
}
