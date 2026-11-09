/**
 * Schemas Zod do subconjunto da API de parceiros do iFood que o projeto usa.
 * Espelham `packages/ifood-client/openapi.yaml` (mesmos nomes de componentes).
 * Fonte e grau de confirmação de cada campo: docs/research/ifood-api.md.
 *
 * Objetos usam `z.looseObject` para tolerar campos extras da API real.
 */
import { z } from 'zod';

// ---------- Comuns ----------

export const Status = z.enum(['AVAILABLE', 'UNAVAILABLE']);
export const CatalogContext = z.enum(['DEFAULT', 'WHITELABEL', 'INDOOR']);
const IsoDateTime = z.iso.datetime({ offset: true });
const IsoDate = z.iso.date();
/** Valores em reais (decimal), como no detalhe de pedido. */
const Money = z.number().nonnegative();

// ---------- Autenticação ----------

export const TokenResponse = z.looseObject({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});
export type TokenResponse = z.infer<typeof TokenResponse>;

// ---------- Merchant ----------

export const MerchantSummary = z.looseObject({
  id: z.string(),
  name: z.string(),
  corporateName: z.string().optional(),
});
export type MerchantSummary = z.infer<typeof MerchantSummary>;

export const MerchantStatus = z.looseObject({
  operation: z.string(),
  available: z.boolean(),
  state: z.enum(['OK', 'WARNING', 'CLOSED', 'ERROR']),
  reopenable: z.boolean().optional(),
  validations: z.array(z.looseObject({ id: z.string().optional(), code: z.string() })).optional(),
});
export type MerchantStatus = z.infer<typeof MerchantStatus>;

// ---------- Catálogo (v2.0) ----------

export const Price = z.looseObject({
  value: z.number().nonnegative(),
  originalValue: z.number().nonnegative().optional(),
});
export type Price = z.infer<typeof Price>;

export const ContextModifier = z.looseObject({
  catalogContext: CatalogContext,
  status: Status.optional(),
  price: Price.optional(),
});

export const Item = z.looseObject({
  id: z.string(),
  type: z.string(),
  categoryId: z.string(),
  status: Status,
  price: Price,
  externalCode: z.string().optional(),
  index: z.number().int().nonnegative().optional(),
  productId: z.string(),
  contextModifiers: z.array(ContextModifier).optional(),
});
export type Item = z.infer<typeof Item>;

export const ProductOptionGroupRef = z.looseObject({
  id: z.string(),
  min: z.number().int().nonnegative(),
  max: z.number().int().nonnegative(),
});

export const Product = z.looseObject({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  externalCode: z.string().optional(),
  imagePath: z.string().optional(),
  serving: z.string().optional(),
  quantity: z.number().int().optional(),
  optionGroups: z.array(ProductOptionGroupRef).optional(),
});
export type Product = z.infer<typeof Product>;

export const OptionGroup = z.looseObject({
  id: z.string(),
  name: z.string(),
  status: Status,
  optionGroupType: z.string().optional(),
  optionIds: z.array(z.string()),
});

export const Option = z.looseObject({
  id: z.string(),
  status: Status,
  productId: z.string(),
  price: Price,
  index: z.number().int().optional(),
});

/** Corpo de PUT /catalog/v2.0/merchants/{merchantId}/items. */
export const ItemUpsert = z.looseObject({
  item: Item,
  products: z.array(Product).min(1),
  optionGroups: z.array(OptionGroup).optional(),
  options: z.array(Option).optional(),
});
export type ItemUpsert = z.infer<typeof ItemUpsert>;

export const Catalog = z.looseObject({
  catalogId: z.string(),
  context: z.array(CatalogContext),
  status: Status,
  modifiedAt: IsoDateTime.optional(),
});
export type Catalog = z.infer<typeof Catalog>;

/** Item como aparece na listagem de uma categoria (item + produto achatados). */
export const CategoryItem = z.looseObject({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  externalCode: z.string().optional(),
  imagePath: z.string().optional(),
  status: Status,
  index: z.number().int().optional(),
  price: Price,
});
export type CategoryItem = z.infer<typeof CategoryItem>;

export const Category = z.looseObject({
  id: z.string(),
  name: z.string(),
  status: Status,
  externalCode: z.string().optional(),
  index: z.number().int().optional(),
  items: z.array(CategoryItem),
});
export type Category = z.infer<typeof Category>;

export const ItemStatusPatch = z.looseObject({ itemId: z.string(), status: Status });
export const ItemPricePatch = z.looseObject({ itemId: z.string(), price: Price });

// ---------- Pedidos (v1.0) ----------

export const EventCode = z.enum(['PLC', 'CFM', 'RTP', 'DSP', 'CON', 'CAN']);

