-- Course mailing: pronunciation decisions (validated / needs_retry) also email the learner.
-- Replaces the review trigger function from 20261005000001_email_triggers.sql; the trigger
-- itself already fires on status/teacher_feedback/reviewed_at changes, so it is recreated unchanged.
-- Re-runnable.

create or replace function enqueue_submission_reviewed_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status not in ('reviewed', 'validated', 'needs_retry')
     or new.teacher_feedback is null
     or new.reviewed_at is null then
    return new;
  end if;
  -- A feedback edit with the same decision and reviewed_at is not a new review.
  if tg_op = 'UPDATE' and old.status = new.status and old.reviewed_at is not distinct from new.reviewed_at then
    return new;
  end if;

  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select new.user_id,
         'course_activity',
         'submission_reviewed',
         jsonb_build_object(
           'submission_id', new.id, 'lesson_title', l.title, 'course_title', c.title,
           'course_slug', c.slug, 'feedback', new.teacher_feedback, 'grade', new.grade,
           'outcome', new.status),
         'reviewed:' || new.id || ':' || extract(epoch from new.reviewed_at)::bigint
    from lessons l
    join courses c on c.id = l.course_id
   where l.id = new.lesson_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists submissions_enqueue_reviewed on submissions;
create trigger submissions_enqueue_reviewed
  after insert or update of status, teacher_feedback, reviewed_at on submissions
  for each row execute function enqueue_submission_reviewed_email();
