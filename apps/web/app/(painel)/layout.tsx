import Link from 'next/link';
import type { ReactNode } from 'react';
import { selectMerchantAction, signOutAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { requireContext } from '@/lib/session';
import { MerchantSelect } from './merchant-select';

const NAV = [
  { href: '/', label: 'Início' },
  { href: '/cardapio/novo', label: 'Novo cardápio' },
  { href: '/aprovacoes', label: 'Aprovações' },
];

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const { user, merchants, merchant, backend } = await requireContext();

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
      <main className="py-6">{children}</main>
    </div>
  );
}
