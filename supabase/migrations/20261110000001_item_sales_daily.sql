-- T03 · View diária por item para o Analista (efeito de mudança de preço, sazonalidade de item).
-- Mesmas regras das demais v_*: escopo por app.merchant_id, só analyst_ro lê.

create view public.v_item_sales_daily as
select
  oi.merchant_id,
  (o.placed_at at time zone m.timezone)::date as day,
  oi.catalog_item_id,
  oi.name as item_name,
  sum(oi.quantity)::integer as units_sold,
  sum(oi.total_cents)::bigint as revenue_cents,
  round(sum(oi.total_cents)::numeric / nullif(sum(oi.quantity), 0))::integer as avg_unit_price_cents
from public.order_items oi
join public.orders o on o.id = oi.order_id
join public.merchants m on m.id = oi.merchant_id
where oi.merchant_id = public.analyst_merchant_id()
  and o.status <> 'cancelled'
group by oi.merchant_id, (o.placed_at at time zone m.timezone)::date, oi.catalog_item_id, oi.name;

revoke all on public.v_item_sales_daily from public, anon, authenticated;
grant select on public.v_item_sales_daily to analyst_ro;
