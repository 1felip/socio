import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRole, createTestDb } from './testing/pglite';

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';
const MERCHANT_A = '10000000-0000-4000-8000-00000000000a';
const MERCHANT_B = '10000000-0000-4000-8000-00000000000b';

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
    insert into public.merchants (id, name) values ('${MERCHANT_A}', 'Cantina A'), ('${MERCHANT_B}', 'Lanches B');
    insert into public.merchant_members (merchant_id, user_id) values
      ('${MERCHANT_A}', '${USER_A}'), ('${MERCHANT_B}', '${USER_B}');
    insert into public.catalog_items (id, merchant_id, name, price_cents, cost_cents) values
      ('20000000-0000-4000-8000-000000000001', '${MERCHANT_A}', 'Parmegiana', 4500, 1800),
      ('20000000-0000-4000-8000-000000000002', '${MERCHANT_B}', 'X-Salada', 2500, 1000);
    insert into public.orders (id, merchant_id, placed_at, subtotal_cents, total_cents, customer_name, customer_phone) values
      ('30000000-0000-4000-8000-000000000001', '${MERCHANT_A}', '2026-11-01 20:00-03', 9000, 9000, 'Maria Silva', '+5511999990000'),
      ('30000000-0000-4000-8000-000000000002', '${MERCHANT_B}', '2026-11-01 21:00-03', 2500, 2500, 'João Souza', '+5511988880000');
    insert into public.order_items (order_id, merchant_id, catalog_item_id, name, quantity, unit_price_cents, total_cents) values
      ('30000000-0000-4000-8000-000000000001', '${MERCHANT_A}', '20000000-0000-4000-8000-000000000001', 'Parmegiana', 2, 4500, 9000);
    insert into public.reviews (merchant_id, rating, comment, customer_name, reviewed_at) values
      ('${MERCHANT_A}', 5, 'Muito bom', 'Maria Silva', '2026-11-02 12:00-03');
    insert into public.approvals (merchant_id, kind, payload, payload_hash, token_hash, expires_at, requested_by) values
      ('${MERCHANT_A}', 'review_reply', '{}', 'h', 'secret-token-hash', now() + interval '1 day', 'agent:reviews');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('migrations', () => {
  it('liga RLS em todas as tabelas de public', async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('cria o bucket menu-photos privado', async () => {
    const { rows } = await db.query<{ public: boolean }>(
      `select public from storage.buckets where id = 'menu-photos'`,
    );
    expect(rows).toEqual([{ public: false }]);
  });

  it('impede aprovação aprovada sem quem aprovou', async () => {
    await expect(
      db.query(`update public.approvals set status = 'approved' where merchant_id = $1`, [
        MERCHANT_A,
      ]),
    ).rejects.toThrow(/approvals_approved_has_actor/);
  });
});

describe('RLS do painel', () => {
  it('anon não lê nada', async () => {
    await expect(
      asRole(db, 'anon', (tx) => tx.query('select * from public.orders')),
    ).rejects.toThrow(/permission denied/);
  });

  it('membro só vê a própria loja', async () => {
    const rows = await asRole(
      db,
      'authenticated',
      async (tx) =>
        (await tx.query<{ merchant_id: string }>('select merchant_id from public.orders')).rows,
      { sub: USER_A },
    );
    expect(rows.map((r) => r.merchant_id)).toEqual([MERCHANT_A]);
  });

  it('membro não escreve no catálogo direto', async () => {
    await expect(
      asRole(
        db,
        'authenticated',
        (tx) =>
          tx.query(
            `insert into public.catalog_items (merchant_id, name, price_cents) values ($1, 'X', 1)`,
            [MERCHANT_A],
          ),
        { sub: USER_A },
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it('membro não lê token_hash das aprovações', async () => {
    await expect(
      asRole(db, 'authenticated', (tx) => tx.query('select token_hash from public.approvals'), {
        sub: USER_A,
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it('membro não cria upload em loja alheia', async () => {
    await expect(
      asRole(
        db,
        'authenticated',
        (tx) =>
          tx.query(
            `insert into public.menu_uploads (merchant_id, storage_path, created_by) values ($1, 'x', $2)`,
            [MERCHANT_B, USER_A],
          ),
        { sub: USER_A },
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('membro sobe foto só na pasta da própria loja', async () => {
    const insert = (merchant: string) =>
      asRole(
        db,
        'authenticated',
        (tx) =>
          tx.query(`insert into storage.objects (bucket_id, name) values ('menu-photos', $1)`, [
            `${merchant}/u.jpg`,
          ]),
        { sub: USER_A },
      );
    await expect(insert(MERCHANT_A)).resolves.toBeDefined();
    await expect(insert(MERCHANT_B)).rejects.toThrow(/row-level security/);
  });

  it('painel não lê as views v_*', async () => {
    await expect(
      asRole(db, 'authenticated', (tx) => tx.query('select * from public.v_sales_daily'), {
        sub: USER_A,
      }),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('role analyst_ro', () => {
  const asAnalyst = <T>(
    fn: Parameters<typeof asRole<T>>[2],
    merchantId: string | undefined = MERCHANT_A,
  ) => asRole(db, 'analyst_ro', fn, { merchantId });

  it('não consegue INSERT', async () => {
    await expect(
      asAnalyst((tx) => tx.query(`insert into public.merchants (name) values ('hack')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it.each([
    'orders',
    'order_items',
    'reviews',
    'catalog_items',
    'merchants',
    'approvals',
    'merchant_members',
  ])('não lê a tabela %s', async (table) => {
    await expect(
      asAnalyst((tx) => tx.query(`select * from public.${table} limit 1`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('não lê auth.users', async () => {
    await expect(asAnalyst((tx) => tx.query('select * from auth.users'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('lê as views só da loja definida em app.merchant_id', async () => {
    const sales = await asAnalyst(
      async (tx) =>
        (
          await tx.query<{ merchant_id: string; gross_cents: number }>(
            'select * from public.v_sales_daily',
          )
        ).rows,
    );
    expect(sales).toHaveLength(1);
    expect(sales[0]?.merchant_id).toBe(MERCHANT_A);

    const items = await asAnalyst(
      async (tx) =>
        (
          await tx.query<{ item_name: string; units_sold: number; margin_pct: string }>(
            'select item_name, units_sold, margin_pct from public.v_item_performance',
          )
        ).rows,
    );
    expect(items).toEqual([{ item_name: 'Parmegiana', units_sold: 2, margin_pct: '60.00' }]);
  });

  it('sem app.merchant_id as views ficam vazias', async () => {
    const rows = await asRole(
      db,
      'analyst_ro',
      async (tx) => (await tx.query('select * from public.v_sales_daily')).rows,
    );
    expect(rows).toEqual([]);
  });

  it('views não expõem nome nem telefone de cliente', async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name like 'v\\_%'`);
    const cols = rows.map((r) => r.column_name);
    expect(cols.some((c) => /customer|phone|name$/.test(c) && c !== 'item_name')).toBe(false);
  });

  it('tem statement_timeout de 5 s', async () => {
    const { rows } = await db.query<{ setconfig: string[] }>(`
      select s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
      where r.rolname = 'analyst_ro'`);
    expect(rows[0]?.setconfig).toContain('statement_timeout=5s');
  });
});
