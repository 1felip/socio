import type { ApprovalRef, DateRange, IfoodClient, ListReviewsParams } from './client';
import { IfoodNotFoundError, MissingApprovalError } from './errors';
import {
  Catalog,
  Category,
  FinancialSummary,
  ItemUpsert,
  MerchantStatus,
  MerchantSummary,
  Order,
  OrderEvent,
  Review,
  ReviewAnswer,
  ReviewAnswerRequest,
  type ReviewPage,
  Sale,
} from './schemas';

/**
 * Fonte de dados do mock, já no formato oficial. A implementação em memória
 * fica em `memory-store.ts`; a que lê do Supabase (dados sintéticos) vem na T03.
 */
export interface MockStore {
  merchants(): Promise<MerchantSummary[]>;
  merchantStatus(merchantId: string): Promise<MerchantStatus[]>;
  catalogs(merchantId: string): Promise<Catalog[]>;
  categories(merchantId: string, catalogId: string): Promise<Category[]>;
  saveItem(merchantId: string, body: ItemUpsert): Promise<void>;
  reviews(merchantId: string): Promise<Review[]>;
  saveReviewReply(merchantId: string, reviewId: string, answer: ReviewAnswer): Promise<void>;
  pendingEvents(merchantIds?: string[]): Promise<OrderEvent[]>;
  ackEvents(eventIds: string[]): Promise<void>;
  order(orderId: string): Promise<Order | null>;
  sales(merchantId: string, range: DateRange): Promise<Sale[]>;
}

const POLLING_LIMIT = 100;
const round2 = (n: number) => Math.round(n * 100) / 100;

function requireApproval(method: string, approval: ApprovalRef | undefined): void {
  if (!approval || typeof approval.approvalId !== 'string' || approval.approvalId.trim() === '') {
    throw new MissingApprovalError(method);
  }
}

/** Mock do iFood: toda resposta é validada no schema oficial antes de sair. */
export class MockIfoodClient implements IfoodClient {
  readonly mode = 'mock' as const;

  constructor(
    private readonly store: MockStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listMerchants() {
    return MerchantSummary.array().parse(await this.store.merchants());
  }

  async getMerchantStatus(merchantId: string) {
    return MerchantStatus.array().parse(await this.store.merchantStatus(merchantId));
  }

  async listCatalogs(merchantId: string) {
    return Catalog.array().parse(await this.store.catalogs(merchantId));
  }

  async listCatalog(merchantId: string, catalogId: string) {
    return Category.array().parse(await this.store.categories(merchantId, catalogId));
  }

  async upsertItems(merchantId: string, body: ItemUpsert, approval: ApprovalRef) {
    requireApproval('upsertItems', approval);
    const parsed = ItemUpsert.parse(body);
    if (!parsed.products.some((p) => p.id === parsed.item.productId)) {
      throw new Error('upsertItems: item.productId não está em products[] (422 na API real).');
    }
    await this.store.saveItem(merchantId, parsed);
  }

  async listReviews(merchantId: string, params: ListReviewsParams = {}): Promise<ReviewPage> {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(100, Math.max(1, params.pageSize ?? 10));
    const all = Review.array()
      .parse(await this.store.reviews(merchantId))
      .filter((r) => {
        const day = r.createdAt.slice(0, 10);
        return (
          (!params.dateFrom || day >= params.dateFrom) && (!params.dateTo || day <= params.dateTo)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      page,
      size,
      total: all.length,
      pageCount: Math.ceil(all.length / size),
      reviews: all.slice((page - 1) * size, page * size),
    };
  }

  async replyReview(merchantId: string, reviewId: string, text: string, approval: ApprovalRef) {
    requireApproval('replyReview', approval);
    const req = ReviewAnswerRequest.parse({ text });
    const reviews = await this.store.reviews(merchantId);
    if (!reviews.some((r) => r.id === reviewId)) throw new IfoodNotFoundError('review', reviewId);
    const answer = ReviewAnswer.parse({
      reviewId,
      text: req.text,
      createdAt: this.now().toISOString(),
    });
    await this.store.saveReviewReply(merchantId, reviewId, answer);
    return answer;
  }

  async pollOrderEvents(merchantIds?: string[]) {
    const events = OrderEvent.array().parse(await this.store.pendingEvents(merchantIds));
    return events.slice(0, POLLING_LIMIT);
  }

  async acknowledgeOrderEvents(eventIds: string[]) {
    if (eventIds.length > 2000) throw new Error('acknowledgeOrderEvents: máximo de 2000 IDs.');
    await this.store.ackEvents(eventIds);
  }

  async getOrder(orderId: string) {
    const order = await this.store.order(orderId);
    if (!order) throw new IfoodNotFoundError('order', orderId);
    return Order.parse(order);
  }

  async getFinancialSummary(merchantId: string, range: DateRange) {
    const sales = Sale.array().parse(await this.store.sales(merchantId, range));
    const done = sales.filter((s) => s.orderStatus === 'CONCLUDED');
    const sum = (f: (s: Sale) => number) => round2(done.reduce((acc, s) => acc + f(s), 0));
    const grossRevenue = sum((s) => s.grossValue);
    return FinancialSummary.parse({
      merchantId,
      beginDate: range.beginDate,
      endDate: range.endDate,
      orders: done.length,
      cancelledOrders: sales.length - done.length,
      grossRevenue,
      commission: sum((s) => s.commission),
      benefits: sum((s) => s.benefits),
      netRevenue: sum((s) => s.netValue),
      averageTicket: done.length ? round2(grossRevenue / done.length) : 0,
    });
  }
}
