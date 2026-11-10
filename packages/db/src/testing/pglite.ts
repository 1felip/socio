import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const migrationsDir = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));

/**
 * Mínimo do ambiente Supabase para rodar as migrations offline:
 * roles, auth.users + auth.uid(), storage.buckets/objects + storage.foldername().
 * Não é o Supabase real; serve para testar RLS e grants sem Docker nem conta.
 */
const supabaseShim = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, public;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to public;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid
);
alter table storage.objects enable row level security;
grant select, insert on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to public;
`;

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(supabaseShim);
  for (const file of migrationFiles()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`migration ${file} falhou: ${(err as Error).message}`);
    }
  }
  return db;
}

/** Roda `fn` como a role indicada (e o usuário `sub`, se houver) dentro de uma transação desfeita no fim. */
export async function asRole<T>(
  db: PGlite,
  role: 'anon' | 'authenticated' | 'analyst_ro' | 'service_role',
  fn: (tx: Pick<PGlite, 'query' | 'exec'>) => Promise<T>,
  opts: { sub?: string; merchantId?: string } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    if (opts.sub)
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opts.sub]);
    if (opts.merchantId)
      await tx.query(`select set_config('app.merchant_id', $1, true)`, [opts.merchantId]);
    await tx.exec(`set local role ${role}`);
    try {
      return await fn(tx);
    } finally {
      await tx.rollback();
    }
  });
}
