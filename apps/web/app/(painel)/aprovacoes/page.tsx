import type { Approval } from '@socio/agents';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateTime, KIND_LABEL, STATUS_LABEL, STATUS_VARIANT } from '@/lib/approval-labels';
import { requireMerchant } from '@/lib/session';

function Row({ a }: { a: Approval }) {
  return (
    <li>
      <Link href={`/aprovacoes/${a.id}`} className="block">
        <Card className="space-y-1 hover:bg-accent/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{KIND_LABEL[a.kind]}</span>
            <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDateTime(a.createdAt)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{a.summary}</p>
        </Card>
      </Link>
    </li>
  );
}

export default async function ApprovalsPage() {
  const { backend, merchant } = await requireMerchant();
  const all = await backend.approvals.list(merchant.id);
  const pending = all.filter((a) => a.status === 'pending');
  const history = all.filter((a) => a.status !== 'pending').slice(0, 50);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Aprovações</h1>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada esperando você. Tudo em dia.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((a) => (
              <Row key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Histórico</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem histórico.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((a) => (
              <Row key={a.id} a={a} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
