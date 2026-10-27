-- Run this in Supabase SQL Editor to ensure proposal owners can read replies for their own proposals.
-- This does not expose replies publicly; visitors can still only INSERT an answer.
alter table public.proposal_responses enable row level security;
drop policy if exists "Owners can read responses" on public.proposal_responses;
create policy "Owners can read responses" on public.proposal_responses
  for select to authenticated
  using (exists (
    select 1 from public.proposals p
    where p.id = proposal_responses.proposal_id
      and p.owner_id = (select auth.uid())
  ));
grant select on public.proposal_responses to authenticated;
grant insert on public.proposal_responses to anon, authenticated;

drop policy if exists "Anyone can answer published proposals" on public.proposal_responses;
drop policy if exists "Anyone can answer unexpired published proposals" on public.proposal_responses;
create policy "Anyone can answer unexpired published proposals" on public.proposal_responses
  for insert to anon, authenticated
  with check (answer in ('yes','no') and exists (
    select 1 from public.proposals p
    where p.id = proposal_responses.proposal_id
      and p.status = 'published'
      and p.created_at > now() - interval '15 days'
  ));
