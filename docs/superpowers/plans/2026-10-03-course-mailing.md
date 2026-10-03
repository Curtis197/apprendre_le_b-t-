# Course Mailing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send French course emails (new course from a teacher, learner submitted, work corrected, weekly progress) from `apprendre-le-bhete.com` through an outbox queue, with per-category opt-out and one-click unsubscribe.

**Architecture:** Database triggers and a weekly SQL function write rows into `email_outbox` (unique `dedupe_key`). A cron-protected route `/api/mail/dispatch` claims due rows with a lease (`claim_email_batch`), checks preferences, renders a template and sends through Resend with retry/backoff. `pg_cron` + `pg_net` call the route every 5 minutes and enqueue the digest on Mondays. All senders (new and existing) go through one `sendEmail()` wrapper.

**Tech Stack:** Next.js (App Router; this repo's version has breaking changes — see `web/AGENTS.md`), Supabase (Postgres, RLS, `pg_cron`, `pg_net`), Resend v6, TypeScript, Vitest (unit: `npm run test`, RLS: `npm run test:rls`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-03-course-mailing-design.md`

## Global Constraints

- Work only in the git worktree `C:\Users\DELL LATITUDE 7480\tb-mail` (branch `feat/course-mailing`). Run `git branch --show-current` before every commit; never switch branches in the shared `traduction bété` folder.
- All user-facing copy (emails, settings page) is **French**.
- Sender: `RESEND_FROM_EMAIL`, falling back to `Parlons Bhété <notif@apprendre-le-bhete.com>` (the verified Resend domain is `apprendre-le-bhete.com`, with hyphens). Never hard-code another address.
- Migrations must be **re-runnable** and must **not use `drop policy`** (the Supabase MCP tool declines DDL that drops policies): guard policies with `if not exists (select 1 from pg_policies ...)`. `drop trigger if exists` is fine.
- Categories are exactly `teacher_announcements`, `weekly_progress`, `course_activity`.
- Retries: at most **5 attempts**, delay `attempts² × 5 min`. Lease on claim: **10 minutes**. Daily send cap default **90** (`MAIL_DAILY_LIMIT`), batch default **20** (`MAIL_BATCH_SIZE`).
- Routes run on the Node.js runtime (no `export const runtime = 'edge'`).
- Next.js here has breaking changes: before writing a route handler or page in Tasks 4–5, skim the matching guide in `web/node_modules/next/dist/docs/` (e.g. `searchParams` is a Promise in pages).
- No `console.log` in new code (`console.error` for real failures only).
- Local Supabase: check `docker ps` for ports first; the RLS suite hits a signup rate limit (30 per 5 min) so run RLS files individually (`npm run test:rls -- <file>`); never stop the Bartender-Google processes. Apply migrations to the local DB with `supabase migration up` from the worktree root.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but a happy-path test would miss (each pinned by a test in the named task):

1. **Opted-out learner** must never be mailed, and the row must end `skipped`, not retried. (Task 4)
2. **Hostile teacher text** (`<script>`, quotes, CR/LF in titles) must be escaped in HTML and must not inject headers through the subject. (Task 1)
3. **Replayed events** (course toggled draft↔published, a feedback edit with the same `reviewed_at`) must not queue duplicates, and the author/teacher is never mailed their own event. (Task 3)
4. **Overlapping dispatcher runs** must not claim the same row twice; callers other than the service role cannot claim at all. (Task 2)
5. **Forged or unknown unsubscribe token** changes nothing and returns 404; an invalid category returns 400. (Task 2, Task 5)

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261005000000_email_outbox.sql` | `email_preferences`, `email_outbox`, RLS/grants, `claim_email_batch` |
| `supabase/migrations/20261005000001_email_triggers.sql` | Course/submission triggers, `enqueue_weekly_digest` |
| `supabase/ops/mail-cron.sql` | One-time `pg_cron` schedule, run by hand (holds no secret) |
| `web/lib/mail/categories.ts` | Category constants, labels, type guard |
| `web/lib/mail/send.ts` | `sendEmail()` Resend wrapper, `senderAddress()` |
| `web/lib/mail/layout.ts` | Shared HTML layout + button |
| `web/lib/mail/templates.ts` | `renderTemplate()` + `renderWelcomeEmail()` |
| `web/lib/mail/dispatcher.ts` | Pure `runDispatch()` with injected deps, retry rules, cron auth helper |
| `web/lib/mail/dispatcher-deps.ts` | Real deps (service client + Resend) |
| `web/lib/mail/unsubscribe.ts` | `applyPreferenceChange()` |
| `web/app/api/mail/dispatch/route.ts` | Cron-protected dispatcher endpoint |
| `web/app/api/mail/unsubscribe/route.ts` | One-click unsubscribe endpoint |
| `web/app/notifications/page.tsx`, `web/components/NotificationPreferences.tsx` | Settings page |
| `web/app/notifications/unsubscribe/page.tsx`, `web/components/UnsubscribeConfirm.tsx` | Confirmation page from the email link |
| `web/__tests__/mail-*.test.ts`, `web/__tests__/rls/email-mailing.test.ts` | Tests |
| `web/scripts/mail-live-check.mjs` | Manual end-to-end check |

---

### Task 1: Mail core — categories, sender, layout, templates

**Files:**
- Create: `web/lib/mail/categories.ts`, `web/lib/mail/send.ts`, `web/lib/mail/layout.ts`, `web/lib/mail/templates.ts`
- Test: `web/__tests__/mail-templates.test.ts`, `web/__tests__/mail-send.test.ts`

**Interfaces:**
- Produces:
  - `EMAIL_CATEGORIES`, `type EmailCategory`, `CATEGORY_LABELS: Record<EmailCategory, string>`, `isEmailCategory(v: unknown): v is EmailCategory`
  - `interface OutgoingEmail { to: string; subject: string; html: string; text: string; replyTo?: string; headers?: Record<string, string> }`, `type SendResult = { ok: true; id: string } | { ok: false; error: string }`, `senderAddress(): string`, `sendEmail(email: OutgoingEmail, sender?: Sender): Promise<SendResult>`
  - `interface RenderedEmail { subject: string; html: string; text: string }`, `interface RenderContext { baseUrl: string; unsubscribeUrl: string }`, `renderTemplate(name: string, payload: Record<string, unknown>, ctx: RenderContext): RenderedEmail | null`, `renderWelcomeEmail(opts: { name: string; baseUrl: string }): RenderedEmail`

- [ ] **Step 1: Install dependencies in the worktree**

Run (from `C:\Users\DELL LATITUDE 7480\tb-mail\web`): `npm ci`
Expected: completes without errors (`node_modules` is not shared with the main folder).

- [ ] **Step 2: Write the failing tests**

`web/__tests__/mail-templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderTemplate, renderWelcomeEmail } from '@/lib/mail/templates'

const ctx = { baseUrl: 'https://apprendre-le-bhete.com', unsubscribeUrl: 'https://apprendre-le-bhete.com/notifications/unsubscribe?token=t&category=course_activity' }

describe('renderTemplate', () => {
  it('returns null for an unknown template', () => {
    expect(renderTemplate('nope', {}, ctx)).toBeNull()
  })

  it('renders new_course with a course link, an unsubscribe link and a text part', () => {
    const out = renderTemplate('new_course', { course_title: 'Le bhété pour débutants', course_slug: 'bhete-debutants', summary: 'Un début.' }, ctx)!
    expect(out.subject).toBe('Nouveau cours : Le bhété pour débutants')
    expect(out.html).toContain('<meta charset="utf-8"')
    expect(out.html).toContain('https://apprendre-le-bhete.com/courses/bhete-debutants')
    expect(out.html).toContain('notifications/unsubscribe')
    expect(out.text).toContain('https://apprendre-le-bhete.com/courses/bhete-debutants')
    expect(out.text).toContain('notifications/unsubscribe')
  })

  it('escapes hostile teacher text and keeps CR/LF out of the subject', () => {
    const out = renderTemplate(
      'submission_reviewed',
      { lesson_title: 'Leçon\r\nBcc: evil@x.com', course_title: '<b>C</b>', course_slug: 's', feedback: '<script>alert(1)</script> "x" & y', grade: 80 },
      ctx,
    )!
    expect(out.subject).not.toMatch(/[\r\n]/)
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
    expect(out.html).not.toContain('<b>C</b>')
    expect(out.html).toContain('80 / 100')
  })

  it('omits the grade line when there is no grade', () => {
    const out = renderTemplate('submission_reviewed', { lesson_title: 'L', course_title: 'C', course_slug: 's', feedback: 'Bien', grade: null }, ctx)!
    expect(out.html).not.toContain('/ 100')
  })

  it('links the teacher to the review queue for submission_received', () => {
    const out = renderTemplate('submission_received', { lesson_title: 'L', course_title: 'C', course_slug: 's' }, ctx)!
    expect(out.html).toContain('https://apprendre-le-bhete.com/teach/reviews')
  })

  it('renders weekly_progress with per-course lines and tolerates a malformed courses payload', () => {
    const ok = renderTemplate('weekly_progress', { lessons_completed: 3, courses: [{ title: 'Cours A', slug: 'a', completed_this_week: 3, completed_total: 5, total_lessons: 10 }] }, ctx)!
    expect(ok.html).toContain('Cours A')
    expect(ok.html).toContain('5 / 10')
    const bad = renderTemplate('weekly_progress', { lessons_completed: 1, courses: 'oops' }, ctx)!
    expect(bad.subject).toContain('semaine')
  })

  it('renders the welcome email without an unsubscribe footer and escapes the name', () => {
    const out = renderWelcomeEmail({ name: '<i>Awa</i>', baseUrl: ctx.baseUrl })
    expect(out.html).toContain('&lt;i&gt;Awa&lt;/i&gt;')
    expect(out.html).not.toContain('unsubscribe')
  })
})
```

`web/__tests__/mail-send.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail, senderAddress } from '@/lib/mail/send'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('senderAddress', () => {
  it('uses RESEND_FROM_EMAIL when set', () => {
    vi.stubEnv('RESEND_FROM_EMAIL', 'Test <t@apprendre-le-bhete.com>')
    expect(senderAddress()).toBe('Test <t@apprendre-le-bhete.com>')
  })
  it('falls back to the verified-domain address', () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    expect(senderAddress()).toBe('Parlons Bhété <notif@apprendre-le-bhete.com>')
  })
})

