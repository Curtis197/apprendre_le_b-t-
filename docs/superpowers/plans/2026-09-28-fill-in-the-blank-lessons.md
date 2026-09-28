# Implementation Plan: Textes à Trous (Fill-in-the-Blank Lessons)

This plan details the implementation of interactive **Fill-in-the-Blank / Textes à Trous** exercises for course lessons (`kind: 'fill_in_blank'`).

---

## Technical Overview & Core Requirements

- **Lesson Kind**: `'fill_in_blank'` added to `LESSON_KINDS` and database `lessons_kind_check` constraint.
- **Bracket Parser Syntax**:
  1. `[[answer]]`: Simple open text blank.
  2. `[[correct|option1|option2]]`: Multiple-choice dropdown blank with shuffled choices.
  3. `[[answer:hint]]`: Open text blank with a hint tooltip.
  4. `[[correct|option1|option2:hint]]`: Multiple-choice blank with a hint tooltip.
- **Learner Experience Modes**:
  - **Inline Input / Select**: Interactive `<input>` and `<select>` elements inserted seamlessly inside paragraph text.
  - **Tap / Drag-and-Drop Word Bank**: Word chips displayed at the bottom for easy selection on mobile.
- **Verification & Tolerance**:
  - Diacritics and case-insensitive normalization (ignoring minor accent variations for Bété text).
  - Batch "Vérifier mes réponses" submit button with score badge and retry option.
  - Automatic `completeLesson` call when score >= 80%.

---

## Tasks Breakdown

### Task 1: Database Migration (`supabase/migrations/20260928000004_courses_fill_in_blank.sql`)
- Alter `lessons` table constraint to accept `'fill_in_blank'`.
- Apply migration locally via `npx supabase migration up` and remotely via MCP `apply_migration`.

### Task 2: Types & Label Constants (`web/lib/courses/types.ts`, `web/lib/courses/labels.ts`)
- Add `'fill_in_blank'` to `LessonKind`.
- Update `LESSON_KINDS` array and `LESSON_KIND_LABELS` / `LESSON_KIND_ICONS`.

### Task 3: Pure Domain Parser & Tests (`web/lib/courses/fill-in-blank.ts`, `web/__tests__/course-fill-in-blank.test.ts`)
- Build `parseFillInBlankText(text)` parsing `[[...]]` expressions into structured segment tokens.
- Implement `normalizeText` & `evaluateFillInBlankAnswers(tokens, userAnswers)`.
- Unit test coverage for all bracket variations and accent/case tolerance.

### Task 4: Interactive Component (`web/components/courses/FillInBlankExercise.tsx`)
- Render interactive inline inputs/selects and Word Bank toggle.
- Batch submission with score feedback, hints, and automatic lesson completion.

### Task 5: Editor & Lesson Page Integration (`page.tsx`, `LessonForm.tsx`, `LessonKindSelect.tsx`)
- Update `LessonKindSelect.tsx` and `LessonForm.tsx` with syntax guide helper box.
- Render `FillInBlankExercise` in `/courses/[slug]/learn/[lessonId]` and teacher preview.

### Task 6: Testing & Verification
- Run Vitest unit tests (`npm run test`).
- Run Supabase RLS tests (`npm run test:rls`).
- Verify Next.js production build (`npm run build`).

---

## Implementation Dependencies & Rules
- Maintain local-first testing protocol (`npx supabase migration up` + `npm run test:rls`).
- Preserve existing RLS policies and table structures.
- Commit all changes atomically with trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
