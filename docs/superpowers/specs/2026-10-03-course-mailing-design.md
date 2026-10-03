# Course Mailing — Design

Date: 2026-10-03 · Branch: `feat/course-mailing`

## Goal

Automatic French emails on course events, sent from the verified Resend domain `apprendre-le-bhete.com`, with per-category opt-out. One sending path for all course mail, with queueing, retries and de-duplication.

## Verified facts (2026-10-03)

- Resend key works from `notif@apprendre-le-bhete.com` (new key in root `.env.local`; `web/.env.local` still held the old key and must be synced; Vercel envs must be updated by the user).
- `assignment-email.ts` hard-codes `notif@apprendrelebete.com` (typo, unverified domain) → every "devoir corrigé" email has failed silently. Errors are swallowed by `console.error`.
- Sender addresses are scattered (`send-welcome`, `contact`, `assignment-email`). `RESEND_FROM_EMAIL` exists only in `.env.local.example`.
- Resend free tier is roughly 100 emails/day and 3,000/month; the outbox must be able to spread sends over days.
- No notification, preference or unsubscribe tables exist. No cron configuration exists.

## Decisions (agreed with the user)

| Question | Decision |
|---|---|
| Scope | Transactional + course mail (no free-form newsletter) |
| "New course from your teacher" recipients | Learners enrolled in any earlier course by that teacher |
| Opt-out granularity | Per category, plus one-click unsubscribe link |
| Architecture | Outbox queue + single dispatcher (approach A) |
| Scheduler | Supabase `pg_cron` calling the dispatcher via `pg_net` (plan-independent) |
| Welcome + contact emails | Stay direct sends, but use the shared sender wrapper |

## 1. Data model

All tables have RLS enabled.

- `email_preferences` — one row per user: `user_id` (pk, fk auth.users), `teacher_announcements`, `weekly_progress`, `course_activity` (booleans, default true), `unsubscribe_token` (random, unique). Users select/update only their own row. The unsubscribe route flips a flag by token using the service role.
- `email_outbox` — `id`, `user_id`, `category`, `template`, `payload jsonb`, `dedupe_key` (unique), `status` (`pending|sent|failed|skipped`), `attempts`, `last_error`, `send_after`, `sent_at`, `created_at`. No client access; written by triggers/jobs, read by the dispatcher (service role).
- Recipient addresses are read from `auth.users` at send time, never stored in the queue.
- A preferences row is created lazily: absence means all categories on.

## 2. Events

| Event | Recipient | Category | Source |
|---|---|---|---|
| Course published | Learners enrolled in any earlier course by the same teacher | `teacher_announcements` | trigger on `courses` when it becomes published |
| Learner submits an exercise | The course's teacher | `course_activity` | trigger on `submissions` insert |
| Teacher corrects a submission | The learner | `course_activity` | trigger on `submissions` update; replaces the direct send in `assignment-email.ts` |
| Pronunciation validated / retry requested | The learner | `course_activity` | same trigger, once the pronunciation plan lands |
| Weekly progress | Learners with activity that week | `weekly_progress` | weekly job inserts rows |
| Welcome, contact form | Fixed recipient | always sent | direct send via shared wrapper |

Rules:
- Never email the author of the event (a teacher publishing a course, or a teacher who is also an enrolled learner, gets no announcement).
- Empty digests are skipped (no activity ⇒ no email).
- `dedupe_key` examples: `new_course:<course_id>:<user_id>`, `submission:<submission_id>`, `reviewed:<submission_id>:<review_version>`, `digest:<iso_week>:<user_id>`. Re-running an event never duplicates a row (`insert ... on conflict do nothing`).

Exact column names for triggers (published flag, review status) must be read from the migrations when writing the plan.

## 3. Dispatcher, templates, scheduling

**Dispatcher** — `POST /api/mail/dispatch`, protected by a `CRON_SECRET` bearer token.
- Claims a small due batch with `for update skip locked` so overlapping runs never double-send.
- Per row: load preference (off ⇒ `skipped`) → look up email via service role → render template → send via Resend → mark `sent`; on failure increment `attempts`, reschedule with backoff, `failed` after 5 attempts.
- Batch size is configurable (`MAIL_BATCH_SIZE`) to stay under the Resend daily cap; leftover rows stay `pending` for the next run.
- Every email carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers and a footer unsubscribe link.

**Templates** — `web/lib/mail/templates/*.ts`: one shared layout (French, `<meta charset="utf-8">`, styling from the existing welcome email) and one function per template returning `{ subject, html, text }`. All user-supplied text is HTML-escaped (reuse `escapeHtml`).

**Sender wrapper** — `web/lib/mail/send.ts` reads `RESEND_FROM_EMAIL`, falling back to `Parlons Bhété <notif@apprendre-le-bhete.com>` (the verified domain). `assignment-email.ts`, `send-welcome` and `contact` all go through it, which removes the hard-coded and mistyped addresses. `send-welcome` previously accepted any address from an unauthenticated request and interpolated the posted name into HTML; it now sends only to the signed-in user's own address and escapes the name.

**Scheduling** — `pg_cron` + `pg_net` (secret in Supabase Vault): dispatcher every 5 minutes; weekly digest enqueue Monday 07:00 UTC (07:00 in Côte d'Ivoire, no DST).

**Settings UI** — a "Notifications" page with three toggles. The unsubscribe link opens a small confirmation page with a re-subscribe option.

## 4. Testing

- Unit (Vitest): templates render, escape hostile text and include a plain-text part. Dispatcher with a fake Resend client: skips when preference off, retries with backoff, `failed` after 5 attempts, never resends `sent`.
- RLS: a user reads/updates only their own preferences; no non-service-role access to `email_outbox`. Run in groups (local signup rate limit).
- Triggers: publishing a course queues only the right learners, never the author, each once; submit and review each queue exactly one row; replaying an event adds none.
- Live check: one real send through the dispatcher to curtiscapre@gmail.com on the verified domain, following the unsubscribe link once.
- Pinned failure modes: forged/guessed unsubscribe token changes nothing; opted-out learner never mailed; teacher-who-is-also-learner gets no own announcement.

## Out of scope

Free-form newsletters, per-course preferences, open/click tracking, in-app notifications, custom Supabase auth email templates/SMTP (separate follow-up).

## Operational prerequisites

- Sync the new `RESEND_API_KEY` to `web/.env.local` and to Vercel (production + preview); add `RESEND_FROM_EMAIL` and `CRON_SECRET`.
- Migrations that drop policies must be applied to the remote project by hand (the Supabase MCP tool declines them).
