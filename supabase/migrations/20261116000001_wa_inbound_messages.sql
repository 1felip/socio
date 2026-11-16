-- T17 · Deduplicação do webhook do WhatsApp. A Meta reenvia a mesma mensagem (mesmo wamid)
-- por até 7 dias se não receber 200 a tempo; cada wamid só pode ser processado uma vez.
-- Guarda só o id e a hora: nada do conteúdo da mensagem nem do número.

create table public.wa_inbound_messages (
  message_id text primary key check (char_length(message_id) between 1 and 256),
  received_at timestamptz not null default now()
);

-- Só o servidor (service role) lê e escreve. Sem policy: RLS ligada nega todo o resto.
alter table public.wa_inbound_messages enable row level security;
revoke all on public.wa_inbound_messages from authenticated, anon;

create index wa_inbound_messages_received_at_idx on public.wa_inbound_messages (received_at);
