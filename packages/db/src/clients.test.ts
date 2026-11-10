import { describe, expect, it } from 'vitest';
import { createServerClient, createServiceClient } from './clients';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
};

describe('clients', () => {
  it('cria o cliente de serviço com as variáveis de ambiente', () => {
    expect(createServiceClient(env).from).toBeTypeOf('function');
  });

  it('cria o cliente do painel com cookies', () => {
    const client = createServerClient({ getAll: () => [], setAll: () => {} }, env);
    expect(client.from).toBeTypeOf('function');
  });

  it('falha com mensagem clara sem a service role', () => {
    expect(() => createServiceClient({ NEXT_PUBLIC_SUPABASE_URL: 'http://x' })).toThrow(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
  });
});
