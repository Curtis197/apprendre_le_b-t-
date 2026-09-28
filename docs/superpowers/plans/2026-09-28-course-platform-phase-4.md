# Phase 4: Answer Form & Teacher Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 4 of the Course Platform: Free-text and audio assignment submissions, learner submission form, teacher review queue (`/teach/reviews`), email notifications via Resend when feedback is posted, and local-first DB/RLS security testing.

**Architecture:**
- **Submission Flow:** Learner submits text or audio answer on an assignment lesson → Server records submission in `submissions` table and automatically marks the lesson complete in `lesson_progress` (so a busy teacher review queue never blocks learner progression).
- **Teacher Review Queue (`/teach/reviews`):** Course owner views submitted answers across their courses, reviews learner audio/text, enters feedback text and optional numeric grade (0–100), and submits the review.
- **Feedback Notification:** Upon review submission, the server sends an email to the learner via Resend ("Votre devoir a été corrigé").
- **Zero New Dependencies:** Reuses existing `resend`, `@supabase/ssr`, `lucide-react`, and standard Next.js 16 App Router components.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase SSR & RLS (Postgres 17), Resend, Vitest 4, Tailwind CSS 4.

**Spec:** [`docs/superpowers/specs/2026-09-25-course-platform-design.md`](file:///c:/Users/DELL%20LATITUDE%207480/traduction%20bété/docs/superpowers/specs/2026-09-25-course-platform-design.md) (Phase 4: Answer Form).

---

## Global Constraints

- **Zero Accidental Deletion Policy**: NEVER delete existing feature code, routes, or database columns.
- **Local-First Testing Protocol**:
  1. Write migration in `supabase/migrations/20260928000002_courses_phase4_assignments.sql`.
  2. Run `npx supabase migration up` on local Docker stack (`127.0.0.1:54322`).
  3. Execute `npm run test:rls` to verify RLS policies against local test actors.
  4. Only after local tests pass 100%, apply to remote Supabase via `supabase-mcp-server:apply_migration`.
- **Typographic Curly Apostrophes**: All French user-facing copy MUST use strict typographic apostrophes (`’`, `U+2019`).
- **Browser Floor**: iOS Safari >= 15.4 (`safari >= 15.4`).
- **Git Hygiene**: Atomic commits per task with explicit file paths and `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.

---

## File Structure & Responsibilities Table

| File Path | Single Responsibility |
|---|---|
| `supabase/migrations/20260928000002_courses_phase4_assignments.sql` | Phase 4 DB migration: `submissions` table, indexes, and RLS policies |
| `web/__tests__/rls/phase4-assignments.test.ts` | RLS integration test suite for assignment submissions and teacher review queue |
| `web/lib/courses/assignment.ts` | Pure assignment domain types, status helpers, and grade formatters |
| `web/__tests__/course-assignment.test.ts` | Unit tests for assignment domain logic and status helpers |
| `web/lib/courses/assignment-email.ts` | Resend email helper for teacher review feedback notifications |
| `web/lib/courses/queries.ts` | Server-side queries for `submissions` and teacher review queue |
| `web/lib/courses/mutations.ts` | Mutations for `submitAssignment` and `reviewSubmission` |
| `web/components/courses/AssignmentForm.tsx` | Learner assignment submission widget with text area, audio upload, and feedback display |
| `web/components/courses/ReviewQueue.tsx` | Teacher review queue component with filtering, feedback input, and grading |
| `web/app/teach/reviews/page.tsx` | Teacher review queue route pre-fetching pending/reviewed submissions |
| `web/components/courses/LessonEditor.tsx` | Updated lesson editor adding `assignment` format support |
| `web/app/courses/[slug]/learn/[lessonId]/page.tsx` | Updated learner page rendering `AssignmentForm` |
| `web/app/teach/page.tsx` | Updated teacher dashboard adding review queue link and pending counter |

---

### Task 1: Database Migration for Submissions Schema

**Files:**
- Create: `supabase/migrations/20260928000002_courses_phase4_assignments.sql`

**Interfaces:**
- Consumes: `lessons`, `courses`, `auth.users`, `can_access_lesson()`, `is_admin()`.
- Produces: `submissions` table with RLS policies.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260928000002_courses_phase4_assignments.sql`:

```sql
-- Course Platform, Phase 4: Free-text & audio assignments & teacher review queue.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Submissions Table ────────────────────────────────────────────────────
create table if not exists submissions (
  id               uuid primary key default gen_random_uuid(),
  lesson_id        uuid not null references lessons(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  answer_text      text check (answer_text is null or char_length(answer_text) <= 10000),
  audio_path       text check (audio_path is null or char_length(audio_path) <= 1000),
  status           text not null default 'submitted' check (status in ('submitted', 'reviewed')),
  teacher_feedback text check (teacher_feedback is null or char_length(teacher_feedback) <= 5000),
  grade            int check (grade is null or (grade >= 0 and grade <= 100)),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint submissions_user_lesson_unique unique (user_id, lesson_id),
  constraint submissions_has_content check (answer_text is not null or audio_path is not null)
);

create index if not exists submissions_lesson_idx on submissions (lesson_id);
create index if not exists submissions_user_idx on submissions (user_id);
create index if not exists submissions_status_idx on submissions (status);

alter table submissions enable row level security;

-- Learners can read their own submission; course owners & admins can read submissions for their courses.
create policy submissions_select on submissions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- Enrolled learners or preview users can insert their own submission if they can access the lesson.
create policy submissions_insert_own on submissions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and can_access_lesson(lesson_id)
  );

-- Learners can update their own unreviewed submission; course owners/admins can update any submission for their courses.
create policy submissions_update on submissions
  for update to authenticated
  using (
    (user_id = (select auth.uid()) and status = 'submitted')
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  )
  with check (
    (user_id = (select auth.uid()) and status = 'submitted')
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- Learners can delete their unreviewed submission; owners/admins can delete submissions for their courses.
create policy submissions_delete on submissions
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and status = 'submitted')
    or exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = submissions.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );
```

- [ ] **Step 2: Apply migration to local Docker stack**

Run from repo root:
```bash
npx supabase migration up
```
Expected: `Applying migration 20260928000002_courses_phase4_assignments.sql...` with exit code 0.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/20260928000002_courses_phase4_assignments.sql
git commit -m "feat(db): phase 4 submissions schema and RLS policies" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: RLS Test Suite for Assignments & Submissions

**Files:**
- Create: `web/__tests__/rls/phase4-assignments.test.ts`

**Interfaces:**
- Consumes: `admin`, `createUser`, `makeAdmin`, `seedCourse`, `must`, `TestUser`, `Seed`.
- Tests: Learner submission insert, self-read, outsider block, teacher review update, and grade enforcement.

- [ ] **Step 1: Write the RLS test file**

Create `web/__tests__/rls/phase4-assignments.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 4 assignments & submissions RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let assignmentLessonId: string
  let submissionId: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p4-teacher'),
      createUser('p4-learner'),
      createUser('p4-outsider'),
      createUser('p4-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Enroll learner
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })

    // Create an assignment lesson
    const lesson = must(
      await admin.from('lessons').insert({
        section_id: seed.section.id,
        course_id: seed.course.id,
        title: 'Devoir : Traduire une phrase',
        position: 4,
        kind: 'assignment',
        is_preview: false,
      }).select('id').single(),
      'create assignment lesson',
    )
    assignmentLessonId = lesson.id

    // Submit assignment as learner
    const sub = must(
      await learner.client.from('submissions').insert({
        lesson_id: assignmentLessonId,
        user_id: learner.id,
        answer_text: 'Voici ma réponse en bété.',
        status: 'submitted',
      }).select('id').single(),
      'submit assignment',
    )
    submissionId = sub.id
  })

  describe('submissions RLS visibility & mutations', () => {
    it('allows learner to read their own submission', async () => {
      const { data, error } = await learner.client
        .from('submissions')
        .select('answer_text, status')
        .eq('id', submissionId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].answer_text).toBe('Voici ma réponse en bété.')
    })

    it('denies outsider from reading learner submission', async () => {
      const { data } = await outsider.client
        .from('submissions')
        .select('id')
        .eq('id', submissionId)

      expect(data).toEqual([])
    })

    it('allows course teacher to read submissions for their course', async () => {
      const { data, error } = await teacher.client
        .from('submissions')
        .select('id, user_id, answer_text')
        .eq('id', submissionId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('allows course teacher to review submission and assign grade', async () => {
      const res = await teacher.client
        .from('submissions')
        .update({
          status: 'reviewed',
          teacher_feedback: 'Très bon travail !',
          grade: 95,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', submissionId)

      expect(res.error).toBeNull()

      const { data } = await learner.client
        .from('submissions')
        .select('status, teacher_feedback, grade')
        .eq('id', submissionId)
        .single()

      expect(data?.status).toBe('reviewed')
      expect(data?.teacher_feedback).toBe('Très bon travail !')
      expect(data?.grade).toBe(95)
    })
  })
})
```

- [ ] **Step 2: Run local RLS tests**

Run from `web/`:
```bash
npm run test:rls -- phase4-assignments
```
Expected: PASS with 0 failures.

- [ ] **Step 3: Commit RLS tests**

```bash
git add web/__tests__/rls/phase4-assignments.test.ts
git commit -m "test(rls): phase 4 assignments and submission review RLS tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Assignment Domain Library & Status Helpers

**Files:**
- Create: `web/lib/courses/assignment.ts`
- Create: `web/__tests__/course-assignment.test.ts`

**Interfaces:**
- Produces:
  - `Submission`, `PendingReviewItem`.
  - `formatGradeDisplay(grade: number | null)`.
  - `formatSubmissionStatusLabel(status: 'submitted' | 'reviewed')`.

- [ ] **Step 1: Write failing unit tests**

Create `web/__tests__/course-assignment.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatGradeDisplay, formatSubmissionStatusLabel } from '../lib/courses/assignment'

