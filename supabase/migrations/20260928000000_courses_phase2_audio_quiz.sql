-- Course Platform, Phase 2: Audio lessons and auto-graded QCM quizzes.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Audio Support in Lesson Contents ──────────────────────────────────────
alter table lesson_contents
  add column if not exists audio_path text check (audio_path is null or char_length(audio_path) <= 255);

-- ── 2. Storage Bucket: lesson-audio ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-audio',
  'lesson-audio',
  false,
  10485760, -- 10 MB cap
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac'];

-- Storage RLS: Owner can upload/update/delete their own lesson audio.
-- Path convention: "{course_owner_id}/{lesson_id}/{filename}"
create policy "lesson_audio_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lesson-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lesson_audio_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lesson-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lesson_audio_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lesson-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Reading audio files is handled via signed URLs minted by server components
-- after verifying can_access_lesson(lesson_id). Direct client select is restricted to owners and admins.
create policy "lesson_audio_select_owner_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lesson-audio'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select is_admin())
    )
  );

-- ── 3. Quiz Questions ────────────────────────────────────────────────────────
create table if not exists quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references lessons(id) on delete cascade,
  prompt      text not null check (char_length(prompt) between 1 and 1000),
  audio_path  text check (audio_path is null or char_length(audio_path) <= 255),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists quiz_questions_lesson_idx on quiz_questions (lesson_id, position);

alter table quiz_questions enable row level security;

-- Readable if the caller has access to the lesson
create policy quiz_questions_select on quiz_questions
  for select using (can_access_lesson(lesson_id));

-- Writable only by the course owner
create policy quiz_questions_write_owner on quiz_questions
  for all to authenticated
  using (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = quiz_questions.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = quiz_questions.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

-- ── 4. Quiz Options (Choices) ────────────────────────────────────────────────
create table if not exists quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references quiz_questions(id) on delete cascade,
  text        text not null check (char_length(text) between 1 and 500),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists quiz_options_question_idx on quiz_options (question_id, position);

alter table quiz_options enable row level security;

create policy quiz_options_select on quiz_options
  for select using (
    exists (
      select 1 from quiz_questions q
      where q.id = quiz_options.question_id
        and can_access_lesson(q.lesson_id)
    )
  );

create policy quiz_options_write_owner on quiz_options
  for all to authenticated
  using (
    exists (
      select 1 from quiz_questions q
      join lessons l on l.id = q.lesson_id
      join courses c on c.id = l.course_id
      where q.id = quiz_options.question_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from quiz_questions q
      join lessons l on l.id = q.lesson_id
      join courses c on c.id = l.course_id
      where q.id = quiz_options.question_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

-- ── 5. Quiz Answer Keys (Secret Correct Answers) ─────────────────────────────
-- Learners NEVER have SELECT access to this table.
create table if not exists quiz_answer_keys (
  question_id        uuid primary key references quiz_questions(id) on delete cascade,
  correct_option_ids uuid[] not null check (cardinality(correct_option_ids) >= 1),
  explanation        text not null default '' check (char_length(explanation) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table quiz_answer_keys enable row level security;

-- Visible and editable only by the course owner (or admin)
create policy quiz_answer_keys_owner_select on quiz_answer_keys
  for select to authenticated
  using (
    exists (
      select 1 from quiz_questions q
      join lessons l on l.id = q.lesson_id
      join courses c on c.id = l.course_id
      where q.id = quiz_answer_keys.question_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

create policy quiz_answer_keys_owner_write on quiz_answer_keys
  for all to authenticated
  using (
    exists (
      select 1 from quiz_questions q
      join lessons l on l.id = q.lesson_id
      join courses c on c.id = l.course_id
      where q.id = quiz_answer_keys.question_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from quiz_questions q
      join lessons l on l.id = q.lesson_id
      join courses c on c.id = l.course_id
      where q.id = quiz_answer_keys.question_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

-- ── 6. Quiz Grading Function (SECURITY DEFINER) ──────────────────────────────
-- Compares learner answers against quiz_answer_keys, updates lesson_progress,
-- and returns score, pass status (>= 70%), and per-question correction with explanations.
create or replace function submit_quiz(
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
    insert into lesson_progress (user_id, lesson_id, completed_at, score)
    values (v_user_id, p_lesson_id, now(), v_score)
    on conflict (user_id, lesson_id)
    do update set
      completed_at = now(),
      score = greatest(lesson_progress.score, v_score);
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

revoke all on function submit_quiz(uuid, jsonb) from public;
grant execute on function submit_quiz(uuid, jsonb) to authenticated;
