-- T02 · Role analyst_ro e views v_* para o Agente Analista (texto para SQL).
-- Regras: só SELECT nas views v_*, nada de nome ou telefone de cliente,
-- statement_timeout de 5 s e escopo por loja via `set local app.merchant_id = '<uuid>'`.
-- Sem app.merchant_id definido as views não retornam linhas.
-- Login e senha da role são definidos fora da migration (ver docs/tasks/T02).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analyst_ro') then
    create role analyst_ro nologin noinherit;
  end if;
end
$$;

alter role analyst_ro set statement_timeout = '5s';
alter role analyst_ro set idle_in_transaction_session_timeout = '10s';
alter role analyst_ro set search_path = public;

revoke all on all tables in schema public from analyst_ro;
revoke all on all sequences in schema public from analyst_ro;
revoke all on all functions in schema public from analyst_ro;
revoke create on schema public from analyst_ro;
grant usage on schema public to analyst_ro;

create function public.analyst_merchant_id() returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('app.merchant_id', true), '')::uuid;
$$;

grant execute on function public.analyst_merchant_id() to analyst_ro;

create view public.v_sales_daily as
select
  o.merchant_id,
  (o.placed_at at time zone m.timezone)::date as day,
  count(*) filter (where o.status <> 'cancelled')::integer as orders_count,
  count(*) filter (where o.status = 'cancelled')::integer as cancelled_count,
  coalesce(sum(o.subtotal_cents) filter (where o.status <> 'cancelled'), 0)::bigint as gross_cents,
  coalesce(sum(o.discount_cents) filter (where o.status <> 'cancelled'), 0)::bigint as discount_cents,
  coalesce(sum(o.total_cents) filter (where o.status <> 'cancelled'), 0)::bigint as total_cents,
  coalesce(round(avg(o.total_cents) filter (where o.status <> 'cancelled')), 0)::integer
    as avg_ticket_cents
from public.orders o
join public.merchants m on m.id = o.merchant_id
where o.merchant_id = public.analyst_merchant_id()
group by o.merchant_id, (o.placed_at at time zone m.timezone)::date;

create view public.v_item_performance as
select
  c.merchant_id,
  c.id as catalog_item_id,
  c.name as item_name,
  c.category,
  c.status,
  c.price_cents,
  c.cost_cents,
  case
    when c.cost_cents is null or c.price_cents = 0 then null
    else round(100.0 * (c.price_cents - c.cost_cents) / c.price_cents, 2)
  end as margin_pct,
  coalesce(sum(oi.quantity) filter (where o.status <> 'cancelled'), 0)::integer as units_sold,
  coalesce(sum(oi.total_cents) filter (where o.status <> 'cancelled'), 0)::bigint as revenue_cents,
  max(o.placed_at) filter (where o.status <> 'cancelled') as last_sold_at
from public.catalog_items c
left join public.order_items oi on oi.catalog_item_id = c.id
left join public.orders o on o.id = oi.order_id
where c.merchant_id = public.analyst_merchant_id()
group by c.merchant_id, c.id;

create view public.v_reviews as
select
  r.merchant_id,
  r.id as review_id,
  r.rating,
  r.comment,
  r.reviewed_at,
  r.sentiment,
  r.topics,
  exists (
    select 1 from public.review_replies rr
    where rr.review_id = r.id and rr.status = 'published'
  ) as has_reply
from public.reviews r
where r.merchant_id = public.analyst_merchant_id();

-- Views rodam com o dono (postgres), por isso só analyst_ro pode lê-las.
revoke all on public.v_sales_daily, public.v_item_performance, public.v_reviews
  from public, anon, authenticated;
grant select on public.v_sales_daily, public.v_item_performance, public.v_reviews to analyst_ro;
