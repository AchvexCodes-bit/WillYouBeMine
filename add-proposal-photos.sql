-- Run this in Supabase SQL Editor AFTER supabase-schema.sql.
-- Safe to rerun. Photos live in a private bucket and are readable only
-- while their parent proposal is published and within its 15-day lifetime.

alter table public.proposals
  add column if not exists photo_gallery jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.proposals'::regclass
      and conname = 'proposals_photo_gallery_valid'
  ) then
    alter table public.proposals
      add constraint proposals_photo_gallery_valid
      check (
        jsonb_typeof(photo_gallery) = 'array'
        and jsonb_array_length(photo_gallery) <= 5
      );
  end if;
end $$;

-- Saving gallery metadata after the files upload needs owner-scoped UPDATE.
drop policy if exists "Owners can update proposal content" on public.proposals;
create policy "Owners can update proposal content" on public.proposals
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

grant update on public.proposals to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proposal-photos',
  'proposal-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Proposal photos readable for active proposals" on storage.objects;
create policy "Proposal photos readable for active proposals" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'proposal-photos'
    and (storage.foldername(name))[1] is not null
    and (storage.foldername(name))[2] is not null
    and exists (
      select 1
      from public.proposals p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id::text = (storage.foldername(name))[1]
        and p.status = 'published'
        and p.created_at > now() - interval '15 days'
    )
  );

drop policy if exists "Proposal owners can upload photos" on storage.objects;
create policy "Proposal owners can upload photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proposal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] is not null
    and exists (
      select 1
      from public.proposals p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = (select auth.uid())
        and p.status = 'published'
        and p.created_at > now() - interval '15 days'
    )
  );

drop policy if exists "Proposal owners can delete photos" on storage.objects;
create policy "Proposal owners can delete photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proposal-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] is not null
    and exists (
      select 1
      from public.proposals p
      where p.id::text = (storage.foldername(name))[2]
        and p.owner_id = (select auth.uid())
    )
  );

-- Important: the bucket is private. Recipient pages request short-lived
-- signed URLs only after the proposal passes the existing 15-day RLS check.
