-- T02 · Schema inicial do Sócio.
-- Dinheiro em centavos (integer), datas em timestamptz, IDs uuid.
-- Embeddings com 768 dimensões (D7: MODEL_EMBED com output_dimensionality=768).

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Lojas e membros
-- ---------------------------------------------------------------------------

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 200),
  ifood_merchant_id text unique,
  voice_tone text not null default 'acolhedor e direto',
  min_margin_pct numeric(5, 2) not null default 30 check (min_margin_pct between 0 and 100),
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchant_members (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (merchant_id, user_id)
);

create index merchant_members_user_idx on public.merchant_members (user_id);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  external_id text,
  name text not null check (length(name) between 1 and 200),
  description text,
  category text,
  price_cents integer not null check (price_cents >= 0),
  cost_cents integer check (cost_cents >= 0),
  status text not null default 'available' check (status in ('draft', 'available', 'unavailable')),
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, external_id)
);

create index catalog_items_merchant_idx on public.catalog_items (merchant_id);

create table public.menu_uploads (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'drafted', 'failed')),
  draft jsonb,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index menu_uploads_merchant_idx on public.menu_uploads (merchant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Pedidos (nome e telefone do cliente nunca saem para as views v_*)
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  external_id text,
  placed_at timestamptz not null,
  status text not null default 'concluded'
    check (status in ('placed', 'confirmed', 'dispatched', 'concluded', 'cancelled')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  customer_name text,
  customer_phone text,
  customer_hash text,
  neighborhood text,
  created_at timestamptz not null default now(),
  unique (merchant_id, external_id)
);

create index orders_merchant_placed_idx on public.orders (merchant_id, placed_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_merchant_item_idx on public.order_items (merchant_id, catalog_item_id);

-- ---------------------------------------------------------------------------
-- Avaliações
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  external_id text,
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  customer_name text,
  reviewed_at timestamptz not null,
  sentiment text check (sentiment in ('positive', 'neutral', 'negative')),
  topics text[] not null default '{}',
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  unique (merchant_id, external_id)
);

create index reviews_merchant_reviewed_idx on public.reviews (merchant_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- Aprovações (toda escrita na loja passa por aqui)
-- ---------------------------------------------------------------------------

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  kind text not null
    check (kind in ('catalog_update', 'review_reply', 'promotion', 'message_send')),
  payload jsonb not null,
  payload_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'executed')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  requested_by text not null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint approvals_approved_has_actor
    check (status not in ('approved', 'executed') or (approved_by is not null and approved_at is not null)),
  constraint approvals_executed_has_time
    check (status <> 'executed' or executed_at is not null)
);

create index approvals_merchant_status_idx on public.approvals (merchant_id, status, created_at desc);

create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'published', 'rejected')),
  approval_id uuid references public.approvals (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint review_replies_published_needs_approval
    check (status <> 'published' or approval_id is not null)
);

create index review_replies_review_idx on public.review_replies (review_id);

-- ---------------------------------------------------------------------------
-- Conversas, execuções de agentes e ROI
-- ---------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'panel')),
  external_ref text,
  state jsonb not null default '{}',
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create index conversations_merchant_idx on public.conversations (merchant_id, last_message_at desc);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  agent text not null,
  model text not null,
  prompt_version text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  latency_ms integer check (latency_ms >= 0),
  status text not null default 'ok' check (status in ('ok', 'error', 'blocked')),
  error text,
  trace_id text,
  created_at timestamptz not null default now()
);

create index agent_runs_merchant_created_idx on public.agent_runs (merchant_id, created_at desc);

create table public.roi_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  kind text not null,
  value_cents integer not null default 0,
  minutes_saved integer not null default 0 check (minutes_saved >= 0),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index roi_events_merchant_created_idx on public.roi_events (merchant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.set_updated_at();
create trigger catalog_items_updated_at before update on public.catalog_items
  for each row execute function public.set_updated_at();
create trigger menu_uploads_updated_at before update on public.menu_uploads
  for each row execute function public.set_updated_at();
