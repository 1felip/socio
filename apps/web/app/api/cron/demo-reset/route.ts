import { handleDemoReset } from '@/lib/demo-reset-endpoint';
import { getBackend } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handleDemoReset(req, { backend: await getBackend() });
}
