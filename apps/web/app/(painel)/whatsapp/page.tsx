import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { requireMerchant } from '@/lib/session';
import { PhoneForm } from './phone-form';

function pretty(waId: string | null): string {
  if (!waId) return '';
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(waId);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${waId}`;
}

export default async function WhatsAppPage() {
  const { backend, user, merchant } = await requireMerchant();
  const status = await backend.whatsAppStatusFor(user.id, merchant.id);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Com seu número confirmado, você fala com o Sócio pelo WhatsApp: pergunta das vendas,
          recebe avisos e aprova com um botão. Cada número fica ligado a uma pessoa de uma loja.
        </p>
      </div>
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {status.phone ? (
            <>
              <span>
                <strong>{pretty(status.phone)}</strong> em {merchant.name}
              </span>
              <Badge variant={status.verified ? 'success' : 'warning'}>
                {status.verified ? 'confirmado' : 'esperando confirmação'}
              </Badge>
            </>
          ) : (
            <span>Nenhum número ligado ainda.</span>
          )}
        </div>
        <PhoneForm current={pretty(status.phone)} />
      </Card>
      <p className="text-xs text-muted-foreground">
        Para confirmar, mande do seu WhatsApp a mensagem com o código para o número do Sócio. O
        código vale 30 minutos. Números não confirmados recebem só uma resposta padrão, sem acesso à
        loja.
      </p>
    </div>
  );
}
