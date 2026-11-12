/**
 * Descrição compacta das views v_* que entra no prompt do Analista.
 *
 * É também a lista branca do validador: só estas relações podem aparecer no SQL.
 * Todas já vêm filtradas pela loja (app.merchant_id); a coluna merchant_id não precisa de filtro.
 */

export interface ViewColumn {
  name: string;
  type: string;
  note?: string;
}

export interface ViewSpec {
  name: string;
  about: string;
  columns: ViewColumn[];
}

export const ANALYST_VIEWS: readonly ViewSpec[] = [
  {
    name: 'v_sales_daily',
    about: 'Uma linha por dia com pedido (dia local da loja). Dias sem pedido não aparecem.',
    columns: [
      { name: 'day', type: 'date' },
      { name: 'orders_count', type: 'int', note: 'pedidos não cancelados' },
      { name: 'cancelled_count', type: 'int' },
      { name: 'gross_cents', type: 'bigint', note: 'subtotal dos itens' },
      { name: 'discount_cents', type: 'bigint' },
      { name: 'total_cents', type: 'bigint', note: 'faturamento: total pago, com taxa e desconto' },
      { name: 'avg_ticket_cents', type: 'int', note: 'ticket médio do dia' },
    ],
  },
  {
    name: 'v_item_performance',
    about: 'Uma linha por item do cardápio, somando todo o histórico (sem recorte de data).',
    columns: [
      { name: 'item_name', type: 'text' },
      { name: 'category', type: 'text' },
      { name: 'status', type: 'text', note: "'available' | 'unavailable' | 'draft'" },
      { name: 'price_cents', type: 'int', note: 'preço atual' },
      { name: 'cost_cents', type: 'int', note: 'pode ser null' },
      { name: 'margin_pct', type: 'numeric', note: '0–100; null sem custo' },
      { name: 'units_sold', type: 'int' },
      { name: 'revenue_cents', type: 'bigint' },
      { name: 'last_sold_at', type: 'timestamptz' },
    ],
  },
  {
    name: 'v_item_sales_daily',
    about:
      'Vendas por item e dia (dia local, só pedidos não cancelados). Use para recorte de data por item e efeito de preço.',
    columns: [
      { name: 'day', type: 'date' },
      { name: 'item_name', type: 'text' },
      { name: 'units_sold', type: 'int' },
      { name: 'revenue_cents', type: 'bigint' },
      { name: 'avg_unit_price_cents', type: 'int', note: 'preço médio praticado no dia' },
    ],
  },
  {
    name: 'v_reviews',
    about:
      "Avaliações de clientes. comment é texto livre do cliente; para achar assunto use ilike (ex.: comment ilike '%atras%').",
    columns: [
      { name: 'review_id', type: 'uuid' },
      { name: 'rating', type: 'int', note: '1 a 5' },
      { name: 'comment', type: 'text' },
      { name: 'reviewed_at', type: 'timestamptz', note: 'UTC; converta para o fuso da loja' },
      { name: 'sentiment', type: 'text', note: 'pode ser null' },
      { name: 'topics', type: 'text[]', note: 'pode estar vazio' },
      { name: 'has_reply', type: 'boolean' },
    ],
  },
];

export const ANALYST_VIEW_NAMES: ReadonlySet<string> = new Set(ANALYST_VIEWS.map((v) => v.name));

/** Texto para o prompt: uma linha por view e uma por coluna. */
export function viewsPrompt(views: readonly ViewSpec[] = ANALYST_VIEWS): string {
  return views
    .map((v) => {
      const cols = v.columns
        .map((c) => `  - ${c.name} ${c.type}${c.note ? ` (${c.note})` : ''}`)
        .join('\n');
      return `${v.name}: ${v.about}\n${cols}`;
    })
    .join('\n\n');
}
