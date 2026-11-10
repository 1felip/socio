'use client';

import { useActionState, useState } from 'react';
import { type FormState, submitDraftAction } from '@/app/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import type { CatalogCategoryRef } from '@/lib/backend/types';
import type { FormItem, ReviewForm } from '@/lib/review-form';

export function ReviewEditor({
  uploadId,
  initial,
  targetCategories,
}: {
  uploadId: string;
  initial: ReviewForm;
  targetCategories: CatalogCategoryRef[];
}) {
  const [form, setForm] = useState<ReviewForm>(initial);
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitDraftAction.bind(null, uploadId),
    {},
  );

  const setCategory = (ci: number, patch: Partial<ReviewForm['categories'][number]>) =>
    setForm((f) => ({
      categories: f.categories.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    }));

  const setItem = (ci: number, ii: number, patch: Partial<FormItem>) =>
    setForm((f) => ({
      categories: f.categories.map((c, i) =>
        i === ci
          ? { ...c, items: c.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }
          : c,
      ),
    }));

  const removeItem = (ci: number, ii: number) =>
    setForm((f) => ({
      categories: f.categories.map((c, i) =>
        i === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c,
      ),
    }));

  const total = form.categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="form" value={JSON.stringify(form)} />

      {form.categories.map((cat, ci) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: categorias não são reordenadas.
        <section key={ci} className="space-y-3" aria-label={`Categoria ${cat.name}`}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`cat-${ci}`}>Categoria</Label>
              <Input
                id={`cat-${ci}`}
                value={cat.name}
                onChange={(e) => setCategory(ci, { name: e.currentTarget.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`target-${ci}`}>Entra em</Label>
              <Select
                id={`target-${ci}`}
                value={cat.targetCategoryId}
                onChange={(e) => setCategory(ci, { targetCategoryId: e.currentTarget.value })}
              >
                <option value="">Escolha a categoria do cardápio</option>
                {targetCategories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {cat.items.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem itens nesta categoria.</p>
          )}

          {cat.items.map((item, ii) => {
            const key = `${ci}-${ii}`;
            return (
              <Card
                key={key}
                className={
                  item.price_outlier || item.low_confidence
                    ? 'space-y-2 border-amber-400 dark:border-amber-700'
                    : 'space-y-2'
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {item.price_outlier && <Badge variant="warning">Preço fora do padrão</Badge>}
                  {item.low_confidence && <Badge variant="warning">Leitura incerta</Badge>}
                  <span className="text-xs text-muted-foreground">Na foto: {item.source_name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => removeItem(ci, ii)}
                  >
                    Remover
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                  <div className="space-y-1">
                    <Label htmlFor={`name-${key}`}>Nome</Label>
                    <Input
                      id={`name-${key}`}
                      value={item.name}
                      maxLength={80}
                      onChange={(e) =>
                        setItem(ci, ii, { name: e.currentTarget.value, low_confidence: false })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`price-${key}`}>Preço (R$)</Label>
                    <Input
                      id={`price-${key}`}
                      value={item.price}
                      inputMode="decimal"
                      placeholder="0,00"
                      onChange={(e) =>
                        // O dono conferiu o preço: o alerta da leitura deixa de valer.
                        setItem(ci, ii, { price: e.currentTarget.value, price_outlier: false })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`desc-${key}`}>Descrição</Label>
                  <Textarea
                    id={`desc-${key}`}
                    value={item.description}
                    maxLength={200}
                    onChange={(e) => setItem(ci, ii, { description: e.currentTarget.value })}
                  />
                </div>
                {(item.allergens.length > 0 || item.complement_groups.length > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {item.allergens.length > 0 && `Pode conter: ${item.allergens.join(', ')}. `}
                    {item.complement_groups.length > 0 &&
                      `Complementos: ${item.complement_groups.map((g) => g.name).join(', ')}.`}
                  </p>
                )}
              </Card>
            );
          })}
        </section>
      ))}

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <div className="sticky bottom-12 flex items-center gap-3 border-t border-input bg-background py-3">
        <span className="text-sm text-muted-foreground">
          {total} {total === 1 ? 'item' : 'itens'}
        </span>
        <Button type="submit" className="ml-auto" disabled={pending || total === 0}>
          {pending ? 'Enviando…' : 'Enviar para aprovação'}
        </Button>
      </div>
    </form>
  );
}