describe('sendEmail', () => {
  const email = { to: 'a@b.c', subject: 'S', html: '<p>x</p>', text: 'x' }

  it('returns the Resend id on success and forwards from/to/headers', async () => {
    vi.stubEnv('RESEND_FROM_EMAIL', '')
    const send = vi.fn().mockResolvedValue({ data: { id: 'abc' }, error: null })
    const res = await sendEmail({ ...email, headers: { 'List-Unsubscribe': '<u>' } }, { emails: { send } })
    expect(res).toEqual({ ok: true, id: 'abc' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'Parlons Bhété <notif@apprendre-le-bhete.com>', to: 'a@b.c', headers: { 'List-Unsubscribe': '<u>' } }))
  })

  it('returns ok:false with the Resend message on an API error', async () => {
    const send = vi.fn().mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    expect(await sendEmail(email, { emails: { send } })).toEqual({ ok: false, error: 'domain not verified' })
  })

  it('returns ok:false instead of throwing when the client throws', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'))
    expect(await sendEmail(email, { emails: { send } })).toEqual({ ok: false, error: 'network down' })
  })

  it('returns ok:false when there is no API key and no injected sender', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const res = await sendEmail(email)
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `web/`): `npm run test -- __tests__/mail-templates.test.ts __tests__/mail-send.test.ts`
Expected: FAIL — modules `@/lib/mail/templates` and `@/lib/mail/send` not found.

- [ ] **Step 4: Implement `categories.ts` and `send.ts`**

`web/lib/mail/categories.ts`:

```ts
export const EMAIL_CATEGORIES = ['teacher_announcements', 'weekly_progress', 'course_activity'] as const
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number]

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  teacher_announcements: 'Nouveaux cours de mes enseignants',
  weekly_progress: 'Mon bilan de la semaine',
  course_activity: 'Devoirs rendus et corrigés',
}

export function isEmailCategory(value: unknown): value is EmailCategory {
  return typeof value === 'string' && (EMAIL_CATEGORIES as readonly string[]).includes(value)
}
```

`web/lib/mail/send.ts` (no `server-only` import so it stays unit-testable; it only reads server env vars):

```ts
import { Resend } from 'resend'

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
  headers?: Record<string, string>
}

export type SendResult = { ok: true; id: string } | { ok: false; error: string }

/** The slice of the Resend client we use, so tests can inject a fake. */
export interface Sender {
  emails: {
    send(payload: Record<string, unknown>): Promise<{ data: { id: string } | null; error: { message: string } | null }>
  }
}

export function senderAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'Parlons Bhété <notif@apprendre-le-bhete.com>'
}

export async function sendEmail(email: OutgoingEmail, sender?: Sender): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const client = sender ?? (apiKey ? (new Resend(apiKey) as unknown as Sender) : null)
  if (!client) return { ok: false, error: 'RESEND_API_KEY manquante' }
  try {
    const { data, error } = await client.emails.send({
      from: senderAddress(),
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      ...(email.headers ? { headers: email.headers } : {}),
    })
    if (error || !data) return { ok: false, error: error?.message ?? 'Réponse Resend vide' }
    return { ok: true, id: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 5: Implement `layout.ts` and `templates.ts`**

`web/lib/mail/layout.ts`:

```ts
import { escapeHtml } from '@/lib/courses/assignment'

export function emailButton(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none;">${escapeHtml(label)}</a></p>`
}

