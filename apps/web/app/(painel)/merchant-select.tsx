'use client';

import { Select } from '@/components/ui/input';
import type { MerchantRef } from '@/lib/backend/types';

export function MerchantSelect({
  action,
  merchants,
  current,
}: {
  action: (form: FormData) => Promise<void>;
  merchants: MerchantRef[];
  current: string;
}) {
  return (
    <form action={action}>
      <Select
        name="merchantId"
        aria-label="Loja"
        defaultValue={current}
        className="h-8 max-w-48"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {merchants.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </Select>
    </form>
  );
}
