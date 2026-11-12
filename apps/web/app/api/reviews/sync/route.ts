import { handleReviewsSyncPost } from '@/lib/reviews-sync-endpoint';
import { getBackend } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handleReviewsSyncPost(req, { backend: await getBackend() });
}
