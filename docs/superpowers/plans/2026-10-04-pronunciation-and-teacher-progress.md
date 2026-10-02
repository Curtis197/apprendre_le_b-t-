# Pronunciation Exercises & Teacher Progress Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let learners record their pronunciation and teachers validate it (or ask for a retry), with lesson completion driven by that validation; give teachers a per-course view of learner progress and scores; fix the learner-side scoring inconsistencies found in the 2026-10-02 evaluation.

**Architecture:** A new lesson kind `pronunciation` reuses the existing `submissions` table (new statuses `validated` / `needs_retry`) and a new private storage bucket for learner recordings. Completion of a pronunciation lesson is written **only** by a database trigger when the teacher validates, and is blocked for clients by a guard trigger. The teacher dashboard reads through a `security definer` RPC (owner/admin only) and aggregates in a pure, unit-tested TypeScript module.

**Tech Stack:** Next.js (App Router; this repo's version has breaking changes — see `web/AGENTS.md`), Supabase (Postgres, RLS, Storage), TypeScript, Vitest (unit: `npm run test`, RLS: `npm run test:rls`), Tailwind, lucide-react.

**Spec:** No separate spec. Design is the conversation of 2026-10-02/04 (evaluation of progress & scoring, then the pronunciation-flow review). Related: `docs/superpowers/walkthroughs/2026-09-30-lesson-completion-percentage-scoring.md`, `docs/superpowers/specs/2026-09-25-course-platform-design.md`.

## Global Constraints

- Work on a **new branch from `master`** in a **git worktree** (other sessions share this folder; never switch branches in the shared folder; run `git branch --show-current` before every commit). Check that migrations `20261003000000_word_usages.sql` / `20261003000001_find_usages.sql` do not collide with the new `20261004*` files.
- All user-facing copy is **French**, matching existing components.
- **iOS Safari 16.1 must keep working**: only use Tailwind opacity utilities already used in the codebase (`bg-secondary/10`, `bg-destructive/10`, `bg-emerald-500/10`, `bg-muted/40`, `bg-muted/60`); no new `color-mix` style utilities. `MediaRecorder` on Safari produces `audio/mp4`, Chrome/Firefox `audio/webm`/`audio/ogg` — all three must be accepted.
- Migrations must be **re-runnable** (`drop ... if exists`, `create or replace`, `add column if not exists`).
- Local Supabase: check `docker ps` for ports first; the RLS suite hits a signup rate limit (30 per 5 min) so run RLS files individually (`npm run test:rls -- <file>`); `next dev` crashes on deep Windows paths (use a short worktree path); never stop the Bartender-Google processes.
- Remote project `agdqbzbjcxrzfhkvempe`: the Supabase MCP tool declines DDL that drops policies — migrations containing `drop policy` must be applied **by hand** by the user (see Task 11).
- Do not add `console.log` debugging to new code.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Pass thresholds **keep their current values**: quiz 70 (enforced in `submit_quiz`), fill-in-the-blank 80. This plan only centralises them.

## Review Focus

Failure modes the spec implies but a happy-path test would miss (each is pinned by a test in the named task):

1. **Learner forges completion of a pronunciation lesson** (direct `lesson_progress` insert/upsert, or setting `status='validated'` on own submission) → must fail / be ignored. (Task 3)
2. **Teacher deletes a pronunciation lesson that already has learner progress/submissions** → must succeed (cascade must not hit the progress guard). (Task 3)
3. **Teacher reverses a decision** (validated → needs_retry) → the learner's completion must be revoked, not stay at 100%. (Task 3)
4. **Learner re-records after `needs_retry`** → row goes back to `submitted`, old feedback cleared; after `validated` the row is frozen. (Task 3)
5. **Browser records a MIME type the bucket rejects** (`audio/webm;codecs=opus` with a codec suffix, or Safari `audio/mp4`) → upload content-type must be the base type and in the allow-list; unsupported browsers get a clear message, not a crash. (Task 4)
6. **Teacher stats with zero lessons / zero enrolled learners / progress rows for deleted lessons** → no divide-by-zero, no NaN. (Task 8)
7. **Outsider or learner calls the progress RPC** → must error, never return other users' rows. (Task 9)
8. **Fill-in-the-blank failed attempt** must not raise course progress; best score kept. (Task 1)

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261004000000_pronunciation_exercises.sql` (new) | `pronunciation` kind, submission statuses, learner-recording bucket + policies, progress guard, validation trigger, delete-policy tweak |
| `supabase/migrations/20261004000001_course_progress_rows.sql` (new) | `course_progress_rows(p_course_id)` RPC (owner/admin only) |
| `web/lib/courses/thresholds.ts` (new) | Shared pass-percent constants + `fillInBlankOutcome` |
| `web/lib/courses/pronunciation.ts` (new) | Pure helpers: MIME choice, extension, storage path, labels, limits |
| `web/lib/courses/stats.ts` (new) | Pure aggregation `summarizeCourseStats` + types |
| `web/lib/courses/assignment.ts` (modify) | `SubmissionStatus`, `isPendingSubmission`, `audioUrl` on review items |
| `web/lib/courses/types.ts`, `labels.ts` (modify) | `pronunciation` kind + label |
| `web/lib/courses/mutations.ts` (modify) | `submitPronunciation`, `reviewPronunciation` |
| `web/lib/courses/queries.ts` (modify) | recording signed URLs, review-item kind/audio, `getCourseProgressRows` |
| `web/components/courses/PronunciationRecorder.tsx` (new) | Browser recording UI (no network) |
| `web/components/courses/PronunciationExercise.tsx` (new) | Learner exercise: status, feedback, recorder, send |
| `web/components/courses/PronunciationReviewCard.tsx` (new) | Teacher card: player + Valider / À refaire |
| `web/components/courses/CourseStatsPanel.tsx` (new) | Teacher dashboard section |
| `web/components/courses/ReviewQueue.tsx`, `LessonEditor.tsx`, `FillInBlankExercise.tsx` (modify) | wire-up |
| `web/app/courses/[slug]/learn/[lessonId]/page.tsx`, `web/app/teach/[courseId]/page.tsx`, `web/app/api/courses/submissions/notify/route.ts` (modify) | wire-up |
| tests: `web/__tests__/course-thresholds.test.ts`, `course-pronunciation.test.ts`, `course-stats.test.ts` (unit); `web/__tests__/rls/pronunciation.test.ts`, `rls/course-progress-rows.test.ts` (RLS) | |

---

### Task 1: Centralise pass thresholds and fix fill-in-the-blank progress

**Files:**
- Create: `web/lib/courses/thresholds.ts`
- Test: `web/__tests__/course-thresholds.test.ts`
- Modify: `web/components/courses/FillInBlankExercise.tsx:87-122`
- Modify: `web/components/courses/LessonEditor.tsx:175`

**Interfaces:**
- Produces: `QUIZ_PASS_PERCENT: 70`, `FILL_IN_BLANK_PASS_PERCENT: 80`, `fillInBlankOutcome(scorePercent: number): { passed: boolean; progressPercent: number }`

- [ ] **Step 1: Write the failing test** — `web/__tests__/course-thresholds.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { FILL_IN_BLANK_PASS_PERCENT, QUIZ_PASS_PERCENT, fillInBlankOutcome } from '../lib/courses/thresholds'

describe('thresholds', () => {
  it('keeps the current pass marks', () => {
    expect(QUIZ_PASS_PERCENT).toBe(70)
    expect(FILL_IN_BLANK_PASS_PERCENT).toBe(80)
  })
})

describe('fillInBlankOutcome', () => {
  it('completes the lesson at or above the pass mark', () => {
    expect(fillInBlankOutcome(80)).toEqual({ passed: true, progressPercent: 100 })
    expect(fillInBlankOutcome(100)).toEqual({ passed: true, progressPercent: 100 })
  })

  it('does not turn a failed score into partial lesson progress', () => {
    expect(fillInBlankOutcome(79)).toEqual({ passed: false, progressPercent: 0 })
    expect(fillInBlankOutcome(0)).toEqual({ passed: false, progressPercent: 0 })
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd web && npx vitest run __tests__/course-thresholds.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `web/lib/courses/thresholds.ts`

```ts
/** Must match the `v_score >= 70.0` check in the `submit_quiz` SQL function. */
export const QUIZ_PASS_PERCENT = 70

export const FILL_IN_BLANK_PASS_PERCENT = 80

/**
 * A failed exercise records its score but adds no lesson progress: progress
 * means "how far through the lesson", the score means "how well it went".
 */
export function fillInBlankOutcome(scorePercent: number): { passed: boolean; progressPercent: number } {
  const passed = scorePercent >= FILL_IN_BLANK_PASS_PERCENT
  return { passed, progressPercent: passed ? 100 : 0 }
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Wire the component.** In `FillInBlankExercise.tsx` add `import { fillInBlankOutcome } from '@/lib/courses/thresholds'` and replace the whole `handleCheckAnswers` body (lines 87-122) with:

```tsx
  async function handleCheckAnswers() {
    const evalResult = evaluateFillInBlankAnswers(parsed.blanks, userAnswers)
    setEvaluated(evalResult)

    if (isAuthed) {
      const { passed, progressPercent } = fillInBlankOutcome(evalResult.scorePercent)
      setSubmitting(true)
      await saveLessonProgress(supabase, lessonId, {
        progressPercent,
        score: evalResult.scorePercent,
        completed: passed,
      })
      setSubmitting(false)
      if (passed && onComplete) onComplete()
    }
  }
```

Also replace the two literal `>= 80` in the JSX (lines ~307 and ~319) with `>= FILL_IN_BLANK_PASS_PERCENT` (import it from the same module), and delete the remaining `console.log` calls in `handleReset` / `handleSwitchMode` of this file.

In `LessonEditor.tsx:175` change the literal to `Note de passage minimale : {QUIZ_PASS_PERCENT} %` and import `QUIZ_PASS_PERCENT` from `@/lib/courses/thresholds`.

- [ ] **Step 6: Verify** — `cd web && npx tsc --noEmit && npm run test` → both succeed.

- [ ] **Step 7: Commit**

```bash
git add web/lib/courses/thresholds.ts web/__tests__/course-thresholds.test.ts web/components/courses/FillInBlankExercise.tsx web/components/courses/LessonEditor.tsx
git commit -m "fix(courses): centralise pass marks; failed fill-in-the-blank no longer adds progress"
```

---

### Task 2: Pronunciation pure helpers, types and labels

**Files:**
- Create: `web/lib/courses/pronunciation.ts`
- Test: `web/__tests__/course-pronunciation.test.ts`
- Modify: `web/lib/courses/types.ts:6`, `web/lib/courses/labels.ts:27-34`, `web/lib/courses/assignment.ts`
- Modify: `web/__tests__/course-assignment.test.ts` (add cases)

**Interfaces:**
- Produces (`pronunciation.ts`): `MAX_RECORDING_SECONDS = 60`, `MAX_RECORDING_BYTES = 5 * 1024 * 1024`, `PRONUNCIATION_BUCKET = 'pronunciation-submissions'`, `pickRecordingMimeType(isSupported: (mime: string) => boolean): string | null`, `baseMimeType(mime: string): string`, `extensionForMime(mime: string): 'webm' | 'mp4' | 'ogg'`, `buildRecordingPath(userId: string, lessonId: string, nowMs: number, ext: string): string`, `pronunciationStatusLabel(status: SubmissionStatus): string`
- Produces (`assignment.ts`): `type SubmissionStatus = 'submitted' | 'reviewed' | 'validated' | 'needs_retry'`, `isPendingSubmission(status: SubmissionStatus): boolean`; `Submission.status: SubmissionStatus`; `PendingReviewItem.lesson` gains `kind: LessonKind`; `PendingReviewItem` gains `audioUrl?: string | null`; `formatSubmissionStatusLabel(status: SubmissionStatus)` also handles the two new statuses.

- [ ] **Step 1: Write the failing tests** — `web/__tests__/course-pronunciation.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_RECORDING_BYTES,
  baseMimeType,
  buildRecordingPath,
  extensionForMime,
  pickRecordingMimeType,
  pronunciationStatusLabel,
} from '../lib/courses/pronunciation'

describe('pickRecordingMimeType', () => {
  it('prefers webm/opus where supported (Chrome, Firefox)', () => {
    const supported = new Set(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
    expect(pickRecordingMimeType(m => supported.has(m))).toBe('audio/webm;codecs=opus')
  })

  it('falls back to mp4 on Safari', () => {
    expect(pickRecordingMimeType(m => m === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns null when nothing is supported so the UI can explain', () => {
    expect(pickRecordingMimeType(() => false)).toBeNull()
  })
})

describe('baseMimeType / extensionForMime', () => {
  it('strips codec parameters so the storage allow-list matches', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMimeType('audio/mp4')).toBe('audio/mp4')
  })

  it('maps mime to file extension', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForMime('audio/mp4')).toBe('mp4')
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('ogg')
  })
})

describe('buildRecordingPath', () => {
  it('puts the learner id first (storage RLS) then the lesson id', () => {
    expect(buildRecordingPath('u1', 'l1', 1700000000000, 'webm')).toBe('u1/l1/1700000000000.webm')
  })
})

describe('limits and labels', () => {
  it('caps recordings at 5 MB', () => {
    expect(MAX_RECORDING_BYTES).toBe(5 * 1024 * 1024)
  })

  it('labels each status in French', () => {
    expect(pronunciationStatusLabel('submitted')).toBe('En attente de validation')
    expect(pronunciationStatusLabel('validated')).toBe('Prononciation validée')
    expect(pronunciationStatusLabel('needs_retry')).toBe('À refaire')
    expect(pronunciationStatusLabel('reviewed')).toBe('Évalué')
  })
})
```

Append to `web/__tests__/course-assignment.test.ts` (extend the import with `isPendingSubmission`):

```ts
describe('isPendingSubmission', () => {
  it('is true only while the teacher still has to act', () => {
    expect(isPendingSubmission('submitted')).toBe(true)
    expect(isPendingSubmission('reviewed')).toBe(false)
    expect(isPendingSubmission('validated')).toBe(false)
    expect(isPendingSubmission('needs_retry')).toBe(false)
  })
})
```

- [ ] **Step 2: Run** — `cd web && npx vitest run __tests__/course-pronunciation.test.ts __tests__/course-assignment.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `web/lib/courses/pronunciation.ts`:

```ts
import type { SubmissionStatus } from './assignment'

export const MAX_RECORDING_SECONDS = 60
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024
export const PRONUNCIATION_BUCKET = 'pronunciation-submissions'

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/** First recording format the browser's MediaRecorder supports, or null. */
export function pickRecordingMimeType(isSupported: (mime: string) => boolean): string | null {
  return CANDIDATE_MIME_TYPES.find(isSupported) ?? null
}

/** Storage compares the bare type, so `audio/webm;codecs=opus` must become `audio/webm`. */
export function baseMimeType(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase()
}

export function extensionForMime(mime: string): 'webm' | 'mp4' | 'ogg' {
  const base = baseMimeType(mime)
  if (base === 'audio/mp4') return 'mp4'
  if (base === 'audio/ogg') return 'ogg'
  return 'webm'
}

/** Storage RLS requires the learner id as the first folder. */
export function buildRecordingPath(userId: string, lessonId: string, nowMs: number, ext: string): string {
  return `${userId}/${lessonId}/${nowMs}.${ext}`
}

export function pronunciationStatusLabel(status: SubmissionStatus): string {
  switch (status) {
    case 'validated':
      return 'Prononciation validée'
    case 'needs_retry':
      return 'À refaire'
    case 'reviewed':
      return 'Évalué'
    default:
      return 'En attente de validation'
  }
}
```

`assignment.ts`: add `import type { LessonKind } from './types'`; add

```ts
export type SubmissionStatus = 'submitted' | 'reviewed' | 'validated' | 'needs_retry'

/** True while the teacher still has to act on the submission. */
export function isPendingSubmission(status: SubmissionStatus): boolean {
  return status === 'submitted'
}
```

change `Submission.status` to `SubmissionStatus`, `PendingReviewItem.lesson` to `{ id: string; title: string; course_id: string; kind: LessonKind }`, add `audioUrl?: string | null` to `PendingReviewItem`, and replace `formatSubmissionStatusLabel` with:

```ts
export function formatSubmissionStatusLabel(status: SubmissionStatus): string {
  if (status === 'reviewed') return 'Évalué'
  if (status === 'validated') return 'Validé'
  if (status === 'needs_retry') return 'À refaire'
  return 'En attente de correction'
}
```

`types.ts:6`: add `| 'pronunciation'` to `LessonKind`. `labels.ts` `KIND_LABELS`: add `pronunciation: 'Prononciation',`.

- [ ] **Step 4: Run** — same command → PASS; then `npx tsc --noEmit` (fix every error it reports from the widened `Submission.status` / `LessonKind`: the only exhaustive map is `KIND_LABELS`; `PendingReviewItem` is built in `queries.ts:497-511`, add `kind` there by changing the lessons select at line 477 to `'id, title, course_id, kind'`).

- [ ] **Step 5: Commit**

```bash
git add web/lib/courses web/__tests__/course-pronunciation.test.ts web/__tests__/course-assignment.test.ts
git commit -m "feat(courses): pronunciation helpers, submission statuses and lesson kind types"
```

---

### Task 3: Database — pronunciation kind, statuses, bucket, completion-by-validation

**Files:**
- Create: `supabase/migrations/20261004000000_pronunciation_exercises.sql`
- Test: `web/__tests__/rls/pronunciation.test.ts`

**Interfaces:**
- Consumes: `can_access_lesson(uuid)`, `is_admin()`, tables `lessons`, `courses`, `submissions`, `lesson_progress`.
- Produces: lesson kind `pronunciation`; submission statuses `validated`, `needs_retry`; bucket `pronunciation-submissions` (path `{learner_id}/{lesson_id}/{file}`); behaviour: validation writes progress 100, reversal deletes it, clients cannot write progress for pronunciation lessons.

- [ ] **Step 1: Write the failing RLS test** — `web/__tests__/rls/pronunciation.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, seedCourse, type Seed, type TestUser } from './helpers'

describe('pronunciation lessons RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let seed: Seed
  let lessonId: string

  async function progressRow() {
    const { data } = await admin
      .from('lesson_progress')
      .select('progress_percent, completed_at')
      .eq('user_id', learner.id)
      .eq('lesson_id', lessonId)
    return data ?? []
  }

  beforeAll(async () => {
    ;[teacher, learner] = await Promise.all([createUser('pr-teacher'), createUser('pr-learner')])
    seed = await seedCourse(teacher.id)
    must(
      await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id }).select(),
      'enroll learner',
    )
    const lesson = must(
      await admin
        .from('lessons')
        .insert({ section_id: seed.section.id, course_id: seed.course.id, title: 'Dire Awa', position: 20, kind: 'pronunciation' })
        .select('id')
        .single(),
      'create pronunciation lesson',
    )
    lessonId = lesson.id
  })

  it('refuses a client-written completion for a pronunciation lesson', async () => {
    const { error } = await learner.client
      .from('lesson_progress')
      .upsert({ user_id: learner.id, lesson_id: lessonId, progress_percent: 100, completed_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })
    expect(error).not.toBeNull()
    expect(await progressRow()).toHaveLength(0)
  })

  let submissionId: string
  it('lets the learner submit a recording path, forcing status to submitted', async () => {
    const sub = must(
      await learner.client
        .from('submissions')
        .insert({ lesson_id: lessonId, user_id: learner.id, audio_path: `${learner.id}/${lessonId}/1.webm`, status: 'validated' })
        .select('id, status')
        .single(),
      'submit recording',
    )
    submissionId = sub.id
    expect(sub.status).toBe('submitted')
    expect(await progressRow()).toHaveLength(0)
  })

  it('does not let the learner validate their own recording', async () => {
    await learner.client.from('submissions').update({ status: 'validated' }).eq('id', submissionId)
    const { data } = await admin.from('submissions').select('status').eq('id', submissionId).single()
    expect(data?.status).toBe('submitted')
    expect(await progressRow()).toHaveLength(0)
  })

  it('completes the lesson when the teacher validates', async () => {
    must(
      await teacher.client
        .from('submissions')
        .update({ status: 'validated', teacher_feedback: 'Très bien', reviewed_at: new Date().toISOString() })
        .eq('id', submissionId)
        .select('id')
        .single(),
      'teacher validates',
    )
    const rows = await progressRow()
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].progress_percent)).toBe(100)
    expect(rows[0].completed_at).not.toBeNull()
  })

  it('freezes a validated submission for the learner', async () => {
    const { data } = await learner.client
      .from('submissions')
      .update({ audio_path: `${learner.id}/${lessonId}/2.webm` })
      .eq('id', submissionId)
      .select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('does not let the learner delete their validated progress', async () => {
    await learner.client.from('lesson_progress').delete().eq('user_id', learner.id).eq('lesson_id', lessonId)
    expect(await progressRow()).toHaveLength(1)
  })

  it('revokes completion when the teacher reverses the decision', async () => {
    must(
      await teacher.client
        .from('submissions')
        .update({ status: 'needs_retry', teacher_feedback: 'Reprenez la voyelle finale' })
        .eq('id', submissionId)
        .select('id')
        .single(),
      'teacher reverses',
    )
    expect(await progressRow()).toHaveLength(0)
  })

  it('lets the learner re-record after needs_retry, resetting review fields', async () => {
    const { data, error } = await learner.client
      .from('submissions')
      .update({ audio_path: `${learner.id}/${lessonId}/3.webm` })
      .eq('id', submissionId)
      .select('status, teacher_feedback, grade, reviewed_at')
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'submitted', teacher_feedback: null, grade: null, reviewed_at: null })
  })

  it('still lets the teacher delete a lesson that has submissions and progress', async () => {
    must(
      await teacher.client
        .from('submissions')
        .update({ status: 'validated', teacher_feedback: 'OK' })
        .eq('id', submissionId)
        .select('id')
        .single(),
      're-validate',
    )
    expect(await progressRow()).toHaveLength(1)
    const { error } = await teacher.client.from('lessons').delete().eq('id', lessonId)
    expect(error).toBeNull()
    expect(await progressRow()).toHaveLength(0)
  })
})

describe('pronunciation-submissions bucket', () => {
  it('exists, is private and accepts webm, mp4 and ogg audio', async () => {
    const { data, error } = await admin.storage.getBucket('pronunciation-submissions')
    expect(error).toBeNull()
    expect(data?.public).toBe(false)
    expect(data?.allowed_mime_types).toEqual(expect.arrayContaining(['audio/webm', 'audio/mp4', 'audio/ogg']))
  })
})
```

- [ ] **Step 2: Run to verify it fails** — start local Supabase (`docker ps` first), then `cd web && npm run test:rls -- __tests__/rls/pronunciation.test.ts` → FAIL (`pronunciation` violates `lessons_kind_check`).

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261004000000_pronunciation_exercises.sql`

```sql
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
```

- [ ] **Step 4: Apply and run** — `npx supabase migration up` (local), then `cd web && npm run test:rls -- __tests__/rls/pronunciation.test.ts` → PASS. Also re-run `__tests__/rls/phase4-assignments.test.ts`, `course-review-hardening.test.ts` and `progress-reports.test.ts` (one file per run) to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261004000000_pronunciation_exercises.sql web/__tests__/rls/pronunciation.test.ts
git commit -m "feat(db): pronunciation lessons with teacher-validated completion and recording bucket"
```

---

### Task 4: Mutations and queries for recordings and review

**Files:**
- Modify: `web/lib/courses/mutations.ts` (after `submitAssignment`, ~line 515), `web/lib/courses/queries.ts` (assignment section, ~line 446-513)
- Modify: `web/app/api/courses/submissions/notify/route.ts:28`
- Test: `web/__tests__/course-mutations.test.ts` (add describe blocks)

**Interfaces:**
- Consumes: `buildRecordingPath`, `baseMimeType`, `extensionForMime`, `MAX_RECORDING_BYTES`, `PRONUNCIATION_BUCKET` (Task 2); `getAuthUser`, `ok`, `fail`, `done` (already in `mutations.ts`).
- Produces:
  - `submitPronunciation(client: SupabaseClient, lessonId: string, blob: Blob): Promise<Result<Submission>>`
  - `reviewPronunciation(client: SupabaseClient, submissionId: string, outcome: 'validated' | 'needs_retry', feedback: string): Promise<Result<null>>`
  - `getPronunciationAudioUrl(client: SupabaseClient, audioPath: string | null): Promise<string | null>` (queries)
  - `getPendingReviewsForTeacher` now returns `lesson.kind` and `audioUrl`.

- [ ] **Step 1: Write the failing tests** — append to `web/__tests__/course-mutations.test.ts` (extend the import with `reviewPronunciation, submitPronunciation`):

```ts
describe('submitPronunciation', () => {
  it('rejects recordings over the size cap before uploading', async () => {
    const { client } = fakeClient([])
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'audio/webm' })
    const res = await submitPronunciation(client, 'lesson-1', big)
    expect(res.error).toMatch(/trop volumineux/i)
  })

  it('rejects an empty recording', async () => {
    const { client } = fakeClient([])
    const res = await submitPronunciation(client, 'lesson-1', new Blob([], { type: 'audio/webm' }))
    expect(res.error).toMatch(/vide/i)
  })

  it('requires a signed-in user', async () => {
    const { client } = fakeClient([], null)
    const res = await submitPronunciation(client, 'lesson-1', new Blob(['x'], { type: 'audio/webm' }))
    expect(res.error).toMatch(/connectez-vous/i)
  })
})

describe('reviewPronunciation', () => {
  it('requires a comment so the learner knows what to work on', async () => {
    const { client } = fakeClient([])
    const res = await reviewPronunciation(client, 'sub-1', 'needs_retry', '   ')
    expect(res.error).toMatch(/commentaire/i)
  })

  it('requires a signed-in user', async () => {
    const { client } = fakeClient([], null)
    const res = await reviewPronunciation(client, 'sub-1', 'validated', 'Bien')
    expect(res.error).toMatch(/connectez-vous/i)
  })
})
```

- [ ] **Step 2: Run** — `cd web && npx vitest run __tests__/course-mutations.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement** in `mutations.ts` (add `import { MAX_RECORDING_BYTES, PRONUNCIATION_BUCKET, baseMimeType, buildRecordingPath, extensionForMime } from './pronunciation'`):

```ts
// ── Pronunciation exercises ────────────────────────────────────────────────

/**
 * Uploads the learner's recording and creates or replaces their submission.
 * Unlike a written assignment this does NOT mark the lesson complete: the
 * teacher's validation does (database trigger).
 */
export async function submitPronunciation(
  client: SupabaseClient,
  lessonId: string,
  blob: Blob,
): Promise<Result<Submission>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour envoyer votre enregistrement.')
  if (blob.size === 0) return fail('L’enregistrement est vide, veuillez recommencer.')
  if (blob.size > MAX_RECORDING_BYTES) return fail('Enregistrement trop volumineux (5 Mo maximum).')

  const { data: previous } = await client
    .from('submissions')
    .select('audio_path')
    .eq('lesson_id', lessonId)
    .eq('user_id', user.id)
    .maybeSingle()

  const path = buildRecordingPath(user.id, lessonId, Date.now(), extensionForMime(blob.type))
  const upload = await client.storage
    .from(PRONUNCIATION_BUCKET)
    .upload(path, blob, { contentType: baseMimeType(blob.type), upsert: false })
  if (upload.error) return fail(upload.error.message)

  const { data, error } = await client
    .from('submissions')
    .upsert(
      { lesson_id: lessonId, user_id: user.id, audio_path: path, status: 'submitted', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('*')
    .single()

  if (error || !data) {
    await client.storage.from(PRONUNCIATION_BUCKET).remove([path])
    return fail(error?.message ?? 'Erreur lors de l’envoi de l’enregistrement.')
  }

  // Best effort: the replaced recording is no longer referenced.
  const oldPath = (previous as { audio_path: string | null } | null)?.audio_path
  if (oldPath && oldPath !== path) {
    await client.storage.from(PRONUNCIATION_BUCKET).remove([oldPath])
  }
  return ok(data as Submission)
}

/** Teacher decision on a pronunciation recording. A comment is always required. */
export async function reviewPronunciation(
  client: SupabaseClient,
  submissionId: string,
  outcome: 'validated' | 'needs_retry',
  feedback: string,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour corriger cet enregistrement.')
  if (!feedback.trim()) return fail('Veuillez saisir un commentaire pour l’apprenant.')

  const now = new Date().toISOString()
  const { error } = await client
    .from('submissions')
    .update({ status: outcome, teacher_feedback: feedback.trim(), reviewed_at: now, updated_at: now })
    .eq('id', submissionId)
  if (error) return fail(error.message)

  void fetch('/api/courses/submissions/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId }),
  }).catch(() => null)

  return ok(null)
}
```

Check the exact `Submission` import already exists in `mutations.ts` (it is used by `submitAssignment`); reuse it.

In `queries.ts` add `import { PRONUNCIATION_BUCKET } from './pronunciation'` and:

```ts
/** Short-lived signed URL for a learner recording (learner, course owner and admins can sign). */
export async function getPronunciationAudioUrl(
  client: SupabaseClient,
  audioPath: string | null,
): Promise<string | null> {
  if (!audioPath) return null
  const { data, error } = await client.storage.from(PRONUNCIATION_BUCKET).createSignedUrl(audioPath, 3600)
  return error || !data ? null : data.signedUrl
}
```

In `getPendingReviewsForTeacher`, before the final `return submissions.map(...)`, sign all recording paths in one call and attach them:

```ts
  const audioPaths = submissions.map(s => s.audio_path).filter((p): p is string => Boolean(p))
  const signed = audioPaths.length
    ? await client.storage.from(PRONUNCIATION_BUCKET).createSignedUrls(audioPaths, 3600)
    : { data: [] as { path: string | null; signedUrl: string }[] }
  const urlByPath = new Map((signed.data ?? []).map(entry => [entry.path, entry.signedUrl]))
```

and add `audioUrl: sub.audio_path ? (urlByPath.get(sub.audio_path) ?? null) : null,` to the returned item object.

In `notify/route.ts:28` replace `sub.status !== 'reviewed'` with `!['reviewed', 'validated', 'needs_retry'].includes(sub.status)`.

- [ ] **Step 4: Run** — `cd web && npx vitest run __tests__/course-mutations.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/courses web/app/api/courses/submissions/notify/route.ts web/__tests__/course-mutations.test.ts
git commit -m "feat(courses): submit and review pronunciation recordings"
```

---

### Task 5: Recorder component and learner exercise

**Files:**
- Create: `web/components/courses/PronunciationRecorder.tsx`, `web/components/courses/PronunciationExercise.tsx`
- Modify: `web/app/courses/[slug]/learn/[lessonId]/page.tsx:105-110, 205-241`

**Interfaces:**
- Consumes: `pickRecordingMimeType`, `MAX_RECORDING_SECONDS`, `pronunciationStatusLabel` (Task 2); `submitPronunciation` (Task 4); `getPronunciationAudioUrl`, `getSubmissionForLesson` (queries).
- Produces: `<PronunciationRecorder disabled? sending? onSend={(blob: Blob) => void} />`; `<PronunciationExercise lessonId initialSubmission initialAudioUrl readOnly />`.

- [ ] **Step 1: Recorder** — `web/components/courses/PronunciationRecorder.tsx`

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, RotateCcw, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_RECORDING_SECONDS, pickRecordingMimeType } from '@/lib/courses/pronunciation'

interface Props {
  disabled?: boolean
  sending?: boolean
  onSend: (blob: Blob) => void
}

export function PronunciationRecorder({ disabled = false, sending = false, onSend }: Props) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function cleanupStream() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      cleanupStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function start() {
    setError(null)
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Votre navigateur ne permet pas l’enregistrement audio. Essayez Chrome, Firefox ou Safari récent.')
      return
    }
    const mimeType = pickRecordingMimeType(m => MediaRecorder.isTypeSupported(m))
    if (!mimeType) {
      setError('Aucun format d’enregistrement audio n’est pris en charge par votre navigateur.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const chunks: Blob[] = []
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        const recorded = new Blob(chunks, { type: mimeType })
        cleanupStream()
        setBlob(recorded)
        setPreviewUrl(URL.createObjectURL(recorded))
        setPhase('recorded')
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      setPhase('recording')
      timerRef.current = setInterval(() => {
        setSeconds(prev => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) recorderRef.current?.stop()
          return prev + 1
        })
      }, 1000)
    } catch {
      cleanupStream()
      setError('Accès au microphone refusé. Autorisez le micro dans votre navigateur puis réessayez.')
    }
  }

  function stop() {
    recorderRef.current?.stop()
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setBlob(null)
    setSeconds(0)
    setPhase('idle')
  }

  return (
    <div className="space-y-4">
      {phase === 'idle' && (
        <Button type="button" onClick={start} disabled={disabled}>
          <Mic className="w-4 h-4 mr-2" />
          Enregistrer ma prononciation
        </Button>
      )}

      {phase === 'recording' && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-destructive" role="status">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
            Enregistrement… {seconds}s / {MAX_RECORDING_SECONDS}s
          </span>
          <Button type="button" variant="outline" onClick={stop}>
            <Square className="w-4 h-4 mr-2" />
            Arrêter
          </Button>
        </div>
      )}

      {phase === 'recorded' && previewUrl && blob && (
        <div className="space-y-3">
          <audio controls src={previewUrl} className="w-full" />
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => onSend(blob)} disabled={disabled || sending}>
              <Send className="w-4 h-4 mr-2" />
              {sending ? 'Envoi…' : 'Envoyer à l’enseignant'}
            </Button>
            <Button type="button" variant="outline" onClick={reset} disabled={sending}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Recommencer
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Learner exercise** — `web/components/courses/PronunciationExercise.tsx`

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Mic, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { submitPronunciation } from '@/lib/courses/mutations'
import { pronunciationStatusLabel } from '@/lib/courses/pronunciation'
import type { Submission } from '@/lib/courses/assignment'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'

interface Props {
  lessonId: string
  initialSubmission: Submission | null
  initialAudioUrl: string | null
  readOnly?: boolean
}

export function PronunciationExercise({ lessonId, initialSubmission, initialAudioUrl, readOnly = false }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submission = initialSubmission

  const canRecord = !readOnly && (!submission || submission.status === 'submitted' || submission.status === 'needs_retry')

  async function handleSend(blob: Blob) {
    setSending(true)
    setError(null)
    const res = await submitPronunciation(supabase, lessonId, blob)
    setSending(false)
    if (res.error) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
          <Mic className="w-5 h-5 text-primary" />
          Votre prononciation
        </h3>
        {submission && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted flex items-center gap-1.5">
            {submission.status === 'validated' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : submission.status === 'needs_retry' ? (
              <RotateCcw className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            )}
            {pronunciationStatusLabel(submission.status)}
          </span>
        )}
      </div>

      {submission?.teacher_feedback && (
        <div className="bg-muted/60 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Commentaire de l’enseignant</p>
          <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
        </div>
      )}

      {initialAudioUrl && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Votre dernier enregistrement :</p>
          <audio controls src={initialAudioUrl} className="w-full" />
        </div>
      )}

      {submission?.status === 'submitted' && (
        <p className="text-sm text-muted-foreground">
          Votre enseignant n’a pas encore écouté cet enregistrement. Vous pouvez le remplacer en en envoyant un nouveau.
        </p>
      )}

      {canRecord && <PronunciationRecorder sending={sending} onSend={handleSend} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Learn page.** In `web/app/courses/[slug]/learn/[lessonId]/page.tsx`:
  - import `PronunciationExercise`, `getPronunciationAudioUrl`;
  - replace line 108 with:

```tsx
  const hasSubmission = lesson.kind === 'assignment' || lesson.kind === 'pronunciation'
  const submission = user && hasSubmission ? await getSubmissionForLesson(supabase, lesson.id, user.id) : null
  const recordingUrl =
    lesson.kind === 'pronunciation' ? await getPronunciationAudioUrl(supabase, submission?.audio_path ?? null) : null
```

  - after the `fill_in_blank` block (line ~216) add. The model audio player deliberately gets **no** `lessonId` so it does not try to write progress:

```tsx
        {lesson.kind === 'pronunciation' && (
          <div className="space-y-6">
            {signedAudioUrl && <AudioPlayer src={signedAudioUrl} title="Écoutez le modèle" />}
            {body.trim() && <LessonMarkdown source={body} />}
            <PronunciationExercise
              lessonId={lesson.id}
              initialSubmission={submission}
              initialAudioUrl={recordingUrl}
              readOnly={!user}
            />
          </div>
        )}
```

  - in the footer (lines ~219-233) the manual button must not appear for this kind: change `{user ? (<CompleteButton .../>) : (<Link .../>)}` so that the first branch is `{user && lesson.kind === 'pronunciation' ? (<span className="text-sm text-muted-foreground">{completed.includes(lesson.id) ? 'Leçon validée par votre enseignant ✓' : 'Cette leçon sera terminée quand votre enseignant aura validé votre prononciation.'}</span>) : user ? (<CompleteButton ... />) : (<Link ... />)}` (keep the existing `CompleteButton` and `Link` props unchanged).

- [ ] **Step 4: Verify** — `cd web && npx tsc --noEmit && npm run lint` (if configured) → no errors. Manual check is in Task 7.

- [ ] **Step 5: Commit**

```bash
git add web/components/courses/PronunciationRecorder.tsx web/components/courses/PronunciationExercise.tsx "web/app/courses/[slug]/learn/[lessonId]/page.tsx"
git commit -m "feat(courses): learner pronunciation recorder and exercise page"
```

---

### Task 6: Teacher side — authoring and review card

**Files:**
- Create: `web/components/courses/PronunciationReviewCard.tsx`
- Modify: `web/components/courses/ReviewQueue.tsx:24-28, 75, 84, 103-104`, `web/components/courses/LessonEditor.tsx:121-122, 142, 191-199, 220-230`

**Interfaces:**
- Consumes: `reviewPronunciation` (Task 4), `PendingReviewItem` with `audioUrl` and `lesson.kind` (Tasks 2, 4), `isPendingSubmission` (Task 2).
- Produces: `<PronunciationReviewCard item={PendingReviewItem} onReviewed={(submissionId: string, status: 'validated' | 'needs_retry', feedback: string) => void} />`

- [ ] **Step 1: Review card** — `web/components/courses/PronunciationReviewCard.tsx`

```tsx
'use client'
import { useState } from 'react'
import { CheckCircle2, Clock, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { reviewPronunciation } from '@/lib/courses/mutations'
import { pronunciationStatusLabel } from '@/lib/courses/pronunciation'
import type { PendingReviewItem } from '@/lib/courses/assignment'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  item: PendingReviewItem
  onReviewed: (submissionId: string, status: 'validated' | 'needs_retry', feedback: string) => void
}

export function PronunciationReviewCard({ item, onReviewed }: Props) {
  const { submission, lesson, course, learner, audioUrl } = item
  const [supabase] = useState(() => createClient())
  const [feedback, setFeedback] = useState(submission.teacher_feedback ?? '')
  const [editing, setEditing] = useState(submission.status === 'submitted')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(outcome: 'validated' | 'needs_retry') {
    setBusy(true)
    setError(null)
    const res = await reviewPronunciation(supabase, submission.id, outcome, feedback)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setEditing(false)
    onReviewed(submission.id, outcome, feedback.trim())
  }

  return (
    <div className="border border-border rounded-xl p-5 bg-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <span className="text-xs text-muted-foreground">{course.title}</span>
          <h4 className="font-semibold text-base">{lesson.title}</h4>
          <p className="text-xs text-muted-foreground">Par : {learner.full_name}</p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted flex items-center gap-1">
          {submission.status === 'validated' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : submission.status === 'needs_retry' ? (
            <RotateCcw className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          )}
          {pronunciationStatusLabel(submission.status)}
        </span>
      </div>

      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full" />
      ) : (
        <p className="text-sm text-muted-foreground">Enregistrement indisponible.</p>
      )}

      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            rows={3}
            placeholder="Commentaire pour l’apprenant (obligatoire) : ce qui est bien, ce qu’il faut corriger…"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => decide('validated')} disabled={busy || !feedback.trim()}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Valider
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide('needs_retry')} disabled={busy || !feedback.trim()}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              À refaire
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted/40 p-4 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Votre commentaire</span>
            <button type="button" className="underline" onClick={() => setEditing(true)}>
              Modifier la décision
            </button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire into `ReviewQueue.tsx`.**
  - add imports: `import { isPendingSubmission } from '@/lib/courses/assignment'` (merge with the existing type import) and `import { PronunciationReviewCard } from '@/components/courses/PronunciationReviewCard'`;
  - replace the filter (lines 24-28) with:

```tsx
  const filtered = items.filter(item => {
    if (filter === 'pending') return isPendingSubmission(item.submission.status)
    if (filter === 'reviewed') return !isPendingSubmission(item.submission.status)
    return true
  })
```

  - replace `items.filter(i => i.submission.status === 'submitted').length` (line 75) with `items.filter(i => isPendingSubmission(i.submission.status)).length` and `items.filter(i => i.submission.status === 'reviewed').length` (line 84) with `items.filter(i => !isPendingSubmission(i.submission.status)).length`;
  - add a parent updater and use the card. Add above `handleSaveReview`:

```tsx
  function handlePronunciationReviewed(submissionId: string, status: 'validated' | 'needs_retry', feedback: string) {
    setItems(prev =>
      prev.map(item =>
        item.submission.id === submissionId
          ? {
              ...item,
              submission: { ...item.submission, status, teacher_feedback: feedback, reviewed_at: new Date().toISOString() },
            }
          : item,
      ),
    )
  }
```

  - in the `filtered.map(...)` change the callback to receive the whole item and branch first:

```tsx
          {filtered.map(item => {
            if (item.lesson.kind === 'pronunciation') {
              return (
                <PronunciationReviewCard key={item.submission.id} item={item} onReviewed={handlePronunciationReviewed} />
              )
            }
            const { submission, lesson, course, learner } = item
            return (
              <div key={submission.id} className="border border-border rounded-xl p-5 bg-card space-y-4">
                {/* ...the existing card body, unchanged... */}
              </div>
            )
          })}
```

  (Keep the existing JSX of the card body exactly as it is, only wrapped by the new `return (...)`; close with `)})}` instead of `))}`.)

- [ ] **Step 3: Wire into `LessonEditor.tsx`.**
  - add after the `fill_in_blank` option (line 122): `<option value="pronunciation">Prononciation (l’apprenant s’enregistre, vous validez)</option>`;
  - change line 142 `{kind === 'audio' && (` to `{(kind === 'audio' || kind === 'pronunciation') && (` and its heading to `{kind === 'pronunciation' ? 'Audio modèle (la prononciation à imiter)' : 'Enregistrement audio de la leçon'}`;
  - in the body label ternary (line 191-199) add before the final `'Contenu du cours (Markdown)'`: `: kind === 'pronunciation' ? 'Consigne et phrase à prononcer (Markdown)'`;
  - in the placeholder ternary (220-229) add before the final default: `: kind === 'pronunciation' ? 'Ex: Répétez la phrase : **Awa ɛ wa.** Écoutez le modèle puis enregistrez-vous.'`.

- [ ] **Step 4: Verify** — `cd web && npx tsc --noEmit && npm run test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/courses
git commit -m "feat(courses): teacher pronunciation review card and lesson authoring"
```

---

### Task 7: End-to-end verification of the pronunciation flow

**Files:** none (verification only; add a walkthrough doc at the end).

- [ ] **Step 1: Run all suites** — `cd web && npm run test && npx tsc --noEmit`, then each RLS file for the touched areas one at a time: `pronunciation`, `phase4-assignments`, `course-review-hardening`, `progress-reports`, `phase2-audio-quiz` → all PASS.

- [ ] **Step 2: Manual run in a browser (Chrome, plus Safari/iOS if available)** using `superpowers:verification-before-completion` discipline — start the app from a short-path worktree (`npm run dev`), local Supabase running:
  1. As teacher: create a course, add a lesson with format **Prononciation**, upload a model audio, write the phrase, publish.
  2. As learner: enroll, open the lesson → model audio plays, **no "Marquer comme terminée" button**, recorder works, preview plays, send → status "En attente de validation".
  3. As learner: record again before review → replaces the recording (old file removed from the bucket).
  4. As teacher: `/teach/reviews` → card plays the audio → "À refaire" with a comment → learner sees "À refaire" + comment, can re-record.
  5. Teacher "Valider" → learner outline shows the lesson complete (100%), course percentage updated, email sent (or skipped if no Resend key).
  6. Teacher "Modifier la décision" → "À refaire" → learner's lesson no longer complete.
  7. Deny microphone permission → French error, no crash.

- [ ] **Step 3: Record the results** in `docs/superpowers/walkthroughs/2026-10-04-pronunciation-exercises.md` (what was verified, what was not — e.g. Safari untested if so) and commit.

---

### Task 8: Pure course-stats aggregation

**Files:**
- Create: `web/lib/courses/stats.ts`
- Test: `web/__tests__/course-stats.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ProgressRow {
  user_id: string
  full_name: string | null
  enrolled_at: string
  lesson_id: string | null
  progress_percent: number | string | null
  score: number | string | null
  completed_at: string | null
}
export interface StatsLesson { id: string; title: string; kind: string }
export interface LearnerSummary { userId: string; name: string; enrolledAt: string; completedLessons: number; percent: number; averageScore: number | null }
export interface LessonStat { lessonId: string; title: string; kind: string; completedCount: number; completionRate: number; averageScore: number | null }
export interface CourseStats { enrolledCount: number; averageProgress: number; fullyCompletedCount: number; learners: LearnerSummary[]; lessons: LessonStat[] }
export function summarizeCourseStats(rows: ProgressRow[], lessons: StatsLesson[]): CourseStats
```

- [ ] **Step 1: Write the failing tests** — `web/__tests__/course-stats.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { summarizeCourseStats, type ProgressRow } from '../lib/courses/stats'

const lessons = [
  { id: 'l1', title: 'Salutations', kind: 'text' },
  { id: 'l2', title: 'Quiz', kind: 'quiz' },
]

const row = (over: Partial<ProgressRow>): ProgressRow => ({
  user_id: 'u1',
  full_name: 'Awa',
  enrolled_at: '2026-10-01T00:00:00Z',
  lesson_id: null,
  progress_percent: null,
  score: null,
  completed_at: null,
  ...over,
})

describe('summarizeCourseStats', () => {
  it('returns zeros, not NaN, with no learners', () => {
    expect(summarizeCourseStats([], lessons)).toEqual({
      enrolledCount: 0,
      averageProgress: 0,
      fullyCompletedCount: 0,
      learners: [],
      lessons: [
        { lessonId: 'l1', title: 'Salutations', kind: 'text', completedCount: 0, completionRate: 0, averageScore: null },
        { lessonId: 'l2', title: 'Quiz', kind: 'quiz', completedCount: 0, completionRate: 0, averageScore: null },
      ],
    })
  })

  it('handles a course with no lessons', () => {
    const stats = summarizeCourseStats([row({})], [])
    expect(stats.enrolledCount).toBe(1)
    expect(stats.learners[0].percent).toBe(0)
    expect(stats.averageProgress).toBe(0)
    expect(stats.lessons).toEqual([])
  })

  it('counts an enrolled learner with no progress', () => {
    const stats = summarizeCourseStats([row({})], lessons)
    expect(stats.enrolledCount).toBe(1)
    expect(stats.learners[0]).toMatchObject({ completedLessons: 0, percent: 0, averageScore: null })
  })

  it('aggregates partial progress, completion and scores per learner and per lesson', () => {
    const rows = [
      row({ user_id: 'u1', lesson_id: 'l1', progress_percent: 100, completed_at: '2026-10-02T00:00:00Z' }),
      row({ user_id: 'u1', lesson_id: 'l2', progress_percent: 100, score: 80, completed_at: '2026-10-02T00:00:00Z' }),
      row({ user_id: 'u2', full_name: 'Koffi', lesson_id: 'l1', progress_percent: 50 }),
      row({ user_id: 'u3', full_name: null }),
    ]
    const stats = summarizeCourseStats(rows, lessons)
    expect(stats.enrolledCount).toBe(3)
    expect(stats.fullyCompletedCount).toBe(1)

    const byId = Object.fromEntries(stats.learners.map(l => [l.userId, l]))
    expect(byId.u1).toMatchObject({ completedLessons: 2, percent: 100, averageScore: 80 })
    expect(byId.u2).toMatchObject({ completedLessons: 0, percent: 25 })
    expect(byId.u3.name).toBe('Apprenant')
    expect(stats.averageProgress).toBe(42) // (100 + 25 + 0) / 3

    const l1 = stats.lessons.find(l => l.lessonId === 'l1')!
    expect(l1).toMatchObject({ completedCount: 1, completionRate: 33, averageScore: null })
    const l2 = stats.lessons.find(l => l.lessonId === 'l2')!
    expect(l2).toMatchObject({ completedCount: 1, completionRate: 33, averageScore: 80 })
  })

  it('sorts learners who need attention first (lowest progress)', () => {
    const rows = [
      row({ user_id: 'a', full_name: 'A', lesson_id: 'l1', progress_percent: 100, completed_at: 'x' }),
      row({ user_id: 'b', full_name: 'B' }),
    ]
    expect(summarizeCourseStats(rows, lessons).learners.map(l => l.userId)).toEqual(['b', 'a'])
  })

  it('ignores progress rows for lessons that are no longer in the course', () => {
    const rows = [row({ lesson_id: 'deleted', progress_percent: 100, completed_at: 'x' })]
    expect(summarizeCourseStats(rows, lessons).learners[0].percent).toBe(0)
  })

  it('accepts numerics serialised as strings', () => {
    const rows = [row({ lesson_id: 'l2', progress_percent: '100', score: '72.5', completed_at: 'x' })]
    const stats = summarizeCourseStats(rows, lessons)
    expect(stats.learners[0].averageScore).toBe(73)
  })
})
```

- [ ] **Step 2: Run** — `cd web && npx vitest run __tests__/course-stats.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `web/lib/courses/stats.ts`

```ts
export interface ProgressRow {
  user_id: string
  full_name: string | null
  enrolled_at: string
  lesson_id: string | null
  progress_percent: number | string | null
  score: number | string | null
  completed_at: string | null
}

export interface StatsLesson {
  id: string
  title: string
  kind: string
}

export interface LearnerSummary {
  userId: string
  name: string
  enrolledAt: string
  completedLessons: number
  percent: number
  averageScore: number | null
}

export interface LessonStat {
  lessonId: string
  title: string
  kind: string
  completedCount: number
  completionRate: number
  averageScore: number | null
}

export interface CourseStats {
  enrolledCount: number
  averageProgress: number
  fullyCompletedCount: number
  learners: LearnerSummary[]
  lessons: LessonStat[]
}

function num(value: number | string | null): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
}