export function renderLayout(opts: { bodyHtml: string; unsubscribeUrl?: string }): string {
  const footer = opts.unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#9ca3af;">Se désabonner de ces e-mails</a></p>`
    : ''
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5f0;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="background:#7c3aed;padding:24px 32px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Parlons Bhété</p>
        </td></tr>
        <tr><td style="padding:32px;font-size:16px;line-height:1.6;color:#374151;">${opts.bodyHtml}</td></tr>
        <tr><td style="padding:20px 32px;background:#f9f5f0;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Parlons Bhété — Préserver la langue bhété, ensemble.</p>
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
```

`web/lib/mail/templates.ts`:

```ts
import { escapeHtml } from '@/lib/courses/assignment'
import { emailButton, renderLayout } from './layout'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface RenderContext {
  baseUrl: string
  unsubscribeUrl: string
}

type Payload = Record<string, unknown>

const str = (p: Payload, key: string, fallback = ''): string => (typeof p[key] === 'string' ? (p[key] as string) : fallback)
const num = (p: Payload, key: string): number | null => (typeof p[key] === 'number' && Number.isFinite(p[key]) ? (p[key] as number) : null)
const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim()
const plural = (n: number, one: string, many: string): string => (n > 1 ? many : one)
const courseUrl = (ctx: RenderContext, slug: string): string => `${ctx.baseUrl}/courses/${encodeURIComponent(slug)}`

function p(html: string): string {
  return `<p style="margin:0 0 16px;">${html}</p>`
}

function build(ctx: RenderContext, subject: string, bodyHtml: string, textLines: string[]): RenderedEmail {
  return {
    subject: oneLine(subject),
    html: renderLayout({ bodyHtml, unsubscribeUrl: ctx.unsubscribeUrl }),
    text: [...textLines, '', `Se désabonner : ${ctx.unsubscribeUrl}`].join('\n'),
  }
}

const RENDERERS: Record<string, (payload: Payload, ctx: RenderContext) => RenderedEmail> = {
  new_course(payload, ctx) {
    const title = str(payload, 'course_title', 'Nouveau cours')
    const summary = str(payload, 'summary')
    const url = courseUrl(ctx, str(payload, 'course_slug'))
    return build(
      ctx,
      `Nouveau cours : ${title}`,
      p('Un enseignant dont vous suivez un cours vient de publier un nouveau cours.') +
        `<h2 style="margin:0 0 8px;color:#1a1a2e;">${escapeHtml(title)}</h2>` +
        (summary ? p(escapeHtml(summary)) : '') +
        emailButton(url, 'Découvrir le cours'),
      ['Un enseignant dont vous suivez un cours vient de publier un nouveau cours.', title, summary, url].filter(Boolean),
    )
  },

  submission_received(payload, ctx) {
    const lesson = str(payload, 'lesson_title', 'Devoir')
    const course = str(payload, 'course_title', 'Cours')
    const url = `${ctx.baseUrl}/teach/reviews`
    return build(
      ctx,
      `Nouveau devoir à corriger — ${lesson}`,
      p(`Un apprenant a rendu le devoir de la leçon <strong>${escapeHtml(lesson)}</strong> du cours <strong>${escapeHtml(course)}</strong>.`) +
        emailButton(url, 'Corriger les devoirs'),
      [`Un apprenant a rendu le devoir de la leçon « ${lesson} » du cours « ${course} ».`, url],
    )
  },

  submission_reviewed(payload, ctx) {
    const lesson = str(payload, 'lesson_title', 'Devoir')
    const course = str(payload, 'course_title', 'Cours')
    const feedback = str(payload, 'feedback')
    const grade = num(payload, 'grade')
    const url = courseUrl(ctx, str(payload, 'course_slug'))
    const gradeHtml = grade !== null ? p(`<strong>Note :</strong> ${grade} / 100`) : ''
    return build(
      ctx,
      `Votre devoir a été corrigé — ${lesson}`,
      p(`Votre enseignant a publié une correction pour votre devoir de la leçon <strong>${escapeHtml(lesson)}</strong> du cours <strong>${escapeHtml(course)}</strong>.`) +
        gradeHtml +
        `<div style="background:#f4f4f5;border-left:4px solid #7c3aed;padding:12px 16px;margin:16px 0;"><p style="margin:0;font-weight:bold;">Commentaire de l’enseignant :</p><p style="margin:8px 0 0;white-space:pre-wrap;">${escapeHtml(feedback)}</p></div>` +
        emailButton(url, 'Voir mes devoirs'),
      [
        `Votre enseignant a corrigé votre devoir de la leçon « ${lesson} » (cours « ${course} »).`,
        ...(grade !== null ? [`Note : ${grade} / 100`] : []),
        `Commentaire : ${feedback}`,
        url,
      ],
    )
  },

  weekly_progress(payload, ctx) {
    const completed = num(payload, 'lessons_completed') ?? 0
    const rawCourses = Array.isArray(payload.courses) ? (payload.courses as unknown[]) : []
    const courses = rawCourses.flatMap((c) => {
      if (typeof c !== 'object' || c === null) return []
      const row = c as Payload
      return [{
        title: str(row, 'title', 'Cours'),
        slug: str(row, 'slug'),
        week: num(row, 'completed_this_week') ?? 0,
        done: num(row, 'completed_total') ?? 0,
        total: num(row, 'total_lessons') ?? 0,
      }]
    })
    const items = courses
      .map((c) => `<li style="margin:0 0 8px;"><a href="${escapeHtml(courseUrl(ctx, c.slug))}" style="color:#7c3aed;">${escapeHtml(c.title)}</a> — ${c.week} ${plural(c.week, 'leçon terminée', 'leçons terminées')} cette semaine (${c.done} / ${c.total})</li>`)
      .join('')
    return build(
      ctx,
      'Votre progression de la semaine',
      p(`Bravo ! Cette semaine, vous avez terminé <strong>${completed}</strong> ${plural(completed, 'leçon', 'leçons')}.`) +
        (items ? `<ul style="margin:0 0 16px;padding-left:20px;">${items}</ul>` : '') +
        emailButton(`${ctx.baseUrl}/courses`, 'Continuer à apprendre'),
      [
        `Cette semaine, vous avez terminé ${completed} ${plural(completed, 'leçon', 'leçons')}.`,
        ...courses.map((c) => `- ${c.title} : ${c.week} cette semaine (${c.done} / ${c.total})`),
        `${ctx.baseUrl}/courses`,
      ],
    )
  },
}

export function renderTemplate(name: string, payload: Payload, ctx: RenderContext): RenderedEmail | null {
  const render = RENDERERS[name]
  return render ? render(payload, ctx) : null
}

/** Transactional (no unsubscribe footer): sent right after signup. */
export function renderWelcomeEmail(opts: { name: string; baseUrl: string }): RenderedEmail {
  const name = opts.name.replace(/[\r\n]+/g, ' ').trim() || 'Contributeur'
  const bodyHtml =
    `<h1 style="margin:0 0 16px;font-size:24px;color:#1a1a2e;">Bienvenue, ${escapeHtml(name)} !</h1>` +
    p('Votre compte a été créé sur <strong>Parlons Bhété</strong>. Vous faites maintenant partie d’une communauté dédiée à la préservation et à la valorisation de la langue bhété.') +
    p('Vous pouvez explorer le lexique, contribuer des mots et des expressions, suivre des cours et rejoindre le forum.') +
    emailButton(opts.baseUrl, 'Accéder à la plateforme') +
    p('<span style="font-size:13px;color:#6b7280;">Si vous n’êtes pas à l’origine de cette inscription, ignorez cet e-mail.</span>')
  return {
    subject: `Bienvenue sur Parlons Bhété, ${name} !`,
    html: renderLayout({ bodyHtml }),
    text: [`Bienvenue, ${name} !`, 'Votre compte a été créé sur Parlons Bhété.', opts.baseUrl].join('\n'),
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `web/`): `npm run test -- __tests__/mail-templates.test.ts __tests__/mail-send.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print feat/course-mailing
git add web/lib/mail web/__tests__/mail-templates.test.ts web/__tests__/mail-send.test.ts
git commit -m "feat(mail): sender wrapper, layout and email templates" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Outbox and preferences tables, claim function

**Files:**
- Create: `supabase/migrations/20261005000000_email_outbox.sql`, `web/lib/mail/unsubscribe.ts`
- Test: `web/__tests__/rls/email-mailing.test.ts`

**Interfaces:**
- Consumes: `isEmailCategory` from Task 1.
- Produces:
  - Tables `email_preferences(user_id pk, teacher_announcements, weekly_progress, course_activity, unsubscribe_token uuid unique, updated_at)` and `email_outbox(id, user_id, category, template, payload, dedupe_key unique, status, attempts, last_error, send_after, sent_at, created_at)`
  - `claim_email_batch(p_limit int) returns setof email_outbox` (service role only; increments `attempts`, sets `send_after = now() + 10 min`)
  - `applyPreferenceChange(client: SupabaseClient, token: string | null, category: string | null, subscribe: boolean): Promise<PreferenceChange>` where `PreferenceChange = { ok: true } | { ok: false; status: 400 | 404 | 500; error: string }`

- [ ] **Step 1: Write the failing RLS tests**

`web/__tests__/rls/email-mailing.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, uid, type TestUser } from './helpers'
import { applyPreferenceChange } from '../../lib/mail/unsubscribe'

describe('email tables RLS', () => {
  let alice: TestUser
  let bob: TestUser
  let carol: TestUser

  beforeAll(async () => {
    ;[alice, bob, carol] = await Promise.all([createUser('em-alice'), createUser('em-bob'), createUser('em-carol')])
    must(await alice.client.from('email_preferences').insert({ user_id: alice.id }).select(), 'alice prefs')
    must(await bob.client.from('email_preferences').insert({ user_id: bob.id }).select(), 'bob prefs')
  })

  it('lets a user read only their own preferences', async () => {
    const { data } = await alice.client.from('email_preferences').select('user_id')
    expect(data?.map((r) => r.user_id)).toEqual([alice.id])
  })

  it('refuses a preference row created for someone else', async () => {
    const { error } = await alice.client.from('email_preferences').insert({ user_id: carol.id })
    expect(error).not.toBeNull()
    const { data } = await admin.from('email_preferences').select('user_id').eq('user_id', carol.id)
    expect(data).toEqual([])
  })

  it('lets a user toggle categories but not rewrite the unsubscribe token', async () => {
    const before = must(await admin.from('email_preferences').select('unsubscribe_token').eq('user_id', alice.id).single(), 'token')
    const toggle = await alice.client.from('email_preferences').update({ weekly_progress: false }).eq('user_id', alice.id)
    expect(toggle.error).toBeNull()
    const forged = await alice.client
      .from('email_preferences')
      .update({ unsubscribe_token: '00000000-0000-4000-8000-000000000000' })
      .eq('user_id', alice.id)
    expect(forged.error).not.toBeNull()
    const after = must(await admin.from('email_preferences').select('unsubscribe_token, weekly_progress').eq('user_id', alice.id).single(), 'token after')
    expect(after.unsubscribe_token).toBe(before.unsubscribe_token)
    expect(after.weekly_progress).toBe(false)
    await admin.from('email_preferences').update({ weekly_progress: true }).eq('user_id', alice.id)
  })

  it('hides the outbox from signed-in users', async () => {
    must(
      await admin.from('email_outbox').insert({ user_id: alice.id, category: 'course_activity', template: 'weekly_progress', dedupe_key: `t-hide-${uid()}` }).select(),
      'seed outbox',
    )
    const { data } = await alice.client.from('email_outbox').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('leases claimed rows so overlapping runs cannot claim them twice, and refuses non-service callers', async () => {
    const row = must(
      await admin.from('email_outbox').insert({ user_id: alice.id, category: 'course_activity', template: 'weekly_progress', dedupe_key: `t-claim-${uid()}` }).select('id').single(),
      'seed claimable',
    )
    const first = must(await admin.rpc('claim_email_batch', { p_limit: 100 }), 'first claim')
    const mine = first.find((r: { id: string }) => r.id === row.id)
    expect(mine).toBeDefined()
    expect(mine.attempts).toBe(1)
    const second = must(await admin.rpc('claim_email_batch', { p_limit: 100 }), 'second claim')
    expect(second.find((r: { id: string }) => r.id === row.id)).toBeUndefined()

    const denied = await alice.client.rpc('claim_email_batch', { p_limit: 1 })
    expect(denied.error).not.toBeNull()
  })

  it('applies an unsubscribe only to the row that owns the token, and rejects bad input', async () => {
    const aliceRow = must(await admin.from('email_preferences').select('unsubscribe_token').eq('user_id', alice.id).single(), 'alice token')

    expect(await applyPreferenceChange(admin, aliceRow.unsubscribe_token, 'weekly_progress', false)).toEqual({ ok: true })
    const rows = must(await admin.from('email_preferences').select('user_id, weekly_progress').in('user_id', [alice.id, bob.id]), 'rows')
    expect(rows.find((r) => r.user_id === alice.id)?.weekly_progress).toBe(false)
    expect(rows.find((r) => r.user_id === bob.id)?.weekly_progress).toBe(true)

    const unknown = await applyPreferenceChange(admin, '00000000-0000-4000-8000-0000000000aa', 'weekly_progress', false)
    expect(unknown).toMatchObject({ ok: false, status: 404 })
    expect(await applyPreferenceChange(admin, aliceRow.unsubscribe_token, 'not_a_category', false)).toMatchObject({ ok: false, status: 400 })
    expect(await applyPreferenceChange(admin, 'not-a-uuid', 'weekly_progress', false)).toMatchObject({ ok: false, status: 400 })
    expect(await applyPreferenceChange(admin, null, null, false)).toMatchObject({ ok: false, status: 400 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `web/`): `npm run test:rls -- email-mailing`
Expected: FAIL — `../../lib/mail/unsubscribe` not found (and the tables do not exist yet).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261005000000_email_outbox.sql`:

```sql
-- Course mailing: per-user email preferences and the outbox queue.
-- Re-runnable; no "drop policy" (policies are guarded with pg_policies lookups).

create table if not exists email_preferences (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  teacher_announcements boolean not null default true,
  weekly_progress       boolean not null default true,
  course_activity       boolean not null default true,
  unsubscribe_token     uuid not null unique default gen_random_uuid(),
  updated_at            timestamptz not null default now()
);

alter table email_preferences enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_preferences' and policyname = 'email_prefs_select_own') then
    create policy email_prefs_select_own on email_preferences
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_preferences' and policyname = 'email_prefs_insert_own') then
    create policy email_prefs_insert_own on email_preferences
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_preferences' and policyname = 'email_prefs_update_own') then
    create policy email_prefs_update_own on email_preferences
      for update to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
end $$;

-- Users may set the category flags, never the unsubscribe token.
revoke all on email_preferences from anon, authenticated;
grant select on email_preferences to authenticated;
grant insert (user_id, teacher_announcements, weekly_progress, course_activity) on email_preferences to authenticated;
grant update (teacher_announcements, weekly_progress, course_activity, updated_at) on email_preferences to authenticated;

create table if not exists email_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null check (category in ('teacher_announcements', 'weekly_progress', 'course_activity')),
  template    text not null,
  payload     jsonb not null default '{}'::jsonb,
  dedupe_key  text not null unique,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts    int  not null default 0,
  last_error  text,
  send_after  timestamptz not null default now(),
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists email_outbox_due_idx on email_outbox (send_after) where status = 'pending';
create index if not exists email_outbox_sent_idx on email_outbox (sent_at) where status = 'sent';

-- RLS on with no policies and no grants: only the service role and SECURITY DEFINER code touch the queue.
alter table email_outbox enable row level security;
revoke all on email_outbox from anon, authenticated;

-- Claims due rows and leases them for 10 minutes so overlapping dispatcher runs never pick the same row.
create or replace function claim_email_batch(p_limit int)
returns setof email_outbox
language sql security definer set search_path = public as $$
  update email_outbox o
     set attempts = o.attempts + 1,
         send_after = now() + interval '10 minutes'
   where o.id in (
     select id from email_outbox
      where status = 'pending' and send_after <= now()
      order by send_after
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning o.*;
$$;

revoke execute on function claim_email_batch(int) from public, anon, authenticated;
grant execute on function claim_email_batch(int) to service_role;
```

- [ ] **Step 4: Implement `unsubscribe.ts`**

`web/lib/mail/unsubscribe.ts` (relative import so the RLS suite, which has no `@` alias, can load it):

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { isEmailCategory } from './categories'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PreferenceChange = { ok: true } | { ok: false; status: 400 | 404 | 500; error: string }

/** Flips one category for the user who owns `token`. Needs a service-role client. */
export async function applyPreferenceChange(
  client: SupabaseClient,
  token: string | null,
  category: string | null,
  subscribe: boolean,
): Promise<PreferenceChange> {
  if (!token || !UUID_RE.test(token) || !isEmailCategory(category)) {
    return { ok: false, status: 400, error: 'Lien invalide.' }
  }
  const { data, error } = await client
    .from('email_preferences')
    .update({ [category]: subscribe, updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .select('user_id')
  if (error) return { ok: false, status: 500, error: 'Erreur serveur.' }
  if (!data || data.length === 0) return { ok: false, status: 404, error: 'Lien introuvable.' }
  return { ok: true }
}
```

- [ ] **Step 5: Apply the migration locally and run the tests**

Run (from the worktree root): `docker ps` (confirm Supabase is up), then `supabase migration up`
Then (from `web/`): `npm run test:rls -- email-mailing`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add supabase/migrations/20261005000000_email_outbox.sql web/lib/mail/unsubscribe.ts web/__tests__/rls/email-mailing.test.ts
git commit -m "feat(mail): email preferences, outbox queue and claim function" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Event triggers and weekly digest function

**Files:**
- Create: `supabase/migrations/20261005000001_email_triggers.sql`
- Test: `web/__tests__/rls/email-mailing.test.ts` (append two `describe` blocks)

**Interfaces:**
- Consumes: `email_outbox`, `claim_email_batch` (Task 2). Existing tables `courses(owner_id, title, slug, summary, status, access, paid_approved)`, `enrollments(user_id, course_id)`, `lessons(id, course_id, title)`, `submissions(id, lesson_id, user_id, status, teacher_feedback, grade, reviewed_at)`, `lesson_progress(user_id, lesson_id, completed_at)`.
- Produces: outbox rows with these `template` names and payload keys (consumed by Task 1 templates) —
  `new_course {course_id, course_title, course_slug, summary}`, `submission_received {submission_id, lesson_title, course_title, course_slug}`, `submission_reviewed {submission_id, lesson_title, course_title, course_slug, feedback, grade}`, `weekly_progress {week_start, lessons_completed, courses:[{title, slug, completed_this_week, completed_total, total_lessons}]}`; and `enqueue_weekly_digest(p_week_start date default <Monday of last week>) returns int` (service role only).

- [ ] **Step 1: Write the failing tests**

Append to `web/__tests__/rls/email-mailing.test.ts` (add `seedCourse, type Seed` to the helpers import):

```ts
describe('email triggers', () => {
  let teacher: TestUser
  let l1: TestUser
  let l2: TestUser
  let seed: Seed

  const outbox = async (userId: string, template: string) =>
    must(await admin.from('email_outbox').select('dedupe_key, payload, category').eq('user_id', userId).eq('template', template), `outbox ${template}`)

  async function newCourse(ownerId: string) {
    return must(
      await admin.from('courses').insert({ owner_id: ownerId, title: `Cours ${uid()}`, slug: `c-${uid()}`, summary: 'Résumé', status: 'draft' }).select('id').single(),
      'create course',
    )
  }

  beforeAll(async () => {
    ;[teacher, l1, l2] = await Promise.all([createUser('tr-teacher'), createUser('tr-l1'), createUser('tr-l2')])
    seed = await seedCourse(teacher.id)
    await admin.from('courses').update({ status: 'published' }).eq('id', seed.course.id)
    must(await admin.from('enrollments').insert([{ user_id: l1.id, course_id: seed.course.id }, { user_id: teacher.id, course_id: seed.course.id }]).select(), 'enroll')
  })

  it('announces a newly published course to earlier learners of the same teacher, once, never to the author', async () => {
    const course = await newCourse(teacher.id)
    expect(await outbox(l1.id, 'new_course')).toHaveLength(0)

    must(await admin.from('courses').update({ status: 'published' }).eq('id', course.id).select(), 'publish')
    const rows = await outbox(l1.id, 'new_course')
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('teacher_announcements')
    expect(rows[0].dedupe_key).toBe(`new_course:${course.id}:${l1.id}`)
    expect(rows[0].payload.course_slug).toMatch(/^c-/)

    // Replay: unpublish then publish again must not queue a second row.
    await admin.from('courses').update({ status: 'draft' }).eq('id', course.id)
    await admin.from('courses').update({ status: 'published' }).eq('id', course.id)
    expect(await outbox(l1.id, 'new_course')).toHaveLength(1)

    expect(await outbox(l2.id, 'new_course')).toHaveLength(0)
    expect(await outbox(teacher.id, 'new_course')).toHaveLength(0)
  })

  it('queues one email to the teacher when a learner submits, and one to the learner when it is reviewed', async () => {
    const lesson = must(
      await admin.from('lessons').insert({ section_id: seed.section.id, course_id: seed.course.id, title: 'Devoir', position: 50, kind: 'assignment' }).select('id').single(),
      'lesson',
    )
    const sub = must(
      await l1.client.from('submissions').insert({ lesson_id: lesson.id, user_id: l1.id, answer_text: 'ma réponse' }).select('id').single(),
      'submit',
    )
    const received = (await outbox(teacher.id, 'submission_received')).filter((r) => r.dedupe_key === `submitted:${sub.id}`)
    expect(received).toHaveLength(1)
    expect(await outbox(l1.id, 'submission_reviewed')).toHaveLength(0)

    const reviewedAt = new Date().toISOString()
    must(
      await teacher.client.from('submissions').update({ status: 'reviewed', teacher_feedback: 'Bien joué', grade: 80, reviewed_at: reviewedAt }).eq('id', sub.id).select(),
      'review',
    )
    const reviewed = (await outbox(l1.id, 'submission_reviewed')).filter((r) => r.payload.submission_id === sub.id)
    expect(reviewed).toHaveLength(1)
    expect(reviewed[0].payload.feedback).toBe('Bien joué')
    expect(reviewed[0].payload.grade).toBe(80)

    // Editing the feedback with the same reviewed_at must not queue a duplicate.
    await teacher.client.from('submissions').update({ teacher_feedback: 'Très bien joué', reviewed_at: reviewedAt }).eq('id', sub.id)
    expect((await outbox(l1.id, 'submission_reviewed')).filter((r) => r.payload.submission_id === sub.id)).toHaveLength(1)
  })
})

describe('weekly digest', () => {
  let teacher: TestUser
  let active: TestUser
  let idle: TestUser

  const mondayOf = (d: Date): string => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7))
    return x.toISOString().slice(0, 10)
  }

  beforeAll(async () => {
    ;[teacher, active, idle] = await Promise.all([createUser('dg-teacher'), createUser('dg-active'), createUser('dg-idle')])
  })

  it('queues one digest per active learner for the week, none for idle learners, and is idempotent', async () => {
    const seed = await seedCourse(teacher.id)
    const lesson = must(
      await admin.from('lessons').insert({ section_id: seed.section.id, course_id: seed.course.id, title: 'L1', position: 1, kind: 'text' }).select('id').single(),
      'lesson',
    )
    const doneAt = new Date(Date.now() - 3 * 86_400_000)
    must(await admin.from('lesson_progress').insert({ user_id: active.id, lesson_id: lesson.id, completed_at: doneAt.toISOString(), score: 90 }).select(), 'progress')
    const week = mondayOf(doneAt)

    const first = must(await admin.rpc('enqueue_weekly_digest', { p_week_start: week }), 'digest 1')
    expect(first).toBeGreaterThanOrEqual(1)
    const rows = must(await admin.from('email_outbox').select('user_id, payload, category').eq('dedupe_key', `digest:${week}:${active.id}`), 'digest row')
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('weekly_progress')
    expect(rows[0].payload.lessons_completed).toBe(1)
    expect(rows[0].payload.courses[0]).toMatchObject({ completed_this_week: 1, completed_total: 1, total_lessons: 1 })

    const idleRows = must(await admin.from('email_outbox').select('id').eq('dedupe_key', `digest:${week}:${idle.id}`), 'idle rows')
    expect(idleRows).toHaveLength(0)

    must(await admin.rpc('enqueue_weekly_digest', { p_week_start: week }), 'digest 2')
    const again = must(await admin.from('email_outbox').select('id').eq('dedupe_key', `digest:${week}:${active.id}`), 'digest again')
    expect(again).toHaveLength(1)
  })

  it('refuses signed-in users calling the digest function', async () => {
    const { error } = await active.client.rpc('enqueue_weekly_digest', { p_week_start: '2026-01-05' })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npm run test:rls -- email-mailing`
Expected: the new tests FAIL (no rows queued; `enqueue_weekly_digest` does not exist).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261005000001_email_triggers.sql`:

```sql
-- Course mailing: triggers that queue emails, and the weekly digest enqueue function.
-- All functions are SECURITY DEFINER because the triggering user (a learner, a teacher)
-- has no access to email_outbox.

-- ── New course published → learners of the same teacher's earlier courses ───
create or replace function enqueue_new_course_emails()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_live  boolean;
  was_live boolean := false;
begin
  is_live := new.status = 'published' and (new.access = 'free' or new.paid_approved);
  if tg_op = 'UPDATE' then
    was_live := old.status = 'published' and (old.access = 'free' or old.paid_approved);
  end if;
  if not is_live or was_live then
    return new;
  end if;

  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select distinct e.user_id,
         'teacher_announcements',
         'new_course',
         jsonb_build_object('course_id', new.id, 'course_title', new.title, 'course_slug', new.slug, 'summary', new.summary),
         'new_course:' || new.id || ':' || e.user_id
    from enrollments e
    join courses c on c.id = e.course_id
   where c.owner_id = new.owner_id
     and c.id <> new.id
     and e.user_id <> new.owner_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists courses_enqueue_new_course_emails on courses;
create trigger courses_enqueue_new_course_emails
  after insert or update of status, access, paid_approved on courses
  for each row execute function enqueue_new_course_emails();

-- ── Learner submits → the course owner ──────────────────────────────────────
create or replace function enqueue_submission_received_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select c.owner_id,
         'course_activity',
         'submission_received',
         jsonb_build_object('submission_id', new.id, 'lesson_title', l.title, 'course_title', c.title, 'course_slug', c.slug),
         'submitted:' || new.id
    from lessons l
    join courses c on c.id = l.course_id
   where l.id = new.lesson_id
     and c.owner_id <> new.user_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists submissions_enqueue_received on submissions;
create trigger submissions_enqueue_received
  after insert on submissions
  for each row execute function enqueue_submission_received_email();

-- ── Teacher reviews → the learner (once per distinct reviewed_at) ───────────
create or replace function enqueue_submission_reviewed_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'reviewed' or new.teacher_feedback is null or new.reviewed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'reviewed' and old.reviewed_at is not distinct from new.reviewed_at then
    return new;
  end if;

  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select new.user_id,
         'course_activity',
         'submission_reviewed',
         jsonb_build_object(
           'submission_id', new.id, 'lesson_title', l.title, 'course_title', c.title,
           'course_slug', c.slug, 'feedback', new.teacher_feedback, 'grade', new.grade),
         'reviewed:' || new.id || ':' || extract(epoch from new.reviewed_at)::bigint
    from lessons l
    join courses c on c.id = l.course_id
   where l.id = new.lesson_id
  on conflict (dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists submissions_enqueue_reviewed on submissions;
create trigger submissions_enqueue_reviewed
  after insert or update of status, teacher_feedback, reviewed_at on submissions
  for each row execute function enqueue_submission_reviewed_email();

-- ── Weekly digest: one row per learner with activity in [week, week + 7 days) ─
create or replace function enqueue_weekly_digest(
  p_week_start date default (date_trunc('week', now() - interval '7 days'))::date
)
returns int language plpgsql security definer set search_path = public as $$
declare
  inserted int;
begin
  with done as (
    select lp.user_id, l.course_id, count(*) as completed
      from lesson_progress lp
      join lessons l on l.id = lp.lesson_id
     where lp.completed_at >= p_week_start and lp.completed_at < p_week_start + 7
     group by lp.user_id, l.course_id
  ), per_user as (
    select d.user_id,
           sum(d.completed)::int as lessons_completed,
           jsonb_agg(jsonb_build_object(
             'title', c.title,
             'slug', c.slug,
             'completed_this_week', d.completed,
             'completed_total', (select count(*) from lesson_progress lp2 join lessons l2 on l2.id = lp2.lesson_id
                                  where lp2.user_id = d.user_id and l2.course_id = d.course_id),
             'total_lessons', (select count(*) from lessons l3 where l3.course_id = d.course_id)
           ) order by c.title) as courses
      from done d
      join courses c on c.id = d.course_id
     group by d.user_id
  )
  insert into email_outbox (user_id, category, template, payload, dedupe_key)
  select pu.user_id,
         'weekly_progress',
         'weekly_progress',
         jsonb_build_object('week_start', p_week_start, 'lessons_completed', pu.lessons_completed, 'courses', pu.courses),
         'digest:' || p_week_start || ':' || pu.user_id
    from per_user pu
  on conflict (dedupe_key) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end $$;

revoke execute on function enqueue_weekly_digest(date) from public, anon, authenticated;
grant execute on function enqueue_weekly_digest(date) to service_role;
```

- [ ] **Step 4: Apply and run the tests**

Run: `supabase migration up` (worktree root), then (from `web/`) `npm run test:rls -- email-mailing`
Expected: PASS (all tests in the file). If publishing a course is blocked by an existing guard trigger, add the minimum content that guard demands to the test setup (do not weaken the guard).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add supabase/migrations/20261005000001_email_triggers.sql web/__tests__/rls/email-mailing.test.ts
git commit -m "feat(mail): queue emails from course, submission and digest events" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Dispatcher logic, real deps and route

**Files:**
- Create: `web/lib/mail/dispatcher.ts`, `web/lib/mail/dispatcher-deps.ts`, `web/app/api/mail/dispatch/route.ts`
- Test: `web/__tests__/mail-dispatcher.test.ts`

**Interfaces:**
- Consumes: `renderTemplate`, `RenderContext` (Task 1); `OutgoingEmail`, `SendResult`, `sendEmail` (Task 1); `EmailCategory` (Task 1); `claim_email_batch` and table columns (Task 2); `createServiceClient` from `@/lib/supabase-service`; `SITE_URL` from `@/lib/site`.
- Produces: `MAX_ATTEMPTS`, `retryDelayMs(attempts)`, `isAuthorizedCron(header: string | null, secret: string | undefined): boolean`, `runDispatch(deps: DispatcherDeps, opts: DispatchOptions): Promise<DispatchSummary>`, types `OutboxRow`, `PreferenceRecord`, `RowOutcome`, `DispatcherDeps`, `DispatchOptions`, `DispatchSummary`; `createDispatcherDeps(client?)`.

- [ ] **Step 1: Write the failing tests**

`web/__tests__/mail-dispatcher.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { MAX_ATTEMPTS, isAuthorizedCron, retryDelayMs, runDispatch, type DispatcherDeps, type OutboxRow, type PreferenceRecord, type RowOutcome } from '@/lib/mail/dispatcher'

const NOW = new Date('2026-10-05T07:00:00Z')
const opts = { batchSize: 20, dailyLimit: 90, baseUrl: 'https://apprendre-le-bhete.com' }

function row(over: Partial<OutboxRow> = {}): OutboxRow {
  return { id: 'r1', user_id: 'u1', category: 'course_activity', template: 'submission_received', payload: { lesson_title: 'L', course_title: 'C', course_slug: 's' }, dedupe_key: 'k1', attempts: 1, ...over }
}

const prefs = (over: Partial<PreferenceRecord> = {}): PreferenceRecord => ({
  unsubscribe_token: '11111111-1111-4111-8111-111111111111',
  teacher_announcements: true,
  weekly_progress: true,
  course_activity: true,
  ...over,
})

function makeDeps(rows: OutboxRow[], over: Partial<DispatcherDeps> = {}) {
  const finished: Array<[string, RowOutcome]> = []
  const deps: DispatcherDeps = {
    countSentSince: vi.fn().mockResolvedValue(0),
    claim: vi.fn().mockResolvedValue(rows),
    getPreferences: vi.fn().mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, prefs()]))),
    getEmail: vi.fn().mockResolvedValue('a@b.c'),
    send: vi.fn().mockResolvedValue({ ok: true, id: 'resend-1' }),
    finish: vi.fn().mockImplementation(async (id: string, outcome: RowOutcome) => { finished.push([id, outcome]) }),
    now: () => NOW,
    ...over,
  }
  return { deps, finished }
}

describe('retryDelayMs', () => {
  it('grows quadratically in 5-minute units', () => {
    expect(retryDelayMs(1)).toBe(5 * 60_000)
    expect(retryDelayMs(2)).toBe(20 * 60_000)
    expect(retryDelayMs(3)).toBe(45 * 60_000)
  })
})

describe('isAuthorizedCron', () => {
  it('rejects when no secret is configured, when the header is missing, and when it is wrong', () => {
    expect(isAuthorizedCron('Bearer x', undefined)).toBe(false)
    expect(isAuthorizedCron('Bearer x', '')).toBe(false)
    expect(isAuthorizedCron(null, 'x')).toBe(false)
    expect(isAuthorizedCron('Bearer y', 'x')).toBe(false)
  })
  it('accepts the exact bearer token', () => {
    expect(isAuthorizedCron('Bearer s3cret', 's3cret')).toBe(true)
  })
})

describe('runDispatch', () => {
  it('sends a due row with unsubscribe headers and marks it sent', async () => {
    const { deps, finished } = makeDeps([row()])
    const summary = await runDispatch(deps, opts)
    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 0, retried: 0 })
    const sent = (deps.send as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(sent.to).toBe('a@b.c')
    expect(sent.headers['List-Unsubscribe']).toContain('/api/mail/unsubscribe?token=11111111-1111-4111-8111-111111111111&category=course_activity')
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(finished).toEqual([['r1', { status: 'sent', sent_at: NOW.toISOString() }]])
  })

  it('skips without sending when the category is switched off', async () => {
    const { deps, finished } = makeDeps([row()], {
      getPreferences: vi.fn().mockResolvedValue(new Map([['u1', prefs({ course_activity: false })]])),
    })
    const summary = await runDispatch(deps, opts)
    expect(summary.skipped).toBe(1)
    expect(deps.send).not.toHaveBeenCalled()
    expect(deps.getEmail).not.toHaveBeenCalled()
    expect(finished[0][1].status).toBe('skipped')
  })

  it('skips when the user has no email address', async () => {
    const { deps } = makeDeps([row()], { getEmail: vi.fn().mockResolvedValue(null) })
    expect((await runDispatch(deps, opts)).skipped).toBe(1)
    expect(deps.send).not.toHaveBeenCalled()
  })

  it('fails permanently on an unknown template without sending', async () => {
    const { deps, finished } = makeDeps([row({ template: 'nope' })])
    expect((await runDispatch(deps, opts)).failed).toBe(1)
    expect(deps.send).not.toHaveBeenCalled()
    expect(finished[0][1]).toMatchObject({ status: 'failed' })
  })

  it('reschedules with backoff when sending fails', async () => {
    const { deps, finished } = makeDeps([row({ attempts: 2 })], { send: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }) })
    expect((await runDispatch(deps, opts)).retried).toBe(1)
    expect(finished[0][1]).toEqual({ status: 'pending', last_error: 'boom', send_after: new Date(NOW.getTime() + 20 * 60_000).toISOString() })
  })

  it('gives up after MAX_ATTEMPTS', async () => {
    const { deps, finished } = makeDeps([row({ attempts: MAX_ATTEMPTS })], { send: vi.fn().mockResolvedValue({ ok: false, error: 'boom' }) })
    expect((await runDispatch(deps, opts)).failed).toBe(1)
    expect(finished[0][1]).toEqual({ status: 'failed', last_error: 'boom' })
  })

  it('treats a throwing dependency as a retryable failure and keeps going', async () => {
    const { deps, finished } = makeDeps([row({ id: 'a' }), row({ id: 'b', dedupe_key: 'k2' })], {
      getEmail: vi.fn().mockRejectedValueOnce(new Error('auth down')).mockResolvedValue('a@b.c'),
    })
    const summary = await runDispatch(deps, opts)
    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 0, retried: 1 })
    expect(finished.map(([id]) => id)).toEqual(['a', 'b'])
  })

  it('claims nothing once the daily limit is reached', async () => {
    const { deps } = makeDeps([row()], { countSentSince: vi.fn().mockResolvedValue(90) })
    expect(await runDispatch(deps, opts)).toEqual({ sent: 0, skipped: 0, failed: 0, retried: 0 })
    expect(deps.claim).not.toHaveBeenCalled()
  })

  it('claims at most the remaining daily budget', async () => {
    const { deps } = makeDeps([], { countSentSince: vi.fn().mockResolvedValue(85) })
    await runDispatch(deps, opts)
    expect(deps.claim).toHaveBeenCalledWith(5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npm run test -- __tests__/mail-dispatcher.test.ts`
Expected: FAIL — `@/lib/mail/dispatcher` not found.

- [ ] **Step 3: Implement `dispatcher.ts`**

`web/lib/mail/dispatcher.ts`:

```ts
import { timingSafeEqual } from 'node:crypto'
import type { EmailCategory } from './categories'
import type { OutgoingEmail, SendResult } from './send'
import { renderTemplate } from './templates'

export const MAX_ATTEMPTS = 5

/** `attempts` is the value AFTER claim_email_batch incremented it (1 on the first try). */
export interface OutboxRow {
  id: string
  user_id: string
  category: EmailCategory
  template: string
  payload: Record<string, unknown>
  dedupe_key: string
  attempts: number
}

export interface PreferenceRecord {
  unsubscribe_token: string
  teacher_announcements: boolean
  weekly_progress: boolean
  course_activity: boolean
}

export type RowOutcome =
  | { status: 'sent'; sent_at: string }
  | { status: 'skipped'; last_error: string }
  | { status: 'failed'; last_error: string }
  | { status: 'pending'; last_error: string; send_after: string }

export interface DispatcherDeps {
  countSentSince(since: Date): Promise<number>
  claim(limit: number): Promise<OutboxRow[]>
  /** Must return an entry for every requested user (creating missing preference rows). */
  getPreferences(userIds: string[]): Promise<Map<string, PreferenceRecord>>
  getEmail(userId: string): Promise<string | null>
  send(email: OutgoingEmail): Promise<SendResult>
  finish(id: string, outcome: RowOutcome): Promise<void>
  now(): Date
}

export interface DispatchOptions {
  batchSize: number
  dailyLimit: number
  baseUrl: string
}

export interface DispatchSummary {
  sent: number
  skipped: number
  failed: number
  retried: number
}

export function retryDelayMs(attempts: number): number {
  return attempts * attempts * 5 * 60_000
}

export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function retryOrFail(row: OutboxRow, message: string, now: Date): RowOutcome {
  if (row.attempts >= MAX_ATTEMPTS) return { status: 'failed', last_error: message }
  return { status: 'pending', last_error: message, send_after: new Date(now.getTime() + retryDelayMs(row.attempts)).toISOString() }
}

async function processRow(row: OutboxRow, prefs: PreferenceRecord | undefined, deps: DispatcherDeps, opts: DispatchOptions): Promise<RowOutcome> {
  try {
    if (!prefs) return retryOrFail(row, 'préférences indisponibles', deps.now())
    if (prefs[row.category] === false) return { status: 'skipped', last_error: 'catégorie désactivée' }

    const to = await deps.getEmail(row.user_id)
    if (!to) return { status: 'skipped', last_error: 'aucune adresse e-mail' }

    const qs = `token=${encodeURIComponent(prefs.unsubscribe_token)}&category=${encodeURIComponent(row.category)}`
    const rendered = renderTemplate(row.template, row.payload, {
      baseUrl: opts.baseUrl,
      unsubscribeUrl: `${opts.baseUrl}/notifications/unsubscribe?${qs}`,
    })
    if (!rendered) return { status: 'failed', last_error: `modèle inconnu : ${row.template}` }

    const result = await deps.send({
      to,
      ...rendered,
      headers: {
        'List-Unsubscribe': `<${opts.baseUrl}/api/mail/unsubscribe?${qs}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
    if (result.ok) return { status: 'sent', sent_at: deps.now().toISOString() }
    return retryOrFail(row, result.error, deps.now())
  } catch (err) {
    return retryOrFail(row, err instanceof Error ? err.message : String(err), deps.now())
  }
}

export async function runDispatch(deps: DispatcherDeps, opts: DispatchOptions): Promise<DispatchSummary> {
  const summary: DispatchSummary = { sent: 0, skipped: 0, failed: 0, retried: 0 }
  const now = deps.now()
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const budget = opts.dailyLimit - (await deps.countSentSince(startOfDay))
  const limit = Math.min(opts.batchSize, budget)
  if (limit <= 0) return summary

  const rows = await deps.claim(limit)
  if (rows.length === 0) return summary

  const prefs = await deps.getPreferences([...new Set(rows.map((r) => r.user_id))])
  for (const row of rows) {
    const outcome = await processRow(row, prefs.get(row.user_id), deps, opts)
    try {
      await deps.finish(row.id, outcome)
    } catch (err) {
      // The row keeps its 10-minute lease and is retried afterwards (at-least-once delivery).
      console.error('[mail] could not record outcome for', row.id, err)
      continue
    }
    if (outcome.status === 'sent') summary.sent++
    else if (outcome.status === 'skipped') summary.skipped++
    else if (outcome.status === 'failed') summary.failed++
    else summary.retried++
  }
  return summary
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `web/`): `npm run test -- __tests__/mail-dispatcher.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Implement the real deps and the route**

`web/lib/mail/dispatcher-deps.ts`:

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-service'
import type { DispatcherDeps, OutboxRow, PreferenceRecord, RowOutcome } from './dispatcher'
import { sendEmail } from './send'

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

export function createDispatcherDeps(client: SupabaseClient = createServiceClient()): DispatcherDeps {
  return {
    async countSentSince(since) {
      const { count, error } = await client
        .from('email_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', since.toISOString())
      if (error) throw new Error(error.message)
      return count ?? 0
    },

    async claim(limit) {
      return (must(await client.rpc('claim_email_batch', { p_limit: limit })) ?? []) as OutboxRow[]
    },

    async getPreferences(userIds) {
      must(await client.from('email_preferences').upsert(userIds.map((user_id) => ({ user_id })), { onConflict: 'user_id', ignoreDuplicates: true }))
      const rows = must(
        await client
          .from('email_preferences')
          .select('user_id, unsubscribe_token, teacher_announcements, weekly_progress, course_activity')
          .in('user_id', userIds),
      ) as Array<PreferenceRecord & { user_id: string }>
      return new Map(rows.map((r) => [r.user_id, r]))
    },

    async getEmail(userId) {
      const { data } = await client.auth.admin.getUserById(userId)
      return data?.user?.email ?? null
    },

    send: (email) => sendEmail(email),

    async finish(id, outcome: RowOutcome) {
      must(
        await client
          .from('email_outbox')
          .update({
            status: outcome.status,
            last_error: 'last_error' in outcome ? outcome.last_error : null,
            ...(outcome.status === 'sent' ? { sent_at: outcome.sent_at } : {}),
            ...(outcome.status === 'pending' ? { send_after: outcome.send_after } : {}),
          })
          .eq('id', id),
      )
    },

    now: () => new Date(),
  }
}
```

`web/app/api/mail/dispatch/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/site'
import { isAuthorizedCron, runDispatch } from '@/lib/mail/dispatcher'
import { createDispatcherDeps } from '@/lib/mail/dispatcher-deps'

export const dynamic = 'force-dynamic'

function intEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** Called by pg_cron (see supabase/ops/mail-cron.sql) with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })
  }
  try {
    const summary = await runDispatch(createDispatcherDeps(), {
      batchSize: intEnv('MAIL_BATCH_SIZE', 20),
      dailyLimit: intEnv('MAIL_DAILY_LIMIT', 90),
      baseUrl: SITE_URL,
    })
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[mail] dispatch failed:', err)
    return NextResponse.json({ error: 'Échec du traitement.' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Type-check and lint**

Run (from `web/`): `npx tsc --noEmit` and `npx eslint lib/mail app/api/mail`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add web/lib/mail/dispatcher.ts web/lib/mail/dispatcher-deps.ts web/app/api/mail/dispatch web/__tests__/mail-dispatcher.test.ts
git commit -m "feat(mail): outbox dispatcher with preferences, retries and daily cap" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Unsubscribe route and notification settings pages

**Files:**
- Create: `web/app/api/mail/unsubscribe/route.ts`, `web/app/notifications/unsubscribe/page.tsx`, `web/components/UnsubscribeConfirm.tsx`, `web/app/notifications/page.tsx`, `web/components/NotificationPreferences.tsx`
- Modify: `web/app/profile/layout.tsx`

**Interfaces:**
- Consumes: `applyPreferenceChange` (Task 2), `CATEGORY_LABELS`, `EMAIL_CATEGORIES`, `isEmailCategory`, `EmailCategory` (Task 1), `createServiceClient`, `createClient` from `@/lib/supabase-browser`.
- Produces: `POST /api/mail/unsubscribe?token=&category=` (body optional `{ "subscribe": true }`; default unsubscribes; also accepts the form-encoded one-click POST from mail clients), pages `/notifications` and `/notifications/unsubscribe?token=&category=`.

The validation logic is already covered by Task 2's tests (`applyPreferenceChange`); this task is thin glue, verified by type-check, lint and the manual check in Task 7.

- [ ] **Step 1: Write the unsubscribe route**

`web/app/api/mail/unsubscribe/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { applyPreferenceChange } from '@/lib/mail/unsubscribe'

export const dynamic = 'force-dynamic'

/**
 * RFC 8058 one-click target (mail clients POST a form body here) and the endpoint behind the
 * confirmation page. The token in the query string identifies the user; no login is needed.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const body = (await request.json().catch(() => ({}))) as { subscribe?: unknown }
  const result = await applyPreferenceChange(
    createServiceClient(),
    url.searchParams.get('token'),
    url.searchParams.get('category'),
    body.subscribe === true,
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the confirmation page and its client component**

`web/app/notifications/unsubscribe/page.tsx` (read `node_modules/next/dist/docs/` first to confirm `searchParams` is a Promise in this version):

```tsx
import type { Metadata } from 'next'
import { UnsubscribeConfirm } from '@/components/UnsubscribeConfirm'
import { CATEGORY_LABELS, isEmailCategory } from '@/lib/mail/categories'

export const metadata: Metadata = {
  title: 'Se désabonner',
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; category?: string }>
}) {
  const { token, category } = await searchParams
  if (!token || !isEmailCategory(category)) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-bold">Lien invalide</h1>
        <p className="mt-2 text-muted-foreground">Ce lien de désabonnement est incomplet ou a expiré.</p>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <UnsubscribeConfirm token={token} category={category} label={CATEGORY_LABELS[category]} />
    </main>
  )
}
```

`web/components/UnsubscribeConfirm.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type State = 'idle' | 'working' | 'unsubscribed' | 'resubscribed' | 'error'

export function UnsubscribeConfirm({ token, category, label }: { token: string; category: string; label: string }) {
  const [state, setState] = useState<State>('idle')

  async function change(subscribe: boolean) {
    setState('working')
    try {
      const res = await fetch(
        `/api/mail/unsubscribe?token=${encodeURIComponent(token)}&category=${encodeURIComponent(category)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscribe }) },
      )
      setState(res.ok ? (subscribe ? 'resubscribed' : 'unsubscribed') : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Se désabonner</h1>
      <p className="text-muted-foreground">Catégorie : <strong>{label}</strong></p>

      {(state === 'idle' || state === 'working' || state === 'resubscribed') && (
        <>
          {state === 'resubscribed' && <p className="text-emerald-700">Vous êtes de nouveau abonné.</p>}
          <Button onClick={() => change(false)} disabled={state === 'working'}>
            Me désabonner
          </Button>
        </>
      )}

      {state === 'unsubscribed' && (
        <>
          <p>Vous ne recevrez plus ces e-mails.</p>
          <Button variant="outline" onClick={() => change(true)}>Me réabonner</Button>
        </>
      )}

      {state === 'error' && <p className="text-destructive">Une erreur est survenue. Réessayez plus tard.</p>}

      <p className="text-sm text-muted-foreground">
        Vous pouvez aussi gérer toutes vos préférences dans <Link className="underline" href="/notifications">vos notifications</Link>.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Write the settings page and component**

`web/app/notifications/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { NotificationPreferences } from '@/components/NotificationPreferences'

export const metadata: Metadata = {
  title: 'Mes notifications',
  robots: { index: false, follow: false },
}

export default function NotificationsPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-bold">Mes notifications par e-mail</h1>
      <p className="mt-2 text-muted-foreground">Choisissez les e-mails que vous souhaitez recevoir. Les e-mails liés à votre compte (bienvenue, sécurité) sont toujours envoyés.</p>
      <NotificationPreferences />
    </main>
  )
}
```

`web/components/NotificationPreferences.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { CATEGORY_LABELS, EMAIL_CATEGORIES, type EmailCategory } from '@/lib/mail/categories'

type Prefs = Record<EmailCategory, boolean>
const DEFAULTS: Prefs = { teacher_announcements: true, weekly_progress: true, course_activity: true }

export function NotificationPreferences() {
  const supabase = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: auth } = await supabase.auth.getUser()
      if (cancelled) return
      if (!auth.user) {
        setLoading(false)
        return
      }
      setUserId(auth.user.id)
      const { data } = await supabase
        .from('email_preferences')
        .select('teacher_announcements, weekly_progress, course_activity')
        .eq('user_id', auth.user.id)
        .maybeSingle()
      if (!cancelled && data) setPrefs(data as Prefs)
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function toggle(category: EmailCategory, value: boolean) {
    if (!userId) return
    const previous = prefs
    setPrefs({ ...prefs, [category]: value })
    setError(null)
    const { error: saveError } = await supabase
      .from('email_preferences')
      .upsert({ user_id: userId, [category]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (saveError) {
      setPrefs(previous)
      setError('Impossible d’enregistrer. Réessayez.')
    }
  }

  if (loading) return <p className="mt-8 text-muted-foreground">Chargement…</p>
  if (!userId) {
    return (
      <p className="mt-8">
        <Link className="underline" href="/auth">Connectez-vous</Link> pour gérer vos notifications.
      </p>
    )
  }

  return (
    <div className="mt-8 space-y-4">
      {EMAIL_CATEGORIES.map((category) => (
        <label key={category} className="flex items-center gap-3 rounded-lg border p-4">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={prefs[category]}
            onChange={(e) => void toggle(category, e.target.checked)}
          />
          <span>{CATEGORY_LABELS[category]}</span>
        </label>
      ))}
      {error && <p className="text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Link the settings page from the profile**

Replace `web/app/profile/layout.tsx` body with:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { ProfileCourses } from '@/components/courses/ProfileCourses'

export const metadata: Metadata = {
  title: 'Mon profil',
  robots: { index: false, follow: false },
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProfileCourses />
      <div className="mx-auto max-w-3xl px-4 pb-12">
        <Link className="text-sm underline" href="/notifications">Gérer mes notifications par e-mail</Link>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Type-check and lint**

Run (from `web/`): `npx tsc --noEmit` and `npx eslint app/notifications app/api/mail components/UnsubscribeConfirm.tsx components/NotificationPreferences.tsx app/profile/layout.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add web/app/api/mail/unsubscribe web/app/notifications web/components/UnsubscribeConfirm.tsx web/components/NotificationPreferences.tsx web/app/profile/layout.tsx
git commit -m "feat(mail): one-click unsubscribe and notification settings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Move existing senders onto the shared path

**Files:**
- Delete: `web/app/api/courses/submissions/notify/route.ts`, `web/lib/courses/assignment-email.ts`
- Modify: `web/lib/courses/mutations.ts:542-549`, `web/app/api/send-welcome/route.ts`, `web/app/api/contact/route.ts`

**Interfaces:**
- Consumes: `sendEmail`, `renderWelcomeEmail` (Task 1); the `submissions_enqueue_reviewed` trigger (Task 3) now owns the "devoir corrigé" email.

Why: the review email is now queued by the database, so the client-triggered notify route (and its hard-coded, mistyped `notif@apprendrelebete.com` sender) must go, or learners would get two emails. `send-welcome` is also currently unauthenticated and interpolates the posted `name` into HTML; it will send only to the signed-in user's own address.

- [ ] **Step 1: Remove the notify route and helper**

Run (from the worktree root):
```bash
git rm web/app/api/courses/submissions/notify/route.ts web/lib/courses/assignment-email.ts
```

- [ ] **Step 2: Remove the fire-and-forget call in `mutations.ts`**

In `web/lib/courses/mutations.ts`, replace this exact block:

```ts
  if (updateError) return fail(updateError.message)

  // The email needs the service-role key and the Resend key, so a server route
  // sends it. Fire-and-forget: a failed notification must not fail the review.
  void fetch('/api/courses/submissions/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId }),
  }).catch(() => null)

  return ok(null)
```

with:

```ts
  if (updateError) return fail(updateError.message)

  // The "devoir corrigé" email is queued by the submissions_enqueue_reviewed database trigger.
  return ok(null)
```

Then run `grep -rn "submissions/notify\|assignment-email\|sendSubmissionReviewedEmail" web --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next` — Expected: no matches (if a test in `web/__tests__/course-mutations.test.ts` asserted the notify `fetch`, delete that assertion).

- [ ] **Step 3: Rewrite `send-welcome`**

Replace the whole of `web/app/api/send-welcome/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { SITE_URL } from '@/lib/site'
import { sendEmail } from '@/lib/mail/send'
import { renderWelcomeEmail } from '@/lib/mail/templates'

export const dynamic = 'force-dynamic'

/** Welcome email for the signed-in user only: the address comes from the session, never from the request body. */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })

  const meta = user.user_metadata as { full_name?: unknown } | null
  const name = typeof meta?.full_name === 'string' && meta.full_name.trim() ? meta.full_name : user.email.split('@')[0]

  const result = await sendEmail({ to: user.email, ...renderWelcomeEmail({ name, baseUrl: SITE_URL }) })
  if (!result.ok) {
    console.error('[send-welcome] failed:', result.error)
    return NextResponse.json({ error: 'Email sending failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

(`web/app/auth/page.tsx` keeps posting `{ email, name }`; the extra body is ignored.)

- [ ] **Step 4: Rewrite `contact`**

Replace the whole of `web/app/api/contact/route.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { escapeHtml } from '@/lib/courses/assignment'
import { sendEmail } from '@/lib/mail/send'

export const dynamic = 'force-dynamic'

const CONTACT_INBOX = 'curtiscapre@gmail.com'

export async function POST(req: NextRequest) {
  const { name, email, subject, message } = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string' || !name || !email || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const subj = typeof subject === 'string' && subject ? subject : 'Sans sujet'
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

  const result = await sendEmail({
    to: CONTACT_INBOX,
    replyTo: oneLine(email),
    subject: `[Contact] ${oneLine(subj)} — de ${oneLine(name)}`,
    html: `<p><strong>De :</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p><strong>Sujet :</strong> ${escapeHtml(subj)}</p><hr /><p>${escapeHtml(message).replace(/\n/g, '<br />')}</p>`,
    text: `De : ${name} (${email})\nSujet : ${subj}\n\n${message}`,
  })
  if (!result.ok) {
    console.error('[contact] failed:', result.error)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Verify**

Run (from `web/`): `npx tsc --noEmit`, `npx eslint app/api lib/courses`, `npm run test`
Expected: no type or lint errors; the full unit suite passes.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add -A web
git commit -m "refactor(mail): route welcome, contact and review emails through the shared sender" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Scheduling, environment, live check

**Files:**
- Create: `supabase/ops/mail-cron.sql`, `web/scripts/mail-live-check.mjs`
- Modify: `web/.env.local.example`

**Interfaces:**
- Consumes: `/api/mail/dispatch` (Task 4), `enqueue_weekly_digest` (Task 3).

- [ ] **Step 1: Document the new environment variables**

Append to `web/.env.local.example`:

```
# Mailing (see docs/superpowers/specs/2026-10-03-course-mailing-design.md)
# CRON_SECRET: shared secret pg_cron sends as "Authorization: Bearer <secret>" to /api/mail/dispatch.
CRON_SECRET=generate-a-long-random-string
MAIL_BATCH_SIZE=20
MAIL_DAILY_LIMIT=90
```

Also change the existing `RESEND_FROM_EMAIL` line to `RESEND_FROM_EMAIL=Parlons Bhété <notif@apprendre-le-bhete.com>`.

- [ ] **Step 2: Write the cron setup script (run by hand, contains no secret)**

`supabase/ops/mail-cron.sql`:

```sql
-- One-time scheduling for course mailing. Run by hand in the Supabase SQL editor (production)
-- after the two email migrations are applied. Not a migration: it needs a real secret.
--
-- 1. Enable the extensions (Dashboard → Database → Extensions, or the two lines below).
-- 2. Store the secret once in Vault (use the SAME value as the CRON_SECRET env var in Vercel):
--      select vault.create_secret('<CRON_SECRET value>', 'mail_cron_secret');
-- 3. Run the rest of this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-running replaces the jobs.
select cron.unschedule(jobid) from cron.job where jobname in ('mail-dispatch', 'mail-weekly-digest');

-- Every 5 minutes: ask the app to send due emails.
select cron.schedule(
  'mail-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://apprendre-le-bhete.com/api/mail/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mail_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Mondays 07:00 UTC (07:00 in Côte d'Ivoire): queue last week's progress digests.
select cron.schedule('mail-weekly-digest', '0 7 * * 1', $$select enqueue_weekly_digest();$$);
```

- [ ] **Step 3: Write the manual live-check script**

`web/scripts/mail-live-check.mjs` — queues one real `weekly_progress` email for a given address on a **local** Supabase stack and calls the local dispatcher. Usage (from `web/`): `node scripts/mail-live-check.mjs curtiscapre@gmail.com`.

```js
// Manual end-to-end check of the mailing pipeline against the LOCAL stack.
// Needs: `supabase start`, `npm run dev` (port 3000), RESEND_API_KEY + CRON_SECRET in web/.env.local.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const to = process.argv[2]
if (!to) throw new Error('Usage: node scripts/mail-live-check.mjs <email>')

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(webDir, '..')

const status = execFileSync('supabase', ['status', '-o', 'env'], { cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32' })
const sb = {}
for (const line of status.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
  if (m) sb[m[1]] = m[2]
}
const envFile = readFileSync(path.join(webDir, '.env.local'), 'utf8')
const cronSecret = /^CRON_SECRET=(.+)$/m.exec(envFile)?.[1]?.trim()
if (!cronSecret) throw new Error('CRON_SECRET missing from web/.env.local')

const admin = createClient(sb.API_URL, sb.SERVICE_ROLE_KEY ?? sb.SECRET_KEY, { auth: { persistSession: false } })

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
let user = list.users.find((u) => u.email === to)
if (!user) {
  const created = await admin.auth.admin.createUser({ email: to, email_confirm: true })
  if (created.error) throw created.error
  user = created.data.user
}

const dedupe = `live-check:${Date.now()}`
const { error } = await admin.from('email_outbox').insert({
  user_id: user.id,
  category: 'weekly_progress',
  template: 'weekly_progress',
  payload: { lessons_completed: 2, courses: [{ title: 'Cours de test', slug: 'test', completed_this_week: 2, completed_total: 2, total_lessons: 6 }] },
  dedupe_key: dedupe,
})
if (error) throw error

const res = await fetch('http://localhost:3000/api/mail/dispatch', { method: 'POST', headers: { Authorization: `Bearer ${cronSecret}` } })
console.log('dispatch →', res.status, await res.json())

const { data: row } = await admin.from('email_outbox').select('status, attempts, last_error').eq('dedupe_key', dedupe).single()
console.log('outbox row →', row)
```

- [ ] **Step 4: Run the live check (manual, sends one real email)**

1. Copy `RESEND_API_KEY` from the main folder's `web/.env.local` into the worktree's `web/.env.local` (gitignored, not shared) and add `CRON_SECRET=<any long random string>`.
2. `supabase start` if needed (`docker ps` first), `supabase migration up`, then `npm run dev` from `web/` (if it crashes on the long Windows path, run it from a shorter worktree path).
3. Run `node scripts/mail-live-check.mjs curtiscapre@gmail.com`.

Expected: `dispatch → 200 { sent: 1, ... }`, outbox row `status: 'sent'`, and an email "Votre progression de la semaine" from `notif@apprendre-le-bhete.com` in curtiscapre@gmail.com (check spam). Open the footer "Se désabonner" link, confirm, then re-run the script: expected `skipped: 1` (category `weekly_progress` switched off), no second email.

- [ ] **Step 5: Final verification**

Run (from `web/`): `npm run test`, `npx tsc --noEmit`, `npx eslint .`; then run each RLS file touched by this work individually: `npm run test:rls -- email-mailing`, `npm run test:rls -- phase4-assignments`, `npm run test:rls -- course-review-hardening`.
Expected: all pass (the two older files prove the triggers did not break assignment review flows).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add supabase/ops/mail-cron.sql web/scripts/mail-live-check.mjs web/.env.local.example
git commit -m "feat(mail): cron schedule, env docs and live-check script" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Rollout (after merge, by hand)

1. Apply both migrations to the remote project `agdqbzbjcxrzfhkvempe` (neither uses `drop policy`, so the Supabase MCP `apply_migration` may work; otherwise use the SQL editor).
2. In Vercel (production + preview): set `RESEND_API_KEY` (new key), `RESEND_FROM_EMAIL`, `CRON_SECRET`; optional `MAIL_BATCH_SIZE`, `MAIL_DAILY_LIMIT`.
3. Create the Vault secret and run `supabase/ops/mail-cron.sql` in the SQL editor.
4. Watch `select status, count(*) from email_outbox group by 1;` for a day; `failed` rows carry the reason in `last_error`.
