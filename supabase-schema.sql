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
  custom_options jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_options) = 'object'),
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

-- Link-scoped public access: visitors can read only a proposal whose UUID they present,
-- through the RPC below. Do not grant anonymous table-wide SELECT on proposals.
create or replace function public.is_published_proposal(p_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.proposals p
    where p.id = p_proposal_id
      and p.status = 'published'
      and p.created_at > now() - interval '15 days'
  );
$function$;

create or replace function public.get_published_proposal(p_proposal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'id', p.id,
    'creator_name', p.creator_name,
    'recipient_name', p.recipient_name,
    'question', p.question,
    'message', p.message,
    'yes_text', p.yes_text,
    'theme', p.theme,
    'status', p.status,
    'created_at', p.created_at,
    'question_pages', coalesce(to_jsonb(p)->'question_pages', '[]'::jsonb),
    'dodge_no', coalesce((to_jsonb(p)->>'dodge_no')::boolean, false),
    'custom_options', coalesce(to_jsonb(p)->'custom_options', '{}'::jsonb),
    'photo_gallery', coalesce(to_jsonb(p)->'photo_gallery', '[]'::jsonb)
  )
  from public.proposals p
  where p.id = p_proposal_id
    and p.status = 'published'
    and p.created_at > now() - interval '15 days';
$function$;

revoke all on function public.is_published_proposal(uuid) from public;
revoke all on function public.get_published_proposal(uuid) from public;
grant execute on function public.is_published_proposal(uuid) to anon, authenticated;
grant execute on function public.get_published_proposal(uuid) to anon, authenticated;

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

-- Public responses are accepted only for proposals that are still active.
-- The SECURITY DEFINER helper avoids requiring anonymous table-read access to proposals.
create policy "Anyone can answer published proposals" on public.proposal_responses
  for insert to anon, authenticated
  with check (answer in ('yes','no') and public.is_published_proposal(proposal_id));

-- Only the proposal owner can read responses to their proposals.
create policy "Owners can read responses" on public.proposal_responses
  for select to authenticated using (
    exists (
      select 1 from public.proposals p
      where p.id = proposal_id and p.owner_id = auth.uid()
    )
  );

-- Keep direct proposal reads and management account-scoped; public link reads use the RPC.
revoke all on public.proposals from public, anon;
grant select, insert, delete on public.proposals to authenticated;
revoke all on public.proposal_responses from public, anon;
grant insert on public.proposal_responses to anon, authenticated;
grant select on public.proposal_responses to authenticated;
-- Safe upgrade for projects that already created the proposals table.
alter table public.proposals add column if not exists question_pages jsonb not null default '[]'::jsonb;
alter table public.proposals add column if not exists dodge_no boolean not null default false;

-- Proposal links expire 15 days after creation. Applies to existing projects too.
-- Enable pg_cron in Supabase if it is not already available in this project.
create extension if not exists pg_cron;

drop policy if exists "Anyone can view published proposals" on public.proposals;
drop policy if exists "Anyone can view unexpired published proposals" on public.proposals;
drop policy if exists "Anyone can answer published proposals" on public.proposal_responses;
drop policy if exists "Anyone can answer unexpired published proposals" on public.proposal_responses;
create policy "Anyone can answer unexpired published proposals" on public.proposal_responses
  for insert to anon, authenticated
  with check (answer in ('yes','no') and public.is_published_proposal(proposal_id));

-- Remove expired proposals hourly; response rows are removed by ON DELETE CASCADE.
select cron.unschedule(jobid)
from cron.job
where jobname = 'wybm-delete-expired-proposals';

select cron.schedule(
  'wybm-delete-expired-proposals',
  '17 * * * *',
  $job$delete from public.proposals where created_at <= now() - interval '15 days';$job$
);

-- Safe upgrade for projects created before the extra appearance controls.
alter table public.proposals add column if not exists custom_options jsonb not null default '{}'::jsonb;

-- Refresh PostgREST so the secure proposal RPC is immediately available to the frontend.
notify pgrst, 'reload schema';
