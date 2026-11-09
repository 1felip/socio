import type {
  Catalog,
  Category,
  FinancialSummary,
  ItemUpsert,
  MerchantStatus,
  MerchantSummary,
  Order,
  OrderEvent,
  ReviewAnswer,
  ReviewPage,
} from './schemas';

/**
 * Referência à aprovação humana. A validação completa (token, hash do payload,
 * expiração) fica no módulo de approvals; o client só se recusa a escrever sem ela.
 */
export interface ApprovalRef {
  approvalId: string;
}

export interface ListReviewsParams {
  page?: number;
  pageSize?: number;
  /** ISO date (YYYY-MM-DD), inclusivo. */
  dateFrom?: string;
  /** ISO date (YYYY-MM-DD), inclusivo. */
  dateTo?: string;
}

export interface DateRange {
  /** ISO date (YYYY-MM-DD), inclusivo. */
  beginDate: string;
  /** ISO date (YYYY-MM-DD), inclusivo. */
  endDate: string;
}

export interface IfoodClient {
  readonly mode: 'mock' | 'real';

  listMerchants(): Promise<MerchantSummary[]>;
  getMerchantStatus(merchantId: string): Promise<MerchantStatus[]>;

  listCatalogs(merchantId: string): Promise<Catalog[]>;
  /** Categorias com itens de um catálogo. */
  listCatalog(merchantId: string, catalogId: string): Promise<Category[]>;
  /** Escrita: exige aprovação. */
  upsertItems(merchantId: string, body: ItemUpsert, approval: ApprovalRef): Promise<void>;

  listReviews(merchantId: string, params?: ListReviewsParams): Promise<ReviewPage>;
  /** Escrita: exige aprovação. */
  replyReview(
    merchantId: string,
    reviewId: string,
    text: string,
    approval: ApprovalRef,
  ): Promise<ReviewAnswer>;

  pollOrderEvents(merchantIds?: string[]): Promise<OrderEvent[]>;
  acknowledgeOrderEvents(eventIds: string[]): Promise<void>;
  getOrder(orderId: string): Promise<Order>;

  getFinancialSummary(merchantId: string, range: DateRange): Promise<FinancialSummary>;
}
