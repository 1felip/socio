import { getBackend } from '@/lib/session';
import { handleWhatsAppReviews } from '@/lib/wa-reviews';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** reviews-hourly (n8n): sincroniza avaliações da loja e devolve os avisos para os donos. */
export async function POST(req: Request) {
  return handleWhatsAppReviews(req, { backend: await getBackend() });
}
