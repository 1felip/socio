import { CATALOG_PUBLISH, CatalogPublishPayload } from '@socio/agents';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateTime, KIND_LABEL, STATUS_LABEL, STATUS_VARIANT } from '@/lib/approval-labels';
import { formatBRL } from '@/lib/money';
import { requireMerchant } from '@/lib/session';
import { DecisionButtons } from './decision-buttons';

export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ feito?: string; n?: string }>;
}) {
  const { id } = await params;
  const { feito, n } = await searchParams;
  const { backend, merchant } = await requireMerchant();
  const approval = await backend.approvals.get(id, merchant.id);
  if (!approval) notFound();

  const payload =
    approval.kind === CATALOG_PUBLISH ? CatalogPublishPayload.safeParse(approval.payload) : null;
  const target = payload?.success ? await backend.catalogTarget(merchant.id) : null;
  const targetName = (cid: string) => target?.categories.find((c) => c.id === cid)?.name ?? cid;

  const canDecide = approval.status === 'pending' && merchant.role === 'owner';

  return (
    <div className="space-y-4">
      {feito === 'publicado' && approval.status === 'executed' && (
        <p
          role="status"
          className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
        >
          Publicado: {Number(n) === 1 ? '1 item' : `${Number(n) || 0} itens`} no cardápio.
        </p>
      )}
      {feito === 'recusado' && approval.status === 'rejected' && (
        <p role="status" className="rounded-md bg-accent p-3 text-sm">
          Recusado. Nada foi publicado.
        </p>
      )}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{KIND_LABEL[approval.kind]}</h1>
          <Badge variant={STATUS_VARIANT[approval.status]}>{STATUS_LABEL[approval.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Pedido em {formatDateTime(approval.createdAt)}. {approval.summary}
        </p>
      </div>

      <h2 className="text-base font-semibold">O que vai ser publicado</h2>
      {payload?.success ? (
        payload.data.draft.categories.map((cat, ci) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lista só de leitura, payload congelado.
          <section key={`${cat.name}-${ci}`} className="space-y-2">
            <h3 className="text-sm font-medium">
              {cat.name}{' '}
              <span className="text-muted-foreground">
                → {targetName(payload.data.categoryIds[ci] ?? '')}
              </span>
            </h3>
            <ul className="space-y-2">
              {cat.items.map((item, ii) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista só de leitura, payload congelado.
                <li key={`${item.name}-${ii}`}>
                  <Card className="space-y-1 p-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.price_outlier && <Badge variant="warning">Preço fora do padrão</Badge>}
                      {item.low_confidence && <Badge variant="warning">Leitura incerta</Badge>}
                      <span className="ml-auto tabular-nums">
                        {item.price_cents === null ? 'sem preço' : formatBRL(item.price_cents)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                    {item.complement_groups.map((g) => (
                      <p key={g.name} className="text-xs text-muted-foreground">
                        {g.name}:{' '}
                        {g.options
                          .map(
                            (o) =>
                              `${o.name}${o.price_cents ? ` (+${formatBRL(o.price_cents)})` : ''}`,
                          )
                          .join(', ')}
                      </p>
                    ))}
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <Card>
          <pre className="overflow-x-auto text-xs">{JSON.stringify(approval.payload, null, 2)}</pre>
        </Card>
      )}

      {canDecide && <DecisionButtons approvalId={approval.id} />}
      {approval.status === 'pending' && merchant.role !== 'owner' && (
        <p className="text-sm text-muted-foreground">Só o dono da loja pode aprovar.</p>
      )}
    </div>
  );
}
