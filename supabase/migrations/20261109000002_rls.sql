-- T02 · RLS em todas as tabelas via merchant_members.
-- Escritas na loja (catálogo, respostas, aprovações, pedidos) vão pelo servidor com service role.
-- O painel (role authenticated) lê só as lojas de que é membro e cria uploads de cardápio.

create function public.is_merchant_member(target uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_members m
    where m.merchant_id = target
      and m.user_id = (select auth.uid())
  );
$$;

create function public.is_merchant_owner(target uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_members m
    where m.merchant_id = target
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_merchant_member(uuid) from public, anon;
revoke all on function public.is_merchant_owner(uuid) from public, anon;
grant execute on function public.is_merchant_member(uuid) to authenticated;
grant execute on function public.is_merchant_owner(uuid) to authenticated;

alter table public.merchants enable row level security;
alter table public.merchant_members enable row level security;
alter table public.catalog_items enable row level security;
alter table public.menu_uploads enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;
alter table public.approvals enable row level security;
alter table public.agent_runs enable row level security;
alter table public.roi_events enable row level security;
alter table public.conversations enable row level security;

-- anon não tem acesso a nada.
revoke all on all tables in schema public from anon;

-- Leitura para membros.
create policy merchants_select on public.merchants
  for select to authenticated using (public.is_merchant_member(id));
create policy merchants_update_owner on public.merchants
  for update to authenticated
  using (public.is_merchant_owner(id)) with check (public.is_merchant_owner(id));

create policy merchant_members_select on public.merchant_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy catalog_items_select on public.catalog_items
  for select to authenticated using (public.is_merchant_member(merchant_id));

create policy menu_uploads_select on public.menu_uploads
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy menu_uploads_insert on public.menu_uploads
  for insert to authenticated
  with check (
    public.is_merchant_member(merchant_id)
    and created_by = (select auth.uid())
    and status = 'pending'
  );

create policy orders_select on public.orders
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy order_items_select on public.order_items
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy reviews_select on public.reviews
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy review_replies_select on public.review_replies
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy approvals_select on public.approvals
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy agent_runs_select on public.agent_runs
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy roi_events_select on public.roi_events
  for select to authenticated using (public.is_merchant_member(merchant_id));
create policy conversations_select on public.conversations
  for select to authenticated using (public.is_merchant_member(merchant_id));

-- Colunas sensíveis: o painel não lê token_hash das aprovações.
revoke select on public.approvals from authenticated;
grant select (
  id, merchant_id, kind, payload, payload_hash, status, expires_at,
  requested_by, approved_by, approved_at, executed_at, created_at
) on public.approvals to authenticated;

-- O dono só altera configurações da loja, nunca o vínculo com o iFood.
revoke update on public.merchants from authenticated;
grant update (name, voice_tone, min_margin_pct, timezone) on public.merchants to authenticated;
