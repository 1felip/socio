import { describe, expect, it } from 'vitest';
import {
  createDemoBackend,
  createDemoState,
  DEMO_DEFAULT_PASSWORD,
  DEMO_OWNER_EMAIL,
  DEMO_STAFF_EMAIL,
} from './backend/demo.ts';
import type { CookieJar, SessionUser } from './backend/types.ts';
import { confirmWhatsAppFromMessage, saveWhatsAppPhone } from './flows.ts';
import { extractLinkCode } from './whatsapp-link.ts';

const jar = (): CookieJar => {
  const d = new Map<string, string>();
  return { get: (n) => d.get(n), set: (n, v) => void d.set(n, v), delete: (n) => void d.delete(n) };
};

describe('número de WhatsApp com prova de posse', () => {
  it('cadastro gera código; só a mensagem do próprio número confirma', async () => {
    const state = createDemoState({});
    const owner = createDemoBackend(state, jar());
    await owner.signIn(DEMO_OWNER_EMAIL, DEMO_DEFAULT_PASSWORD);
    const staff = createDemoBackend(state, jar());
    await staff.signIn(DEMO_STAFF_EMAIL, DEMO_DEFAULT_PASSWORD);
    const ownerUser = (await owner.currentUser()) as SessionUser;
    const staffUser = (await staff.currentUser()) as SessionUser;
    const merchantId = state.merchants[0]?.id as string;
    const wa = '5511988887777';

    const res = await saveWhatsAppPhone(owner, ownerUser, merchantId, '(11) 98888-7777');
    expect(res.ok).toBe(true);
    const code = res.ok ? (res.value.code as string) : '';
    expect(code).toMatch(/^\d{6}$/);
    expect(await owner.memberByWhatsApp(wa)).toBeNull();

    // Outro membro "reivindica" o mesmo número: não bloqueia o dono real.
    const fake = await saveWhatsAppPhone(staff, staffUser, merchantId, '11988887777');
    expect(fake.ok).toBe(true);

    expect((await confirmWhatsAppFromMessage(owner, wa, 'oi')).status).toBe('not_a_code');
    expect((await confirmWhatsAppFromMessage(owner, '5511900000000', `SOCIO ${code}`)).status).toBe(
      'invalid',
    );
    const ok = await confirmWhatsAppFromMessage(owner, wa, `Sócio: ${code}`);
    expect(ok).toEqual({
      status: 'linked',
      member: { merchantId, userId: ownerUser.id, role: 'owner' },
    });
    expect(await owner.memberByWhatsApp(wa)).toMatchObject({ userId: ownerUser.id });
    expect(await owner.whatsAppStatusFor(ownerUser.id, merchantId)).toEqual({
      phone: wa,
      verified: true,
    });

    // Código não serve duas vezes; o falso não consegue confirmar um número já verificado.
    expect((await confirmWhatsAppFromMessage(owner, wa, `SOCIO ${code}`)).status).toBe('invalid');
    const fakeCode = fake.ok ? (fake.value.code as string) : '';
    expect((await confirmWhatsAppFromMessage(staff, wa, `SOCIO ${fakeCode}`)).status).toBe('taken');

    // Código vencido não confirma.
    const again = await saveWhatsAppPhone(owner, ownerUser, merchantId, '11977776666', new Date(0));
    const old = again.ok ? (again.value.code as string) : '';
    expect((await confirmWhatsAppFromMessage(owner, '5511977776666', `SOCIO ${old}`)).status).toBe(
      'invalid',
    );

    expect((await saveWhatsAppPhone(owner, ownerUser, merchantId, '123')).ok).toBe(false);
    const stranger = { id: 'x', email: 'x@y.z' };
    expect((await saveWhatsAppPhone(owner, stranger, merchantId, '11988887777')).ok).toBe(false);
  });

  it('lê o código da mensagem', () => {
    expect(extractLinkCode('SOCIO 123456')).toBe('123456');
    expect(extractLinkCode('socio-000123')).toBe('000123');
    expect(extractLinkCode('meu código 123456')).toBeNull();
  });
});
