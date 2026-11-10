import { describe, expect, it } from 'vitest';
import { canonicalJson, createApprovalService, MemoryApprovalStore, sha256 } from './service.ts';

function setup() {
  let clock = new Date('2026-11-10T12:00:00Z');
  const store = new MemoryApprovalStore(() => clock);
  const service = createApprovalService({ store, now: () => clock });
  return { store, service, tick: (ms: number) => (clock = new Date(clock.getTime() + ms)) };
}

const base = {
  merchantId: 'm1',
  kind: 'review.reply' as const,
  payload: { b: 1, a: { d: [2, 1], c: 'x' } },
  summary: 'Responder avaliação',
  requestedBy: 'agent:reviews',
};

describe('approvals', () => {
  it('canonicalJson ignora a ordem das chaves', () => {
    expect(canonicalJson({ b: 1, a: { c: 2, b: undefined } })).toBe(
      canonicalJson({ a: { c: 2 }, b: 1 }),
    );
  });

  it('approve guarda só o hash do token e vale 24 h', async () => {
    const { store, service } = setup();
    const a = await service.create(base);
    const { approval, token } = await service.approve({
      approvalId: a.id,
      merchantId: 'm1',
      userId: 'u1',
    });
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(store.rows.get(a.id)?.tokenHash).toBe(sha256(token));
    expect(approval).not.toHaveProperty('tokenHash');
    expect(JSON.stringify([...store.rows.values()])).not.toContain(token);
    expect(approval.expiresAt?.getTime()).toBe((approval.approvedAt?.getTime() ?? 0) + 86_400_000);
    expect(approval).toMatchObject({ status: 'approved', approvedBy: 'u1' });
  });

  it('não aprova duas vezes nem depois de recusar', async () => {
    const { service } = setup();
    const a = await service.create(base);
    await service.approve({ approvalId: a.id, merchantId: 'm1', userId: 'u1' });
    await expect(
      service.approve({ approvalId: a.id, merchantId: 'm1', userId: 'u1' }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
    const b = await service.create(base);
    await service.reject({ approvalId: b.id, merchantId: 'm1', userId: 'u1' });
    await expect(
      service.approve({ approvalId: b.id, merchantId: 'm1', userId: 'u1' }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('lista por loja e status, mais recentes primeiro', async () => {
    const { service, tick } = setup();
    const first = await service.create(base);
    tick(1000);
    const second = await service.create(base);
    await service.create({ ...base, merchantId: 'm2' });
    await service.approve({ approvalId: first.id, merchantId: 'm1', userId: 'u1' });
    expect((await service.list('m1')).map((a) => a.id)).toEqual([second.id, first.id]);
    expect((await service.list('m1', 'pending')).map((a) => a.id)).toEqual([second.id]);
  });

  it('outra loja não aprova, não recusa nem lê (responde como inexistente)', async () => {
    const { service } = setup();
    const a = await service.create(base);
    const other = { approvalId: a.id, merchantId: 'm2', userId: 'u2' };
    await expect(service.approve(other)).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.reject(other)).rejects.toMatchObject({ code: 'not_found' });
    expect(await service.get(a.id, 'm2')).toBeNull();
    expect((await service.get(a.id, 'm1'))?.status).toBe('pending');
  });

  it('proposta pendente expira em 7 dias e não pode mais ser aprovada', async () => {
    const { service, tick } = setup();
    const a = await service.create(base);
    tick(7 * 24 * 60 * 60 * 1000);
    await expect(
      service.approve({ approvalId: a.id, merchantId: 'm1', userId: 'u1' }),
    ).rejects.toMatchObject({ code: 'expired' });
    expect((await service.get(a.id, 'm1'))?.status).toBe('expired');
  });

  it('recusa kind desconhecido', async () => {
    const { service } = setup();
    await expect(
      service.create({ ...base, kind: 'catalog.delete' as unknown as 'review.reply' }),
    ).rejects.toMatchObject({ code: 'wrong_kind' });
  });
});
