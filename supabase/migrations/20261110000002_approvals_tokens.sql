-- T07: aprovações com token gerado só na aprovação + ROI com estimativa e duração.

-- Kinds alinhados à skill approvals.
alter table public.approvals drop constraint approvals_kind_check;
alter table public.approvals add constraint approvals_kind_check
  check (kind in ('catalog.publish', 'review.reply', 'promo.create', 'message.send'));

-- Resumo em pt-BR mostrado ao dono no painel e no WhatsApp.
alter table public.approvals add column summary text not null default ''
  check (length(summary) <= 500);
grant select (summary) on public.approvals to authenticated;

-- O token (e a validade de 24 h) só existe depois que o dono aprova.
alter table public.approvals alter column token_hash drop not null;
alter table public.approvals alter column expires_at drop not null;
alter table public.approvals add constraint approvals_approved_has_token
  check (status not in ('approved', 'executed') or (token_hash is not null and expires_at is not null));

-- ROI: estimativa manual configurável por tipo, de onde ela veio e duração real do fluxo.
alter table public.roi_events
  add column manual_minutes_estimate integer not null default 0 check (manual_minutes_estimate >= 0),
  add column estimate_source text not null default 'a medir na T11',
  add column flow_duration_ms integer check (flow_duration_ms >= 0);

-- O que foi proposto não muda depois do insert: editar = nova aprovação.
create function public.approvals_freeze_proposal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.payload is distinct from old.payload
     or new.payload_hash is distinct from old.payload_hash
     or new.merchant_id is distinct from old.merchant_id
     or new.kind is distinct from old.kind then
    raise exception 'approvals: payload, payload_hash, merchant_id e kind são imutáveis';
  end if;
  return new;
end;
$$;

create trigger approvals_freeze_proposal
  before update on public.approvals
  for each row execute function public.approvals_freeze_proposal();
