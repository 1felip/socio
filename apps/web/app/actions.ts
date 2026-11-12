'use server';

import type { AnalystAnswer } from '@socio/agents';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  askAnalystQuestion,
  decide,
  saveWhatsAppPhone,
  submitDraft,
  uploadMenuPhoto,
} from '@/lib/flows';
import { limitByIp, rateLimitMessage } from '@/lib/rate-limit';
import { readSampleMenu } from '@/lib/sample-menu';
import { getBackend, MERCHANT_COOKIE, requireContext, requireMerchant } from '@/lib/session';

export interface FormState {
  error?: string;
  message?: string;
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Preencha e-mail e senha.' };
  const backend = await getBackend();
  if (!(await backend.signIn(email, password))) return { error: 'E-mail ou senha incorretos.' };
  redirect('/');
}

export async function signOutAction(): Promise<void> {
  const backend = await getBackend();
  await backend.signOut();
  (await cookies()).delete(MERCHANT_COOKIE);
  redirect('/login');
}

export async function selectMerchantAction(form: FormData): Promise<void> {
  const { merchants } = await requireContext();
  const id = String(form.get('merchantId') ?? '');
  if (merchants.some((m) => m.id === id)) {
    (await cookies()).set(MERCHANT_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' });
  }
  revalidatePath('/', 'layout');
}

export async function uploadMenuAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { backend, user, merchant } = await requireMerchant();
  const rate = limitByIp(await headers(), 'upload');
  if (!rate.ok) return { error: rateLimitMessage(rate.retryAfter) };
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return { error: 'Escolha uma foto do cardápio.' };
  const data = new Uint8Array(await file.arrayBuffer());
  const res = await uploadMenuPhoto(backend, user, merchant.id, data);
  if (!res.ok) return { error: res.error };
  if (res.value.status !== 'drafted') {
    return { error: res.value.error ?? 'Não consegui ler a foto. Manda outra mais de perto?' };
  }
  redirect(`/cardapio/${res.value.uploadId}`);
}

export async function submitDraftAction(
  uploadId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { backend, user, merchant } = await requireMerchant();
  const res = await submitDraft(
    backend,
    user,
    merchant.id,
    uploadId,
    String(form.get('form') ?? ''),
  );
  if (!res.ok) return { error: res.error };
  revalidatePath('/aprovacoes');
  redirect(`/aprovacoes/${res.value.id}`);
}

export async function decideAction(
  approvalId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const { backend, user, merchant } = await requireMerchant();
  const decision = form.get('decision') === 'approve' ? 'approve' : 'reject';
  const res = await decide(backend, user, merchant.id, approvalId, decision);
  if (!res.ok) return { error: res.error };
  revalidatePath('/', 'layout');
  // Redireciona com o resultado na URL: a página re-renderiza sem os botões (não está mais
  // pendente), então uma mensagem no estado do formulário se perderia.
  const q =
    decision === 'reject'
      ? 'feito=recusado'
      : `feito=publicado&n=${Math.max(0, Math.trunc(res.value.itemsPublished ?? 0))}`;
  redirect(`/aprovacoes/${encodeURIComponent(approvalId)}?${q}`);
}

export interface AnalystFormState {
  error?: string;
  result?: AnalystAnswer;
}

export async function askAnalystAction(
  _prev: AnalystFormState,
  form: FormData,
): Promise<AnalystFormState> {
  const { backend, user, merchant } = await requireMerchant();
  const rate = limitByIp(await headers(), 'model');
  if (!rate.ok) return { error: rateLimitMessage(rate.retryAfter) };
  const question = String(form.get('question') ?? '');
  const res = await askAnalystQuestion(backend, user, merchant.id, question);
  if (!res.ok) return { error: res.error };
  // Linhas cruas ficam no servidor: o painel só precisa da resposta e do gráfico.
  const { rows: _rows, error: _error, ...result } = res.value;
  return { result: { ...result, rows: [], columns: [] } };
}

/** Botão "usar foto de exemplo": mesmo fluxo do upload, com a foto versionada em public/samples. */
export async function sampleMenuAction(_prev: FormState, _form: FormData): Promise<FormState> {
  const { backend, user, merchant } = await requireMerchant();
  const rate = limitByIp(await headers(), 'upload');
  if (!rate.ok) return { error: rateLimitMessage(rate.retryAfter) };
  const data = readSampleMenu();
  if (!data) return { error: 'A foto de exemplo não está disponível agora.' };
  const res = await uploadMenuPhoto(backend, user, merchant.id, data);
  if (!res.ok) return { error: res.error };
  if (res.value.status !== 'drafted') {
    return { error: res.value.error ?? 'Não consegui ler a foto de exemplo. Tente de novo.' };
  }
  redirect(`/cardapio/${res.value.uploadId}`);
}

export interface WhatsAppFormState extends FormState {
  /** Código para mandar pelo WhatsApp (mostrado uma vez). */
  code?: string;
}

export async function saveWhatsAppAction(
  _prev: WhatsAppFormState,
  form: FormData,
): Promise<WhatsAppFormState> {
  const { backend, user, merchant } = await requireMerchant();
  const res = await saveWhatsAppPhone(backend, user, merchant.id, String(form.get('phone') ?? ''));
  if (!res.ok) return { error: res.error };
  revalidatePath('/whatsapp');
  if (!res.value.code) return { message: 'Número removido.' };
  return { message: 'Falta só confirmar.', code: res.value.code };
}
