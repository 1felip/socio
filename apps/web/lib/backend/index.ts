import { createDemoBackend, sharedDemoState } from './demo.ts';
import { createSupabaseBackend, type SupabaseCookieAdapter } from './supabase.ts';
import type { Backend, BackendMode, CookieJar } from './types.ts';

export type * from './types.ts';

type Env = Record<string, string | undefined>;

/**
 * `SOCIO_BACKEND=demo|supabase`. Sem a variável: supabase se houver URL configurada,
 * senão demo. Em produção o demo só liga com `SOCIO_BACKEND=demo` explícito.
 */
export function resolveBackendMode(env: Env = process.env): BackendMode {
  const explicit = env.SOCIO_BACKEND?.trim().toLowerCase();
  if (explicit === 'demo' || explicit === 'supabase') return explicit;
  if (explicit) throw new Error(`SOCIO_BACKEND inválido: "${explicit}". Use demo ou supabase.`);
  if (env.NEXT_PUBLIC_SUPABASE_URL) return 'supabase';
  if (env.NODE_ENV === 'production') {
    throw new Error('Defina SOCIO_BACKEND (demo ou supabase) em produção.');
  }
  return 'demo';
}

export function createBackend(jar: CookieJar, supabaseCookies: SupabaseCookieAdapter): Backend {
  return resolveBackendMode() === 'demo'
    ? createDemoBackend(sharedDemoState(), jar)
    : createSupabaseBackend(supabaseCookies, jar);
}
