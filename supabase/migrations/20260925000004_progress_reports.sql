-- Course platform, phase 1: learner progress and moderation reports.

-- ── Progress ────────────────────────────────────────────────────────────────
create table if not exists lesson_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  score        numeric check (score is null or (score >= 0 and score <= 100)),
  primary key (user_id, lesson_id)
);

alter table lesson_progress enable row level security;

create policy progress_select_own on lesson_progress
  for select to authenticated using (user_id = (select auth.uid()));

create policy progress_insert_own on lesson_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()) and can_access_lesson(lesson_id));

create policy progress_delete_own on lesson_progress
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── Reports ─────────────────────────────────────────────────────────────────
create table if not exists course_reports (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (char_length(reason) between 5 and 1000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (course_id, reporter_id)
);
create index if not exists course_reports_open_idx
  on course_reports (created_at) where resolved_at is null;

alter table course_reports enable row level security;

create policy reports_insert_own on course_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and resolved_at is null
    and exists (
      select 1 from courses c
      where c.id = course_reports.course_id and c.status = 'published'
    )
  );

create policy reports_select_admin on course_reports
  for select to authenticated using ((select is_admin()));

create policy reports_update_admin on course_reports
  for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
