'use client';

import { useActionState } from 'react';
import { type FormState, sampleMenuAction } from '@/app/actions';
import { Button } from '@/components/ui/button';

/** Para quem não tem cardápio à mão: roda o mesmo fluxo com a foto de exemplo. */
export function SampleButton() {
  const [state, action, pending] = useActionState<FormState, FormData>(sampleMenuAction, {});
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Lendo a foto de exemplo…' : 'Usar foto de exemplo'}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
