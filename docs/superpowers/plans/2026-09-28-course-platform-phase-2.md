# Course Platform — Phase 2 (Audio & QCM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audio lessons with private Supabase Storage playback and auto-graded interactive quizzes (QCM) with secret answer keys, listen-and-choose audio clips, and instant feedback.

**Architecture:** 
- **Storage:** Private Supabase Storage bucket `lesson-audio` with owner-only uploads and short-lived signed URLs generated on the server after verifying enrollment or preview access via `can_access_lesson(lesson_id)`.
- **Audio floor:** Native HTML5 audio supporting **MP3 and M4A only** (capped at 10 MB). WebM/OGG are rejected to guarantee playback on the iOS Safari floor (`safari >= 15.4` / iOS 16.1).
- **QCM Security:** Quiz questions and choices live in `quiz_questions` and `quiz_options` (public to enrolled learners). **Correct answers and explanations live in `quiz_answer_keys` with NO client read access.** Grading is performed securely on PostgreSQL via a `SECURITY DEFINER` function `submit_quiz()`, recording the score in `lesson_progress` and returning question-by-question explanations.
- **Builder & Player:** Integrated directly into the existing `/teach` builder and `/courses/[slug]/learn/[lessonId]` player with zero new runtime dependencies.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, Supabase (`@supabase/ssr`, `@supabase/supabase-js`, local CLI + Docker for RLS tests), Tailwind v4 with shadcn on `@base-ui/react`, Vitest 4, `lucide-react`. **Zero new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-25-course-platform-design.md` (Phase 2).

---

## Global Constraints

- **Phase 2 scope only:** Audio lessons in Supabase Storage, QCM auto-graded quizzes, listen-and-choose audio questions. No video (Phase 3), no free-text assignments (Phase 4), no payments (Phase 5).
- **Audio formats:** Only `audio/mpeg` (`.mp3`) and `audio/mp4` / `audio/x-m4a` (`.m4a`). Maximum file size: 10 MB per audio clip.
- **Answer key secrecy:** Learners must never be able to inspect network payloads or query `quiz_answer_keys` to see correct answers ahead of submission.
- **Grading rules:** Pass threshold is 70% by default. Passing marks the lesson complete in `lesson_progress`. Unlimited retries are supported.
- **Site copy in French:** Always use the typographic curly apostrophe `’` (`U+2019`) in JSX text, never straight `'` (preventing `react/no-unescaped-entities` errors).
- **Safari floor:** iOS Safari 16.1 (`safari >= 15.4`). Custom audio player uses native `<audio>` element with Tailwind controls and standard opacity utilities present in the `@supports not (color: color-mix(...))` block of `globals.css`.
- **Next.js 16 conventions:** Server components await `params` and `searchParams`. Server reads use `createClient()` from `@/lib/supabase-server`.
- **Git hygiene:** Explicit file paths only (`git add <file1> <file2>`). Every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure & Responsibilities

| File | Responsibility |
|---|---|
| `supabase/migrations/20260928000000_courses_phase2_audio_quiz.sql` | `lesson-audio` bucket, `audio_path` in `lesson_contents`, `quiz_questions`, `quiz_options`, `quiz_answer_keys`, `submit_quiz()`, RLS |
| `web/__tests__/rls/phase2-audio-quiz.test.ts` | RLS integration tests for audio bucket, question access, answer key privacy, and grading |
| `web/lib/courses/audio.ts` | Audio validation (MIME, extensions, 10MB cap) and playback time formatting |
| `web/lib/courses/quiz.ts` | Pure QCM types, validation blockers, and scoring helpers |
| `web/lib/courses/queries.ts` | Server queries for quiz questions, options, and signed audio URLs |
| `web/lib/courses/mutations.ts` | Client mutations for audio uploads, quiz builder persistence, and quiz submissions |
| `web/components/courses/AudioPlayer.tsx` | Custom zero-dependency HTML5 audio player (play/pause, seek scrubber, rate control 0.8x/1x/1.2x) |
| `web/components/courses/AudioUploader.tsx` | Teacher audio file upload widget with preview and delete controls |
| `web/components/courses/QuizBuilder.tsx` | Teacher quiz builder: question prompt, optional audio clip, choices, correct key toggle, explanations |
| `web/components/courses/QuizPlayer.tsx` | Learner interactive quiz player: choice selection, audio prompt playback, instant score and explanation display |
| `web/components/courses/LessonEditor.tsx` | Updated lesson editor adding audio upload and quiz builder tabs |
| `web/app/courses/[slug]/learn/[lessonId]/page.tsx` | Updated lesson player rendering audio player and quiz player |
| `web/__tests__/course-audio.test.ts` | Unit tests for audio validation and utilities |
| `web/__tests__/course-quiz.test.ts` | Unit tests for quiz validation and client-side scoring logic |

---

### Task 1: Database Migration for Audio & Quiz Schema

**Files:**
- Create: `supabase/migrations/20260928000000_courses_phase2_audio_quiz.sql`

**Interfaces:**
- Consumes: `courses`, `lessons`, `lesson_contents`, `lesson_progress`, `is_admin()`, `can_access_lesson()`.
- Produces: `lesson_contents.audio_path`, `quiz_questions`, `quiz_options`, `quiz_answer_keys`, storage bucket `lesson-audio`, RPC `submit_quiz(uuid, jsonb)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260928000000_courses_phase2_audio_quiz.sql`:

