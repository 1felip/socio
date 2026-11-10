'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { decide, submitDraft, uploadMenuPhoto } from '@/lib/flows';
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
