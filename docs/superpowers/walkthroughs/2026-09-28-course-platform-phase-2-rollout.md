# Walkthrough: Course Platform Phase 2 Implementation & Rollout

**Date:** 2026-09-28  
**Scope:** Phase 2: Audio Lessons & Interactive Auto-Graded QCM Quizzes — Storage Bucket RLS, Server-side Grading RPC, Pure Domain Utilities, Audio Player & Uploader, Quiz Builder & Player, Lesson Editor & Player Integrations, Remote Supabase Migration via MCP.

---

## 1. Summary of Changes

### Database Layer (Supabase Migrations via MCP)
Applied migration `20260928000000_courses_phase2_audio_quiz.sql` to live remote project `agdqbzbjcxrzfhkvempe` via `supabase-mcp-server`:
- `lesson_contents.audio_path`: Added text column for storage object path reference.
- `storage.buckets`: Registered private bucket `lesson-audio` (10 MB file cap, MIME restricted to `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/aac`).
- Storage RLS:
  - `lesson_audio_owner_insert`: Owner-only insert restricted to authenticated users matching folder prefix `(storage.foldername(name))[1] = auth.uid()`.
  - `lesson_audio_owner_update` & `lesson_audio_owner_delete`: Owner-only modifications.
  - `lesson_audio_select_owner_or_admin`: Direct select restricted to owner and admin; public/learner streaming strictly mediated by short-lived signed URLs.
- `quiz_questions`: Added table with foreign key cascade to `lessons`, RLS enabled (`select` via `can_access_lesson(lesson_id)`, owner-only writes).
- `quiz_options`: Added choices table referencing `quiz_questions(id)`, RLS enabled (`select` via `can_access_lesson(lesson_id)` on parent question, owner-only writes).
- `quiz_answer_keys`: Added answer key table holding `correct_option_ids uuid[]` and pedagogical `explanation`.
  - **Security Invariant:** Learners **NEVER** have SELECT permission on this table. Only course owners and admins can query it.
- `submit_quiz(p_lesson_id uuid, p_answers jsonb)`:
  - `SECURITY DEFINER` function with `search_path = public`.
  - Validates `can_access_lesson(p_lesson_id)`.
  - Compares submitted option UUIDs against `quiz_answer_keys.correct_option_ids`.
  - Scores percentage, checks pass threshold (>= 70%), and updates `lesson_progress` on pass.
  - Returns itemized results with explanations without ever exposing raw answer keys beforehand.

### Pure Domain Libraries & Unit Tests (`web/lib/courses/`)
- `web/lib/courses/audio.ts`:
  - `MAX_AUDIO_BYTES` (10 MB cap).
  - `isValidAudioFile()`: Validates size, extension (`.mp3`, `.m4a`), and MIME types. Rejects unsupported formats (e.g., OGG, WebM) to guarantee iOS Safari 15.4+ compatibility.
  - `formatAudioDuration()`: Formats seconds to `m:ss`.
- `web/lib/courses/quiz.ts`:
  - Typed interfaces: `QuizOption`, `QuizQuestion`, `QuizAnswerKey`, `QuizQuestionDraft`, `QuizInput`, `QuizCorrectionItem`, `QuizSubmissionResult`.
  - `validateQuiz()`: Pure validator enforcing at least 1 question, minimum 2 options per question, non-empty text, and at least 1 correct option marked.
- `web/__tests__/course-audio.test.ts`: 4 unit tests verifying audio validation and duration formatting.
- `web/__tests__/course-quiz.test.ts`: 4 unit tests verifying quiz validation rules.
- `web/__tests__/rls/phase2-audio-quiz.test.ts`: Integration test suite verifying RLS visibility, answer key isolation, and `submit_quiz()` grading execution.

### Server Queries & Client Mutations (`web/lib/courses/`)
- `queries.ts`:
  - `getQuizForLesson()`: Retrieves questions and options for enrolled learners / preview access.
  - `getTeacherQuizKeys()`: Retrieves secret answer keys for course owners / admins.
  - `getLessonAudioPath()`: Reads audio path from `lesson_contents`.
  - `getLessonAudioUrl()`: Mints a short-lived (1 hour) signed URL from `lesson-audio` bucket.
- `mutations.ts`:
  - `updateLesson()`: Extended with optional `kind` parameter.
  - `uploadLessonAudio()`: Uploads audio file to `lesson-audio` and updates `lesson_contents.audio_path`.
  - `deleteLessonAudio()`: Removes audio file from storage and clears database column.
  - `saveQuiz()`: Atomically saves questions, options, and secret answer keys with cascading re-indexing.
  - `submitQuizAnswers()`: Invokes `submit_quiz` RPC for server-side evaluation.

### UI Components (`web/components/courses/`)
- `AudioPlayer.tsx`: Zero-dependency HTML5 player with custom play/pause, scrub slider, current/duration timestamps, 5-second rewind, volume mute toggle, and playback speed switcher (`0.8x`, `1.0x`, `1.2x`).
- `AudioUploader.tsx`: Teacher audio file upload widget with drag-and-drop/browse button, format validation, audio preview, and deletion control.
- `QuizBuilder.tsx`: Interactive teacher quiz authoring interface supporting questions reordering, multiple choices, correct answer designation, and pedagogical explanations.
- `QuizPlayer.tsx`: Interactive learner quiz experience with choice selection, instant correction feedback, pass/fail banner, and retry capability.
- `LessonEditor.tsx`: Enhanced lesson authoring page with format selector (`text`, `audio`, `quiz`), integrated `AudioUploader`, and `QuizBuilder`.
- `app/courses/[slug]/learn/[lessonId]/page.tsx`: Updated learner lesson page conditionally rendering `AudioPlayer`, `QuizPlayer`, or `LessonMarkdown` based on lesson kind.
- `app/teach/[courseId]/lessons/[lessonId]/page.tsx`: Updated teacher page pre-fetching audio signed URLs and quiz drafts server-side.

---

## 2. Testing & Verification

1. **Unit Test Suite (`vitest run`):**
   - 70 passed tests (9 test files) covering audio validation, quiz validation, slug generation, outline tree, position reordering, and markdown rendering.
2. **Typecheck & Lint:**
   - `npx tsc --noEmit`: 0 errors across the entire codebase.
   - `npx eslint`: 0 errors across all course platform files.
3. **Database Migration Verification:**
   - Applied to remote Supabase project `agdqbzbjcxrzfhkvempe` via MCP tool `apply_migration`.
   - Verified presence of tables `quiz_questions`, `quiz_options`, `quiz_answer_keys`.
   - Verified `lesson-audio` storage bucket settings and `submit_quiz` RPC.
4. **Safari Compatibility & Zero New Runtime Dependencies:**
   - 0 new runtime dependencies added to `package.json`.
   - Audio strictly restricted to MP3 and M4A codecs ensuring universal playback on iOS Safari >= 15.4.
   - All French user-facing copy uses curly apostrophes (`’`, `U+2019`).

---

## 3. Git Branch State

- **Branch:** `feat/course-platform-phase-2`
- All phase tasks committed with explicit paths and Claude Sonnet co-authorship.
