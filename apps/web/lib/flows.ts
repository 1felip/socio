/**
 * Regras do painel, iguais para os modos demo e supabase (testadas sem Next).
 *
 * - Ver loja, subir foto e mandar rascunho para aprovação: qualquer membro.
 * - Aprovar ou rejeitar: só o dono (role = owner). É a checagem que o serviço de
 *   aprovações espera da rota antes de `approve/reject`.
 */
import {
  type AnalystAnswer,
  type Approval,
  ApprovalError,
  CATALOG_PUBLISH,
  CatalogPublishError,
  proposeCatalogPublish,
  REVIEW_REPLY,
  ReviewReplyError,
} from '@socio/agents';
import { normalizePhone } from '@socio/whatsapp';
import type {
  Backend,
  MenuImage,
  MerchantRef,
  SessionUser,
  WhatsAppMember,
} from './backend/types.ts';
import { buildPublishPayload } from './review-form.ts';
import { extractLinkCode, LINK_CODE_TTL_MS, linkCodeHash, newLinkCode } from './whatsapp-link.ts';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class FlowError extends Error {
  override readonly name = 'FlowError';
}

export type FlowResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): FlowResult<T> => ({ ok: true, value });
const fail = (error: string): FlowResult<never> => ({ ok: false, error });

export async function membership(
  backend: Backend,
  user: SessionUser,
  merchantId: string,
): Promise<MerchantRef | null> {
  const list = await backend.merchantsFor(user.id);
  return list.find((m) => m.id === merchantId) ?? null;
}

