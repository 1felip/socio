import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { formatUSD } from '@/lib/money';
import { requireContext } from '@/lib/session';

export default async function HomePage() {
  const { backend, merchant } = await requireContext();

  if (!merchant) {
    return (
      <section className="space-y-2 py-10 text-center">
        <h1 className="text-xl font-semibold">Nenhuma loja por aqui ainda</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta ainda não está ligada a uma loja. Fale com quem te convidou.
        </p>
      </section>
    );
  }

  const [stats, pending] = await Promise.all([
    backend.monthStats(merchant.id, new Date()),
    backend.approvals.list(merchant.id, 'pending'),
  ]);

  const cards = [
    { title: 'Itens publicados no mês', value: String(stats.itemsPublished) },
    { title: 'Minutos economizados', value: String(stats.minutesSaved) },
    { title: 'Custo de IA no mês', value: formatUSD(stats.aiCostUsd) },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{merchant.name}</h1>
        <p className="text-sm text-muted-foreground">Resumo do mês.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardTitle>{c.title}</CardTitle>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</p>
          </Card>
        ))}
      </div>

      {pending.length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {pending.length === 1
              ? '1 aprovação esperando você.'
              : `${pending.length} aprovações esperando você.`}
          </p>
          <Link href="/aprovacoes" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
            Ver fila
          </Link>
        </Card>
      ) : (
        stats.itemsPublished === 0 && (
          <Card className="space-y-2 text-center">
            <p className="text-sm">Ainda nada publicado este mês.</p>
            <Link href="/cardapio/novo" className="text-sm font-medium underline">
              Mande a foto do cardápio para começar
            </Link>
          </Card>
        )
      )}
    </div>
  );
}
