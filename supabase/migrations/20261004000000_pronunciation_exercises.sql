-- Pronunciation exercises: learners record, the teacher validates or asks for a retry.
-- Completion of a pronunciation lesson is written ONLY by the validation trigger below.

-- ── 1. Lesson kind & submission statuses ────────────────────────────────────
alter table public.lessons drop constraint if exists lessons_kind_check;
alter table public.lessons add constraint lessons_kind_check
  check (kind in ('text', 'audio', 'video', 'quiz', 'assignment', 'fill_in_blank', 'pronunciation'));

alter table public.submissions drop constraint if exists submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('submitted', 'reviewed', 'validated', 'needs_retry'));

-- ── 2. Learners may edit (re-record) while the teacher has not validated ────
drop policy if exists submissions_update on submissions;
create policy submissions_update on submissions
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and status in ('submitted', 'needs_retry'))
    or exists (
      select 1 from lessons l join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  )
  with check (
    (user_id = (select auth.uid()) and status in ('submitted', 'needs_retry'))
    or exists (
      select 1 from lessons l join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- A learner resubmitting after needs_retry goes back to 'submitted' with a clean review.
create or replace function submissions_guard_review_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_is_reviewer boolean;
begin
  -- service role / direct database access
  if auth.uid() is null then
    return new;
  end if;

  select exists (
    select 1
    from lessons l join courses c on c.id = l.course_id
    where l.id = new.lesson_id
      and (c.owner_id = auth.uid() or is_admin())
  ) into v_is_reviewer;

  if v_is_reviewer and new.user_id <> auth.uid() then
    return new;
  end if;

  -- Learner (including a teacher submitting to their own lesson): review
  -- fields are server-managed and cannot be set from the client.
  if tg_op = 'INSERT' then
    new.status := 'submitted';
    new.teacher_feedback := null;
    new.grade := null;
    new.reviewed_at := null;
  elsif old.status = 'needs_retry' then
    new.status := 'submitted';
    new.teacher_feedback := null;
    new.grade := null;
    new.reviewed_at := null;
  else
    new.status := old.status;
    new.teacher_feedback := old.teacher_feedback;
    new.grade := old.grade;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

-- ── 3. Progress of a pronunciation lesson cannot be written by clients ──────
create or replace function lesson_progress_guard_pronunciation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.pronunciation_validation', true) = 'on' then
    return new;
  end if;

  if exists (select 1 from lessons where id = new.lesson_id and kind = 'pronunciation') then
    raise exception 'La progression d''une leçon de prononciation est validée par l''enseignant.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_progress_guard_pronunciation on lesson_progress;
create trigger lesson_progress_guard_pronunciation
  before insert or update on lesson_progress
  for each row execute function lesson_progress_guard_pronunciation();

-- Clients may not delete (un-complete) pronunciation progress. This is a policy,
-- not a trigger, so cascades from deleting a lesson or user are unaffected.
drop policy if exists progress_delete_own on lesson_progress;
create policy progress_delete_own on lesson_progress
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and not exists (
      select 1 from lessons l where l.id = lesson_progress.lesson_id and l.kind = 'pronunciation'
    )
  );

-- ── 4. Validation drives completion ─────────────────────────────────────────
create or replace function submissions_apply_pronunciation_validation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from lessons where id = new.lesson_id and kind = 'pronunciation') then
    return null;
  end if;

  if new.status = 'validated' and old.status is distinct from 'validated' then
    perform set_config('app.pronunciation_validation', 'on', true);
    insert into lesson_progress (user_id, lesson_id, completed_at, progress_percent)
    values (new.user_id, new.lesson_id, now(), 100)
    on conflict (user_id, lesson_id)
    do update set
      completed_at = coalesce(lesson_progress.completed_at, now()),
      progress_percent = 100;
    perform set_config('app.pronunciation_validation', 'off', true);
  elsif old.status = 'validated' and new.status <> 'validated' then
    delete from lesson_progress where user_id = new.user_id and lesson_id = new.lesson_id;
  end if;
  return null;
end;
$$;

drop trigger if exists submissions_apply_pronunciation_validation on submissions;
create trigger submissions_apply_pronunciation_validation
  after update on submissions
  for each row execute function submissions_apply_pronunciation_validation();

-- ── 5. Storage: learner recordings ──────────────────────────────────────────
-- Path convention: "{learner_id}/{lesson_id}/{timestamp}.{ext}"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pronunciation-submissions',
  'pronunciation-submissions',
  false,
  5242880, -- 5 MB cap
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

drop policy if exists "pronunciation_insert_own" on storage.objects;
create policy "pronunciation_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pronunciation-submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and can_access_lesson(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "pronunciation_delete_own" on storage.objects;
create policy "pronunciation_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'pronunciation-submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The learner, the owner of the course the lesson belongs to, and admins can read.
drop policy if exists "pronunciation_select" on storage.objects;
create policy "pronunciation_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'pronunciation-submissions'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select is_admin())
      or exists (
        select 1 from lessons l join courses c on c.id = l.course_id
        where l.id = ((storage.foldername(name))[2])::uuid
          and c.owner_id = (select auth.uid())
      )
    )
  );