```sql
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
```

- [ ] **Step 2: Apply migration to local stack**

Run from repo root:
```bash
supabase migration up
```
Expected: `Applying migration 20260928000000_courses_phase2_audio_quiz.sql...` with exit code 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260928000000_courses_phase2_audio_quiz.sql
git commit -m "feat(db): phase 2 audio lessons and quiz schema with RLS" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: RLS Test Suite for Audio & Quiz Security

**Files:**
- Create: `web/__tests__/rls/phase2-audio-quiz.test.ts`

**Interfaces:**
- Consumes: `admin`, `createUser`, `makeAdmin`, `seedCourse`, `must`, `TestUser`, `Seed`.
- Tests: Answer key privacy, learner grading access, owner-only quiz writing, lesson audio gating.

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/rls/phase2-audio-quiz.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 2 audio & quiz RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let quizLessonId: string
  let questionId: string
  let optA: string
  let optB: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p2-teacher'),
      createUser('p2-learner'),
      createUser('p2-outsider'),
      createUser('p2-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Enroll learner
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })

    // Create a quiz lesson
    const lesson = must(
      await admin.from('lessons').insert({
        section_id: seed.section.id,
        course_id: seed.course.id,
        title: 'Quiz de vocabulaire',
        position: 2,
        kind: 'quiz',
        is_preview: false,
      }).select('id').single(),
      'create quiz lesson',
    )
    quizLessonId = lesson.id

    // Create a quiz question
    const q = must(
      await admin.from('quiz_questions').insert({
        lesson_id: quizLessonId,
        prompt: 'Comment dit-on "bonjour" ?',
        position: 0,
      }).select('id').single(),
      'create quiz question',
    )
    questionId = q.id

    // Create two options
    const o1 = must(
      await admin.from('quiz_options').insert({ question_id: questionId, text: 'Akwaba', position: 0 }).select('id').single(),
      'opt1',
    )
    const o2 = must(
      await admin.from('quiz_options').insert({ question_id: questionId, text: 'A té bété', position: 1 }).select('id').single(),
      'opt2',
    )
    optA = o1.id
    optB = o2.id

    // Set correct answer key (optA is correct)
    const key = await admin.from('quiz_answer_keys').insert({
      question_id: questionId,
      correct_option_ids: [optA],
      explanation: 'Akwaba est la salutation de bienvenue.',
    })
    if (key.error) throw new Error(key.error.message)
  })

  describe('quiz questions and options visibility', () => {
    it('allows an enrolled learner to read quiz questions and options', async () => {
      const q = await learner.client.from('quiz_questions').select('id, prompt').eq('lesson_id', quizLessonId)
      expect(q.error).toBeNull()
      expect(q.data).toHaveLength(1)

      const opts = await learner.client.from('quiz_options').select('id, text').eq('question_id', questionId)
      expect(opts.error).toBeNull()
      expect(opts.data).toHaveLength(2)
    })

    it('denies locked quiz questions to non-enrolled users', async () => {
      const q = await outsider.client.from('quiz_questions').select('id').eq('lesson_id', quizLessonId)
      expect(q.data).toEqual([])
    })

    it('NEVER reveals quiz answer keys to learners', async () => {
      const { data } = await learner.client.from('quiz_answer_keys').select('*').eq('question_id', questionId)
      expect(data).toEqual([])
    })

    it('allows the course owner to read the answer keys', async () => {
      const { data } = await teacher.client.from('quiz_answer_keys').select('explanation').eq('question_id', questionId)
      expect(data).toEqual([{ explanation: 'Akwaba est la salutation de bienvenue.' }])
    })
  })

  describe('quiz grading via submit_quiz() RPC', () => {
    it('evaluates answers correctly, scores 100%, and records lesson progress on pass', async () => {
      const res = await learner.client.rpc('submit_quiz', {
        p_lesson_id: quizLessonId,
        p_answers: { [questionId]: [optA] },
      })
      expect(res.error).toBeNull()
      expect(res.data.score).toBe(100)
      expect(res.data.passed).toBe(true)
      expect(res.data.details[0].is_correct).toBe(true)
      expect(res.data.details[0].explanation).toBe('Akwaba est la salutation de bienvenue.')

      // Check progress recorded
      const progress = await learner.client.from('lesson_progress').select('score').eq('lesson_id', quizLessonId)
      expect(progress.data?.[0].score).toBe(100)
    })

    it('evaluates wrong answers, scores 0%, and fails without recording progress', async () => {
      // Clear previous progress
      await admin.from('lesson_progress').delete().eq('user_id', learner.id).eq('lesson_id', quizLessonId)

      const res = await learner.client.rpc('submit_quiz', {
        p_lesson_id: quizLessonId,
        p_answers: { [questionId]: [optB] },
      })
      expect(res.error).toBeNull()
      expect(res.data.score).toBe(0)
      expect(res.data.passed).toBe(false)
      expect(res.data.details[0].is_correct).toBe(false)

      // Confirm no progress recorded
      const progress = await learner.client.from('lesson_progress').select('score').eq('lesson_id', quizLessonId)
      expect(progress.data).toEqual([])
    })

    it('rejects quiz submission from users without access to the lesson', async () => {
      const res = await outsider.client.rpc('submit_quiz', {
        p_lesson_id: quizLessonId,
        p_answers: { [questionId]: [optA] },
      })
      expect(res.error).not.toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run the RLS tests to verify they pass**

Run from `web/`:
```bash
npm run test:rls -- phase2-audio-quiz
```
Expected: all tests in `phase2-audio-quiz.test.ts` PASS.

- [ ] **Step 3: Commit**

```bash
git add web/__tests__/rls/phase2-audio-quiz.test.ts
git commit -m "test(rls): phase 2 audio and quiz security tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Pure Audio & Quiz Domain Library

**Files:**
- Create: `web/lib/courses/audio.ts`
- Create: `web/lib/courses/quiz.ts`
- Create: `web/__tests__/course-audio.test.ts`
- Create: `web/__tests__/course-quiz.test.ts`

**Interfaces:**
- Produces: 
  - `audio.ts`: `MAX_AUDIO_BYTES`, `ALLOWED_AUDIO_TYPES`, `isValidAudioFile`, `formatAudioDuration`.
  - `quiz.ts`: types `QuizQuestion`, `QuizOption`, `QuizAnswerKey`, `QuizInput`, `QuizSubmissionResult`, `validateQuiz`.

- [ ] **Step 1: Write failing audio and quiz unit tests**

Create `web/__tests__/course-audio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatAudioDuration, isValidAudioFile, MAX_AUDIO_BYTES } from '../lib/courses/audio'

describe('audio validation', () => {
  it('accepts MP3 and M4A files within size limit', () => {
    expect(isValidAudioFile({ size: 1000, type: 'audio/mpeg', name: 'audio.mp3' })).toEqual({ valid: true })
    expect(isValidAudioFile({ size: 5000, type: 'audio/x-m4a', name: 'audio.m4a' })).toEqual({ valid: true })
    expect(isValidAudioFile({ size: 5000, type: 'audio/mp4', name: 'audio.m4a' })).toEqual({ valid: true })
  })

  it('rejects files larger than 10MB', () => {
    const res = isValidAudioFile({ size: MAX_AUDIO_BYTES + 1, type: 'audio/mpeg', name: 'big.mp3' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('10 Mo')
  })

  it('rejects unsupported audio formats (e.g. ogg, webm, wav)', () => {
    expect(isValidAudioFile({ size: 1000, type: 'audio/ogg', name: 'clip.ogg' }).valid).toBe(false)
    expect(isValidAudioFile({ size: 1000, type: 'audio/webm', name: 'clip.webm' }).valid).toBe(false)
  })
})

describe('formatAudioDuration', () => {
  it('formats seconds into m:ss format', () => {
    expect(formatAudioDuration(0)).toBe('0:00')
    expect(formatAudioDuration(45)).toBe('0:45')
    expect(formatAudioDuration(75)).toBe('1:15')
    expect(formatAudioDuration(605)).toBe('10:05')
  })
})
```

Create `web/__tests__/course-quiz.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateQuiz, type QuizInput } from '../lib/courses/quiz'

describe('validateQuiz', () => {
  it('passes for a valid quiz with questions, options, and keys', () => {
    const quiz: QuizInput = {
      questions: [
        {
          prompt: 'Question 1',
          position: 0,
          options: [{ text: 'A', position: 0 }, { text: 'B', position: 1 }],
          correctOptionIndices: [0],
          explanation: 'Parce que A.',
        },
      ],
    }
    expect(validateQuiz(quiz)).toBeNull()
  })

  it('blocks quizzes with no questions', () => {
    expect(validateQuiz({ questions: [] })).toBe('Le quiz doit contenir au moins une question.')
  })

  it('blocks questions with fewer than 2 options', () => {
    const quiz: QuizInput = {
      questions: [
        {
          prompt: 'Question 1',
          position: 0,
          options: [{ text: 'A', position: 0 }],
          correctOptionIndices: [0],
          explanation: '',
        },
      ],
    }
    expect(validateQuiz(quiz)).toBe('Chaque question doit avoir au moins 2 options de réponse.')
  })

  it('blocks questions without any correct option selected', () => {
    const quiz: QuizInput = {
      questions: [
        {
          prompt: 'Question 1',
          position: 0,
          options: [{ text: 'A', position: 0 }, { text: 'B', position: 1 }],
          correctOptionIndices: [],
          explanation: '',
        },
      ],
    }
    expect(validateQuiz(quiz)).toBe('Veuillez désigner au moins une bonne réponse pour chaque question.')
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

Run from `web/`:
```bash
npx vitest run course-audio course-quiz
```
Expected: FAIL (modules cannot be resolved).

- [ ] **Step 3: Implement audio and quiz utilities**

Create `web/lib/courses/audio.ts`:

```ts
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
]

const ALLOWED_EXTENSIONS = ['.mp3', '.m4a']

export function isValidAudioFile(file: { size: number; type: string; name: string }): { valid: boolean; error?: string } {
  if (file.size > MAX_AUDIO_BYTES) {
    return { valid: false, error: 'Le fichier audio ne doit pas dépasser 10 Mo.' }
  }

  const nameLower = file.name.toLowerCase()
  const hasValidExt = ALLOWED_EXTENSIONS.some(ext => nameLower.endsWith(ext))
  const hasValidMime = ALLOWED_AUDIO_MIME_TYPES.includes(file.type.toLowerCase())

  if (!hasValidExt && !hasValidMime) {
    return { valid: false, error: 'Seuls les formats audio MP3 et M4A sont autorisés.' }
  }

  return { valid: true }
}

export function formatAudioDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
```

Create `web/lib/courses/quiz.ts`:

```ts
export interface QuizOption {
  id: string
  question_id: string
  text: string
  position: number
}

export interface QuizQuestion {
  id: string
  lesson_id: string
  prompt: string
  audio_path: string | null
  position: number
  options: QuizOption[]
}

export interface QuizAnswerKey {
  question_id: string
  correct_option_ids: string[]
  explanation: string
}

export interface QuizQuestionDraft {
  id?: string
  prompt: string
  audio_path?: string | null
  position: number
  options: { id?: string; text: string; position: number }[]
  correctOptionIndices: number[]
  explanation: string
}

export interface QuizInput {
  questions: QuizQuestionDraft[]
}

export interface QuizCorrectionItem {
  question_id: string
  is_correct: boolean
  correct_option_ids: string[]
  explanation: string
}

export interface QuizSubmissionResult {
  score: number
  passed: boolean
  total_questions: number
  correct_count: number
  details: QuizCorrectionItem[]
}

export function validateQuiz(input: QuizInput): string | null {
  if (input.questions.length === 0) {
    return 'Le quiz doit contenir au moins une question.'
  }

  for (const q of input.questions) {
    if (!q.prompt.trim()) {
      return 'Chaque question doit avoir un énoncé.'
    }
    if (q.options.length < 2) {
      return 'Chaque question doit avoir au moins 2 options de réponse.'
    }
    if (q.options.some(opt => !opt.text.trim())) {
      return 'Toutes les options de réponse doivent être renseignées.'
    }
    if (q.correctOptionIndices.length === 0) {
      return 'Veuillez désigner au moins une bonne réponse pour chaque question.'
    }
  }

  return null
}
```

- [ ] **Step 4: Run unit tests to verify they pass**

Run from `web/`:
```bash
npx vitest run course-audio course-quiz
```
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/courses/audio.ts web/lib/courses/quiz.ts web/__tests__/course-audio.test.ts web/__tests__/course-quiz.test.ts
git commit -m "feat(courses): pure audio and quiz domain logic" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Server Queries & Client Mutations for Audio & Quizzes

**Files:**
- Modify: `web/lib/courses/queries.ts`
- Modify: `web/lib/courses/mutations.ts`

**Interfaces:**
- Produces: 
  - `queries.ts`: `getQuizForLesson`, `getTeacherQuizData`, `getLessonAudioUrl`.
  - `mutations.ts`: `uploadLessonAudio`, `deleteLessonAudio`, `saveQuiz`, `submitQuiz`.

- [ ] **Step 1: Add queries in `web/lib/courses/queries.ts`**

Append to `web/lib/courses/queries.ts`:

```ts
import type { QuizQuestion, QuizAnswerKey } from './quiz'

/** Fetches questions and options for a lesson. Gated by RLS. */
export async function getQuizForLesson(client: SupabaseClient, lessonId: string): Promise<QuizQuestion[]> {
  const { data: questions } = await client
    .from('quiz_questions')
    .select('id, lesson_id, prompt, audio_path, position')
    .eq('lesson_id', lessonId)
    .order('position', { ascending: true })

  if (!questions || questions.length === 0) return []

  const qIds = questions.map(q => q.id)
  const { data: options } = await client
    .from('quiz_options')
    .select('id, question_id, text, position')
    .in('question_id', qIds)
    .order('position', { ascending: true })

  const optionsMap = new Map<string, QuizOption[]>()
  for (const opt of (options ?? []) as QuizOption[]) {
    const list = optionsMap.get(opt.question_id) ?? []
    list.push(opt)
    optionsMap.set(opt.question_id, list)
  }

  return questions.map(q => ({
    ...q,
    options: optionsMap.get(q.id) ?? [],
  }))
}

/** Fetches quiz answer keys (allowed only for course owner / admin). */
export async function getTeacherQuizKeys(client: SupabaseClient, questionIds: string[]): Promise<Map<string, QuizAnswerKey>> {
  if (questionIds.length === 0) return new Map()
  const { data } = await client
    .from('quiz_answer_keys')
    .select('question_id, correct_option_ids, explanation')
    .in('question_id', questionIds)

  const map = new Map<string, QuizAnswerKey>()
  for (const key of (data ?? []) as QuizAnswerKey[]) {
    map.set(key.question_id, key)
  }
  return map
}

/** Generates a short-lived signed URL (1 hour) for lesson audio playback. */
export async function getLessonAudioUrl(client: SupabaseClient, audioPath: string | null): Promise<string | null> {
  if (!audioPath) return null
  const { data, error } = await client.storage
    .from('lesson-audio')
    .createSignedUrl(audioPath, 3600)

  if (error || !data) return null
  return data.signedUrl
}
```

- [ ] **Step 2: Add mutations in `web/lib/courses/mutations.ts`**

Append to `web/lib/courses/mutations.ts`:

```ts
import type { QuizInput, QuizSubmissionResult } from './quiz'
import { isValidAudioFile } from './audio'

/** Uploads an audio clip to the lesson-audio bucket and updates lesson_contents. */
export async function uploadLessonAudio(
  client: SupabaseClient,
  courseOwnerId: string,
  lessonId: string,
  file: File,
): Promise<Result<{ audioPath: string }>> {
  const check = isValidAudioFile(file)
  if (!check.valid) return fail(check.error ?? 'Fichier audio invalide.')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'mp3'
  const path = `${courseOwnerId}/${lessonId}/audio_${Date.now()}.${ext}`

  const { error: uploadError } = await client.storage
    .from('lesson-audio')
    .upload(path, file, { upsert: true })

  if (uploadError) return fail(uploadError.message)

  const { error: dbError } = await client
    .from('lesson_contents')
    .update({ audio_path: path })
    .eq('lesson_id', lessonId)

  if (dbError) return fail(dbError.message)
  return ok({ audioPath: path })
}

/** Deletes an audio clip from storage and clears audio_path in lesson_contents. */
export async function deleteLessonAudio(
  client: SupabaseClient,
  lessonId: string,
  audioPath: string,
): Promise<Result<null>> {
  await client.storage.from('lesson-audio').remove([audioPath])
  const { error } = await client
    .from('lesson_contents')
    .update({ audio_path: null })
    .eq('lesson_id', lessonId)

  return done(error)
}

/** Saves all quiz questions, options, and secret answer keys for a lesson. */
export async function saveQuiz(
  client: SupabaseClient,
  lessonId: string,
  input: QuizInput,
): Promise<Result<null>> {
  // 1. Delete existing questions (cascades to options and keys)
  const { error: delError } = await client.from('quiz_questions').delete().eq('lesson_id', lessonId)
  if (delError) return fail(delError.message)

  // 2. Insert questions, options, and keys
  for (let qIndex = 0; qIndex < input.questions.length; qIndex++) {
    const qData = input.questions[qIndex]
    const { data: qRow, error: qError } = await client
      .from('quiz_questions')
      .insert({
        lesson_id: lessonId,
        prompt: qData.prompt.trim(),
        audio_path: qData.audio_path ?? null,
        position: qIndex,
      })
      .select('id')
      .single()

    if (qError || !qRow) return fail(qError?.message ?? 'Erreur lors de la création de la question.')

    const optionsToInsert = qData.options.map((opt, optIndex) => ({
      question_id: qRow.id,
      text: opt.text.trim(),
      position: optIndex,
    }))

    const { data: optRows, error: optError } = await client
      .from('quiz_options')
      .insert(optionsToInsert)
      .select('id, position')

    if (optError || !optRows) return fail(optError?.message ?? 'Erreur lors de la création des options.')

    // Map correct indices to inserted option UUIDs
    const correctIds = qData.correctOptionIndices
      .map(idx => optRows.find(r => r.position === idx)?.id)
      .filter((id): id is string => Boolean(id))

    const { error: keyError } = await client.from('quiz_answer_keys').insert({
      question_id: qRow.id,
      correct_option_ids: correctIds,
      explanation: qData.explanation.trim(),
    })

    if (keyError) return fail(keyError.message)
  }

  return ok(null)
}

/** Submits learner answers for server-side evaluation. */
export async function submitQuizAnswers(
  client: SupabaseClient,
  lessonId: string,
  answers: Record<string, string[]>,
): Promise<Result<QuizSubmissionResult>> {
  const { data, error } = await client.rpc('submit_quiz', {
    p_lesson_id: lessonId,
    p_answers: answers,
  })

  if (error || !data) return fail(error?.message ?? 'Erreur lors de l’évaluation du quiz.')
  return ok(data as QuizSubmissionResult)
}
```

- [ ] **Step 3: Typecheck and lint**

Run from `web/`:
```bash
npx tsc --noEmit
npx eslint lib/courses
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/courses/queries.ts web/lib/courses/mutations.ts
git commit -m "feat(courses): queries and mutations for audio and quiz platform" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Zero-Dependency HTML5 Audio Player Component

**Files:**
- Create: `web/components/courses/AudioPlayer.tsx`

**Interfaces:**
- Produces: `AudioPlayer({ src, title? })`.
- Features: Native `<audio>` tag, custom controls (Play/Pause, scrub slider, current time / total duration, speed toggle: 0.8x, 1x, 1.2x).

- [ ] **Step 1: Create the AudioPlayer component**

Create `web/components/courses/AudioPlayer.tsx`:

```tsx
'use client'
import { useRef, useState, useEffect } from 'react'
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { formatAudioDuration } from '@/lib/courses/audio'
import { Button } from '@/components/ui/button'

interface Props {
  src: string
  title?: string
  className?: string
}

const SPEEDS = [0.8, 1.0, 1.2]

export function AudioPlayer({ src, title, className = '' }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1) // Default 1.0x
  const [isMuted, setIsMuted] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration || 0)
    const onEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', onEnded)
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    const nextSpeed = SPEEDS[nextIndex]
    setSpeedIndex(nextIndex)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const rewind = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5)
    }
  }

  return (
    <div className={`bg-card border border-border rounded-xl p-4 flex flex-col gap-3 ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {title && (
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Volume2 className="w-3.5 h-3.5 text-primary" />
          <span className="truncate">{title}</span>
        </div>
      )}

      {/* Progress slider */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-10 text-right">
          {formatAudioDuration(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          aria-label="Progression audio"
          className="flex-1 accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
        />
        <span className="text-xs font-mono text-muted-foreground w-10">
          {formatAudioDuration(duration)}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={togglePlay}
            className="w-10 h-10 p-0 rounded-full"
            aria-label={isPlaying ? 'Mettre en pause' : 'Lire'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </Button>

          <button
            type="button"
            onClick={rewind}
            title="Reculer de 5 secondes"
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSpeed}
            className="px-2 py-1 rounded text-xs font-semibold border border-border hover:bg-muted transition-colors"
            title="Changer la vitesse de lecture"
          >
            {SPEEDS[speedIndex]}x
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-destructive" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Lint and typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
npx eslint components/courses/AudioPlayer.tsx
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/courses/AudioPlayer.tsx
git commit -m "feat(courses): custom zero-dependency audio player" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Audio Upload Component for Teachers

**Files:**
- Create: `web/components/courses/AudioUploader.tsx`

**Interfaces:**
- Consumes: `uploadLessonAudio`, `deleteLessonAudio`, `isValidAudioFile`, `AudioPlayer`.
- Produces: `AudioUploader({ courseOwnerId, lessonId, currentAudioUrl, audioPath, onAudioUpdated })`.

- [ ] **Step 1: Create the AudioUploader component**

Create `web/components/courses/AudioUploader.tsx`:

```tsx
'use client'
import { useState, useRef } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { uploadLessonAudio, deleteLessonAudio } from '@/lib/courses/mutations'
import { AudioPlayer } from './AudioPlayer'
import { Button } from '@/components/ui/button'

interface Props {
  courseOwnerId: string
  lessonId: string
  audioPath: string | null
  signedAudioUrl: string | null
  disabled?: boolean
  onUpdated: () => void
}

export function AudioUploader({ courseOwnerId, lessonId, audioPath, signedAudioUrl, disabled = false, onUpdated }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [supabase] = useState(() => createClient())
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    const result = await uploadLessonAudio(supabase, courseOwnerId, lessonId, file)
    setUploading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onUpdated()
  }

  async function handleDelete() {
    if (!audioPath || !window.confirm('Supprimer cet enregistrement audio ?')) return

    setUploading(true)
    setError(null)
    const result = await deleteLessonAudio(supabase, lessonId, audioPath)
    setUploading(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onUpdated()
  }

  return (
    <div className="space-y-4">
      {signedAudioUrl ? (
        <div className="space-y-3">
          <AudioPlayer src={signedAudioUrl} title="Audio de la leçon" />
          {!disabled && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={uploading}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Supprimer l’audio
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Ajoutez un enregistrement pour cette leçon (format MP3 ou M4A, 10 Mo max).
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
            className="hidden"
            disabled={disabled || uploading}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Téléversement…' : 'Choisir un fichier audio'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Lint and typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
npx eslint components/courses/AudioUploader.tsx
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/courses/AudioUploader.tsx
git commit -m "feat(courses): teacher audio uploader component" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Quiz Builder Component for Teachers

**Files:**
- Create: `web/components/courses/QuizBuilder.tsx`

**Interfaces:**
- Consumes: `QuizQuestionDraft`, `QuizInput`, `validateQuiz`, `saveQuiz`.
- Produces: `QuizBuilder({ lessonId, initialQuestions, initialKeys, readOnly, onSaved })`.

- [ ] **Step 1: Create the QuizBuilder component**

Create `web/components/courses/QuizBuilder.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { saveQuiz } from '@/lib/courses/mutations'
import { validateQuiz, type QuizQuestionDraft, type QuizAnswerKey } from '@/lib/courses/quiz'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  lessonId: string
  initialQuestions: QuizQuestionDraft[]
  initialKeys: Map<string, QuizAnswerKey>
  readOnly?: boolean
  onSaved: () => void
}

export function QuizBuilder({ lessonId, initialQuestions, initialKeys, readOnly = false, onSaved }: Props) {
  const [supabase] = useState(() => createClient())
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>(() => {
    if (initialQuestions.length > 0) return initialQuestions
    return [
      {
        prompt: '',
        position: 0,
        options: [
          { text: '', position: 0 },
          { text: '', position: 1 },
        ],
        correctOptionIndices: [0],
        explanation: '',
      },
    ]
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addQuestion() {
    setQuestions(prev => [
      ...prev,
      {
        prompt: '',
        position: prev.length,
        options: [
          { text: '', position: 0 },
          { text: '', position: 1 },
        ],
        correctOptionIndices: [0],
        explanation: '',
      },
    ])
  }

  function removeQuestion(index: number) {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  function addOption(qIndex: number) {
    setQuestions(prev => {
      const copy = [...prev]
      const q = copy[qIndex]
      q.options.push({ text: '', position: q.options.length })
      return copy
    })
  }

  function removeOption(qIndex: number, optIndex: number) {
    setQuestions(prev => {
      const copy = [...prev]
      const q = copy[qIndex]
      if (q.options.length <= 2) return prev // Minimum 2 options
      q.options = q.options.filter((_, i) => i !== optIndex)
      q.correctOptionIndices = q.correctOptionIndices
        .filter(idx => idx !== optIndex)
        .map(idx => (idx > optIndex ? idx - 1 : idx))
      if (q.correctOptionIndices.length === 0) q.correctOptionIndices = [0]
      return copy
    })
  }

  function toggleCorrect(qIndex: number, optIndex: number) {
    setQuestions(prev => {
      const copy = [...prev]
      const q = copy[qIndex]
      const exists = q.correctOptionIndices.includes(optIndex)
      if (exists) {
        if (q.correctOptionIndices.length > 1) {
          q.correctOptionIndices = q.correctOptionIndices.filter(i => i !== optIndex)
        }
      } else {
        q.correctOptionIndices = [...q.correctOptionIndices, optIndex]
      }
      return copy
    })
  }

  async function handleSave() {
    const blocker = validateQuiz({ questions })
    if (blocker) {
      setError(blocker)
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await saveQuiz(supabase, lessonId, { questions })
    setSaving(false)

    if (res.error) {
      setError(res.error)
      return
    }

    setSaved(true)
    onSaved()
  }

  return (
    <div className="space-y-6">
      {questions.map((q, qIndex) => (
        <div key={qIndex} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold text-primary">Question {qIndex + 1}</span>
            {!readOnly && questions.length > 1 && (
              <button
                type="button"
                onClick={() => removeQuestion(qIndex)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                aria-label="Supprimer la question"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor={`q-${qIndex}-prompt`}>Énoncé de la question</label>
            <Input
              id={`q-${qIndex}-prompt`}
              value={q.prompt}
              onChange={e => {
                const val = e.target.value
                setQuestions(prev => {
                  const copy = [...prev]
                  copy[qIndex].prompt = val
                  return copy
                })
              }}
              placeholder="Ex : Quel est le mot pour désigner l’eau ?"
              disabled={readOnly}
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="text-xs font-medium">Options de réponse (cliquez sur le cercle pour marquer la bonne réponse)</label>
            {q.options.map((opt, optIndex) => {
              const isCorrect = q.correctOptionIndices.includes(optIndex)
              return (
                <div key={optIndex} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => !readOnly && toggleCorrect(qIndex, optIndex)}
                    className="p-1 text-primary hover:opacity-80 transition-opacity"
                    title={isCorrect ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                  >
                    {isCorrect ? <CheckCircle2 className="w-5 h-5 text-secondary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <Input
                    value={opt.text}
                    onChange={e => {
                      const val = e.target.value
                      setQuestions(prev => {
                        const copy = [...prev]
                        copy[qIndex].options[optIndex].text = val
                        return copy
                      })
                    }}
                    placeholder={`Option ${optIndex + 1}`}
                    disabled={readOnly}
                    className="flex-1"
                  />
                  {!readOnly && q.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(qIndex, optIndex)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}

            {!readOnly && q.options.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={() => addOption(qIndex)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Ajouter une option
              </Button>
            )}
          </div>

          {/* Explanation */}
          <div className="space-y-1 pt-2 border-t border-border">
            <label className="text-xs font-medium" htmlFor={`q-${qIndex}-explanation`}>Explication pédagogique (affichée après réponse)</label>
            <Textarea
              id={`q-${qIndex}-explanation`}
              value={q.explanation}
              onChange={e => {
                const val = e.target.value
                setQuestions(prev => {
                  const copy = [...prev]
                  copy[qIndex].explanation = val
                  return copy
                })
              }}
              placeholder="Expliquez pourquoi cette réponse est correcte…"
              rows={2}
              disabled={readOnly}
            />
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={addQuestion}>
            <Plus className="w-4 h-4 mr-1" />
            Nouvelle question
          </Button>

          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : saved ? 'Quiz enregistré ✓' : 'Enregistrer le quiz'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Lint and typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
npx eslint components/courses/QuizBuilder.tsx
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/courses/QuizBuilder.tsx
git commit -m "feat(courses): interactive teacher quiz builder component" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Interactive Learner Quiz Player Component

**Files:**
- Create: `web/components/courses/QuizPlayer.tsx`

**Interfaces:**
- Consumes: `QuizQuestion`, `QuizSubmissionResult`, `submitQuizAnswers`, `AudioPlayer`.
- Produces: `QuizPlayer({ lessonId, questions, onPassed? })`.

- [ ] **Step 1: Create the QuizPlayer component**

Create `web/components/courses/QuizPlayer.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { CheckCircle2, XCircle, RotateCcw, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { submitQuizAnswers } from '@/lib/courses/mutations'
import type { QuizQuestion, QuizSubmissionResult } from '@/lib/courses/quiz'
import { AudioPlayer } from './AudioPlayer'
import { Button } from '@/components/ui/button'

interface Props {
  lessonId: string
  questions: QuizQuestion[]
  onPassed?: () => void
}

export function QuizPlayer({ lessonId, questions, onPassed }: Props) {
  const [supabase] = useState(() => createClient())
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizSubmissionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggleOption(questionId: string, optionId: string) {
    if (result) return // Locked after submit until reset
    setSelectedAnswers(prev => {
      const current = prev[questionId] ?? []
      const exists = current.includes(optionId)
      return {
        ...prev,
        [questionId]: exists ? current.filter(id => id !== optionId) : [...current, optionId],
      }
    })
  }

  async function handleSubmit() {
    // Check all questions answered
    const unanswered = questions.some(q => !(selectedAnswers[q.id]?.length > 0))
    if (unanswered) {
      setError('Veuillez répondre à toutes les questions avant de valider.')
      return
    }

    setSubmitting(true)
    setError(null)
    const res = await submitQuizAnswers(supabase, lessonId, selectedAnswers)
    setSubmitting(false)

    if (res.error || !res.data) {
      setError(res.error ?? 'Erreur inattendue.')
      return
    }

    setResult(res.data)
    if (res.data.passed && onPassed) {
      onPassed()
    }
  }

  function handleRetry() {
    setResult(null)
    setSelectedAnswers({})
    setError(null)
  }

  return (
    <div className="space-y-8">
      {/* Quiz questions */}
      <div className="space-y-6">
        {questions.map((q, qIndex) => {
          const correction = result?.details.find(d => d.question_id === q.id)
          const isCorrect = correction?.is_correct

          return (
            <div
              key={q.id}
              className={`bg-card border rounded-xl p-5 space-y-4 transition-colors ${
                result
                  ? isCorrect
                    ? 'border-secondary/40 bg-secondary/5'
                    : 'border-destructive/40 bg-destructive/5'
                  : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading font-semibold text-base">
                  <span className="text-primary mr-2">{qIndex + 1}.</span>
                  {q.prompt}
                </h3>
                {result && (
                  <span className="shrink-0">
                    {isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-secondary" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </span>
                )}
              </div>

              {/* Optional audio prompt */}
              {q.audio_path && (
                <AudioPlayer src={q.audio_path} title="Écouter la question" className="bg-muted" />
              )}

              {/* Choices */}
              <div className="space-y-2">
                {q.options.map(opt => {
                  const isSelected = (selectedAnswers[q.id] ?? []).includes(opt.id)
                  const isActualCorrect = correction?.correct_option_ids.includes(opt.id)

                  let choiceStyle = 'border-border hover:bg-muted'
                  if (result) {
                    if (isActualCorrect) {
                      choiceStyle = 'border-secondary bg-secondary/15 text-secondary font-medium'
                    } else if (isSelected && !isActualCorrect) {
                      choiceStyle = 'border-destructive bg-destructive/15 text-destructive'
                    } else {
                      choiceStyle = 'border-border opacity-50'
                    }
                  } else if (isSelected) {
                    choiceStyle = 'border-primary bg-primary/10 text-primary font-medium'
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={Boolean(result)}
                      onClick={() => toggleOption(q.id, opt.id)}
                      className={`w-full text-left p-3 rounded-lg border text-sm flex items-center justify-between transition-colors ${choiceStyle}`}
                    >
                      <span>{opt.text}</span>
                      {isSelected && !result && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Correction explanation */}
              {correction?.explanation && (
                <div className="text-xs bg-muted/60 rounded-lg p-3 text-muted-foreground italic">
                  <strong>Explication :</strong> {correction.explanation}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Action / Result banner */}
      {result ? (
        <div className={`rounded-xl border p-6 text-center space-y-4 ${result.passed ? 'bg-secondary/10 border-secondary/30' : 'bg-destructive/10 border-destructive/30'}`}>
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-background mb-1">
            <Award className={`w-8 h-8 ${result.passed ? 'text-secondary' : 'text-destructive'}`} />
          </div>
          <div>
            <h4 className="font-heading text-xl font-bold">
              {result.passed ? 'Félicitations, quiz réussi !' : 'Score insuffisant'}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Votre score : <strong>{result.score} %</strong> ({result.correct_count} sur {result.total_questions} bonnes réponses).
              {result.passed ? ' Cette leçon est désormais validée.' : ' Un score d’au moins 70 % est nécessaire pour valider.'}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Recommencer le quiz
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
          {submitting ? 'Validation en cours…' : 'Valider mes réponses'}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Lint and typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
npx eslint components/courses/QuizPlayer.tsx
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/courses/QuizPlayer.tsx
git commit -m "feat(courses): interactive learner quiz player component" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Integrate Audio & Quiz into Lesson Editor and Player

**Files:**
- Modify: `web/components/courses/LessonEditor.tsx`
- Modify: `web/app/courses/[slug]/learn/[lessonId]/page.tsx`
- Modify: `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Connects: `AudioUploader` and `QuizBuilder` into teacher workflow; `AudioPlayer` and `QuizPlayer` into learner workflow.

- [ ] **Step 1: Update teacher `LessonEditor.tsx`**

Update `web/components/courses/LessonEditor.tsx` to handle audio and quiz kinds with appropriate sub-tabs and controls.

- [ ] **Step 2: Update teacher lesson page `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`**

Ensure `signedAudioUrl` and existing `quizQuestions` / `quizKeys` are pre-fetched server-side and passed to `LessonEditor`.

- [ ] **Step 3: Update learner `web/app/courses/[slug]/learn/[lessonId]/page.tsx`**

Render `AudioPlayer` when audio is present or `lesson.kind === 'audio'`. Render `QuizPlayer` when `lesson.kind === 'quiz'`.

- [ ] **Step 4: Typecheck and lint**

Run from `web/`:
```bash
npx tsc --noEmit
npx eslint app/courses app/teach components/courses
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/courses/LessonEditor.tsx web/app/courses/[slug]/learn/[lessonId]/page.tsx web/app/teach/[courseId]/lessons/[lessonId]/page.tsx
git commit -m "feat(courses): integrate audio and quiz into lesson editor and learner player" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Final Verification & Test Suite Execution

**Files:** None created (verification only).

- [ ] **Step 1: Execute all unit and RLS test suites**

Run from `web/`:
```bash
npm test
npm run test:rls
npx tsc --noEmit
npm run build
```
Expected:
- All unit tests PASS (slug, outline, reorder, markdown, audio, quiz).
- All RLS tests PASS (`courses-core`, `progress-reports`, `phase2-audio-quiz`, `smoke`).
- TypeScript typecheck passes with 0 errors.
- Next.js production build succeeds.

- [ ] **Step 2: Commit and verify git clean state**

Ensure working tree is clean and push branch `feat/course-platform-phase-2`.