/** Per-learner and per-lesson aggregates from the flat rows of `course_progress_rows`. */
export function summarizeCourseStats(rows: ProgressRow[], lessons: StatsLesson[]): CourseStats {
  const lessonIds = new Set(lessons.map(l => l.id))

  const learnersById = new Map<string, { name: string; enrolledAt: string; byLesson: Map<string, { percent: number; score: number | null; done: boolean }> }>()
  for (const r of rows) {
    let learner = learnersById.get(r.user_id)
    if (!learner) {
      learner = { name: r.full_name?.trim() || 'Apprenant', enrolledAt: r.enrolled_at, byLesson: new Map() }
      learnersById.set(r.user_id, learner)
    }
    if (r.lesson_id && lessonIds.has(r.lesson_id)) {
      const percent = Math.max(0, Math.min(100, num(r.progress_percent) ?? (r.completed_at ? 100 : 0)))
      learner.byLesson.set(r.lesson_id, {
        percent,
        score: num(r.score),
        done: percent >= 100 || Boolean(r.completed_at),
      })
    }
  }

  const learners: LearnerSummary[] = [...learnersById.entries()].map(([userId, l]) => {
    const entries = [...l.byLesson.values()]
    const percentSum = entries.reduce((sum, e) => sum + e.percent, 0)
    return {
      userId,
      name: l.name,
      enrolledAt: l.enrolledAt,
      completedLessons: entries.filter(e => e.done).length,
      percent: lessons.length === 0 ? 0 : Math.round(percentSum / lessons.length),
      averageScore: mean(entries.flatMap(e => (e.score === null ? [] : [e.score]))),
    }
  })
  learners.sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name, 'fr'))

  const enrolledCount = learners.length
  const lessonStats: LessonStat[] = lessons.map(lesson => {
    const entries = [...learnersById.values()].flatMap(l => {
      const e = l.byLesson.get(lesson.id)
      return e ? [e] : []
    })
    const completedCount = entries.filter(e => e.done).length
    return {
      lessonId: lesson.id,
      title: lesson.title,
      kind: lesson.kind,
      completedCount,
      completionRate: enrolledCount === 0 ? 0 : Math.round((completedCount / enrolledCount) * 100),
      averageScore: mean(entries.flatMap(e => (e.score === null ? [] : [e.score]))),
    }
  })

  return {
    enrolledCount,
    averageProgress: enrolledCount === 0 ? 0 : Math.round(learners.reduce((sum, l) => sum + l.percent, 0) / enrolledCount),
    fullyCompletedCount: lessons.length === 0 ? 0 : learners.filter(l => l.completedLessons === lessons.length).length,
    learners,
    lessons: lessonStats,
  }
}
```

- [ ] **Step 4: Run** — same command → PASS. (If the `42` average assertion fails because of rounding, recompute: learners are 100, 25, 0 → 125/3 = 41.67 → 42.)

- [ ] **Step 5: Commit**

```bash
git add web/lib/courses/stats.ts web/__tests__/course-stats.test.ts
git commit -m "feat(courses): pure course statistics aggregation"
```

---

### Task 9: Progress RPC for course owners

**Files:**
- Create: `supabase/migrations/20261004000001_course_progress_rows.sql`
- Test: `web/__tests__/rls/course-progress-rows.test.ts`
- Modify: `web/lib/courses/queries.ts` (add `getCourseProgressRows`)

**Interfaces:**
- Consumes: `ProgressRow` (Task 8).
- Produces: SQL `course_progress_rows(p_course_id uuid)`; TS `getCourseProgressRows(client: SupabaseClient, courseId: string): Promise<ProgressRow[]>`.

- [ ] **Step 1: Write the failing RLS test** — `web/__tests__/rls/course-progress-rows.test.ts`

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, must, seedCourse, type Seed, type TestUser } from './helpers'

describe('course_progress_rows RPC', () => {
  let teacher: TestUser
  let learner: TestUser
  let other: TestUser
  let boss: TestUser
  let seed: Seed

  beforeAll(async () => {
    ;[teacher, learner, other, boss] = await Promise.all([
      createUser('cp-teacher'),
      createUser('cp-learner'),
      createUser('cp-other'),
      createUser('cp-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)
    must(
      await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id }).select(),
      'enroll',
    )
    must(
      await learner.client
        .from('lesson_progress')
        .upsert({ user_id: learner.id, lesson_id: seed.preview.id, progress_percent: 100, completed_at: new Date().toISOString() }, { onConflict: 'user_id,lesson_id' })
        .select(),
      'progress',
    )
    // other user: enrolled in a different course owned by someone else, must never leak
    const otherSeed = await seedCourse(other.id)
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: otherSeed.course.id })
  })

  it('returns the enrolled learners and their progress to the course owner', async () => {
    const { data, error } = await teacher.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ user_id: learner.id, lesson_id: seed.preview.id })
    expect(Number(data[0].progress_percent)).toBe(100)
  })

  it('returns a row with no lesson for an enrolled learner without progress', async () => {
    const fresh = await createUser('cp-fresh')
    await fresh.client.from('enrollments').insert({ user_id: fresh.id, course_id: seed.course.id })
    const { data } = await teacher.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    const row = (data as { user_id: string; lesson_id: string | null }[]).find(r => r.user_id === fresh.id)
    expect(row).toBeDefined()
    expect(row?.lesson_id).toBeNull()
  })

  it('works for admins', async () => {
    const { error } = await boss.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(error).toBeNull()
  })

  it('refuses a learner, another teacher and anonymous callers', async () => {
    const asLearner = await learner.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(asLearner.error).not.toBeNull()
    expect(asLearner.data).toBeNull()

    const asOther = await other.client.rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(asOther.error).not.toBeNull()

    const { anonClient } = await import('./helpers')
    const asAnon = await anonClient().rpc('course_progress_rows', { p_course_id: seed.course.id })
    expect(asAnon.error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run** — `cd web && npm run test:rls -- __tests__/rls/course-progress-rows.test.ts` → FAIL (function does not exist).

- [ ] **Step 3: Migration** — `supabase/migrations/20261004000001_course_progress_rows.sql`

```sql
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
    select e.user_id, p.full_name, e.created_at, lp.lesson_id, lp.progress_percent, lp.score, lp.completed_at
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
```

- [ ] **Step 4: Query helper.** In `queries.ts` add `import type { ProgressRow } from './stats'` and:

```ts
/** Learner progress for a course the caller owns (or any course, for admins). Empty on error. */
export async function getCourseProgressRows(client: SupabaseClient, courseId: string): Promise<ProgressRow[]> {
  const { data } = await client.rpc('course_progress_rows', { p_course_id: courseId })
  return (data ?? []) as ProgressRow[]
}
```

- [ ] **Step 5: Run** — `npx supabase migration up`, then the RLS test → PASS; `cd web && npx tsc --noEmit`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261004000001_course_progress_rows.sql web/__tests__/rls/course-progress-rows.test.ts web/lib/courses/queries.ts
git commit -m "feat(db): course_progress_rows RPC for course owners"
```

