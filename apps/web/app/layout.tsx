import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sócio',
  description: 'Seu sócio digital para a loja de delivery.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
