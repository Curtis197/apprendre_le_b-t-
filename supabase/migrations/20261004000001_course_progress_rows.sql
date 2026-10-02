-- Teacher dashboard: one row per (enrolled learner × lesson with progress) for a course.
-- security definer so owners can see their learners' progress without widening
-- lesson_progress / enrollments RLS (which stay "own rows only").
create or replace function public.course_progress_rows(p_course_id uuid)
returns table (
  user_id          uuid,
  full_name        text,
  enrolled_at      timestamptz,
  lesson_id        uuid,
  progress_percent numeric,
  score            numeric,
  completed_at     timestamptz
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
    select e.user_id, p.name as full_name, e.created_at, lp.lesson_id, lp.progress_percent, lp.score, lp.completed_at
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
