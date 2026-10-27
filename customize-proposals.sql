-- Run this once in the Supabase SQL Editor to enable saved proposal appearance settings.
alter table public.proposals
  add column if not exists custom_options jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'proposals_custom_options_is_object'
      and conrelid = 'public.proposals'::regclass
  ) then
    alter table public.proposals
      add constraint proposals_custom_options_is_object
      check (jsonb_typeof(custom_options) = 'object');
  end if;
end $$;
