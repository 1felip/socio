import { hasSampleMenu } from '@/lib/sample-menu';
import { requireMerchant } from '@/lib/session';
import { SampleButton } from './sample-button';
import { UploadForm } from './upload-form';

export default async function NewMenuPage() {
  const { backend } = await requireMerchant();
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Novo cardápio</h1>
        <p className="text-sm text-muted-foreground">
          Tira uma foto do cardápio impresso. Eu monto o rascunho e você confere antes de publicar.
        </p>
      </div>
      <UploadForm />
      {hasSampleMenu() && (
        <div className="space-y-1 border-t border-input pt-4">
          <p className="text-sm text-muted-foreground">Sem cardápio à mão?</p>
          <SampleButton />
        </div>
      )}
      {backend.mode === 'demo' && (
        <p className="text-xs text-muted-foreground">
          No modo demonstração qualquer foto gera o mesmo rascunho de exemplo.
        </p>
      )}
    </div>
  );
}
