import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold">Sócio</h1>
      <p className="text-muted-foreground">
        Seu sócio digital: cardápio, avaliações e vendas da loja em um só lugar.
      </p>
      <div>
        <Button disabled>Painel em construção</Button>
      </div>
    </main>
  );
}
