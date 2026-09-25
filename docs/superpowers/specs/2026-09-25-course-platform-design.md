# Online Course Platform — Design Spec
**Date:** 2026-09-25
**Status:** Draft — awaiting review

---

## Overview

Add an online course platform to the Bété language site. Any logged-in user can create and publish courses made of text, audio, video, multiple-choice quizzes (QCM) and free-text answer forms. Courses can be free or paid. The platform is built natively inside the existing Next.js + Supabase app, not as a separate LMS or a hosted SaaS.

The work is too large for a single implementation plan. This spec fixes the shared architecture and splits delivery into five phases. **Each phase gets its own implementation plan.** Only phase 1 is planned next.

### Decisions already made

| Topic | Decision |
|---|---|
| Access model | Mix of free and paid courses |
| Who can publish | Any logged-in user (no teacher approval step) |
| Video hosting | Dedicated video host, **Mux** as the default |
| Paying learners | Both Côte d'Ivoire (mobile money) and diaspora (cards) |
| Approach | Native module in the existing app, not an open-source LMS or a course SaaS |

### Why native

- Reuses existing auth, profiles, UI kit and Supabase project.
- Allows integration with the lexicon and grammar data (see Backlog), which no generic platform can offer.
- An open-source LMS (Moodle, Open edX) means a second app, separate login, single sign-on glue and a heavy server. A course SaaS charges per teacher or takes a cut, and does not fit open publishing or local mobile money.

---

## Phases

| Phase | Delivers |
|---|---|
| **1. Foundation** | Course builder (`/teach`), catalog (`/courses`), course page, text lessons, free enrollment, progress tracking, admin role, reporting and takedown |
| **2. Audio + QCM** | Audio lessons in Supabase Storage, auto-graded quizzes |
| **3. Video** | Mux direct upload, processing webhook, signed playback, per-user video quota |
| **4. Answer form** | Free-text or audio answers, teacher review queue, feedback emails |
| **5. Payments** | Paid access on two rails (cards + mobile money), teacher payouts, admin approval for paid courses |

Audio and QCM come before video because they need no external vendor and carry most of the language-learning value.

### Backlog (not scheduled)

- Lexicon-linked lessons: inline `[[lexicon:word]]` links and QCM generated from lexicon entries.
- Completion certificates.

---

## Data model

All new tables use `uuid` primary keys with `gen_random_uuid()` and `timestamptz` audit columns, matching existing migrations. `dialect` reuses the existing closed set `western | northern | eastern`.

### Phase 1 tables

**`courses`**
`id`, `owner_id` (→ `auth.users`, `on delete cascade`), `title`, `slug` (unique), `summary`, `cover_url`, `dialect`, `level` (`beginner | intermediate | advanced`), `status` (`draft | published | archived | suspended`), `access` (`free | paid`, default `free`), `price_cents` and `currency` (nullable, unused until phase 5), `created_at`, `updated_at`.

**`course_sections`**
`id`, `course_id` (→ `courses`), `title`, `position`.

**`lessons`**
`id`, `section_id` (→ `course_sections`), `course_id` (denormalized for cheap RLS), `title`, `position`, `kind` (`text | audio | video | quiz | assignment`), `is_preview` (bool, default false), plus content columns for the kind: `body_md` (text), and later `audio_path`, `media_asset_id`.

**`enrollments`**
`user_id`, `course_id`, `created_at`; primary key `(user_id, course_id)`. Free courses use self-enrollment. Paid courses (phase 5) get rows from payment webhooks. This table is the single source of truth for "may this user open this course".

**`lesson_progress`**
`user_id`, `lesson_id`, `completed_at`, `score` (nullable); primary key `(user_id, lesson_id)`.

**`user_roles`**
`user_id`, `role` (`admin`). **No user-writable policy.** `profiles.type` (`member | group | teacher`) stays a cosmetic, self-declared label and is never used for authorization: the `profiles_update_own` policy lets users edit any column of their own row.

**`course_reports`**
`id`, `course_id`, `reporter_id`, `reason`, `created_at`, `resolved_at`.

### Later-phase tables (designed when the phase starts)

- Phase 2: `quiz_questions`, `quiz_options`, `quiz_answer_keys`.
- Phase 3: `media_assets`, plus a per-user video quota.
- Phase 4: `submissions`.
- Phase 5: order/payment records and a `paid_approved` flag on `courses`.

---

## Routes (phase 1)

| Route | Purpose |
|---|---|
| `/courses` | Public catalog, filterable by dialect and level |
| `/courses/[slug]` | Public course page: summary, outline, preview lessons, enroll button |
| `/courses/[slug]/learn/[lessonId]` | Lesson player (login + enrollment, or preview) |
| `/teach` | Teacher dashboard: own courses, status |
| `/teach/[courseId]` | Course builder: sections, lessons, reorder, publish |
| Profile page | "My courses" and "My learning" sections |
| Navbar | New "Cours" item |

The catalog and preview lessons are public so they can be indexed for SEO.

---

## Permissions (RLS)

