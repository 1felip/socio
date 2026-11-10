import Link from 'next/link';
import { notFound } from 'next/navigation';
import { draftToForm } from '@/lib/review-form';
import { requireMerchant } from '@/lib/session';
import { ReviewEditor } from './review-editor';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { backend, merchant } = await requireMerchant();
  const upload = await backend.getUpload(id, merchant.id);
  if (!upload) notFound();

  if (upload.status !== 'drafted' || !upload.draft) {
    return (
      <section role="alert" className="space-y-3 py-10 text-center">
        <h1 className="text-lg font-semibold">
          {upload.status === 'failed' ? 'Não deu para ler essa foto' : 'Ainda lendo o cardápio…'}
        </h1>
        {upload.error && <p className="text-sm text-muted-foreground">{upload.error}</p>}
        <Link href="/cardapio/novo" className="text-sm font-medium underline">
          Mandar outra foto
        </Link>
      </section>
    );
  }

  const target = await backend.catalogTarget(merchant.id);
  if (!target) {
    return (
      <p role="alert" className="py-10 text-center text-sm">
        Não achei o cardápio da loja no iFood. Confere a conexão da loja e tenta de novo.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Confere o rascunho</h1>
        <p className="text-sm text-muted-foreground">
          Ajuste o que precisar. Nada vai para o cardápio sem a sua aprovação.
        </p>
      </div>
      {upload.draft.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {upload.draft.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <ReviewEditor
        uploadId={upload.id}
        initial={draftToForm(upload.draft, target)}
        targetCategories={target.categories}
      />
    </div>
  );
}
