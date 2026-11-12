/**
 * Núcleo do POST /api/agent, separado da rota para testar sem Next.
 *
 * Dois jeitos de entrar:
 * - n8n: assinatura HMAC (lib/agent-auth.ts). Confia no merchantId do corpo, que o n8n
 *   resolveu pelo número do WhatsApp.
 * - painel: sessão. O usuário precisa ser membro da loja; canal vira `panel` e a conversa
 *   é a do próprio usuário.
 */
import {
  analystIntentHandler,
  createOrchestrator,
  InvalidAgentRequest,
  type OrchestratorDeps,
} from '@socio/agents';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from './agent-auth.ts';
import type { Backend } from './backend/types.ts';

export const MAX_BODY_BYTES = 16 * 1024;

type Env = Record<string, string | undefined>;

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export interface AgentEndpointDeps {
  backend: Backend;
  env?: Env;
  now?: () => Date;
  /** Testes injetam handlers e tetos. */
  orchestrator?: Partial<Pick<OrchestratorDeps, 'handlers' | 'limits'>>;
}

export async function handleAgentPost(req: Request, deps: AgentEndpointDeps): Promise<Response> {
  const env = deps.env ?? process.env;
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return error(413, 'Mensagem grande demais.');
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return error(413, 'Mensagem grande demais.');
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(400, 'JSON inválido.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return error(400, 'JSON inválido.');
  }
  let input = body as Record<string, unknown>;

  const signature = req.headers.get(SIGNATURE_HEADER);
  if (signature !== null) {
    const check = verifySignature({
      secret: env.N8N_WEBHOOK_SECRET,
      signature,
      timestamp: req.headers.get(TIMESTAMP_HEADER),
      body: raw,
      ...(deps.now ? { now: deps.now() } : {}),
    });
    if (!check.ok) return error(401, 'Assinatura inválida.');
  } else {
    const user = await deps.backend.currentUser();
    if (!user) return error(401, 'Faça login.');
    const merchants = await deps.backend.merchantsFor(user.id);
    if (!merchants.some((m) => m.id === input.merchantId)) {
      return error(403, 'Você não tem acesso a essa loja.');
    }
    input = { ...input, channel: 'panel', externalRef: user.id };
  }

  const orchestrator = createOrchestrator({
    approvals: deps.backend.approvals,
    conversations: deps.backend.conversations,
    ...(deps.now ? { now: deps.now } : {}),
    ...deps.orchestrator,
    handlers: {
      analista: analystIntentHandler((merchantId, question) =>
        deps.backend.askAnalyst(merchantId, question),
      ),
      ...deps.orchestrator?.handlers,
    },
  });
  try {
    return Response.json(await orchestrator.handle(input));
  } catch (err) {
    if (err instanceof InvalidAgentRequest) return error(400, err.message);
    console.error('[api/agent]', err instanceof Error ? err.message : err);
    return error(500, 'Não consegui responder agora. Tente de novo em instantes.');
  }
}
