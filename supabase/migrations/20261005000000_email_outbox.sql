-- Course mailing: per-user email preferences and the outbox queue.
-- Re-runnable; no "drop policy" (policies are guarded with pg_policies lookups).

create table if not exists email_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  teacher_announcements boolean not null default true,
  weekly_progress       boolean not null default true,
  course_activity       boolean not null default true,
  unsubscribe_token     uuid not null unique default gen_random_uuid(),
  updated_at            timestamptz not null default now()
);

alter table email_preferences enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_preferences' and policyname = 'email_prefs_select_own') then
    create policy email_prefs_select_own on email_preferences
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_preferences' and policyname = 'email_prefs_insert_own') then
    create policy email_prefs_insert_own on email_preferences
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_preferences' and policyname = 'email_prefs_update_own') then
    create policy email_prefs_update_own on email_preferences
      for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- Users may set the category flags, never the unsubscribe token.
revoke all on email_preferences from anon, authenticated;
grant select on email_preferences to authenticated;
grant insert (user_id, teacher_announcements, weekly_progress, course_activity) on email_preferences to authenticated;
grant update (teacher_announcements, weekly_progress, course_activity, updated_at) on email_preferences to authenticated;

create table if not exists email_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('teacher_announcements', 'weekly_progress', 'course_activity')),
  template    text not null,
  payload     jsonb not null default '{}'::jsonb,
  dedupe_key  text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts    int  not null default 0,
  last_error  text,
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists email_outbox_due_idx on email_outbox (send_after) where status = 'pending';
create index if not exists email_outbox_sent_idx on email_outbox (sent_at) where status = 'sent';

-- RLS on with no policies and no grants: only the service role and SECURITY DEFINER code touch the queue.
alter table email_outbox enable row level security;
revoke all on email_outbox from anon, authenticated;

-- Claims due rows and leases them for 10 minutes so overlapping dispatcher runs never pick the same row.
create or replace function claim_email_batch(p_limit int)
returns setof email_outbox
language sql security definer set search_path = public as $$
  update email_outbox o
     set attempts = o.attempts + 1,
         send_after = now() + interval '10 minutes'
   where o.id in (
     select id from email_outbox
      where status = 'pending' and send_after <= now()
      order by send_after
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning o.*;
$$;

revoke execute on function claim_email_batch(int) from public, anon, authenticated;
grant execute on function claim_email_batch(int) to service_role;
