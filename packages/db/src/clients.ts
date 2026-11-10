import {
  type CookieMethodsServer,
  createServerClient as createSsrServerClient,
} from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type DbClient = SupabaseClient<Database>;

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

/**
 * Cliente do painel (Server Components, Route Handlers, Server Actions).
 * Usa a anon key + sessão do usuário nos cookies, então a RLS se aplica.
 */
export function createServerClient(cookies: CookieMethodsServer, env: Env = process.env): DbClient {
  return createSsrServerClient<Database>(
    required(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    required(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { cookies },
  );
}

/**
 * Cliente com service role: ignora RLS. Só no servidor, só para fluxos já autorizados
 * (execução de aprovações, ingestão do iFood, jobs do n8n).
 */
export function createServiceClient(env: Env = process.env): DbClient {
  if ('window' in globalThis) {
    throw new Error('createServiceClient não pode rodar no navegador.');
  }
  return createClient<Database>(
    required(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
