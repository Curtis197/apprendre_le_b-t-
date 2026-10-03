-- Course mailing: triggers that queue emails, and the weekly digest enqueue function.
-- All functions are SECURITY DEFINER because the triggering user (a learner, a teacher)
-- has no access to email_outbox.

-- ── New course published → learners of the same teacher's earlier courses ───
create or replace function enqueue_new_course_emails()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_live  boolean;
  was_live boolean := false;
begin
  is_live := new.status = 'published' and (new.access = 'free' or new.paid_approved);
  if tg_op = 'UPDATE' then
    was_live := old.status = 'published' and (old.access = 'free' or old.paid_approved);
  end if;
  if not is_live or was_live then
    return new;
  end if;

  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select distinct e.user_id,
         'teacher_announcements',
         'new_course',
         jsonb_build_object('course_id', new.id, 'course_title', new.title, 'course_slug', new.slug, 'summary', new.summary),
         'new_course:' || new.id || ':' || e.user_id
    from enrollments e
    join courses c on c.id = e.course_id
   where c.owner_id = new.owner_id
     and c.id <> new.id
     and e.user_id <> new.owner_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists courses_enqueue_new_course_emails on courses;
create trigger courses_enqueue_new_course_emails
  after insert or update of status, access, paid_approved on courses
  for each row execute function enqueue_new_course_emails();

-- ── Learner submits → the course owner ──────────────────────────────────────
create or replace function enqueue_submission_received_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select c.owner_id,
         'course_activity',
         'submission_received',
         jsonb_build_object('submission_id', new.id, 'lesson_title', l.title, 'course_title', c.title, 'course_slug', c.slug),
         'submitted:' || new.id
    from lessons l
    join courses c on c.id = l.course_id
   where l.id = new.lesson_id
     and c.owner_id <> new.user_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists submissions_enqueue_received on submissions;
create trigger submissions_enqueue_received
  after insert on submissions
  for each row execute function enqueue_submission_received_email();

-- ── Teacher reviews → the learner (once per distinct reviewed_at) ───────────
create or replace function enqueue_submission_reviewed_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'reviewed' or new.teacher_feedback is null or new.reviewed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'reviewed' and old.reviewed_at is not distinct from new.reviewed_at then
    return new;
  end if;

  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select new.user_id,
         'course_activity',
         'submission_reviewed',
         jsonb_build_object(
           'submission_id', new.id, 'lesson_title', l.title, 'course_title', c.title,
           'course_slug', c.slug, 'feedback', new.teacher_feedback, 'grade', new.grade),
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

-- ── Weekly digest: one row per learner with activity in [week, week + 7 days) ─
create or replace function enqueue_weekly_digest(
  p_week_start date default (date_trunc('week', now() - interval '7 days'))::date
)
returns int language plpgsql security definer set search_path = public as $$
declare
  inserted int;
begin
  with done as (
    select lp.user_id, l.course_id, count(*) as completed
      from lesson_progress lp
      join lessons l on l.id = lp.lesson_id
     where lp.completed_at >= p_week_start and lp.completed_at < p_week_start + 7
     group by lp.user_id, l.course_id
  ), per_user as (
    select d.user_id,
           sum(d.completed)::int as lessons_completed,
           jsonb_agg(jsonb_build_object(
             'title', c.title,
             'slug', c.slug,
             'completed_this_week', d.completed,
             'completed_total', (select count(*) from lesson_progress lp2 join lessons l2 on l2.id = lp2.lesson_id
                                  where lp2.user_id = d.user_id and l2.course_id = d.course_id),
             'total_lessons', (select count(*) from lessons l3 where l3.course_id = d.course_id)
           ) order by c.title) as courses
      from done d
      join courses c on c.id = d.course_id
     group by d.user_id
  )
  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select pu.user_id,
         'weekly_progress',
         'weekly_progress',
         jsonb_build_object('week_start', p_week_start, 'lessons_completed', pu.lessons_completed, 'courses', pu.courses),
         'digest:' || p_week_start || ':' || pu.user_id
    from per_user pu
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

revoke execute on function enqueue_weekly_digest(date) from public, anon, authenticated;
grant execute on function enqueue_weekly_digest(date) to service_role;
