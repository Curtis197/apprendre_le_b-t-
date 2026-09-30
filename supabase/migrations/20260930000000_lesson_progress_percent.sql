-- ── Lesson progress completion percentage & RLS update policy ──

-- Add progress_percent column (default 100 so all existing completed records remain 100% complete)
alter table public.lesson_progress
  add column if not exists progress_percent numeric not null default 100
  check (progress_percent >= 0 and progress_percent <= 100);

-- Make completed_at nullable so partial progress (in-progress lessons) can exist without a completion timestamp
alter table public.lesson_progress
  alter column completed_at drop not null;

-- Add RLS UPDATE policy so authenticated users can update/upsert their own progress
drop policy if exists progress_update_own on public.lesson_progress;
create policy progress_update_own on public.lesson_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and can_access_lesson(lesson_id));

-- Update submit_quiz to set progress_percent = 100 on pass
create or replace function public.submit_quiz(
  p_lesson_id uuid,
  p_answers jsonb -- Object: { "<question_id>": ["<option_id>", ...] }
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_can_access boolean;
  v_total_questions int := 0;
  v_correct_count int := 0;
  v_score numeric := 0;
  v_passed boolean := false;
  v_q record;
  v_user_selection uuid[];
  v_is_correct boolean;
  v_results jsonb := '[]'::jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select can_access_lesson(p_lesson_id) into v_can_access;
  if not v_can_access then
    raise exception 'Access denied to lesson';
  end if;

  for v_q in
    select
      q.id as question_id,
      ak.correct_option_ids,
      ak.explanation
    from quiz_questions q
    join quiz_answer_keys ak on ak.question_id = q.id
    where q.lesson_id = p_lesson_id
    order by q.position asc
  loop
    v_total_questions := v_total_questions + 1;

    -- Extract submitted option array for this question
    select coalesce(array_agg(elem::text::uuid), '{}'::uuid[])
    into v_user_selection
    from jsonb_array_elements_text(p_answers->(v_q.question_id::text)) as elem;

    -- Sort both arrays to compare equality
    v_is_correct := (
      array(select unnest(v_user_selection) order by 1) =
      array(select unnest(v_q.correct_option_ids) order by 1)
    );

    if v_is_correct then
      v_correct_count := v_correct_count + 1;
    end if;

    v_results := v_results || jsonb_build_object(
      'question_id', v_q.question_id,
      'is_correct', v_is_correct,
      'correct_option_ids', v_q.correct_option_ids,
      'explanation', v_q.explanation
    );
  end loop;

  if v_total_questions = 0 then
    raise exception 'Quiz has no questions';
  end if;

  v_score := round((v_correct_count::numeric / v_total_questions::numeric) * 100, 1);
  v_passed := v_score >= 70.0;

  -- Record progress if user passed
  if v_passed then
    insert into lesson_progress (user_id, lesson_id, completed_at, score, progress_percent)
    values (v_user_id, p_lesson_id, now(), v_score, 100)
    on conflict (user_id, lesson_id)
    do update set
      completed_at = coalesce(lesson_progress.completed_at, now()),
      score = greatest(coalesce(lesson_progress.score, 0), v_score),
      progress_percent = 100;
  end if;

  return jsonb_build_object(
    'score', v_score,
    'passed', v_passed,
    'total_questions', v_total_questions,
    'correct_count', v_correct_count,
    'details', v_results
  );
end;
$$;
