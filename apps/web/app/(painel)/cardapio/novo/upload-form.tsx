'use client';

import { useActionState, useEffect, useState } from 'react';
import { type FormState, uploadMenuAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/input';

export function UploadForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(uploadMenuAction, {});
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="photo">Foto do cardápio</Label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          disabled={pending}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
        <p className="text-xs text-muted-foreground">JPG, PNG ou WEBP, até 10 MB.</p>
      </div>

      {preview && (
        // biome-ignore lint/performance/noImgElement: prévia local (blob:), sem otimização.
        <img
          src={preview}
          alt="Prévia da foto escolhida"
          className="max-h-72 w-full rounded-md border border-input object-contain"
        />
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending ? 'Lendo o cardápio…' : 'Ler cardápio'}
      </Button>
      {pending && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Isso leva uns segundos. Pode deixar a tela aberta.
        </p>
      )}
    </form>
  );
}
