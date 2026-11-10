import { redirect } from 'next/navigation';
import { resolveBackendMode } from '@/lib/backend';
import { DEMO_DEFAULT_PASSWORD, DEMO_OWNER_EMAIL } from '@/lib/backend/demo';
import { getBackend } from '@/lib/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const backend = await getBackend();
  if (await backend.currentUser()) redirect('/');
  const demo = resolveBackendMode() === 'demo';

  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Entrar no Sócio</h1>
        <p className="text-sm text-muted-foreground">Cardápio, avaliações e vendas da sua loja.</p>
      </div>
      <LoginForm />
      {demo && (
        <p className="rounded-md bg-accent p-3 text-xs text-accent-foreground">
          Modo demonstração: use <strong>{DEMO_OWNER_EMAIL}</strong> e a senha{' '}
          <strong>
            {process.env.DEMO_PASSWORD ? 'definida no ambiente' : DEMO_DEFAULT_PASSWORD}
          </strong>
          .
        </p>
      )}
    </main>
  );
}