export const OrderEvent = z.looseObject({
  id: z.string(),
  code: EventCode,
  fullCode: z.string(),
  orderId: z.string(),
  merchantId: z.string(),
  createdAt: IsoDateTime,
});
export type OrderEvent = z.infer<typeof OrderEvent>;

export const AcknowledgmentRequest = z.looseObject({
  acknowledgedEventIds: z.array(z.string()).max(2000),
});

export const OrderItemOption = z.looseObject({
  id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: Money,
  price: Money,
});

export const OrderItem = z.looseObject({
  index: z.number().int(),
  id: z.string(),
  uniqueId: z.string(),
  name: z.string(),
  externalCode: z.string().optional(),
  quantity: z.number().positive(),
  unitPrice: Money,
  price: Money,
  optionsPrice: Money,
  totalPrice: Money,
  options: z.array(OrderItemOption).optional(),
});

export const Order = z.looseObject({
  id: z.string(),
  displayId: z.string(),
  orderType: z.enum(['DELIVERY', 'TAKEOUT', 'DINE_IN']),
  orderTiming: z.enum(['IMMEDIATE', 'SCHEDULED']),
  salesChannel: z.string(),
  category: z.string().optional(),
  createdAt: IsoDateTime,
  preparationStartDateTime: IsoDateTime.optional(),
  isTest: z.boolean().optional(),
  merchant: z.looseObject({ id: z.string(), name: z.string() }),
  customer: z.looseObject({
    id: z.string(),
    name: z.string(),
    phone: z.looseObject({ number: z.string() }).optional(),
  }),
  items: z.array(OrderItem).min(1),
  total: z.looseObject({
    subTotal: Money,
    deliveryFee: Money,
    benefits: Money,
    additionalFees: Money,
    orderAmount: Money,
  }),
  payments: z.looseObject({
    prepaid: Money,
    pending: Money,
    methods: z.array(
      z.looseObject({ value: Money, method: z.string(), type: z.enum(['ONLINE', 'OFFLINE']) }),
    ),
  }),
  delivery: z
    .looseObject({
      mode: z.string(),
      deliveredBy: z.enum(['IFOOD', 'MERCHANT']),
      deliveryDateTime: IsoDateTime,
    })
    .optional(),
});
export type Order = z.infer<typeof Order>;

// ---------- Avaliações (v2.0) — NÃO CONFIRMADO na doc oficial ----------

export const Review = z.looseObject({
  id: z.string(),
  score: z.number().min(1).max(5),
  comment: z.string().optional(),
  createdAt: IsoDateTime,
  published: z.boolean(),
  moderated: z.boolean().optional(),
  discarded: z.boolean().optional(),
  order: z.looseObject({ id: z.string(), shortId: z.string(), createdAt: IsoDateTime }),
  replies: z
    .array(z.looseObject({ text: z.string(), createdAt: IsoDateTime, from: z.string().optional() }))
    .optional(),
});
export type Review = z.infer<typeof Review>;

export const ReviewPage = z.looseObject({
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  reviews: z.array(Review),
});
export type ReviewPage = z.infer<typeof ReviewPage>;

export const ReviewAnswerRequest = z.looseObject({ text: z.string().min(1).max(300) });
export const ReviewAnswer = z.looseObject({
  reviewId: z.string(),
  text: z.string(),
  createdAt: IsoDateTime,
});
export type ReviewAnswer = z.infer<typeof ReviewAnswer>;

// ---------- Financeiro — NÃO CONFIRMADO na doc oficial ----------

/** Venda conciliada (GET /financial/.../merchants/{merchantId}/sales). */
export const Sale = z.looseObject({
  orderId: z.string(),
  orderDate: IsoDateTime,
  orderStatus: z.enum(['CONCLUDED', 'CANCELLED']),
  grossValue: Money,
  commission: Money,
  deliveryFee: Money,
  benefits: Money,
  netValue: z.number(),
});
export type Sale = z.infer<typeof Sale>;

export const SalesPage = z.looseObject({
  page: z.number().int().positive(),
  size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  sales: z.array(Sale),
});
export type SalesPage = z.infer<typeof SalesPage>;

/** Agregação feita pelo adapter sobre `Sale` — não é endpoint do iFood. */
export const FinancialSummary = z.object({
  merchantId: z.string(),
  beginDate: IsoDate,
  endDate: IsoDate,
  orders: z.number().int().nonnegative(),
  cancelledOrders: z.number().int().nonnegative(),
  grossRevenue: z.number(),
  commission: z.number(),
  benefits: z.number(),
  netRevenue: z.number(),
  averageTicket: z.number(),
});
export type FinancialSummary = z.infer<typeof FinancialSummary>;

export { IsoDate, IsoDateTime };
