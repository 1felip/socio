import type * as React from 'react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(field, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(field, 'min-h-16', className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(field, 'h-9', className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: o controle vem por htmlFor ou como filho.
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}
