import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { type Backend, type CookieJar, createBackend } from './backend/index.ts';
import type { MerchantRef, SessionUser } from './backend/types.ts';

export const MERCHANT_COOKIE = 'socio_merchant';

/** Em Server Components o Next não deixa gravar cookie: ignoramos (o proxy/ação renova). */
function safe(fn: () => void) {
  try {
    fn();
  } catch {}
}

export const getBackend = cache(async (): Promise<Backend> => {
  const store = await cookies();
  const jar: CookieJar = {
    get: (name) => store.get(name)?.value,
    set: (name, value, opts) => safe(() => store.set(name, value, opts ?? {})),
    delete: (name) => safe(() => store.delete(name)),
  };
  return createBackend(jar, {
    getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (list) => {
      for (const c of list) safe(() => store.set(c.name, c.value, c.options ?? {}));
    },
  });
});

export interface PanelContext {
  backend: Backend;
  user: SessionUser;
  merchants: MerchantRef[];
  /** null quando o usuário não é membro de nenhuma loja. */
  merchant: MerchantRef | null;
}

export const requireContext = cache(async (): Promise<PanelContext> => {
  const backend = await getBackend();
  const user = await backend.currentUser();
  if (!user) redirect('/login');
  const merchants = await backend.merchantsFor(user.id);
  const chosen = (await cookies()).get(MERCHANT_COOKIE)?.value;
  const merchant = merchants.find((m) => m.id === chosen) ?? merchants[0] ?? null;
  return { backend, user, merchants, merchant };
});

/** Para páginas que precisam de uma loja: sem loja, volta para o início (estado vazio). */
export async function requireMerchant(): Promise<PanelContext & { merchant: MerchantRef }> {
  const ctx = await requireContext();
  if (!ctx.merchant) redirect('/');
  return ctx as PanelContext & { merchant: MerchantRef };
}
