import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sócio',
  description: 'Seu sócio digital para a loja de delivery.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col antialiased">
        <div className="flex-1 pb-12">{children}</div>
        <footer className="fixed inset-x-0 bottom-0 border-t border-input bg-background/95 px-4 py-2 text-center text-xs text-muted-foreground backdrop-blur">
          Projeto independente, não afiliado ao iFood.
        </footer>
      </body>
    </html>
  );
}
