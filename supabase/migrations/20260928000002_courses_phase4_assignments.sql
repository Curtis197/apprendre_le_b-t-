-- Course Platform, Phase 4: Free-text & audio assignments & teacher review queue.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Submissions Table ────────────────────────────────────────────────────
create table if not exists submissions (
  id               uuid primary key default gen_random_uuid(),
  lesson_id        uuid not null references lessons(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  answer_text      text check (answer_text is null or char_length(answer_text) <= 10000),
  audio_path       text check (audio_path is null or char_length(audio_path) <= 1000),
  status           text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  teacher_feedback text check (teacher_feedback is null or char_length(teacher_feedback) <= 5000),
  grade            int check (grade is null or (grade >= 0 and grade <= 100)),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint submissions_user_lesson_unique unique (user_id, lesson_id),
  constraint submissions_has_content check (answer_text is not null or audio_path is not null)
);

create index if not exists submissions_lesson_idx on submissions (lesson_id);
create index if not exists submissions_user_idx on submissions (user_id);
create index if not exists submissions_status_idx on submissions (status);

alter table submissions enable row level security;

-- Learners can read their own submission; course owners & admins can read submissions for their courses.
create policy submissions_select on submissions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- Enrolled learners or preview users can insert their own submission if they can access the lesson.
create policy submissions_insert_own on submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and can_access_lesson(lesson_id)
  );

-- Learners can update their own unreviewed submission; course owners/admins can update any submission for their courses.
create policy submissions_update on submissions
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and status = 'submitted')
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  )
  with check (
    (user_id = (select auth.uid()) and status = 'submitted')
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- Learners can delete their unreviewed submission; owners/admins can delete submissions for their courses.
create policy submissions_delete on submissions
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and status = 'submitted')
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );
