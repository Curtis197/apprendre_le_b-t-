-- supabase/migrations/20261003000003_revoke_client_execute_on_internal_functions.sql
-- Supabase exposes every function in `public` as /rest/v1/rpc/<name> and grants EXECUTE on new
-- functions to `anon` and `authenticated` by default. The database linter flagged security-definer
-- functions that clients can call but were never meant to be called. This closes that.
--
-- Safe by design:
--   * Trigger functions are not checked for EXECUTE when a trigger fires (only when it is created),
--     so revoking it from clients does not stop the triggers.
--   * is_admin(), is_enrolled() and can_access_lesson() are NOT touched: row-level-security policies
--     call them with the caller's privileges, so `anon` must keep EXECUTE on them.
--   * Every statement is idempotent, and functions that do not exist are skipped.

-- ── 1. Internal functions: triggers and maintenance. No client has a reason to call them. ──────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'handle_new_user()',
    'lessons_create_content()',
    'lexicon_seed_translation()',
    'lexicon_translations_sync_primary()',
    'lesson_progress_guard_score()',
    'submissions_guard_review_fields()',
    'usage_sync_trigger()',
    'prune_translation_usage()',
    'rls_auto_enable()'
  ] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end if;
  end loop;
end
$$;

-- ── 2. Functions only signed-in users can use: both already raise an error for anonymous callers. ─
do $$
declare
  f text;
begin
  foreach f in array array['vote(text, uuid, text)', 'submit_quiz(uuid, jsonb)'] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke execute on function public.%s from public, anon', f);
    end if;
  end loop;
end
$$;

-- ── 3. get_user_video_quota: a user reads their own quota (admins any); nobody else's. ─────────────
-- It was a security-definer function taking any user id, so any caller could read any user's quota.
revoke execute on function get_user_video_quota(uuid) from public, anon;

create or replace function get_user_video_quota(p_user_id uuid)
returns table (
  max_minutes int,
  used_seconds bigint,
  used_minutes numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_used bigint;
begin
  -- Clients (anon / authenticated) only get their own row. Service role and direct database access
  -- are unrestricted.
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and (auth.uid() is null or (p_user_id <> auth.uid() and not is_admin())) then
    return;
  end if;

  select vq.max_minutes into v_max
  from video_quotas vq
  where vq.user_id = p_user_id;

  if v_max is null then
    v_max := 30;
  end if;

  select coalesce(sum(ma.duration_seconds), 0) into v_used
  from media_assets ma
  where ma.owner_id = p_user_id
    and ma.status <> 'errored';

  return query
  select
    v_max as max_minutes,
    v_used as used_seconds,
    round((v_used::numeric / 60.0), 1) as used_minutes;
end;
$$;

-- ── 4. Security-definer functions that had no fixed search_path. ───────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array['vote(text, uuid, text)', 'prune_translation_usage()'] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('alter function public.%s set search_path = public', f);
    end if;
  end loop;
end
$$;
