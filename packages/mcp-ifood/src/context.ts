/**
 * Monta os serviços que o MCP server usa. Nada de lógica nova aqui: é a mesma fiação
 * do painel (apps/web/lib/backend), com uma loja fixa por processo.
 *
 * - demo: tudo em memória (mock do iFood + aprovações em memória). Roda sem chaves.
 * - supabase: aprovações e ROI no banco (service role), iFood pelo IFOOD_MODE.
 */
import { randomUUID } from 'node:crypto';
import {
  type ApprovalService,
  createApprovalService,
  createCatalogPublisher,
  MemoryApprovalStore,
  MemoryRoiStore,
  SupabaseApprovalStore,
  SupabaseRoiStore,
} from '@socio/agents';
import { createServiceClient } from '@socio/db';
import {
  createMemoryStore,
  DEMO_MERCHANT_ID,
  demoSeed,
  getIfoodClient,
  type IfoodClient,
  MockIfoodClient,
} from '@socio/ifood-client';

export type CatalogPublisher = ReturnType<typeof createCatalogPublisher>;

export interface SocioContext {
  readonly mode: 'demo' | 'supabase';
  /** Loja (merchants.id) que este processo atende. */
  readonly merchantId: string;
  /** Dono que aprova pelo cliente MCP (merchant_members.role = owner). */
  readonly ownerUserId: string;
  readonly ifood: IfoodClient;
  readonly approvals: ApprovalService;
  readonly publisher: CatalogPublisher;
  resolveIfoodMerchantId(merchantId: string): Promise<string>;
}

type Env = Record<string, string | undefined>;

export function createDemoContext(): SocioContext {
  const merchantId = randomUUID();
  const ifood = new MockIfoodClient(createMemoryStore(demoSeed));
  const approvals = createApprovalService({ store: new MemoryApprovalStore() });
  const resolveIfoodMerchantId = async (id: string) => {
    if (id !== merchantId) throw new Error('Loja sem vínculo com o iFood.');
    return DEMO_MERCHANT_ID;
  };
  return {
    mode: 'demo',
    merchantId,
    ownerUserId: randomUUID(),
    ifood,
    approvals,
    publisher: createCatalogPublisher({
      approvals,
      ifood,
      roi: new MemoryRoiStore(),
      resolveIfoodMerchantId,
    }),
    resolveIfoodMerchantId,
  };
}

function required(env: Env, key: string): string {
  const v = env[key]?.trim();
  if (!v) throw new Error(`Falta ${key} no .env para o MCP server em modo supabase.`);
  return v;
}

/** Confere no banco que o usuário é dono da loja antes de subir o server. */
export async function createSupabaseContext(env: Env = process.env): Promise<SocioContext> {
  const merchantId = required(env, 'SOCIO_MCP_MERCHANT_ID');
  const ownerUserId = required(env, 'SOCIO_MCP_OWNER_USER_ID');
  const db = createServiceClient(env);

  const { data: member, error } = await db
    .from('merchant_members')
    .select('role')
    .eq('merchant_id', merchantId)
    .eq('user_id', ownerUserId)
    .maybeSingle();
  if (error || member?.role !== 'owner') {
    throw new Error('SOCIO_MCP_OWNER_USER_ID não é dono da loja SOCIO_MCP_MERCHANT_ID.');
  }

  const resolveIfoodMerchantId = async (id: string) => {
    const { data, error: e } = await db
      .from('merchants')
      .select('ifood_merchant_id')
      .eq('id', id)
      .maybeSingle();
    if (e || !data?.ifood_merchant_id) throw new Error('Loja sem vínculo com o iFood.');
    return data.ifood_merchant_id;
  };

  const ifood = getIfoodClient({ mode: env.IFOOD_MODE });
  const approvals = createApprovalService({ store: new SupabaseApprovalStore(db) });
  return {
    mode: 'supabase',
    merchantId,
    ownerUserId,
    ifood,
    approvals,
    publisher: createCatalogPublisher({
      approvals,
      ifood,
      roi: new SupabaseRoiStore(db),
      resolveIfoodMerchantId,
    }),
    resolveIfoodMerchantId,
  };
}

/** SOCIO_BACKEND=supabase usa o banco; vazio ou demo roda em memória. */
export async function createContext(env: Env = process.env): Promise<SocioContext> {
  const mode = (env.SOCIO_BACKEND ?? 'demo').trim().toLowerCase();
  if (mode === 'supabase') return createSupabaseContext(env);
  if (mode === 'demo' || mode === '') return createDemoContext();
  throw new Error(`SOCIO_BACKEND inválido: "${mode}". Use demo ou supabase.`);
}