describe('formatGradeDisplay', () => {
  it('formats grade as percentage or unassigned placeholder', () => {
    expect(formatGradeDisplay(95)).toBe('95 / 100')
    expect(formatGradeDisplay(0)).toBe('0 / 100')
    expect(formatGradeDisplay(null)).toBe('Non noté')
    expect(formatGradeDisplay(undefined)).toBe('Non noté')
  })
})

describe('formatSubmissionStatusLabel', () => {
  it('returns French user-facing status label', () => {
    expect(formatSubmissionStatusLabel('submitted')).toBe('En attente de correction')
    expect(formatSubmissionStatusLabel('reviewed')).toBe('Évalué')
  })
})
```

- [ ] **Step 2: Implement domain logic in `web/lib/courses/assignment.ts`**

Create `web/lib/courses/assignment.ts`:

```ts
export interface Submission {
  id: string
  lesson_id: string
  user_id: string
  answer_text: string | null
  audio_path: string | null
  status: 'submitted' | 'reviewed'
  teacher_feedback: string | null
  grade: number | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export interface PendingReviewItem {
  submission: Submission
  lesson: { id: string; title: string; course_id: string }
  course: { id: string; title: string; slug: string }
  learner: { id: string; email: string | null; full_name?: string }
}

export function formatGradeDisplay(grade?: number | null): string {
  if (grade === null || grade === undefined) return 'Non noté'
  return `${grade} / 100`
}

export function formatSubmissionStatusLabel(status: 'submitted' | 'reviewed'): string {
  if (status === 'reviewed') return 'Évalué'
  return 'En attente de correction'
}
```

- [ ] **Step 3: Run unit tests**

Run from `web/`:
```bash
npm test -- course-assignment
```
Expected: PASS with 0 failures.

- [ ] **Step 4: Commit**

```bash
git add web/lib/courses/assignment.ts web/__tests__/course-assignment.test.ts
git commit -m "feat(courses): assignment domain types and status formatters" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Resend Email Notification Helper

**Files:**
- Create: `web/lib/courses/assignment-email.ts`

**Interfaces:**
- Produces: `sendSubmissionReviewedEmail({ learnerEmail, courseTitle, lessonTitle, feedback, grade })`.

- [ ] **Step 1: Create assignment email helper**

Create `web/lib/courses/assignment-email.ts`:

```ts
import { Resend } from 'resend'

interface Props {
  learnerEmail: string
  courseTitle: string
  lessonTitle: string
  feedback: string
  grade?: number | null
}

export async function sendSubmissionReviewedEmail({
  learnerEmail,
  courseTitle,
  lessonTitle,
  feedback,
  grade,
}: Props): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !learnerEmail) return

  const resend = new Resend(apiKey)
  const gradeText = grade !== null && grade !== undefined ? `<p><strong>Note :</strong> ${grade} / 100</p>` : ''

  try {
    await resend.emails.send({
      from: 'Plateforme Bété <notif@apprendrelebete.com>',
      to: learnerEmail,
      subject: `Votre devoir a été corrigé — ${lessonTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a;">Votre devoir a été corrigé</h2>
          <p>Bonjour,</p>
          <p>Votre enseignant a publié une correction pour votre devoir de la leçon <strong>${lessonTitle}</strong> du cours <strong>${courseTitle}</strong>.</p>
          ${gradeText}
          <div style="background-color: #f4f4f5; border-left: 4px solid #2563eb; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; font-weight: bold;">Commentaire de l’enseignant :</p>
            <p style="margin: 8px 0 0 0; white-space: pre-wrap;">${feedback}</p>
          </div>
          <p>Connectez-vous à la plateforme pour consulter tous vos devoirs et continuer votre apprentissage.</p>
        </div>
      `,
    })
  } catch {
    // Non-blocking email sending failure
  }
}
```

- [ ] **Step 2: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/lib/courses/assignment-email.ts
git commit -m "feat(courses): Resend email notification helper for assignment reviews" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Assignment Queries & Review Mutations

**Files:**
- Modify: `web/lib/courses/queries.ts`
- Modify: `web/lib/courses/mutations.ts`

**Interfaces:**
- Produces: `getSubmissionForLesson`, `getPendingReviewsForTeacher`, `submitAssignment`, `reviewSubmission`.

- [ ] **Step 1: Add queries in `web/lib/courses/queries.ts`**

Append to `web/lib/courses/queries.ts`:

```ts
import type { Submission, PendingReviewItem } from './assignment'

/** Fetches a learner's submission for a lesson. */
export async function getSubmissionForLesson(
  client: SupabaseClient,
  lessonId: string,
  userId: string,
): Promise<Submission | null> {
  const { data } = await client
    .from('submissions')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('user_id', userId)
    .maybeSingle()

  return (data ?? null) as Submission | null
}

/** Fetches pending and reviewed submissions for courses owned by the teacher. */
export async function getPendingReviewsForTeacher(
  client: SupabaseClient,
  teacherUserId: string,
): Promise<PendingReviewItem[]> {
  // 1. Fetch courses owned by teacher
  const { data: courses } = await client.from('courses').select('id, title, slug').eq('owner_id', teacherUserId)
  if (!courses || courses.length === 0) return []

  const courseIds = courses.map(c => c.id)
  const courseMap = new Map(courses.map(c => [c.id, c]))

  // 2. Fetch lessons in those courses
  const { data: lessons } = await client.from('lessons').select('id, title, course_id').in('course_id', courseIds)
  if (!lessons || lessons.length === 0) return []

  const lessonIds = lessons.map(l => l.id)
  const lessonMap = new Map(lessons.map(l => [l.id, l]))

  // 3. Fetch submissions for those lessons
  const { data: submissions } = await client
    .from('submissions')
    .select('*')
    .in('lesson_id', lessonIds)
    .order('created_at', { ascending: false })

  if (!submissions || submissions.length === 0) return []

  // 4. Fetch learner profiles
  const userIds = Array.from(new Set(submissions.map(s => s.user_id)))
  const { data: profiles } = await client.from('profiles').select('id, full_name').in('id', userIds)
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  return submissions.map(sub => {
    const lesson = lessonMap.get(sub.lesson_id)!
    const course = courseMap.get(lesson.course_id)!
    const profile = profileMap.get(sub.user_id)

    return {
      submission: sub as Submission,
      lesson,
      course,
      learner: {
        id: sub.user_id,
        email: null,
        full_name: profile?.full_name ?? 'Apprenant',
      },
    }
  })
}
```

- [ ] **Step 2: Add mutations in `web/lib/courses/mutations.ts`**

Append to `web/lib/courses/mutations.ts`:

```ts
import type { Submission } from './assignment'
import { sendSubmissionReviewedEmail } from './assignment-email'

/** Submits an assignment (text or audio) and marks lesson complete automatically. */
export async function submitAssignment(
  client: SupabaseClient,
  lessonId: string,
  answerText: string | null,
  audioPath: string | null,
): Promise<Result<Submission>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour remettre un devoir.')

  if (!answerText?.trim() && !audioPath) {
    return fail('Veuillez fournir une réponse écrite ou un enregistrement audio.')
  }

  const { data, error } = await client
    .from('submissions')
    .upsert(
      {
        lesson_id: lessonId,
        user_id: user.id,
        answer_text: answerText?.trim() || null,
        audio_path: audioPath || null,
        status: 'submitted',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,lesson_id' },
    )
    .select('*')
    .single()

  if (error || !data) return fail(error?.message ?? 'Erreur lors de la remise du devoir.')

  // Mark lesson as complete in lesson_progress so learner is never blocked by teacher review queue
  await client.from('lesson_progress').upsert({
    user_id: user.id,
    lesson_id: lessonId,
    completed_at: new Date().toISOString(),
  })

  return ok(data as Submission)
}

/** Teacher submits review feedback and optional grade for a submission. */
export async function reviewSubmission(
  client: SupabaseClient,
  submissionId: string,
  feedback: string,
  grade: number | null,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour corriger ce devoir.')

  if (!feedback.trim()) return fail('Veuillez saisir un commentaire de correction.')

  const { data: sub, error: fetchError } = await client
    .from('submissions')
    .select('*, lessons(title, courses(title))')
    .eq('id', submissionId)
    .single()

  if (fetchError || !sub) return fail('Devoir introuvable.')

  const { error: updateError } = await client
    .from('submissions')
    .update({
      status: 'reviewed',
      teacher_feedback: feedback.trim(),
      grade: grade !== null && grade !== undefined ? Math.min(100, Math.max(0, grade)) : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (updateError) return fail(updateError.message)

  // Send feedback notification email asynchronously
  const lessonTitle = (sub.lessons as { title?: string })?.title ?? 'Devoir'
  const courseTitle = ((sub.lessons as { courses?: { title?: string } })?.courses)?.title ?? 'Cours'

  // Fetch learner auth email if possible
  const { data: learnerUser } = await client.auth.admin.getUserById(sub.user_id).catch(() => ({ data: null }))
  if (learnerUser?.user?.email) {
    sendSubmissionReviewedEmail({
      learnerEmail: learnerUser.user.email,
      courseTitle,
      lessonTitle,
      feedback: feedback.trim(),
      grade,
    })
  }

  return ok(null)
}
```

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/courses/queries.ts web/lib/courses/mutations.ts
git commit -m "feat(courses): assignment queries and teacher review mutations" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Learner Assignment Form Component

**Files:**
- Create: `web/components/courses/AssignmentForm.tsx`

**Interfaces:**
- Consumes: `lessonId`, `initialSubmission`, `readOnly`.
- Produces: `AssignmentForm({ lessonId, initialSubmission, readOnly })`.

- [ ] **Step 1: Create the AssignmentForm component**

Create `web/components/courses/AssignmentForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { CheckCircle2, Clock, Send, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { submitAssignment } from '@/lib/courses/mutations'
import type { Submission } from '@/lib/courses/assignment'
import { formatGradeDisplay } from '@/lib/courses/assignment'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  lessonId: string
  initialSubmission: Submission | null
  readOnly?: boolean
}

export function AssignmentForm({ lessonId, initialSubmission, readOnly = false }: Props) {
  const [supabase] = useState(() => createClient())
  const [submission, setSubmission] = useState<Submission | null>(initialSubmission)
  const [answerText, setAnswerText] = useState(initialSubmission?.answer_text ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const res = await submitAssignment(supabase, lessonId, answerText, null)
    setSubmitting(false)

    if (res.error || !res.data) {
      setError(res.error ?? 'Erreur lors de la remise de votre devoir.')
      return
    }

    setSubmission(res.data)
    setSuccess(true)
  }

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Remise de votre devoir
        </h3>
        {submission && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted flex items-center gap-1.5">
            {submission.status === 'reviewed' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Évalué ({formatGradeDisplay(submission.grade)})
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                En attente de correction
              </>
            )}
          </span>
        )}
      </div>

      {/* Teacher Feedback Display */}
      {submission && submission.status === 'reviewed' && submission.teacher_feedback && (
        <div className="bg-muted/60 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Commentaire de l’enseignant</p>
          <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
        </div>
      )}

      {/* Answer Form */}
      <div className="space-y-3">
        <label className="text-sm font-medium" htmlFor="assignment-answer">
          Votre réponse écrite :
        </label>
        <Textarea
          id="assignment-answer"
          value={answerText}
          onChange={e => setAnswerText(e.target.value)}
          rows={6}
          disabled={readOnly || submitting || submission?.status === 'reviewed'}
          placeholder="Rédigez votre réponse ici…"
          className="font-mono text-sm"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600 font-medium">Votre devoir a été transmis avec succès !</p>}

      {!readOnly && submission?.status !== 'reviewed' && (
        <Button onClick={handleSubmit} disabled={submitting || !answerText.trim()}>
          <Send className="w-4 h-4 mr-2" />
          {submitting ? 'Transmission…' : submission ? 'Mettre à jour ma réponse' : 'Remettre mon devoir'}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/courses/AssignmentForm.tsx
git commit -m "feat(courses): learner AssignmentForm component with feedback display" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Teacher Review Queue Component & Page Route

**Files:**
- Create: `web/components/courses/ReviewQueue.tsx`
- Create: `web/app/teach/reviews/page.tsx`

**Interfaces:**
- Consumes: `PendingReviewItem`, `reviewSubmission`.
- Produces: `/teach/reviews` route with filter tabs (`Tous`, `À corriger`, `Corrigés`).

- [ ] **Step 1: Create ReviewQueue component**

Create `web/components/courses/ReviewQueue.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { CheckCircle2, Clock, MessageSquare, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { reviewSubmission } from '@/lib/courses/mutations'
import type { PendingReviewItem } from '@/lib/courses/assignment'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  initialItems: PendingReviewItem[]
}

export function ReviewQueue({ initialItems }: Props) {
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<PendingReviewItem[]>(initialItems)
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('pending')
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [grade, setGrade] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = items.filter(item => {
    if (filter === 'pending') return item.submission.status === 'submitted'
    if (filter === 'reviewed') return item.submission.status === 'reviewed'
    return true
  })

  async function handleSaveReview(submissionId: string) {
    setSubmitting(true)
    setError(null)
    const numericGrade = grade.trim() ? parseInt(grade, 10) : null

    const res = await reviewSubmission(supabase, submissionId, feedback, numericGrade)
    setSubmitting(false)

    if (res.error) {
      setError(res.error)
      return
    }

    setItems(prev =>
      prev.map(item =>
        item.submission.id === submissionId
          ? {
              ...item,
              submission: {
                ...item.submission,
                status: 'reviewed',
                teacher_feedback: feedback,
                grade: numericGrade,
                reviewed_at: new Date().toISOString(),
              },
            }
          : item,
      ),
    )
    setActiveSubmissionId(null)
    setFeedback('')
    setGrade('')
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'pending' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          À corriger ({items.filter(i => i.submission.status === 'submitted').length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('reviewed')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'reviewed' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Corrigés ({items.filter(i => i.submission.status === 'reviewed').length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Tous ({items.length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 border border-dashed border-border rounded-xl text-center text-muted-foreground">
          Aucun devoir dans cette file de correction.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(({ submission, lesson, course, learner }) => (
            <div key={submission.id} className="border border-border rounded-xl p-5 bg-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <span className="text-xs text-muted-foreground">{course.title}</span>
                  <h4 className="font-semibold text-base">{lesson.title}</h4>
                  <p className="text-xs text-muted-foreground">Par : {learner.full_name}</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted flex items-center gap-1">
                  {submission.status === 'reviewed' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Évalué ({submission.grade !== null ? `${submission.grade}/100` : 'Pas de note'})
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      En attente
                    </>
                  )}
                </span>
              </div>

              {/* Learner Answer */}
              {submission.answer_text && (
                <div className="bg-muted/40 p-4 rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Réponse de l’apprenant :</p>
                  <p className="text-sm whitespace-pre-wrap">{submission.answer_text}</p>
                </div>
              )}

              {/* Existing Review or Review Form */}
              {submission.status === 'reviewed' && activeSubmissionId !== submission.id ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>Votre correction</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubmissionId(submission.id)
                        setFeedback(submission.teacher_feedback ?? '')
                        setGrade(submission.grade !== null ? String(submission.grade) : '')
                      }}
                      className="underline"
                    >
                      Modifier la correction
                    </button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <Textarea
                    value={activeSubmissionId === submission.id ? feedback : ''}
                    onChange={e => {
                      setActiveSubmissionId(submission.id)
                      setFeedback(e.target.value)
                    }}
                    placeholder="Écrivez votre commentaire de correction pour l’apprenant…"
                    rows={3}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium" htmlFor={`grade-${submission.id}`}>Note / 100 (optionnel) :</label>
                      <input
                        id={`grade-${submission.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={activeSubmissionId === submission.id ? grade : ''}
                        onChange={e => {
                          setActiveSubmissionId(submission.id)
                          setGrade(e.target.value)
                        }}
                        className="w-20 h-8 px-2 rounded border border-input text-sm text-center font-mono"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSaveReview(submission.id)}
                      disabled={submitting || activeSubmissionId !== submission.id || !feedback.trim()}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Envoyer la correction
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create `/teach/reviews/page.tsx` route**

Create `web/app/teach/reviews/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { getPendingReviewsForTeacher } from '@/lib/courses/queries'
import { ReviewQueue } from '@/components/courses/ReviewQueue'

export const dynamic = 'force-dynamic'

export default async function ReviewsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth?next=/teach/reviews')

  const items = await getPendingReviewsForTeacher(supabase, user.id)

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-6">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour au tableau de bord enseignant
      </Link>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-primary" />
          Correction des devoirs
        </h1>
        <p className="text-sm text-muted-foreground">
          Consultez et corrigez les travaux remis par les apprenants inscrits à vos cours.
        </p>
      </div>

      <ReviewQueue initialItems={items} />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/courses/ReviewQueue.tsx web/app/teach/reviews/page.tsx
git commit -m "feat(courses): teacher review queue page and component" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Integrate Assignment Format into Lesson Editor & Learner Page

**Files:**
- Modify: `web/components/courses/LessonEditor.tsx`
- Modify: `web/app/courses/[slug]/learn/[lessonId]/page.tsx`
- Modify: `web/app/teach/page.tsx`

**Interfaces:**
- Consumes: `AssignmentForm`, `getSubmissionForLesson`.

- [ ] **Step 1: Add Assignment option in `LessonEditor.tsx`**

In `web/components/courses/LessonEditor.tsx`:
- Add `<option value="assignment">Devoir à rendre (réponse écrite ou enregistrement)</option>` to the format selector.

- [ ] **Step 2: Update Learner Lesson Route `web/app/courses/[slug]/learn/[lessonId]/page.tsx`**

In `web/app/courses/[slug]/learn/[lessonId]/page.tsx`:
- Fetch `submission` if `lesson.kind === 'assignment'`:
  ```ts
  const submission = user && lesson.kind === 'assignment' ? await getSubmissionForLesson(supabase, lesson.id, user.id) : null
  ```
- Render when `lesson.kind === 'assignment'`:
  ```tsx
  {lesson.kind === 'assignment' && (
    <div className="space-y-6">
      {body.trim() && <LessonMarkdown source={body} />}
      <AssignmentForm lessonId={lesson.id} initialSubmission={submission} readOnly={!user} />
    </div>
  )}
  ```

- [ ] **Step 3: Add Review Queue link in `/teach/page.tsx`**

In `web/app/teach/page.tsx`:
- Add a button/link to `/teach/reviews` ("Correction des devoirs").

- [ ] **Step 4: Typecheck**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/courses/LessonEditor.tsx web/app/courses/[slug]/learn/[lessonId]/page.tsx web/app/teach/page.tsx
git commit -m "feat(courses): integrate assignment form into learner page and review queue into teacher dashboard" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Final Verification & Test Suite Execution

**Files:** None created (verification only).

- [ ] **Step 1: Execute unit and RLS test suites**

Run from `web/`:
```bash
npm test
npm run test:rls
npx tsc --noEmit
npm run build
```
Expected:
- All unit tests PASS (slug, outline, reorder, markdown, audio, quiz, video, assignment).
- All 6 RLS test files PASS (57+ tests).
- Clean Next.js production build with zero errors.

- [ ] **Step 2: Write walkthrough document**

Create `docs/superpowers/walkthroughs/2026-09-28-course-platform-phase-4-rollout.md`.

- [ ] **Step 3: Final Git commit & push**

Commit walkthrough and push `feat/course-platform-phase-4` branch to remote.
