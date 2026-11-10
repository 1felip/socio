-- T02 · Bucket privado de fotos de cardápio.
-- Caminho: <merchant_id>/<upload_id>.jpg. Leitura por URL assinada.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy menu_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'menu-photos'
    and (storage.foldername(name))[1] in (
      select m.merchant_id::text from public.merchant_members m
      where m.user_id = (select auth.uid())
    )
  );

create policy menu_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-photos'
    and (storage.foldername(name))[1] in (
      select m.merchant_id::text from public.merchant_members m
      where m.user_id = (select auth.uid())
    )
  );
