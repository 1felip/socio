import { requireMerchant } from '@/lib/session';
import { AskForm } from './ask-form';

export default async function AnalystPage() {
  const { backend } = await requireMerchant();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Analista</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte sobre vendas, itens, preços ou avaliações. Eu consulto seus dados e respondo com
          o número e um gráfico. Só leio, não mudo nada na loja.
        </p>
      </div>
      <AskForm />
      {backend.mode === 'demo' && (
        <p className="text-xs text-muted-foreground">
          No modo demonstração as respostas são exemplos prontos, com números ilustrativos.
        </p>
      )}
    </div>
  );
}
