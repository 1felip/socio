import { getBackend } from '@/lib/session';
import { handleWhatsAppInbound, handleWhatsAppVerify } from '@/lib/wa-inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Verificação do webhook da Meta (o n8n repassa a query string). */
export async function GET(req: Request) {
  return handleWhatsAppVerify(req);
}

/** Mensagens recebidas: corpo cru da Meta, repassado e assinado pelo n8n (wa-inbound). */
export async function POST(req: Request) {
  return handleWhatsAppInbound(req, { backend: await getBackend() });
}