---

### Task 10: Teacher statistics panel

**Files:**
- Create: `web/components/courses/CourseStatsPanel.tsx`
- Modify: `web/app/teach/[courseId]/page.tsx:8-9, 28-43`

**Interfaces:**
- Consumes: `CourseStats` (Task 8), `getCourseProgressRows` (Task 9), `KIND_LABELS`, `flattenLessons`.
- Produces: `<CourseStatsPanel stats={CourseStats} />` (server component, no state).

- [ ] **Step 1: Panel** — `web/components/courses/CourseStatsPanel.tsx`

```tsx
import { KIND_LABELS } from '@/lib/courses/labels'
import type { LessonKind } from '@/lib/courses/types'
import type { CourseStats } from '@/lib/courses/stats'

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-bold">{value}</p>
    </div>
  )
}

export function CourseStatsPanel({ stats }: { stats: CourseStats }) {
  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-6" aria-labelledby="course-stats-title">
      <h2 id="course-stats-title" className="font-heading font-bold text-base">
        Suivi des apprenants
      </h2>

      {stats.enrolledCount === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun apprenant inscrit pour l’instant.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Tile label="Inscrits" value={String(stats.enrolledCount)} />
            <Tile label="Progression moyenne" value={`${stats.averageProgress} %`} />
            <Tile label="Cours terminé" value={String(stats.fullyCompletedCount)} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Par leçon</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Leçon</th>
                    <th className="py-2 pr-3 font-medium">Terminée par</th>
                    <th className="py-2 font-medium">Score moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.lessons.map(lesson => (
                    <tr key={lesson.lessonId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">
                        {lesson.title}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {KIND_LABELS[lesson.kind as LessonKind] ?? lesson.kind}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {lesson.completedCount} / {stats.enrolledCount} ({lesson.completionRate} %)
                      </td>
                      <td className="py-2">{lesson.averageScore === null ? '—' : `${lesson.averageScore} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Par apprenant (les moins avancés d’abord)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Apprenant</th>
                    <th className="py-2 pr-3 font-medium">Progression</th>
                    <th className="py-2 pr-3 font-medium">Leçons terminées</th>
                    <th className="py-2 font-medium">Score moyen</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.learners.map(learner => (
                    <tr key={learner.userId} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3">{learner.name}</td>
                      <td className="py-2 pr-3">{learner.percent} %</td>
                      <td className="py-2 pr-3">{learner.completedLessons}</td>
                      <td className="py-2">{learner.averageScore === null ? '—' : `${learner.averageScore} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Wire into the builder page** — `web/app/teach/[courseId]/page.tsx`:
  - imports: `import { CourseStatsPanel } from '@/components/courses/CourseStatsPanel'`; extend the queries import with `getCourseProgressRows`; extend the outline import with `flattenLessons`; add `import { summarizeCourseStats } from '@/lib/courses/stats'`;
  - after `const outline = ...` (line 28) add:

```tsx
  const lessons = flattenLessons(outline)
  const stats = summarizeCourseStats(
    await getCourseProgressRows(supabase, course.id),
    lessons.map(l => ({ id: l.id, title: l.title, kind: l.kind })),
  )
```

  - render directly after `<CourseStatusPanel .../>` (line 43): `<CourseStatsPanel stats={stats} />`.

- [ ] **Step 3: Verify** — `cd web && npx tsc --noEmit && npm run test`. Manually (short-path worktree, `npm run dev`): as the teacher open `/teach/<courseId>` with (a) no enrollments → empty-state text; (b) two enrolled learners with different progress → tiles, per-lesson and per-learner tables, lowest progress first; (c) a pronunciation lesson validated → shows as completed in the per-lesson row. Open the same page as a non-owner → 404 (unchanged `notFound()`), and confirm via RPC that a learner cannot fetch the rows (Task 9 test).

- [ ] **Step 4: Commit**

```bash
git add web/components/courses/CourseStatsPanel.tsx "web/app/teach/[courseId]/page.tsx"
git commit -m "feat(courses): teacher progress and scores dashboard"
```

---

### Task 11: Rollout and walkthrough

**Files:**
- Create: `docs/superpowers/walkthroughs/2026-10-04-progress-scoring-and-pronunciation.md`

- [ ] **Step 1: Full local verification** — `cd web && npm run test && npx tsc --noEmit && npm run build`; RLS files one at a time: `pronunciation`, `course-progress-rows`, `phase4-assignments`, `course-review-hardening`, `progress-reports`, `phase2-audio-quiz`, `courses-core` → all PASS.

- [ ] **Step 2: Remote migrations (user action).** `20261004000000_pronunciation_exercises.sql` contains `drop policy` / `drop constraint`, which the Supabase MCP tool declines (same situation as `20260930000005_resources_community_model.sql`). Hand the file to the user to run in the Supabase SQL editor for project `agdqbzbjcxrzfhkvempe`, then apply `20261004000001_course_progress_rows.sql` (MCP `apply_migration` is fine for that one). After applying, verify remotely with read-only SQL: the bucket exists and is private; `select kind` constraint includes `pronunciation`; the three new triggers exist.

- [ ] **Step 3: Write the walkthrough** (what changed, how it was verified, what was not verified — e.g. Safari/iOS recording if untested, remote migration status) and commit.

```bash
git add docs/superpowers/walkthroughs/2026-10-04-progress-scoring-and-pronunciation.md
git commit -m "docs: walkthrough for pronunciation exercises and teacher progress dashboard"
```

---

## Self-Review Notes

- **Coverage:** evaluation items → Task 1 (FIB progress, thresholds, console.log), Tasks 2-7 (pronunciation: recording, bucket, teacher player, validated/needs_retry state, retry, completion gated by validation, dedicated kind), Tasks 8-10 (teacher visibility). Not in scope (called out, not planned): server-verified completion for media/text lessons, `quiz_attempts` history, assignment grade surfaced as lesson score, `saveLessonProgress` read-then-write race.
- **Decision made without asking (flag at review):** teachers see learner **names** (same data the review queue already shows); pronunciation has **no numeric grade**, only validated / needs-retry with a mandatory comment.
- **Known limitation:** resubmitting after `needs_retry` clears the previous teacher feedback (no attempt history).
- **Type consistency:** `SubmissionStatus`, `isPendingSubmission`, `PendingReviewItem.audioUrl`, `submitPronunciation`, `reviewPronunciation`, `getPronunciationAudioUrl`, `getCourseProgressRows`, `summarizeCourseStats`, `ProgressRow` are defined once (Tasks 2/4/8/9) and used with the same names later.
