import type { IfoodClient } from './client';
import { demoSeed } from './fixtures';
import { createMemoryStore } from './memory-store';
import { MockIfoodClient, type MockStore } from './mock';
import { RealIfoodClient } from './real';

export const packageName = '@socio/ifood-client' as const;

export type { ApprovalRef, DateRange, IfoodClient, ListReviewsParams } from './client';
export { IfoodNotFoundError, MissingApprovalError, NotConfiguredError } from './errors';
export { DEMO_CATALOG_ID, DEMO_MERCHANT_ID, DEMO_ORDER_ID, demoSeed } from './fixtures';
export { createMemoryStore, type MemorySeed } from './memory-store';
export { MockIfoodClient, type MockStore } from './mock';
export { RealIfoodClient } from './real';
export * as schemas from './schemas';

export type IfoodMode = 'mock' | 'real';

export interface GetIfoodClientOptions {
  mode?: string | undefined;
  /** Fonte do mock. Padrão: fixture em memória; a T03 troca pelo store do Supabase. */
  store?: MockStore;
}

/** Único ponto de acesso ao iFood. Escolhe pelo `IFOOD_MODE` (padrão: mock). */
export function getIfoodClient(opts: GetIfoodClientOptions = {}): IfoodClient {
  const mode = (opts.mode ?? process.env.IFOOD_MODE ?? 'mock').trim().toLowerCase();
  if (mode === 'real') return new RealIfoodClient();
  if (mode === 'mock') return new MockIfoodClient(opts.store ?? createMemoryStore(demoSeed));
  throw new Error(`IFOOD_MODE inválido: "${mode}". Use mock ou real.`);
}