/** Confere tipo e tamanho pelo conteúdo, não pela extensão. */
export function sniffImageType(data: Uint8Array): (typeof PHOTO_TYPES)[number] | null {
  const b = (i: number) => data[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'image/png';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46) {
    if (b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  }
  return null;
}

export async function uploadMenuPhoto(
  backend: Backend,
  user: SessionUser,
  merchantId: string,
  data: Uint8Array,
): Promise<FlowResult<{ uploadId: string; status: string; error: string | null }>> {
  if (!(await membership(backend, user, merchantId))) return fail('Loja não encontrada.');
  if (data.byteLength === 0) return fail('Escolha uma foto do cardápio.');
  if (data.byteLength > MAX_PHOTO_BYTES) return fail('A foto passa de 10 MB. Manda uma menor?');
  const mediaType = sniffImageType(data);
  if (!mediaType) return fail('Use uma foto em JPG, PNG ou WEBP.');
  const image: MenuImage = { data, mediaType };
  const upload = await backend.createUpload(merchantId, user.id, image);
  return ok({ uploadId: upload.id, status: upload.status, error: upload.error });
}

export async function submitDraft(
  backend: Backend,
  user: SessionUser,
  merchantId: string,
  uploadId: string,
  formJson: string,
): Promise<FlowResult<Approval>> {
  if (!(await membership(backend, user, merchantId))) return fail('Loja não encontrada.');
  const upload = await backend.getUpload(uploadId, merchantId);
  if (upload?.status !== 'drafted') return fail('Rascunho não encontrado.');
  const target = await backend.catalogTarget(merchantId);
  if (!target) return fail('Não achei o cardápio da loja no iFood.');

  // Avisos vêm do rascunho salvo, não do navegador.
  const built = buildPublishPayload(formJson, target, upload.draft?.warnings ?? []);
  if (!built.ok) return built;
  try {
    const approval = await proposeCatalogPublish(backend.approvals, {
      merchantId,
      payload: built.value,
      requestedBy: `user:${user.id}`,
    });
    return ok(approval);
  } catch {
    return fail('Não consegui criar a aprovação. Confere os itens e tenta de novo.');
  }
}

export interface DecisionOutcome {
  approval: Approval;
  itemsPublished?: number;
}

export async function decide(
  backend: Backend,
  user: SessionUser,
  merchantId: string,
  approvalId: string,
  decision: 'approve' | 'reject',
): Promise<FlowResult<DecisionOutcome>> {
  const member = await membership(backend, user, merchantId);
  if (!member) return fail('Loja não encontrada.');
  if (member.role !== 'owner') return fail('Só o dono da loja pode aprovar ou recusar.');

  const current = await backend.approvals.get(approvalId, merchantId);
  if (!current) return fail('Aprovação não encontrada.');
  const d = { approvalId, merchantId, userId: user.id };

  try {
    if (decision === 'reject') return ok({ approval: await backend.approvals.reject(d) });

    // Só aprova o que o painel sabe executar: o token não pode se perder.
    if (current.kind !== CATALOG_PUBLISH && current.kind !== REVIEW_REPLY) {
      return fail('Este tipo de aprovação ainda é feito pelo WhatsApp.');
    }
    const { approval, token } = await backend.approvals.approve(d);
    const input = {
      merchantId,
      approvalId: approval.id,
      approvalToken: token,
      payload: approval.payload,
    };
    if (approval.kind === REVIEW_REPLY) {
      await backend.reviewPublisher.publish(input);
      const done = (await backend.approvals.get(approval.id, merchantId)) ?? approval;
      return ok({ approval: done });
    }
    const result = await backend.publisher.publish(input);
    const done = (await backend.approvals.get(approval.id, merchantId)) ?? approval;
    return ok({ approval: done, itemsPublished: result.itemsPublished });
  } catch (err) {
    if (
      err instanceof ApprovalError ||
      err instanceof CatalogPublishError ||
      err instanceof ReviewReplyError
    ) {
      return fail(err.message);
    }
    return fail('Deu um problema ao publicar. Confere a fila de aprovações e tenta de novo.');
  }
}

export const MAX_ANALYST_QUESTION = 500;

/** Pergunta ao Analista: qualquer membro da loja. Só leitura, nada vai para aprovação. */
export async function askAnalystQuestion(
  backend: Backend,
  user: SessionUser,
  merchantId: string,
  question: string,
): Promise<FlowResult<AnalystAnswer>> {
  if (!(await membership(backend, user, merchantId))) return fail('Loja não encontrada.');
  const q = question.trim();
  if (!q) return fail('Escreva sua pergunta.');
  if (q.length > MAX_ANALYST_QUESTION) return fail('Pergunta longa demais. Resume em uma frase?');
  try {
    return ok(await backend.askAnalyst(merchantId, q));
  } catch (err) {
    console.error('[analyst]', err instanceof Error ? err.message : err);
    return fail('Não consegui montar essa análise agora. Tente de novo em instantes.');
  }
}

/**
 * Número de WhatsApp do próprio membro (canal T16). Cada um cadastra o seu; vazio remove.
 * Devolve o código que o membro precisa mandar DESSE número para provar a posse.
 */
export async function saveWhatsAppPhone(
  backend: Backend,
  user: SessionUser,
  merchantId: string,
  raw: string,
  now = new Date(),
): Promise<FlowResult<{ waId: string | null; code: string | null }>> {
  if (!(await membership(backend, user, merchantId))) return fail('Loja não encontrada.');
  const trimmed = raw.trim();
  if (!trimmed) {
    await backend.startWhatsAppLink(user.id, merchantId, null);
    return ok({ waId: null, code: null });
  }
  const waId = normalizePhone(trimmed);
  if (!waId) return fail('Número inválido. Use DDD + número, ex.: (11) 98888-7777.');
  const code = newLinkCode();
  await backend.startWhatsAppLink(user.id, merchantId, {
    waId,
    codeHash: linkCodeHash(waId, code),
    expiresAt: new Date(now.getTime() + LINK_CODE_TTL_MS),
  });
  return ok({ waId, code });
}

export type WhatsAppLinkOutcome =
  | { status: 'linked'; member: WhatsAppMember }
  | { status: 'taken' | 'invalid' | 'not_a_code' };

/**
 * Mensagem recebida (rota do webhook, T17): se trouxer "SOCIO 123456" válido para o número
 * de origem, confirma a posse. Resposta ao remetente deve ser genérica (não revelar cadastro).
 */
export async function confirmWhatsAppFromMessage(
  backend: Backend,
  waId: string,
  text: string,
  now = new Date(),
): Promise<WhatsAppLinkOutcome> {
  const code = extractLinkCode(text);
  if (!code) return { status: 'not_a_code' };
  const r = await backend.confirmWhatsAppLink(waId, linkCodeHash(waId, code), now);
  if (r === 'taken') return { status: 'taken' };
  if (!r) return { status: 'invalid' };
  return { status: 'linked', member: r };
}
