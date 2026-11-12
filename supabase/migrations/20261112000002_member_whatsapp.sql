-- T16 · Número de WhatsApp do membro: o webhook descobre loja e pessoa pelo número.
-- Formato wa_id (E.164 só dígitos, sem +), 10 a 15 dígitos.
--
-- Posse comprovada: o membro cadastra o número no painel e recebe um código; o número só vale
-- depois que chega uma mensagem DESSE número com o código ("SOCIO 123456"). Antes disso o canal
-- não reconhece o número. Só o hash do código fica no banco (validade de 30 min).
-- Unicidade só entre números verificados: um cadastro falso não bloqueia o dono real.

alter table public.merchant_members
  add column whatsapp_phone text
    check (whatsapp_phone is null or whatsapp_phone ~ '^[1-9][0-9]{9,14}$'),
  add column whatsapp_verified_at timestamptz,
  add column whatsapp_code_hash text,
  add column whatsapp_code_expires_at timestamptz,
  add constraint merchant_members_whatsapp_verified_has_phone
    check (whatsapp_verified_at is null or whatsapp_phone is not null);

create unique index merchant_members_whatsapp_phone_verified_key
  on public.merchant_members (whatsapp_phone)
  where whatsapp_verified_at is not null;

-- O painel lê só o próprio vínculo (policy existente); escrita e número → loja ficam com o servidor
-- (service role), sempre depois de conferir o membro.
revoke update on public.merchant_members from authenticated, anon;
