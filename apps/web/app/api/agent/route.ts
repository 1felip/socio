import { handleAgentPost } from '@/lib/agent-endpoint';
import { getBackend } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleAgentPost(req, { backend: await getBackend() });
}