- Only a course's owner can create or edit its sections and lessons. Draft courses are visible only to the owner.
- Published courses appear in the public catalog.
- Lesson content is readable if the lesson `is_preview`, the user is enrolled, or the user is the course owner or an admin.
- Helper functions `can_access_lesson(lesson_id)` and `is_admin()` keep policies short. Policies wrap `auth.uid()` as `(select auth.uid())`, as the avatars policies already do.
- `user_roles` has no insert/update/delete policy for regular users.

---

## Media and assessment mechanics

### Audio (phase 2)

- Private Supabase Storage bucket `lesson-audio`, paths `{owner_id}/{lesson_id}/…`. Owner-only upload policy modelled on the `avatars` bucket.
- The server checks preview or enrollment, then issues a short-lived signed URL. This is the same mechanism that will protect paid audio.
- **MP3 and M4A only.** OGG and WebM do not play reliably on the iOS Safari versions the site supports. Enforce a file-size cap.

### QCM (phase 2)

- `quiz_questions` and `quiz_options` are readable by enrolled learners. Questions may carry an audio clip for listen-and-choose exercises.
- **Correct answers live in `quiz_answer_keys`, readable only by the course owner.** Learners never receive the key.
- A `SECURITY DEFINER` function `submit_quiz(lesson_id, answers)` grades on the server, records the score in `lesson_progress`, and returns per-question correctness plus the teacher's explanation.
- Single or multiple choice, per-quiz pass mark (default 70%), unlimited retries. No separate attempts history.

### Video (phase 3)

- The teacher selects a file. A server route creates a Mux direct-upload URL and the browser uploads straight to Mux, so large files never pass through the app.
- A Mux webhook at `/api/mux/webhook` moves a `media_assets` row from uploading to processing to ready and stores the playback ID.
- Playback uses `@mux/mux-player-react` with signed playback tokens minted server-side after the access check. Signed playback is used for every course, free or paid, to keep one code path. HLS plays natively on iOS Safari.
- Vendor rationale (list prices at time of writing, for 3,000 stored minutes and 10,000 minutes watched per month): Mux about $9/month (storage $0.003/min/month, first 100,000 delivery minutes free), Cloudflare Stream about $25/month, Bunny Stream cheapest per unit but with no Africa-specific rate confirmed. Revisit if storage grows large.

### Answer form (phase 4)

- `submissions` holds the learner's text or audio answer, status (`submitted | reviewed`), teacher feedback and an optional grade. Learners see only their own; the course owner sees submissions for their own courses.
- Teachers work from `/teach/reviews`. Resend emails the learner when feedback is posted.
- A lesson is marked complete **on submit**, not on review, so a busy teacher never blocks a learner.

---

## Payments (phase 5, direction only)

- Stripe in Côte d'Ivoire is an "extended network" through Paystack. Stripe Connect self-serve cross-border payouts cover only the US, UK, EEA, Canada and Switzerland, so **Stripe Connect cannot pay teachers in Côte d'Ivoire out of the box.**
- Two rails are needed: cards (existing Stripe integration, mainly diaspora) and mobile money (Orange, MTN, Wave, Moov) through a local gateway such as Paystack or CinetPay. Gateway choice, fees and licensing must be verified when phase 5 starts.
- Both rails converge on writing an `enrollments` row from a verified webhook, so phases 1–4 need no change when payments arrive.
- The platform holding funds and paying teachers raises compliance questions to resolve before phase 5.
- Paid courses require admin approval (`paid_approved`) before they can be sold.

---

## Guardrails for open publishing

- **Sanitized Markdown.** Lessons render as Markdown with no raw HTML or scripts. Links get `rel="nofollow ugc noopener"`.
- **Reporting and takedown.** Each course has a "Signaler" button. Reports go to an admin queue and an admin can set a course to `suspended`.
- **Video quota.** Mux bills per stored minute. Each user gets a small default video quota (for example 30 minutes) that an admin can raise per teacher. Audio and text need only a file-size cap.
- **Paid gating.** See Payments.

---

## Error handling

- Video lessons show a "processing" state until the webhook marks the asset ready.
- Webhook handlers are idempotent and only move statuses forward, so retried deliveries are harmless.
- Signed URLs are short-lived; the client fetches a new one on expiry.

---

## Testing

- Vitest unit tests for quiz grading logic.
- **RLS tests are the priority.** Verified as different signed-in users against a local Supabase stack (`supabase/config.toml` exists): a learner cannot read `quiz_answer_keys`; a non-enrolled user cannot read lesson content; a non-owner cannot edit a course; a user cannot write `user_roles`.

---

## Phase 1 cleanup

- Retire the `course` resource type in the resources page filters and submit form, and redirect `/resources?type=course` to `/courses`.
- The migrations reviewed only allow `song | story | poem | proverb | speech | riddle | other` in the `community_texts` type CHECK constraint, so `video` and `course` submissions may already be rejected. Verify against the live database while doing this cleanup.
- Read `node_modules/next/dist/docs/` before writing Next.js code, per `web/AGENTS.md`.

---

## Open questions for later phases

- Payment gateway choice and compliance model for holding and paying out funds (phase 5).
- Exact default video quota and file-size caps.
- Whether learners need a public profile link to a teacher's course list.
