import Link from 'next/link';
import type { ReactNode } from 'react';
import { selectMerchantAction, signOutAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { budgetMessage, todayBudget } from '@/lib/budget';
import { requireContext } from '@/lib/session';
import { MerchantSelect } from './merchant-select';

const NAV = [
  { href: '/', label: 'Início' },
  { href: '/cardapio/novo', label: 'Novo cardápio' },
  { href: '/aprovacoes', label: 'Aprovações' },
  { href: '/analista', label: 'Analista' },
  { href: '/custos', label: 'Custos' },
];

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { user, merchants, merchant, backend } = await requireContext();
  // Aviso de teto diário em todas as telas. Falha aqui nunca derruba o painel.
  const budget = merchant ? await todayBudget(backend, merchant.id).catch(() => null) : null;
  const alert = budget ? budgetMessage(budget) : null;

  return (
    <div className="mx-auto max-w-3xl px-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-input py-3">
        <Link href="/" className="text-lg font-semibold">
          Sócio
        </Link>
        {backend.mode === 'demo' && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs">demo</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {merchants.length > 1 && merchant ? (
            <MerchantSelect
              action={selectMerchantAction}
              merchants={merchants}
              current={merchant.id}
            />
          ) : (
            merchant && <span className="text-sm text-muted-foreground">{merchant.name}</span>
          )}
          <form action={signOutAction}>
            <Button variant="ghost" size="sm" type="submit" title={user.email}>
              Sair
            </Button>
          </form>
        </div>
        <nav className="flex w-full gap-1 overflow-x-auto" aria-label="Painel">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-accent"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      {alert && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
        >
          {alert}{' '}
          <Link href="/custos" className="underline">
            Ver custos
          </Link>
        </div>
      )}
      <main className="py-6">{children}</main>
    </div>
  );
}
