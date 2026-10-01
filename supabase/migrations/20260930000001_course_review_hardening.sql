-- Course platform review hardening.
-- Closes client-side forgery paths found in the post-rollout review:
--   1. submissions: learners could write their own grade / feedback / status
--   2. media_assets: owners could write duration/status (video quota bypass)
--   3. course_orders: users could insert completed orders or arbitrary amounts
--   4. lesson_progress.score: any client could set a quiz score
--   5. submit_quiz: leaked answers on every attempt; ignored unkeyed questions

-- ── 1. submissions: only reviewers may touch review fields ──────────────────
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
  else
    new.status := old.status;
    new.teacher_feedback := old.teacher_feedback;
    new.grade := old.grade;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists submissions_guard_review_fields on submissions;
create trigger submissions_guard_review_fields
  before insert or update on submissions
  for each row execute function submissions_guard_review_fields();

-- ── 2. media_assets: clients may only create 'uploading' rows or delete ─────
-- Status, Mux ids and duration are written by the Mux webhook and the
-- server-side sync (service role), never by the browser.
drop policy if exists media_assets_write_owner on media_assets;

create policy media_assets_insert_owner on media_assets
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'uploading'
    and duration_seconds = 0
    and mux_asset_id is null
    and mux_playback_id is null
    and exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = media_assets.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

create policy media_assets_delete_owner on media_assets
  for delete to authenticated
  using (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = media_assets.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- ── 3. course_orders: pending orders must match the approved course price ───
drop policy if exists course_orders_insert_own on course_orders;

create policy course_orders_insert_own on course_orders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and gateway_ref is null
    and exists (
      select 1 from courses c
      where c.id = course_orders.course_id
        and c.status = 'published'
        and c.access = 'paid'
        and c.paid_approved
        and c.price_cents = course_orders.amount_cents
        and lower(coalesce(c.currency, 'eur')) = course_orders.currency
    )
  );

-- ── 4. lesson_progress.score: server-graded except fill-in-the-blank ────────
-- Fill-in-the-blank lessons are graded in the browser by design. For every
-- other kind the score can only be written by submit_quiz.
create or replace function lesson_progress_guard_score()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.quiz_grading', true) = 'on' then
    return new;
  end if;

  if exists (
    select 1 from lessons where id = new.lesson_id and kind = 'fill_in_blank'
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.score := null;
  else
    new.score := old.score;
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_progress_guard_score on lesson_progress;
create trigger lesson_progress_guard_score
  before insert or update on lesson_progress
  for each row execute function lesson_progress_guard_score();

-- ── 5. submit_quiz: no answer leak before passing, no unkeyed questions ─────
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

  if not can_access_lesson(p_lesson_id) then
    raise exception 'Access denied to lesson';
  end if;

  for v_q in
    select
      q.id as question_id,
      ak.correct_option_ids,
      ak.explanation
    from quiz_questions q
    left join quiz_answer_keys ak on ak.question_id = q.id
    where q.lesson_id = p_lesson_id
    order by q.position asc
  loop
    if v_q.correct_option_ids is null then
      raise exception 'Quiz is incomplete: question % has no answer key', v_q.question_id;
    end if;

    v_total_questions := v_total_questions + 1;

    select coalesce(array_agg(elem::text::uuid), '{}'::uuid[])
    into v_user_selection
    from jsonb_array_elements_text(coalesce(p_answers->(v_q.question_id::text), '[]'::jsonb)) as elem;

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

  if v_passed then
    -- Lets lesson_progress_guard_score accept the server-computed score.
    perform set_config('app.quiz_grading', 'on', true);

    insert into lesson_progress (user_id, lesson_id, completed_at, score, progress_percent)
    values (v_user_id, p_lesson_id, now(), v_score, 100)
    on conflict (user_id, lesson_id)
    do update set
      completed_at = coalesce(lesson_progress.completed_at, now()),
      score = greatest(coalesce(lesson_progress.score, 0), v_score),
      progress_percent = 100;

    perform set_config('app.quiz_grading', 'off', true);
  else
    -- Retries are unlimited: do not reveal the answer key until the learner passes.
    select coalesce(jsonb_agg(elem - 'correct_option_ids'), '[]'::jsonb)
    into v_results
    from jsonb_array_elements(v_results) as elem;
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

revoke all on function public.submit_quiz(uuid, jsonb) from public;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;
