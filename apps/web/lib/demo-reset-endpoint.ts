/**
 * Núcleo do GET /api/cron/demo-reset (Vercel Cron, 1x por dia).
 *
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>`. Sem CRON_SECRET configurado a rota
 * fica fechada (falha fechada), nunca aberta.
 */
import { timingSafeEqual } from 'node:crypto';
import type { Backend } from './backend/types.ts';

type Env = Record<string, string | undefined>;

export const MIN_CRON_SECRET = 16;

export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function handleDemoReset(
  req: Request,
  deps: { backend: Backend; env?: Env },
): Promise<Response> {
  const env = deps.env ?? process.env;
  if (!cronAuthorized(req.headers.get('authorization'), env.CRON_SECRET)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  try {
    const out = await deps.backend.resetDemo();
    return Response.json({ mode: deps.backend.mode, ...out });
  } catch (err) {
    console.error('[cron/demo-reset]', err instanceof Error ? err.message : err);
    return Response.json({ error: 'Falha ao restaurar a demo.' }, { status: 500 });
  }
}
