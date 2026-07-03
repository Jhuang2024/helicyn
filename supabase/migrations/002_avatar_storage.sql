-- Helicyn: profile picture storage bucket + RLS policies.
--
-- Run this in the Supabase SQL editor (or `supabase db push` if you use
-- the Supabase CLI) against a real Supabase project, same as
-- 001_founding_partner_applications.sql. See docs/auth_setup.md.
--
-- Avatars are stored at "<user_id>/avatar.<ext>" (one file per user,
-- overwritten via upsert on re-upload) in a public bucket, so the
-- profile page and nav avatar can render them directly from a public
-- URL without any signed-URL round trip. Public here only means "the
-- image bytes are readable by anyone with the exact URL", the same as
-- any other static asset on the site -- writes are still locked down
-- to the owning user below.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly readable"
  on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar"
  on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can replace their own avatar"
  on storage.objects;
create policy "Users can replace their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own avatar"
  on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
