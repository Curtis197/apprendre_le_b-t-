# Walkthrough: Lesson Completion Percentage and Scoring

**Date:** 2026-09-30  
**Feature:** Lesson completion percentage tracking and exercise scoring  
**Remote Supabase Project:** `agdqbzbjcxrzfhkvempe` (applied via `supabase-mcp-server`)

---

## 1. Overview & Summary of Changes

We evaluated and implemented granular completion percentage and scoring for lessons across the platform. Previously, lesson progress was strictly binary (a lesson was either 0% or 100%), and course progress jumped in coarse increments. With this update:

1. **Granular Completion %**:
   - Audio and video lessons now track playback progress smoothly (e.g. 25%, 50%, 75%), debounced and synchronized with Supabase.
   - Reaching $\ge 90\%$ playback automatically marks the lesson 100% completed.
   - Returning learners automatically resume audio and video playback where they previously left off.
2. **Pedagogical Scoring & Persistence**:
   - `FillInBlankExercise` now persists the learner's calculated accuracy percentage into `lesson_progress.score` (and updates completion status).
   - `QuizPlayer` and `submit_quiz` maintain recorded scores and pass thresholds.
   - Scores are clearly surfaced in the lesson player and outline.
3. **Course-Level Aggregate Progress**:
   - Course progress calculation (`computeProgress`) now aggregates individual lesson progress percentages rather than just binary counts, providing accurate, encouraging feedback on partial progress.
4. **Visual Indicators**:
   - `LessonOutline` displays SVG progress rings for partially completed lessons (`1%–99%`), checkmarks for finished lessons (`100%`), and score badges (e.g., `85%`) for evaluative lessons.
   - `CompleteButton` displays current progress and score badges.

---

### Key Changes Made

1. **Database Schema & RLS Migration** (`supabase/migrations/20260930000000_lesson_progress_percent.sql`):
   - Added `progress_percent numeric not null default 100 check (progress_percent >= 0 and progress_percent <= 100)` to `lesson_progress`. Default `100` ensures all legacy completed records remain 100% complete.
   - Made `completed_at` nullable so in-progress lessons can exist prior to completion.
   - Added `progress_update_own` RLS policy allowing authenticated users to update their own progress.
   - Updated `submit_quiz()` RPC to set `progress_percent = 100` upon passing.
   - Applied automatically to the remote database via `supabase-mcp-server:apply_migration`.

2. **Types & Progress Calculation** (`web/lib/courses/types.ts` & `web/lib/courses/outline.ts`):
   - Added `LessonProgressItem` interface.
   - Upgraded `computeProgress(lessonIds, progressSource)` and `resumeLessonId(flat, progressSource)` to support:
     - `Iterable<string>` (legacy string array of completed IDs)
     - `Record<string, number>`
     - `Record<string, { progress_percent?: number; completed_at?: string | null }>`
     - `Map<string, number>`

3. **Queries & Mutations** (`web/lib/courses/queries.ts` & `web/lib/courses/mutations.ts`):
   - Added `getLessonProgressMap(client, userId, lessonIds)` returning details map `{ progress_percent, score, completed }`.
   - Updated `getMyEnrollments` to aggregate partial percentages into learner course cards.
   - Added `saveLessonProgress(client, lessonId, input)` supporting `progressPercent`, `score`, and `completed`.
   - Updated `setLessonCompleted(client, lessonId, completed)` to delegate to `saveLessonProgress` while preserving deletion on unmark.

4. **Media & Exercise Components**:
   - `web/components/courses/AudioPlayer.tsx`: Tracks playback time, debounces sync to Supabase, resumes playback position, and marks complete at $\ge 90\%$.
   - `web/components/courses/VideoPlayer.tsx`: Tracks playback time with Mux/HLS, debounces sync, resumes playback position, and marks complete at $\ge 90\%$.
   - `web/components/courses/FillInBlankExercise.tsx`: Saves calculated `scorePercent` into `lesson_progress.score` and records completion.
   - `web/components/courses/CompleteButton.tsx`: Shows progress percentage and score badges.
   - `web/components/courses/LessonOutline.tsx`: Renders circular SVG progress rings for partial progress and score badges.

5. **Page Integrations**:
   - `web/app/courses/[slug]/page.tsx`: Uses `getLessonProgressMap` and passes progress details to `computeProgress` and `LessonOutline`.
   - `web/app/courses/[slug]/learn/[lessonId]/page.tsx`: Passes progress data and playback positions to `AudioPlayer`, `VideoPlayer`, `CompleteButton`, and `LessonOutline`.

6. **Unit Test Suite** (`web/__tests__/course-outline.test.ts` & `web/__tests__/course-mutations.test.ts`):
   - Added tests verifying partial percentage calculation across Record of numbers, Record of objects, and Maps.
   - Added tests verifying `saveLessonProgress` and `setLessonCompleted` upserts, deletes, and auth guards.

---

## 2. Verification & Testing Completed

- **Unit Tests (`npm run test`)**:
  - **14 / 14 test suites passed** cleanly.
  - **103 / 103 unit tests passed** (including 4 new outline tests and 5 new mutation tests).
- **TypeScript Typecheck (`npx tsc --noEmit`)**:
  - Exited with code 0 without any errors.
- **Git Deletion Audit (`git diff --name-status`)**:
  - Confirmed 0 accidental deletions across all files.

---

## 3. Visual & Functional Summary

- **0% Progress**: Outlined circle icon, "Marquer comme terminée" button.
- **Partial Progress (1%–89%)**: Mini circular SVG progress ring in sidebar outline, progress percentage badge (e.g. `Vu à 45%` / `Écouté à 45%`), auto-resumed playback position upon return.
- **Completed ($\ge 90\%$ or validated)**: Emerald checkmark icon, "Terminée ✓ (annuler)" button, 100% course contribution.
- **Exercise Score**: Pill badge (e.g. `Score: 85%`) displayed in the outline and completion section.
