-- Run once in the Supabase SQL Editor to enable 15-day proposal expiry.
-- Requires the Supabase pg_cron extension to be available/enabled.
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

-- Clean up once per day. ON DELETE CASCADE removes associated responses too.
select cron.unschedule(jobid) from cron.job where jobname = 'wybm-delete-expired-proposals';
select cron.schedule(
  'wybm-delete-expired-proposals',
  '17 3 * * *',
  $job$delete from public.proposals where created_at <= now() - interval '15 days';$job$
);
