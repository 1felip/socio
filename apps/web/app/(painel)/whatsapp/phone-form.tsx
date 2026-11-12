'use client';

import { useActionState } from 'react';
import { saveWhatsAppAction, type WhatsAppFormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';

export function PhoneForm({ current }: { current: string }) {
  const [state, action, pending] = useActionState<WhatsAppFormState, FormData>(
    saveWhatsAppAction,
    {},
  );
  return (
    <form action={action} className="space-y-2">
      <Label htmlFor="phone">Seu número de WhatsApp</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98888-7777"
          defaultValue={current}
          maxLength={25}
          disabled={pending}
        />
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Deixe vazio e salve para desligar.</p>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          {state.message}
        </p>
      )}
      {state.code && (
        <div className="rounded-md border border-input bg-accent p-3 text-sm">
          <p>Agora mande esta mensagem do seu WhatsApp para o número do Sócio:</p>
          <p className="mt-1 font-mono text-lg font-semibold tracking-wider">SOCIO {state.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">Vale 30 minutos. Não compartilhe.</p>
        </div>
      )}
    </form>
  );
}
