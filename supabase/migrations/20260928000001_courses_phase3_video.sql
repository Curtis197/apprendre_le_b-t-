-- Course Platform, Phase 3: Video lessons & Mux Direct Upload integration.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Video Quotas Table ───────────────────────────────────────────────────
-- Tracks per-teacher video quota (default 30 stored minutes, editable by admins).
create table if not exists video_quotas (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  max_minutes int not null default 30 check (max_minutes >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table video_quotas enable row level security;

-- Course owners can read their own quota; admins can read and manage all quotas.
create policy video_quotas_select_own_or_admin on video_quotas
  for select to authenticated
  using (user_id = (select auth.uid()) or (select is_admin()));

create policy video_quotas_admin_write on video_quotas
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- ── 2. Media Assets Table ───────────────────────────────────────────────────
create table if not exists media_assets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  lesson_id        uuid not null references lessons(id) on delete cascade,
  mux_upload_id    text unique not null check (char_length(mux_upload_id) <= 255),
  mux_asset_id     text check (mux_asset_id is null or char_length(mux_asset_id) <= 255),
  mux_playback_id  text check (mux_playback_id is null or char_length(mux_playback_id) <= 255),
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  status           text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'errored')),
  error_message    text check (error_message is null or char_length(error_message) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists media_assets_lesson_idx on media_assets (lesson_id);
create index if not exists media_assets_owner_idx on media_assets (owner_id);

alter table media_assets enable row level security;

-- Readable by anyone with access to the lesson (enrolled learner, preview, owner, or admin)
create policy media_assets_select on media_assets
  for select using (can_access_lesson(lesson_id));

-- Writable only by the course owner (or admin)
create policy media_assets_write_owner on media_assets
  for all to authenticated
  using (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = media_assets.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  )
  with check (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = media_assets.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- ── 3. Helper Function: Get User Video Quota Usage ──────────────────────────
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
  select coalesce(q.max_minutes, 30) into v_max
  from (select p_user_id) u
  left join video_quotas q on q.user_id = p_user_id;

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

revoke all on function get_user_video_quota(uuid) from public;
grant execute on function get_user_video_quota(uuid) to authenticated;
