import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './testing/pglite.ts';

const M = '5e3d0000-0000-4000-8000-0000000000aa';
const U1 = '5e3d0000-0000-4000-8000-0000000000b1';
const U2 = '5e3d0000-0000-4000-8000-0000000000b2';
let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into public.merchants (id, name) values ('${M}', 'Loja');
    insert into auth.users (id, email) values ('${U1}', 'a@x'), ('${U2}', 'b@x');
    insert into public.merchant_members (merchant_id, user_id, role) values ('${M}', '${U1}', 'owner'), ('${M}', '${U2}', 'staff');
  `);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('merchant_members.whatsapp_phone', () => {
  it('aceita wa_id e recusa formato inválido', async () => {
    await db.exec(
      `update public.merchant_members set whatsapp_phone = '5511988887777', whatsapp_verified_at = now() where user_id = '${U1}'`,
    );
    await expect(
      db.exec(
        `update public.merchant_members set whatsapp_phone = '+55 11 9' where user_id = '${U2}'`,
      ),
    ).rejects.toThrow(/check/i);
  });

  it('um número = um membro', async () => {
    await expect(
      db.exec(
        `update public.merchant_members set whatsapp_phone = '5511988887777', whatsapp_verified_at = now() where user_id = '${U2}'`,
      ),
    ).rejects.toThrow(/unique|duplicate/i);
    await db.exec(
      `update public.merchant_members set whatsapp_phone = null, whatsapp_verified_at = null where user_id = '${U2}'`,
    );
  });
});
