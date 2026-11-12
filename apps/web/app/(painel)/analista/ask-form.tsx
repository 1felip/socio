'use client';

import { useActionState, useRef } from 'react';
import { type AnalystFormState, askAnalystAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { AnalystChart } from './analyst-chart';

const SUGGESTIONS = [
  'Quanto eu faturei em outubro?',
  'Qual dia da semana vende mais?',
  'Quais os 5 itens mais vendidos?',
  'Quando acontecem as reclamações de atraso?',
];

export function AskForm() {
  const [state, action, pending] = useActionState<AnalystFormState, FormData>(askAnalystAction, {});
  const input = useRef<HTMLInputElement>(null);
  const result = state.result;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-2">
        <Label htmlFor="question">Sua pergunta</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={input}
            id="question"
            name="question"
            required
            maxLength={500}
            placeholder="Ex.: quanto vendi na última semana?"
            disabled={pending}
            defaultValue={result?.question ?? ''}
          />
          <Button type="submit" disabled={pending} className="sm:w-auto">
            {pending ? 'Analisando…' : 'Perguntar'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              className="rounded-full border border-input px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
              onClick={() => {
                if (input.current) input.current.value = s;
                input.current?.form?.requestSubmit();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </form>

      {pending && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Consultando suas vendas e avaliações…
        </p>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      {result && !pending && (
        <Card className="space-y-4" aria-live="polite">
          <p className="text-base">{result.answer}</p>
          {result.chart ? (
            <AnalystChart spec={result.chart} />
          ) : (
            result.status === 'ok' && (
              <p className="text-sm text-muted-foreground">Sem dados para desenhar.</p>
            )
          )}
          {result.sql && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Como calculei</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-accent p-2">
                {result.sql}
              </pre>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}
