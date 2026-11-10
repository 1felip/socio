'use client';

import { useActionState } from 'react';
import { decideAction, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';

export function DecisionButtons({ approvalId }: { approvalId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    decideAction.bind(null, approvalId),
    {},
  );

  if (state.message) {
    return (
      <p role="status" className="rounded-md bg-accent p-3 text-sm">
        {state.message}
      </p>
    );
  }

  return (
    <form
      action={action}
      className="sticky bottom-12 flex flex-wrap gap-3 border-t border-input bg-background py-3"
    >
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
      <Button type="submit" name="decision" value="reject" variant="outline" disabled={pending}>
        Rejeitar
      </Button>
      <Button type="submit" name="decision" value="approve" className="ml-auto" disabled={pending}>
        {pending ? 'Publicando…' : 'Aprovar e publicar'}
      </Button>
    </form>
  );
}
