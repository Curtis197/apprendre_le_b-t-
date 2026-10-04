-- Teacher learner tracking: when did a learner last touch a lesson?
-- completed_at is null for in-progress lessons and never moves after completion,
-- so it cannot tell "stuck" from "gone quiet". updated_at is bumped on every write.
alter table public.lesson_progress
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows: best available estimate is the completion time.
update public.lesson_progress
set updated_at = coalesce(completed_at, updated_at);

create or replace function public.touch_lesson_progress()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists lesson_progress_touch on public.lesson_progress;
create trigger lesson_progress_touch
  before update on public.lesson_progress
  for each row execute function public.touch_lesson_progress();

-- The RPC gains a column, so the return type changes: drop and recreate.
drop function if exists public.course_progress_rows(uuid);

create function public.course_progress_rows(p_course_id uuid)
returns table (
  user_id          uuid,
  full_name        text,
  enrolled_at      timestamptz,
  lesson_id        uuid,
  progress_percent numeric,
  score            numeric,
  completed_at     timestamptz,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from courses c
    where c.id = p_course_id
      and (c.owner_id = auth.uid() or is_admin())
  ) then
    raise exception 'Access denied';
  end if;

  return query
    select e.user_id, p.name as full_name, e.created_at, lp.lesson_id, lp.progress_percent,
           lp.score, lp.completed_at, lp.updated_at
    from enrollments e
    left join profiles p on p.id = e.user_id
    left join lesson_progress lp
      on lp.user_id = e.user_id
     and lp.lesson_id in (select l.id from lessons l where l.course_id = p_course_id)
    where e.course_id = p_course_id
    order by e.created_at, e.user_id;
end;
$$;

revoke all on function public.course_progress_rows(uuid) from public;
revoke all on function public.course_progress_rows(uuid) from anon;
grant execute on function public.course_progress_rows(uuid) to authenticated;
