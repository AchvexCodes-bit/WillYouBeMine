-- Run once in the Supabase SQL Editor to enable 15-day proposal expiry.
-- Requires the Supabase pg_cron extension to be available/enabled.
create extension if not exists pg_cron;

create or replace function public.is_published_proposal(p_proposal_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.proposals p
    where p.id = p_proposal_id and p.status = 'published'
      and p.created_at > now() - interval '15 days'
  );
$function$;

create or replace function public.get_published_proposal(p_proposal_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'id', p.id, 'creator_name', p.creator_name, 'recipient_name', p.recipient_name,
    'question', p.question, 'message', p.message, 'yes_text', p.yes_text,
    'theme', p.theme, 'status', p.status, 'created_at', p.created_at,
    'question_pages', coalesce(to_jsonb(p)->'question_pages', '[]'::jsonb),
    'dodge_no', coalesce((to_jsonb(p)->>'dodge_no')::boolean, false),
    'custom_options', coalesce(to_jsonb(p)->'custom_options', '{}'::jsonb),
    'photo_gallery', coalesce(to_jsonb(p)->'photo_gallery', '[]'::jsonb)
  )
  from public.proposals p where p.id = p_proposal_id
    and p.status = 'published' and p.created_at > now() - interval '15 days';
$function$;

revoke all on function public.is_published_proposal(uuid) from public;
revoke all on function public.get_published_proposal(uuid) from public;
grant execute on function public.is_published_proposal(uuid) to anon, authenticated;
grant execute on function public.get_published_proposal(uuid) to anon, authenticated;

drop policy if exists "Anyone can view published proposals" on public.proposals;
drop policy if exists "Anyone can view unexpired published proposals" on public.proposals;
drop policy if exists "Anyone can answer published proposals" on public.proposal_responses;
drop policy if exists "Anyone can answer unexpired published proposals" on public.proposal_responses;
create policy "Anyone can answer unexpired published proposals" on public.proposal_responses
  for insert to anon, authenticated
  with check (answer in ('yes','no') and public.is_published_proposal(proposal_id));

revoke all on public.proposals from public, anon;
grant select, insert, delete on public.proposals to authenticated;
revoke all on public.proposal_responses from public, anon;
grant insert on public.proposal_responses to anon, authenticated;
grant select on public.proposal_responses to authenticated;

-- Preserve photo access after anonymous table-wide proposal reads are removed.
create or replace function public.is_published_proposal_photo(p_owner_id text, p_proposal_id text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $function$
  select exists (
    select 1 from public.proposals p
    where p.id::text = p_proposal_id
      and p.owner_id::text = p_owner_id
      and p.status = 'published'
      and p.created_at > now() - interval '15 days'
  );
$function$;
revoke all on function public.is_published_proposal_photo(text, text) from public;
grant execute on function public.is_published_proposal_photo(text, text) to anon, authenticated;
drop policy if exists "Proposal photos readable for active proposals" on storage.objects;
create policy "Proposal photos readable for active proposals" on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'proposal-photos'
    and public.is_published_proposal_photo(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

-- Clean up once per day. ON DELETE CASCADE removes associated responses too.
select cron.unschedule(jobid) from cron.job where jobname = 'wybm-delete-expired-proposals';
select cron.schedule(
  'wybm-delete-expired-proposals',
  '17 * * * *',
  $job$delete from public.proposals where created_at <= now() - interval '15 days';$job$
);
