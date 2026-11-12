import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/approval-labels';
import { budgetMessage, DEFAULT_TIME_ZONE, todayBudget } from '@/lib/budget';
import {
  agentLabel,
  buildCostReport,
  formatMs,
  formatUsdPrecise,
  type RunRow,
  traceUrl,
} from '@/lib/costs';
import { requireMerchant } from '@/lib/session';

const PERIODS = [7, 14, 30] as const;

const STATUS: Record<
  RunRow['status'],
  { label: string; variant: 'default' | 'warning' | 'danger' | 'success' }
> = {
  ok: { label: 'ok', variant: 'success' },
  error: { label: 'erro', variant: 'danger' },
  blocked: { label: 'bloqueada', variant: 'warning' },
};

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const { backend, merchant } = await requireMerchant();
  const raw = Number((await searchParams).dias);
  const days = (PERIODS as readonly number[]).includes(raw) ? raw : 14;
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);

  const [runs, budget] = await Promise.all([
    backend.listRuns(merchant.id, since),
    todayBudget(backend, merchant.id, { now }).catch(() => null),
  ]);
  const report = buildCostReport(runs, { now, days, timeZone: DEFAULT_TIME_ZONE });
  const maxDay = Math.max(...report.byDay.map((d) => d.costUsd), 1e-9);
  const avgPerDay = report.total.costUsd / days;
  const alert = budget ? budgetMessage(budget) : null;

  const cards = [
    { title: `Custo em ${days} dias`, value: formatUsdPrecise(report.total.costUsd) },
    { title: 'Média por dia', value: formatUsdPrecise(avgPerDay) },
    { title: 'Projeção para 30 dias', value: formatUsdPrecise(avgPerDay * 30) },
    {
      title: 'Latência p50 / p95',
      value: `${formatMs(report.total.p50)} / ${formatMs(report.total.p95)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Custos de IA</h1>
          <p className="text-sm text-muted-foreground">
            Quanto cada agente gastou e quanto demorou, a partir das execuções registradas.
          </p>
        </div>
        <nav className="ml-auto flex gap-1" aria-label="Período">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/custos?dias=${p}`}
              aria-current={p === days ? 'page' : undefined}
              className={`rounded-md px-2 py-1 text-sm ${p === days ? 'bg-accent font-medium' : 'hover:bg-accent'}`}
            >
              {p} dias
            </Link>
          ))}
        </nav>
      </div>

      {budget && (
        <Card className={alert ? 'border-amber-500' : undefined} role={alert ? 'alert' : undefined}>
          <CardTitle>Hoje</CardTitle>
          <p className="text-base">
            {formatUsdPrecise(budget.spentUsd)} de {formatUsdPrecise(budget.limitUsd)} do teto
            diário
          </p>
          {alert && <p className="text-sm text-amber-700 dark:text-amber-400">{alert}</p>}
        </Card>
      )}

      {report.total.runs === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma execução de IA nesse período. Use o cardápio, as avaliações ou o Analista e volte
          aqui.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((c) => (
              <Card key={c.title}>
                <CardTitle>{c.title}</CardTitle>
                <p className="text-2xl font-semibold">{c.value}</p>
              </Card>
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Por dia</h2>
            <ul className="space-y-1">
              {report.byDay.map((d) => (
                <li key={d.day} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {d.day.slice(8, 10)}/{d.day.slice(5, 7)}
                  </span>
                  <span className="h-3 flex-1 rounded-sm bg-accent">
                    <span
                      className="block h-3 rounded-sm bg-primary"
                      style={{ width: `${(d.costUsd / maxDay) * 100}%` }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right tabular-nums">
                    {formatUsdPrecise(d.costUsd)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Por agente</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-input">
                    <th className="px-2 py-1 font-medium">Agente</th>
                    <th className="px-2 py-1 text-right font-medium">Execuções</th>
                    <th className="px-2 py-1 text-right font-medium">Custo</th>
                    <th className="px-2 py-1 text-right font-medium">p50</th>
                    <th className="px-2 py-1 text-right font-medium">p95</th>
                    <th className="px-2 py-1 text-right font-medium">Erros</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byAgent.map((a) => (
                    <tr key={a.agent} className="border-b border-input">
                      <td className="px-2 py-1">{agentLabel(a.agent)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{a.runs}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatUsdPrecise(a.costUsd)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatMs(a.p50)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatMs(a.p95)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{a.errors + a.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">Últimas execuções</h2>
            <ul className="space-y-1">
              {report.recent.map((r) => {
                const url = traceUrl(r.traceId);
                return (
                  <li
                    key={`${r.createdAt.toISOString()}-${r.agent}-${r.step}-${r.traceId ?? ''}`}
                    className="flex flex-wrap items-center gap-2 border-b border-input py-1 text-sm"
                  >
                    <span className="text-muted-foreground">{formatDateTime(r.createdAt)}</span>
                    <span>
                      {agentLabel(r.agent)}
                      {r.step ? ` · ${r.step}` : ''}
                    </span>
                    <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    <span className="ml-auto tabular-nums">
                      {formatUsdPrecise(r.costUsd)} · {formatMs(r.latencyMs)}
                    </span>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline"
                      >
                        trace
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {backend.mode === 'demo' && (
        <p className="text-xs text-muted-foreground">
          No modo demonstração o histórico é de exemplo; as leituras de cardápio que você fizer
          entram aqui com custo simulado.
        </p>
      )}
    </div>
  );
}
