import type { DateRange } from './client';
import type { MockStore } from './mock';
import type {
  Catalog,
  Category,
  ItemUpsert,
  MerchantStatus,
  MerchantSummary,
  Order,
  OrderEvent,
  Review,
  ReviewAnswer,
  Sale,
} from './schemas';

export interface MemorySeed {
  merchants: MerchantSummary[];
  status: Record<string, MerchantStatus[]>;
  catalogs: Record<string, Catalog[]>;
  /** chave: `${merchantId}/${catalogId}` */
  categories: Record<string, Category[]>;
  reviews: Record<string, Review[]>;
  events: OrderEvent[];
  orders: Order[];
  sales: Record<string, Sale[]>;
}

/** MockStore em memória (testes e dev sem banco). Copia o seed; escritas não vazam. */
export function createMemoryStore(seed: MemorySeed): MockStore {
  const s: MemorySeed = structuredClone(seed);
  const acked = new Set<string>();

  return {
    async merchants() {
      return s.merchants;
    },
    async merchantStatus(merchantId) {
      return s.status[merchantId] ?? [];
    },
    async catalogs(merchantId) {
      return s.catalogs[merchantId] ?? [];
    },
    async categories(merchantId, catalogId) {
      return s.categories[`${merchantId}/${catalogId}`] ?? [];
    },
    async saveItem(merchantId, body: ItemUpsert) {
      const product = body.products.find((p) => p.id === body.item.productId);
      if (!product) throw new Error('saveItem: produto do item ausente.');
      const entry = {
        id: body.item.id,
        productId: product.id,
        name: product.name,
        status: body.item.status,
        price: body.item.price,
        ...(product.description !== undefined && { description: product.description }),
        ...(body.item.externalCode !== undefined && { externalCode: body.item.externalCode }),
        ...(product.imagePath !== undefined && { imagePath: product.imagePath }),
        ...(body.item.index !== undefined && { index: body.item.index }),
      };
      const categories = Object.entries(s.categories)
        .filter(([key]) => key.startsWith(`${merchantId}/`))
        .flatMap(([, cats]) => cats)
        .filter((c) => c.id === body.item.categoryId);
      if (categories.length === 0)
        throw new Error(`saveItem: categoria ${body.item.categoryId} não existe.`);
      for (const cat of categories) {
        const i = cat.items.findIndex((it) => it.id === entry.id);
        if (i >= 0) cat.items[i] = entry;
        else cat.items.push(entry);
      }
    },
    async reviews(merchantId) {
      return s.reviews[merchantId] ?? [];
    },
    async saveReviewReply(merchantId, reviewId, answer: ReviewAnswer) {
      const review = s.reviews[merchantId]?.find((r) => r.id === reviewId);
      if (!review) throw new Error(`saveReviewReply: review ${reviewId} não existe.`);
      review.replies = [
        ...(review.replies ?? []),
        { text: answer.text, createdAt: answer.createdAt, from: 'MERCHANT' },
      ];
    },
    async pendingEvents(merchantIds) {
      return s.events.filter(
        (e) => !acked.has(e.id) && (!merchantIds || merchantIds.includes(e.merchantId)),
      );
    },
    async ackEvents(eventIds) {
      for (const id of eventIds) acked.add(id);
    },
    async order(orderId) {
      return s.orders.find((o) => o.id === orderId) ?? null;
    },
    async sales(merchantId, range: DateRange) {
      return (s.sales[merchantId] ?? []).filter((x) => {
        const day = x.orderDate.slice(0, 10);
        return day >= range.beginDate && day <= range.endDate;
      });
    },
  };
}
