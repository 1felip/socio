'use client';

import { Button } from '@/components/ui/button';

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="space-y-3 py-10 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado por aqui</h1>
      <p className="text-sm text-muted-foreground">Nada foi publicado. Tenta de novo?</p>
      <Button variant="outline" onClick={reset}>
        Tentar de novo
      </Button>
    </section>
  );
}
