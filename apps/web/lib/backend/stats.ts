import { CATALOG_PUBLISH, CatalogPublishPayload } from '@socio/agents';

export function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Itens de um payload `catalog.publish` já executado (0 se o payload não bater o schema). */
export function publishedItems(kind: string, payload: unknown): number {
  if (kind !== CATALOG_PUBLISH) return 0;
  const parsed = CatalogPublishPayload.safeParse(payload);
  if (!parsed.success) return 0;
  return parsed.data.draft.categories.reduce((n, c) => n + c.items.length, 0);
}
