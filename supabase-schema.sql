-- Run this file in Supabase SQL Editor for cross-device publishing.
create extension if not exists pgcrypto;

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  creator_name text not null default '' check (char_length(creator_name) <= 60),
  recipient_name text not null default '' check (char_length(recipient_name) <= 60),
  question text not null default 'Will you be my person?' check (char_length(question) between 1 and 180),
  message text not null default '' check (char_length(message) <= 1000),
  yes_text text not null default 'Yes, absolutely! ♥' check (char_length(yes_text) between 1 and 60),
  theme text not null default 'sweet' check (theme in ('sweet','midnight','playful')),
  question_pages jsonb not null default '[]'::jsonb check (jsonb_typeof(question_pages) = 'array' and jsonb_array_length(question_pages) <= 3),
  dodge_no boolean not null default false,
  status text not null default 'published' check (status in ('published','archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_responses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  recipient_name text not null default '' check (char_length(recipient_name) <= 60),
  answer text not null check (answer in ('yes','no')),
  message text not null default '' check (char_length(message) <= 600),
  created_at timestamptz not null default now()
);

alter table public.proposals enable row level security;
alter table public.proposal_responses enable row level security;

-- Keep policy setup repeatable when this schema is rerun for an existing project.
drop policy if exists "Owners can view their proposals" on public.proposals;
drop policy if exists "Owners can create proposals" on public.proposals;
drop policy if exists "Owners can delete proposals" on public.proposals;
drop policy if exists "Anyone can view published proposals" on public.proposals;
drop policy if exists "Anyone can view unexpired published proposals" on public.proposals;
drop policy if exists "Anyone can answer published proposals" on public.proposal_responses;
drop policy if exists "Anyone can answer unexpired published proposals" on public.proposal_responses;
drop policy if exists "Owners can read responses" on public.proposal_responses;

-- Creators can manage only their own proposals.
create policy "Owners can view their proposals" on public.proposals
  for select to authenticated using (auth.uid() = owner_id);
create policy "Owners can create proposals" on public.proposals
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "Owners can delete proposals" on public.proposals
  for delete to authenticated using (auth.uid() = owner_id);

-- Public visitors can read published proposals through a narrowly scoped policy.
create policy "Anyone can view published proposals" on public.proposals
  for select to anon, authenticated using (status = 'published');

-- Anyone with a published proposal link can send a simple answer without an account.
create policy "Anyone can answer published proposals" on public.proposal_responses
  for insert to anon, authenticated
  with check (
    answer in ('yes','no')
    and exists (
      select 1 from public.proposals p
      where p.id = proposal_id and p.status = 'published'
    )
  );

-- Only the proposal owner can read responses to their proposals.
create policy "Owners can read responses" on public.proposal_responses
  for select to authenticated using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_id and p.owner_id = auth.uid()
    )
  );

grant select, insert, delete on public.proposals to anon, authenticated;
grant select, insert on public.proposal_responses to anon, authenticated;
-- Safe upgrade for projects that already created the proposals table.
alter table public.proposals add column if not exists question_pages jsonb not null default '[]'::jsonb;
alter table public.proposals add column if not exists dodge_no boolean not null default false;

-- Proposal links expire 15 days after creation. Applies to existing projects too.
-- Enable pg_cron in Supabase if it is not already available in this project.
create extension if not exists pg_cron;

drop policy if exists "Anyone can view published proposals" on public.proposals;
create policy "Anyone can view unexpired published proposals" on public.proposals
  for select to anon, authenticated
  using (status = 'published' and created_at > now() - interval '15 days');

drop policy if exists "Anyone can answer published proposals" on public.proposal_responses;
create policy "Anyone can answer unexpired published proposals" on public.proposal_responses
  for insert to anon, authenticated
  with check (
    answer in ('yes','no')
    and exists (
      select 1 from public.proposals p
      where p.id = proposal_id
        and p.status = 'published'
        and p.created_at > now() - interval '15 days'
    )
  );

-- Remove expired proposals hourly; response rows are removed by ON DELETE CASCADE.
select cron.unschedule(jobid)
from cron.job
where jobname = 'wybm-delete-expired-proposals';

select cron.schedule(
  'wybm-delete-expired-proposals',
  '17 * * * *',
  $job$delete from public.proposals where created_at <= now() - interval '15 days';$job$
);
