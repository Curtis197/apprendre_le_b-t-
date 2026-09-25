# Course Platform — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in user build and publish text-lesson courses, and let learners browse, enroll, follow lessons and track progress, with an admin role for reporting and takedown.

**Architecture:** New Supabase tables with RLS as the only authorization layer (owner-only writes, public catalog, gated lesson bodies via `can_access_lesson()`), a small pure-TypeScript library in `web/lib/courses/` (slug, outline, reorder, markdown, queries, mutations), and new App Router pages under `/courses`, `/teach` and `/admin`. Reads happen in server components; writes happen from client components through the browser Supabase client, following the existing `community-mutations.ts` pattern.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, Supabase (`@supabase/ssr`, `@supabase/supabase-js`, local CLI 2.75 + Docker for RLS tests), Tailwind v4 with shadcn on `@base-ui/react`, Vitest 4, `lucide-react`. **No new runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-25-course-platform-design.md` (amended on 2026-09-25 to move lesson bodies into a `lesson_contents` table).

## Global Constraints

- **Phase 1 scope only:** text lessons, free enrollment, progress, teacher builder, admin role, reporting and takedown. No audio, QCM, video, answer-form or payment code.
- **Who can publish:** any logged-in user. No teacher-approval step.
- **Value sets:** course `status` = `draft | published | archived | suspended`; `access` = `free | paid` (paid is unused; RLS forces `free`); `level` = `beginner | intermediate | advanced`; `dialect` = `western | northern | eastern` (the existing `DialectKey`); lesson `kind` = `text | audio | video | quiz | assignment`.
- **`profiles.type` is never used for authorization.** Admin status comes only from `user_roles` via `is_admin()`.
- **Markdown safety:** lessons render with no raw HTML or scripts; external links get `rel="nofollow ugc noopener noreferrer"`; images are not supported.
- **Site copy is French.** In JSX text use the typographic apostrophe `’` (U+2019), never a raw `'` or `"` (the `react/no-unescaped-entities` lint rule).
- **Safari floor:** iOS Safari 16.1 (`browserslist` in `web/package.json` targets `safari >= 15.4`). Add **no** runtime dependencies. Only use Tailwind opacity utilities that already appear in the `@supports not (color: color-mix(...))` block at the bottom of `web/app/globals.css` (for example `bg-primary/10`, `bg-secondary/10`, `bg-destructive/10`, `bg-primary/90`, `border-border/50`).
- **Next.js 16 differs from older versions** (`web/AGENTS.md`): copy patterns from existing pages (`params` and `searchParams` are Promises; server data via `createClient()` from `@/lib/supabase-server`). Read the matching guide in `web/node_modules/next/dist/docs/` before using any Next.js API not already used in this repo.
- **Migrations:** files in `supabase/migrations/` named `YYYYMMDDHHMMSS_name.sql`. RLS policies wrap `auth.uid()` as `(select auth.uid())` and helper calls as `(select is_admin())`.
- **Git hygiene:** the working tree contains an unrelated uncommitted change in `web/app/grammar/page.tsx`. Never use `git add -A` or `git add .`; always add explicit paths. Every commit message ends with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (passed as a second `-m`).
- **Shell:** commands are written for Git Bash. `npm`/`npx` commands run from `web/`; `supabase` and `git` commands run from the repo root `C:/Users/DELL LATITUDE 7480/traduction bété` (quote the path, it contains spaces and an accent).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260925000000_fix_handle_new_user_search_path.sql` | Makes signup work on a fresh database (pins `handle_new_user()` search_path) |
| `supabase/migrations/20260925000001_courses_core.sql` | Roles, courses, sections, lessons, lesson contents, enrollments, helper functions, RLS |
| `supabase/migrations/20260925000002_progress_reports.sql` | `lesson_progress`, `course_reports`, RLS |
| `web/lib/courses/types.ts` | Shared types (`Course`, `Lesson`, `OutlineSection`, `Result`, …) |
| `web/lib/courses/labels.ts` | French labels, style maps, `isDialect`/`isLevel` guards |
| `web/lib/courses/slug.ts` | `slugify`, `buildSlug` |
| `web/lib/courses/outline.ts` | `buildOutline`, `flattenLessons`, `computeProgress`, `nextLessonId`, `resumeLessonId`, `publishBlocker` |
| `web/lib/courses/reorder.ts` | `moveItem`, `changedPositions`, `nextPosition` |
| `web/lib/courses/markdown.ts` | Safe Markdown subset parser (`parseMarkdown`, `parseInline`, `safeHref`) |
| `web/lib/courses/queries.ts` | Server-only reads |
| `web/lib/courses/mutations.ts` | Client-side writes (RLS-authorized) |
| `web/components/LessonMarkdown.tsx` | Renders the parser's AST as React elements |
| `web/components/courses/*` | `CourseCard`, `LessonOutline`, `EnrollButton`, `CompleteButton`, `ReportCourseButton`, `CourseForm`, `CourseStatusPanel`, `CourseBuilder`, `LessonEditor`, `ModerationActions`, `ProfileCourses`, `styles.ts` |
| `web/app/courses/**` | Catalog, course page, lesson player |
| `web/app/teach/**` | Teacher dashboard, new course, builder, lesson editor |
| `web/app/admin/reports/page.tsx` | Moderation queue |
| `web/__tests__/rls/*` | RLS tests against local Supabase (run with `npm run test:rls`) |
| `web/__tests__/course-*.test.ts(x)` | Unit tests for the pure library and components |

---

### Task 1: Test infrastructure (local Supabase + RLS test harness)

**Files:**
- Modify: `web/vitest.config.ts`
- Create: `web/vitest.rls.config.ts`
- Create: `web/scripts/test-rls.mjs`
- Modify: `web/package.json` (scripts)
- Create: `web/__tests__/rls/helpers.ts`
- Create: `web/__tests__/rls/smoke.test.ts`
- Create: `supabase/migrations/20260925000000_fix_handle_new_user_search_path.sql`

**Interfaces:**
- Produces (`helpers.ts`): `admin: SupabaseClient` (service role), `anonClient(): SupabaseClient`, `createUser(label: string): Promise<TestUser>`, `makeAdmin(userId: string): Promise<void>`, `must<T>(res, what): T`, `uid(): string`, `interface TestUser { id: string; email: string; client: SupabaseClient }`.

- [ ] **Step 1: Confirm Docker is running**

Run: `docker info`
Expected: server information (no "Cannot connect to the Docker daemon"). If Docker Desktop is stopped, start it and retry.

- [ ] **Step 2: Start the local Supabase stack**

Run from the repo root: `supabase start`
Expected: after image downloads, a table of local URLs (API URL `http://127.0.0.1:54321`, DB URL, Studio). It applies all existing migrations. If it fails on an existing migration, **stop and report the error to the user**; do not edit old migrations.

- [ ] **Step 3: Check which env variable names the CLI prints**

Run from the repo root: `supabase status -o env | sed -E 's/=.*//'`
Expected: a list that includes `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY`. The helper in Step 6 also accepts `PUBLISHABLE_KEY` / `SECRET_KEY` if the CLI prints those instead. If the URL variable has a different name, change `API_URL` in `helpers.ts` to match.

- [ ] **Step 4: Update the default Vitest config (alias, tsx tests, exclude RLS)**

Replace the contents of `web/vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path alias from tsconfig.json.
    alias: { '@': path.resolve(fileURLToPath(new URL('.', import.meta.url))) },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.{ts,tsx}'],
    // RLS tests need a running local Supabase: run them with `npm run test:rls`.
    exclude: ['__tests__/rls/**', 'node_modules/**'],
  },
})
```

- [ ] **Step 5: Add the RLS Vitest config, runner script and npm script**

Create `web/vitest.rls.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/rls/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
```

Create `web/scripts/test-rls.mjs`:

```js
// Runs the RLS suite against the local Supabase stack.
// Usage (from web/): npm run test:rls [-- <vitest filter>]
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const shell = process.platform === 'win32'

const status = execFileSync('supabase', ['status', '-o', 'env'], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell,
})

const env = { ...process.env }
for (const line of status.split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
  if (match) env[match[1]] = match[2]
}

const result = spawnSync(
  'npx',
  ['vitest', 'run', '--config', 'vitest.rls.config.ts', ...process.argv.slice(2)],
  { cwd: path.join(repoRoot, 'web'), env, stdio: 'inherit', shell },
)
process.exit(result.status ?? 1)
```

In `web/package.json`, change the scripts block line `"test": "vitest run"` to:

```json
    "test": "vitest run",
    "test:rls": "node scripts/test-rls.mjs"
```

- [ ] **Step 6: Write the RLS helpers**

Create `web/__tests__/rls/helpers.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

function need(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  throw new Error(`Missing ${names[0]}. Run the suite with: npm run test:rls`)
}

const URL_ = need('API_URL')
const ANON_KEY = need('ANON_KEY', 'PUBLISHABLE_KEY')
const SERVICE_KEY = need('SERVICE_ROLE_KEY', 'SECRET_KEY')

const options = { auth: { persistSession: false, autoRefreshToken: false } }

/** Service-role client: bypasses RLS. Use only for fixtures and verification. */
export const admin: SupabaseClient = createClient(URL_, SERVICE_KEY, options)

export function anonClient(): SupabaseClient {
  return createClient(URL_, ANON_KEY, options)
}

export const uid = () => randomUUID().slice(0, 8)

export function must<T>(
  res: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (res.error || res.data === null) {
    throw new Error(`${what}: ${res.error?.message ?? 'no data returned'}`)
  }
  return res.data
}

export interface TestUser {
  id: string
  email: string
  client: SupabaseClient
}

export async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${uid()}@test.local`
  const password = 'test-password-123'
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created.error || !created.data.user) {
    throw new Error(`createUser: ${created.error?.message ?? 'no user returned'}`)
  }
  const client = createClient(URL_, ANON_KEY, options)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`)
  return { id: created.data.user.id, email, client }
}

export async function makeAdmin(userId: string): Promise<void> {
  const { error } = await admin.from('user_roles').insert({ user_id: userId, role: 'admin' })
  if (error) throw new Error(`makeAdmin: ${error.message}`)
}
```

- [ ] **Step 7: Write the smoke test**

Create `web/__tests__/rls/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { admin, anonClient, createUser } from './helpers'

describe('local Supabase smoke test', () => {
  it('creates a confirmed user whose profile row is auto-created', async () => {
    const user = await createUser('smoke')
    const { data, error } = await admin.from('profiles').select('id').eq('id', user.id).single()
    expect(error).toBeNull()
    expect(data?.id).toBe(user.id)
  })

  it('lets the signed-in user read their own profile through RLS', async () => {
    const user = await createUser('smoke')
    const { data } = await user.client.from('profiles').select('id').eq('id', user.id)
    expect(data).toHaveLength(1)
  })

  it('hides private profiles from anonymous clients', async () => {
    const user = await createUser('smoke')
    const { data } = await anonClient().from('profiles').select('id').eq('id', user.id)
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 8: Fix signup on a freshly created database**

Found while running the smoke test: on a fresh database (local stack, CI) every signup fails with "Database error saving new user", because the existing `handle_new_user()` trigger function has no pinned `search_path` and GoTrue runs it with a search_path of just `auth`, so the unqualified `profiles` does not resolve. Every RLS test creates users, so this must be fixed first. The fix keeps the function body and qualifies the schema (safe to apply to production too, and the Supabase-recommended pattern for `SECURITY DEFINER` functions).

Create `supabase/migrations/20260925000000_fix_handle_new_user_search_path.sql`:

```sql
-- handle_new_user() runs as SECURITY DEFINER but without a pinned search_path, and
-- GoTrue executes the auth.users trigger as supabase_auth_admin, whose search_path is
-- just "auth". On a fresh database (local stack, CI) the unqualified `profiles` then
-- fails to resolve ("relation "profiles" does not exist") and every signup returns
-- "Database error saving new user". Same body as 20260516000001, with the schema
-- qualified and the search_path pinned.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
```

Apply it to the running local stack from the repo root: `supabase migration up`
Expected: `Applying migration 20260925000000_fix_handle_new_user_search_path.sql...`.

- [ ] **Step 9: Run the RLS smoke test**

Run from `web/`: `npm run test:rls`
Expected: 3 tests PASS. (There is no red phase: this task only proves the harness works.) If `createUser` fails with an auth error, run `supabase status` to confirm the stack is healthy.

- [ ] **Step 10: Confirm the default suite is unaffected**

Run from `web/`: `npm test`
Expected: the existing `donation.test.ts` passes and no `rls` tests run.

- [ ] **Step 11: Commit**

```bash
git add web/vitest.config.ts web/vitest.rls.config.ts web/scripts/test-rls.mjs web/package.json web/__tests__/rls/helpers.ts web/__tests__/rls/smoke.test.ts supabase/migrations/20260925000000_fix_handle_new_user_search_path.sql
git commit -m "test: add local-Supabase RLS test harness" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Core schema and RLS (roles, courses, sections, lessons, contents, enrollments)

**Files:**
- Modify: `web/__tests__/rls/helpers.ts` (append `Seed`, `seedCourse`)
- Create: `web/__tests__/rls/courses-core.test.ts`
- Create: `supabase/migrations/20260925000001_courses_core.sql`

**Interfaces:**
- Consumes (Task 1): `admin`, `anonClient`, `createUser`, `makeAdmin`, `must`, `uid`, `TestUser`.
- Produces: tables `user_roles`, `courses`, `course_sections`, `lessons`, `lesson_contents`, `enrollments`; functions `is_admin() → boolean`, `is_enrolled(uuid) → boolean`, `can_access_lesson(uuid) → boolean`; test helper `seedCourse(ownerId, overrides?) → Promise<Seed>`.

- [ ] **Step 1: Append the seed helper**

Append to `web/__tests__/rls/helpers.ts`:

```ts

export interface Seed {
  course: { id: string; slug: string }
  section: { id: string }
  preview: { id: string }
  locked: { id: string }
}

/** Creates a course with one section and two text lessons (one preview, one locked) via the service role. */
export async function seedCourse(
  ownerId: string,
  overrides: { status?: string; access?: string } = {},
): Promise<Seed> {
  const course = must(
    await admin
      .from('courses')
      .insert({
        owner_id: ownerId,
        title: 'Cours de test',
        slug: `t-${uid()}`,
        status: 'published',
        ...overrides,
      })
      .select('id, slug')
      .single(),
    'seed course',
  )
  const section = must(
    await admin
      .from('course_sections')
      .insert({ course_id: course.id, title: 'Section 1', position: 0 })
      .select('id')
      .single(),
    'seed section',
  )
  const lessonBase = { section_id: section.id, course_id: course.id, kind: 'text' }
  const preview = must(
    await admin
      .from('lessons')
      .insert({ ...lessonBase, title: 'Aperçu', position: 0, is_preview: true })
      .select('id')
      .single(),
    'seed preview lesson',
  )
  const locked = must(
    await admin
      .from('lessons')
      .insert({ ...lessonBase, title: 'Verrouillée', position: 1, is_preview: false })
      .select('id')
      .single(),
    'seed locked lesson',
  )
  const contents = await admin.from('lesson_contents').upsert([
    { lesson_id: preview.id, body_md: 'contenu aperçu' },
    { lesson_id: locked.id, body_md: 'contenu verrouillé' },
  ])
  if (contents.error) throw new Error(`seed contents: ${contents.error.message}`)
  return { course, section, preview, locked }
}
```

- [ ] **Step 2: Write the failing RLS tests**

Create `web/__tests__/rls/courses-core.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import {
  admin,
  anonClient,
  createUser,
  makeAdmin,
  seedCourse,
  uid,
  type Seed,
  type TestUser,
} from './helpers'

describe('courses core RLS', () => {
  let teacher: TestUser
  let other: TestUser
  let learner: TestUser
  let boss: TestUser
  let published: Seed
  let draft: Seed

  beforeAll(async () => {
    ;[teacher, other, learner, boss] = await Promise.all([
      createUser('teacher'),
      createUser('other'),
      createUser('learner'),
      createUser('boss'),
    ])
    await makeAdmin(boss.id)
    published = await seedCourse(teacher.id)
    draft = await seedCourse(teacher.id, { status: 'draft' })
  })

  describe('visibility', () => {
    it('shows published courses to anonymous visitors but hides drafts', async () => {
      const { data } = await anonClient()
        .from('courses')
        .select('id')
        .in('id', [published.course.id, draft.course.id])
      expect(data).toEqual([{ id: published.course.id }])
    })

    it('exposes the outline of published courses only', async () => {
      const anon = anonClient()
      const sections = await anon.from('course_sections').select('id').eq('course_id', published.course.id)
      const lessons = await anon.from('lessons').select('id').eq('course_id', published.course.id)
      const draftLessons = await anon.from('lessons').select('id').eq('course_id', draft.course.id)
      expect(sections.data).toHaveLength(1)
      expect(lessons.data).toHaveLength(2)
      expect(draftLessons.data).toEqual([])
    })

    it('lets the owner see their own draft and hides it from other users', async () => {
      const own = await teacher.client.from('courses').select('id').eq('id', draft.course.id)
      const foreign = await other.client.from('courses').select('id').eq('id', draft.course.id)
      expect(own.data).toEqual([{ id: draft.course.id }])
      expect(foreign.data).toEqual([])
    })

    it('lets an admin see every course', async () => {
      const { data } = await boss.client.from('courses').select('id').eq('id', draft.course.id)
      expect(data).toEqual([{ id: draft.course.id }])
    })
  })

  describe('lesson content', () => {
    it('serves preview lessons to anonymous visitors and withholds locked ones', async () => {
      const anon = anonClient()
      const preview = await anon.from('lesson_contents').select('body_md').eq('lesson_id', published.preview.id)
      const locked = await anon.from('lesson_contents').select('body_md').eq('lesson_id', published.locked.id)
      expect(preview.data).toEqual([{ body_md: 'contenu aperçu' }])
      expect(locked.data).toEqual([])
    })

    it('withholds locked lessons from signed-in users who are not enrolled', async () => {
      const { data } = await other.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', published.locked.id)
      expect(data).toEqual([])
    })

    it('serves locked lessons after enrollment', async () => {
      const enrolled = await learner.client
        .from('enrollments')
        .insert({ user_id: learner.id, course_id: published.course.id })
      expect(enrolled.error).toBeNull()
      const { data } = await learner.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', published.locked.id)
      expect(data).toEqual([{ body_md: 'contenu verrouillé' }])
    })

    it('never serves the content of a draft course to other users, but does to its owner', async () => {
      const foreign = await other.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', draft.preview.id)
      const own = await teacher.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', draft.preview.id)
      expect(foreign.data).toEqual([])
      expect(own.data).toEqual([{ body_md: 'contenu aperçu' }])
    })
  })

  describe('enrollment', () => {
    it('refuses enrollment in a draft course', async () => {
      const user = await createUser('enrollee')
      const { error } = await user.client
        .from('enrollments')
        .insert({ user_id: user.id, course_id: draft.course.id })
      expect(error).not.toBeNull()
    })

    it('refuses enrollment in a paid course', async () => {
      const user = await createUser('enrollee')
      const paid = await seedCourse(teacher.id, { access: 'paid' })
      const { error } = await user.client
        .from('enrollments')
        .insert({ user_id: user.id, course_id: paid.course.id })
      expect(error).not.toBeNull()
    })

    it('refuses enrollment on behalf of another user', async () => {
      const user = await createUser('enrollee')
      const { error } = await user.client
        .from('enrollments')
        .insert({ user_id: other.id, course_id: published.course.id })
      expect(error).not.toBeNull()
    })

    it('keeps enrollments private', async () => {
      const { data } = await other.client.from('enrollments').select('user_id').eq('user_id', learner.id)
      expect(data).toEqual([])
    })
  })

  describe('authoring', () => {
    const base = () => ({ owner_id: teacher.id, title: 'Mon cours', slug: `c-${uid()}` })

    it('lets any signed-in user create a free draft course', async () => {
      const { data, error } = await teacher.client.from('courses').insert(base()).select('status, access').single()
      expect(error).toBeNull()
      expect(data).toEqual({ status: 'draft', access: 'free' })
    })

    it('refuses paid, pre-published or foreign-owned inserts', async () => {
      const paid = await teacher.client.from('courses').insert({ ...base(), access: 'paid' })
      const live = await teacher.client.from('courses').insert({ ...base(), status: 'published' })
      const foreign = await teacher.client.from('courses').insert({ ...base(), owner_id: other.id })
      expect(paid.error).not.toBeNull()
      expect(live.error).not.toBeNull()
      expect(foreign.error).not.toBeNull()
    })

    it('refuses course creation by anonymous visitors', async () => {
      const { error } = await anonClient().from('courses').insert(base())
      expect(error).not.toBeNull()
    })

    it('refuses edits of a course by a non-owner', async () => {
      const { data } = await other.client
        .from('courses')
        .update({ title: 'Piraté' })
        .eq('id', published.course.id)
        .select('id')
      expect(data).toEqual([])
      const check = await admin.from('courses').select('title').eq('id', published.course.id).single()
      expect(check.data?.title).toBe('Cours de test')
    })

    it('lets the owner unpublish and republish', async () => {
      const seed = await seedCourse(teacher.id)
      const down = await teacher.client.from('courses').update({ status: 'draft' }).eq('id', seed.course.id).select('status')
      const up = await teacher.client.from('courses').update({ status: 'published' }).eq('id', seed.course.id).select('status')
      expect(down.data).toEqual([{ status: 'draft' }])
      expect(up.data).toEqual([{ status: 'published' }])
    })

    it('refuses owner attempts to suspend a course or make it paid', async () => {
      const seed = await seedCourse(teacher.id)
      const suspend = await teacher.client.from('courses').update({ status: 'suspended' }).eq('id', seed.course.id)
      const paid = await teacher.client.from('courses').update({ access: 'paid' }).eq('id', seed.course.id)
      expect(suspend.error).not.toBeNull()
      expect(paid.error).not.toBeNull()
    })

    it('refuses sections and lessons in someone else’s course', async () => {
      const section = await other.client
        .from('course_sections')
        .insert({ course_id: published.course.id, title: 'x', position: 9 })
      const lesson = await other.client
        .from('lessons')
        .insert({ section_id: published.section.id, course_id: published.course.id, title: 'x', position: 9 })
      expect(section.error).not.toBeNull()
      expect(lesson.error).not.toBeNull()
    })

    it('keeps a lesson in the same course as its section', async () => {
      const { error } = await teacher.client
        .from('lessons')
        .insert({ section_id: published.section.id, course_id: draft.course.id, title: 'x', position: 9 })
      expect(error).not.toBeNull()
    })

    it('creates an empty content row for every new lesson', async () => {
      const inserted = await teacher.client
        .from('lessons')
        .insert({ section_id: draft.section.id, course_id: draft.course.id, title: 'Nouvelle leçon', position: 5 })
        .select('id')
        .single()
      expect(inserted.error).toBeNull()
      const content = await teacher.client
        .from('lesson_contents')
        .select('body_md')
        .eq('lesson_id', inserted.data?.id)
        .single()
      expect(content.data).toEqual({ body_md: '' })
    })

    it('lets the owner delete a draft but not a published course', async () => {
      const draftSeed = await seedCourse(teacher.id, { status: 'draft' })
      const pubSeed = await seedCourse(teacher.id)
      const deletedDraft = await teacher.client.from('courses').delete().eq('id', draftSeed.course.id).select('id')
      const deletedPub = await teacher.client.from('courses').delete().eq('id', pubSeed.course.id).select('id')
      expect(deletedDraft.data).toEqual([{ id: draftSeed.course.id }])
      expect(deletedPub.data).toEqual([])
    })
  })

  describe('admin and moderation', () => {
    it('reports admin status through is_admin()', async () => {
      expect((await boss.client.rpc('is_admin')).data).toBe(true)
      expect((await other.client.rpc('is_admin')).data).toBe(false)
      expect((await anonClient().rpc('is_admin')).data).toBe(false)
    })

    it('keeps user_roles closed to clients', async () => {
      const read = await other.client.from('user_roles').select('user_id')
      const write = await other.client.from('user_roles').insert({ user_id: other.id, role: 'admin' })
      expect(read.data).toEqual([])
      expect(write.error).not.toBeNull()
    })

    it('lets an admin suspend a course, freezing the owner and blocking learners', async () => {
      const seed = await seedCourse(teacher.id)
      const student = await createUser('student')
      await student.client.from('enrollments').insert({ user_id: student.id, course_id: seed.course.id })

      const suspended = await boss.client.from('courses').update({ status: 'suspended' }).eq('id', seed.course.id)
      expect(suspended.error).toBeNull()

      const edit = await teacher.client.from('courses').update({ title: 'Nouveau titre' }).eq('id', seed.course.id).select('id')
      const addSection = await teacher.client
        .from('course_sections')
        .insert({ course_id: seed.course.id, title: 'x', position: 9 })
      const read = await student.client.from('lesson_contents').select('body_md').eq('lesson_id', seed.locked.id)
      const ownView = await teacher.client.from('courses').select('status').eq('id', seed.course.id).single()

      expect(edit.data).toEqual([])
      expect(addSection.error).not.toBeNull()
      expect(read.data).toEqual([])
      expect(ownView.data?.status).toBe('suspended')
    })

    it('lets an admin restore a suspended course to draft', async () => {
      const seed = await seedCourse(teacher.id, { status: 'suspended' })
      const restored = await boss.client
        .from('courses')
        .update({ status: 'draft' })
        .eq('id', seed.course.id)
        .select('status')
        .single()
      expect(restored.data?.status).toBe('draft')
      const edit = await teacher.client.from('courses').update({ title: 'Repris' }).eq('id', seed.course.id).select('id')
      expect(edit.data).toEqual([{ id: seed.course.id }])
    })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `web/`: `npm run test:rls -- courses-core`
Expected: FAIL. `beforeAll` errors with `seed course: Could not find the table 'public.courses'` (or similar), so every test in the file fails.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260925000001_courses_core.sql`:

```sql
-- Course platform, phase 1: authoring, catalog and access model.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── Roles ───────────────────────────────────────────────────────────────────
-- RLS is enabled with NO policies on purpose: clients can neither read nor
-- write this table. Admin checks go through is_admin() (SECURITY DEFINER).
create table if not exists user_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);
alter table user_roles enable row level security;

create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles where user_id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

-- ── Shared trigger: keep updated_at fresh ───────────────────────────────────
create or replace function course_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Courses ─────────────────────────────────────────────────────────────────
create table if not exists courses (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 120),
  slug        text not null unique
              check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  summary     text not null default '' check (char_length(summary) <= 500),
  cover_url   text,
  dialect     text not null default 'western'
              check (dialect in ('western', 'northern', 'eastern')),
  level       text not null default 'beginner'
              check (level in ('beginner', 'intermediate', 'advanced')),
  status      text not null default 'draft'
              check (status in ('draft', 'published', 'archived', 'suspended')),
  access      text not null default 'free' check (access in ('free', 'paid')),
  price_cents int check (price_cents is null or price_cents >= 0),
  currency    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists courses_status_idx on courses (status);
create index if not exists courses_owner_idx  on courses (owner_id);

drop trigger if exists courses_touch_updated_at on courses;
create trigger courses_touch_updated_at
  before update on courses
  for each row execute function course_touch_updated_at();

-- ── Sections and lessons ────────────────────────────────────────────────────
create table if not exists course_sections (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  unique (id, course_id)
);
create index if not exists course_sections_course_idx on course_sections (course_id, position);

create table if not exists lessons (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  course_id  uuid not null references courses(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  position   int  not null default 0,
  kind       text not null default 'text'
             check (kind in ('text', 'audio', 'video', 'quiz', 'assignment')),
  is_preview boolean not null default false,
  created_at timestamptz not null default now(),
  -- The composite FK keeps the denormalized course_id consistent with the section.
  foreign key (section_id, course_id)
    references course_sections (id, course_id) on delete cascade
);
create index if not exists lessons_section_idx on lessons (section_id, position);
create index if not exists lessons_course_idx  on lessons (course_id);

-- Lesson bodies live apart from lesson metadata: RLS is row-level, and titles
-- (the outline) must be public while bodies are gated.
create table if not exists lesson_contents (
  lesson_id  uuid primary key references lessons(id) on delete cascade,
  body_md    text not null default '' check (char_length(body_md) <= 50000),
  updated_at timestamptz not null default now()
);

drop trigger if exists lesson_contents_touch_updated_at on lesson_contents;
create trigger lesson_contents_touch_updated_at
  before update on lesson_contents
  for each row execute function course_touch_updated_at();

create or replace function lessons_create_content()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into lesson_contents (lesson_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists lessons_after_insert_content on lessons;
create trigger lessons_after_insert_content
  after insert on lessons
  for each row execute function lessons_create_content();

-- ── Enrollments ─────────────────────────────────────────────────────────────
-- Single source of truth for "may this user open this course".
create table if not exists enrollments (
  user_id    uuid not null references auth.users(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index if not exists enrollments_course_idx on enrollments (course_id);

-- ── Access helpers (SECURITY DEFINER so policies never recurse) ─────────────
create or replace function is_enrolled(p_course_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from enrollments
    where course_id = p_course_id and user_id = auth.uid()
  );
$$;

create or replace function can_access_lesson(p_lesson_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from lessons l
    join courses c on c.id = l.course_id
    where l.id = p_lesson_id
      and (
        is_admin()
        or c.owner_id = auth.uid()
        or (c.status = 'published' and l.is_preview)
        or (c.status in ('published', 'archived') and is_enrolled(c.id))
      )
  );
$$;

revoke all on function is_enrolled(uuid)      from public;
revoke all on function can_access_lesson(uuid) from public;
grant execute on function is_enrolled(uuid)      to anon, authenticated;
grant execute on function can_access_lesson(uuid) to anon, authenticated;

-- ── RLS: courses ────────────────────────────────────────────────────────────
alter table courses enable row level security;

create policy courses_select_published on courses
  for select using (status = 'published');

create policy courses_select_own on courses
  for select to authenticated using (owner_id = (select auth.uid()));

create policy courses_select_enrolled on courses
  for select to authenticated
  using (status in ('published', 'archived') and is_enrolled(id));

create policy courses_select_admin on courses
  for select to authenticated using ((select is_admin()));

create policy courses_insert_own on courses
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and status = 'draft'
    and access = 'free'
  );

create policy courses_update_own on courses
  for update to authenticated
  using (owner_id = (select auth.uid()) and status <> 'suspended')
  with check (
    owner_id = (select auth.uid())
    and status in ('draft', 'published', 'archived')
    and access = 'free'
  );

create policy courses_update_admin on courses
  for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

create policy courses_delete_own on courses
  for delete to authenticated
  using (owner_id = (select auth.uid()) and status = 'draft');

-- ── RLS: sections, lessons, contents ────────────────────────────────────────
-- Read access mirrors course visibility: the subquery runs under the caller's
-- own RLS, so it only sees courses the caller may see.
alter table course_sections enable row level security;

create policy sections_select on course_sections
  for select using (
    exists (select 1 from courses c where c.id = course_sections.course_id)
  );

create policy sections_write_owner on course_sections
  for all to authenticated
  using (
    exists (
      select 1 from courses c
      where c.id = course_sections.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from courses c
      where c.id = course_sections.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

alter table lessons enable row level security;

create policy lessons_select on lessons
  for select using (
    exists (select 1 from courses c where c.id = lessons.course_id)
  );

create policy lessons_write_owner on lessons
  for all to authenticated
  using (
    exists (
      select 1 from courses c
      where c.id = lessons.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1 from courses c
      where c.id = lessons.course_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

alter table lesson_contents enable row level security;

create policy contents_select on lesson_contents
  for select using (can_access_lesson(lesson_id));

create policy contents_write_owner on lesson_contents
  for all to authenticated
  using (
    exists (
      select 1
      from lessons l join courses c on c.id = l.course_id
      where l.id = lesson_contents.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  )
  with check (
    exists (
      select 1
      from lessons l join courses c on c.id = l.course_id
      where l.id = lesson_contents.lesson_id
        and c.owner_id = (select auth.uid())
        and c.status <> 'suspended'
    )
  );

-- ── RLS: enrollments ────────────────────────────────────────────────────────
alter table enrollments enable row level security;

create policy enrollments_select_own on enrollments
  for select to authenticated using (user_id = (select auth.uid()));

create policy enrollments_insert_own on enrollments
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from courses c
      where c.id = enrollments.course_id
        and c.status = 'published'
        and c.access = 'free'
    )
  );

create policy enrollments_delete_own on enrollments
  for delete to authenticated using (user_id = (select auth.uid()));
```

- [ ] **Step 5: Apply the migration to the local database**

Run from the repo root: `supabase migration up`
Expected: `Applying migration 20260925000001_courses_core.sql...` with no error.

- [ ] **Step 6: Run the tests to verify they pass**

Run from `web/`: `npm run test:rls -- courses-core`
Expected: all tests PASS. If a test fails, fix the **policy** (not the test) unless the test contradicts the spec; the spec's Permissions section is the source of truth.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260925000001_courses_core.sql web/__tests__/rls/helpers.ts web/__tests__/rls/courses-core.test.ts
git commit -m "feat(db): course platform core schema with RLS" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Progress and reports schema

**Files:**
- Create: `web/__tests__/rls/progress-reports.test.ts`
- Create: `supabase/migrations/20260925000002_progress_reports.sql`

**Interfaces:**
- Consumes (Task 2): `courses`, `lessons`, `can_access_lesson()`, `is_admin()`, `seedCourse`.
- Produces: tables `lesson_progress(user_id, lesson_id, completed_at, score)` and `course_reports(id, course_id, reporter_id, reason, created_at, resolved_at)`.

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/rls/progress-reports.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, type Seed, type TestUser } from './helpers'

describe('lesson_progress RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let other: TestUser
  let seed: Seed

  beforeAll(async () => {
    ;[teacher, learner, other] = await Promise.all([
      createUser('teacher'),
      createUser('learner'),
      createUser('other'),
    ])
    seed = await seedCourse(teacher.id)
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })
  })

  it('lets an enrolled learner mark a locked lesson complete and read it back', async () => {
    const inserted = await learner.client
      .from('lesson_progress')
      .insert({ user_id: learner.id, lesson_id: seed.locked.id })
    expect(inserted.error).toBeNull()
    const { data } = await learner.client.from('lesson_progress').select('lesson_id').eq('user_id', learner.id)
    expect(data).toEqual([{ lesson_id: seed.locked.id }])
  })

  it('refuses progress on a locked lesson without enrollment', async () => {
    const { error } = await other.client
      .from('lesson_progress')
      .insert({ user_id: other.id, lesson_id: seed.locked.id })
    expect(error).not.toBeNull()
  })

  it('allows progress on a preview lesson without enrollment', async () => {
    const { error } = await other.client
      .from('lesson_progress')
      .insert({ user_id: other.id, lesson_id: seed.preview.id })
    expect(error).toBeNull()
  })

  it('refuses progress recorded for another user', async () => {
    const { error } = await learner.client
      .from('lesson_progress')
      .insert({ user_id: other.id, lesson_id: seed.preview.id })
    expect(error).not.toBeNull()
  })

  it('keeps progress private', async () => {
    const { data } = await other.client.from('lesson_progress').select('lesson_id').eq('user_id', learner.id)
    expect(data).toEqual([])
  })

  it('lets a user undo their own progress', async () => {
    const { data } = await learner.client
      .from('lesson_progress')
      .delete()
      .eq('user_id', learner.id)
      .eq('lesson_id', seed.locked.id)
      .select('lesson_id')
    expect(data).toEqual([{ lesson_id: seed.locked.id }])
  })
})

describe('course_reports RLS', () => {
  let teacher: TestUser
  let reporter: TestUser
  let boss: TestUser
  let published: Seed
  let draft: Seed

  beforeAll(async () => {
    ;[teacher, reporter, boss] = await Promise.all([
      createUser('teacher'),
      createUser('reporter'),
      createUser('boss'),
    ])
    await makeAdmin(boss.id)
    published = await seedCourse(teacher.id)
    draft = await seedCourse(teacher.id, { status: 'draft' })
  })

  it('lets a signed-in user report a published course once', async () => {
    const first = await reporter.client
      .from('course_reports')
      .insert({ course_id: published.course.id, reporter_id: reporter.id, reason: 'Contenu inapproprié' })
    const second = await reporter.client
      .from('course_reports')
      .insert({ course_id: published.course.id, reporter_id: reporter.id, reason: 'Encore une fois' })
    expect(first.error).toBeNull()
    expect(second.error?.code).toBe('23505')
  })

  it('refuses reports on draft courses and reports filed for someone else', async () => {
    const onDraft = await reporter.client
      .from('course_reports')
      .insert({ course_id: draft.course.id, reporter_id: reporter.id, reason: 'Contenu inapproprié' })
    const forged = await reporter.client
      .from('course_reports')
      .insert({ course_id: published.course.id, reporter_id: boss.id, reason: 'Contenu inapproprié' })
    expect(onDraft.error).not.toBeNull()
    expect(forged.error).not.toBeNull()
  })

  it('keeps reports invisible to non-admins', async () => {
    const { data } = await reporter.client.from('course_reports').select('id')
    expect(data).toEqual([])
  })

  it('lets an admin read and resolve reports', async () => {
    const open = await boss.client
      .from('course_reports')
      .select('id, resolved_at')
      .eq('course_id', published.course.id)
    expect(open.data).toHaveLength(1)
    expect(open.data?.[0].resolved_at).toBeNull()

    const resolved = await boss.client
      .from('course_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('course_id', published.course.id)
      .select('id')
    expect(resolved.data).toHaveLength(1)
  })

  it('refuses report resolution by non-admins', async () => {
    const { data } = await reporter.client
      .from('course_reports')
      .update({ resolved_at: new Date().toISOString() })
      .eq('course_id', published.course.id)
      .select('id')
    expect(data).toEqual([])
    const check = await admin.from('course_reports').select('resolved_at').eq('course_id', published.course.id)
    expect(check.data).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `web/`: `npm run test:rls -- progress-reports`
Expected: FAIL (`Could not find the table 'public.lesson_progress'`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260925000002_progress_reports.sql`:

```sql
-- Course platform, phase 1: learner progress and moderation reports.

-- ── Progress ────────────────────────────────────────────────────────────────
create table if not exists lesson_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  score        numeric check (score is null or (score >= 0 and score <= 100)),
  primary key (user_id, lesson_id)
);

alter table lesson_progress enable row level security;

create policy progress_select_own on lesson_progress
  for select to authenticated using (user_id = (select auth.uid()));

create policy progress_insert_own on lesson_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()) and can_access_lesson(lesson_id));

create policy progress_delete_own on lesson_progress
  for delete to authenticated using (user_id = (select auth.uid()));

-- ── Reports ─────────────────────────────────────────────────────────────────
create table if not exists course_reports (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references courses(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (char_length(reason) between 5 and 1000),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  unique (course_id, reporter_id)
);
create index if not exists course_reports_open_idx
  on course_reports (created_at) where resolved_at is null;

alter table course_reports enable row level security;

create policy reports_insert_own on course_reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and resolved_at is null
    and exists (
      select 1 from courses c
      where c.id = course_reports.course_id and c.status = 'published'
    )
  );

create policy reports_select_admin on course_reports
  for select to authenticated using ((select is_admin()));

create policy reports_update_admin on course_reports
  for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));
```

- [ ] **Step 4: Apply and run the tests**

Run from the repo root: `supabase migration up`
Expected: `Applying migration 20260925000002_progress_reports.sql...`.
Run from `web/`: `npm run test:rls`
Expected: every RLS test file PASSES (smoke, courses-core, progress-reports).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260925000002_progress_reports.sql web/__tests__/rls/progress-reports.test.ts
git commit -m "feat(db): lesson progress and course reports with RLS" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Pure course library (types, labels, slug, outline, reorder)

**Files:**
- Create: `web/lib/courses/types.ts`
- Create: `web/lib/courses/labels.ts`
- Create: `web/lib/courses/slug.ts`
- Create: `web/lib/courses/outline.ts`
- Create: `web/lib/courses/reorder.ts`
- Test: `web/__tests__/course-slug.test.ts`, `web/__tests__/course-outline.test.ts`, `web/__tests__/course-reorder.test.ts`

**Interfaces (Produces):**
- `types.ts`: `CourseStatus`, `CourseAccess`, `CourseLevel`, `LessonKind`, `Course`, `Section`, `Lesson`, `OutlineSection`, `CourseInput`, `Result<T>`.
- `labels.ts`: `LEVELS`, `LEVEL_LABELS`, `STATUS_LABELS`, `STATUS_STYLES`, `KIND_LABELS`, `isDialect(v: unknown): v is DialectKey`, `isLevel(v: unknown): v is CourseLevel`.
- `slug.ts`: `slugify(input: string): string`, `randomSuffix(length?: number, random?: () => number): string`, `buildSlug(title: string, random?: () => number): string`.
- `outline.ts`: `buildOutline(sections: Section[], lessons: Lesson[]): OutlineSection[]`, `flattenLessons(outline: OutlineSection[]): Lesson[]`, `interface Progress { completed: number; total: number; percent: number }`, `computeProgress(lessonIds: string[], completedIds: Iterable<string>): Progress`, `nextLessonId(flat: Lesson[], currentId: string): string | null`, `resumeLessonId(flat: Lesson[], completedIds: Iterable<string>): string | null`, `publishBlocker(outline: OutlineSection[]): string | null`.
- `reorder.ts`: `moveItem<T extends {id: string; position: number}>(items: T[], id: string, direction: -1 | 1): T[]`, `changedPositions(before, after): {id: string; position: number}[]`, `nextPosition(items: {position: number}[]): number`.

- [ ] **Step 1: Write the types and labels (no logic to test-drive)**

Create `web/lib/courses/types.ts`:

```ts
import type { DialectKey } from '../dialect'

export type CourseStatus = 'draft' | 'published' | 'archived' | 'suspended'
export type CourseAccess = 'free' | 'paid'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type LessonKind = 'text' | 'audio' | 'video' | 'quiz' | 'assignment'

export interface Course {
  id: string
  owner_id: string
  title: string
  slug: string
  summary: string
  cover_url: string | null
  dialect: DialectKey
  level: CourseLevel
  status: CourseStatus
  access: CourseAccess
  price_cents: number | null
  currency: string | null
  created_at: string
  updated_at: string
}

export interface Section {
  id: string
  course_id: string
  title: string
  position: number
}

export interface Lesson {
  id: string
  section_id: string
  course_id: string
  title: string
  position: number
  kind: LessonKind
  is_preview: boolean
}

export interface OutlineSection extends Section {
  lessons: Lesson[]
}

export interface CourseInput {
  title: string
  summary: string
  dialect: DialectKey
  level: CourseLevel
}

export type Result<T> = { data: T; error: null } | { data: null; error: string }
```

Create `web/lib/courses/labels.ts`:

```ts
import { DIALECT_KEYS, type DialectKey } from '../dialect'
import type { CourseLevel, CourseStatus, LessonKind } from './types'

export const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']

export const LEVEL_LABELS: Record<CourseLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
}

export const STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
  suspended: 'Suspendu',
}

// Only Tailwind opacity utilities that have an iOS <16.2 fallback in globals.css.
export const STATUS_STYLES: Record<CourseStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-secondary/10 text-secondary',
  archived: 'bg-muted text-muted-foreground',
  suspended: 'bg-destructive/10 text-destructive',
}

export const KIND_LABELS: Record<LessonKind, string> = {
  text: 'Texte',
  audio: 'Audio',
  video: 'Vidéo',
  quiz: 'QCM',
  assignment: 'Exercice',
}

export function isDialect(value: unknown): value is DialectKey {
  return typeof value === 'string' && (DIALECT_KEYS as string[]).includes(value)
}

export function isLevel(value: unknown): value is CourseLevel {
  return typeof value === 'string' && (LEVELS as string[]).includes(value)
}
```

- [ ] **Step 2: Write the failing slug tests**

Create `web/__tests__/course-slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildSlug, randomSuffix, slugify } from '../lib/courses/slug'

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('slugify', () => {
  it('lowercases and strips accents', () => {
    expect(slugify('Salutations en bhété')).toBe('salutations-en-bhete')
  })

  it('collapses punctuation and trims separators', () => {
    expect(slugify('Les nombres (1–10) !')).toBe('les-nombres-1-10')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('ɔ ʋ')).toBe('')
  })

  it('caps the length at 60 without leaving a trailing hyphen', () => {
    const slug = slugify('mot '.repeat(30))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug).not.toMatch(/-$/)
    expect(slug).toMatch(SLUG_PATTERN)
  })
})

describe('randomSuffix', () => {
  it('produces the requested number of base-36 characters', () => {
    expect(randomSuffix(4, () => 0)).toBe('aaaa')
    expect(randomSuffix(6, Math.random)).toMatch(/^[a-z0-9]{6}$/)
  })
})

describe('buildSlug', () => {
  it('appends a 4-character suffix to the slugified title', () => {
    expect(buildSlug('Salutations', () => 0)).toBe('salutations-aaaa')
  })

  it('falls back to "cours" when the title has no usable characters', () => {
    expect(buildSlug('!!!', () => 0)).toBe('cours-aaaa')
  })

  it('always matches the database slug constraint', () => {
    const slug = buildSlug('Un très long titre de cours pour vérifier la contrainte de longueur '.repeat(3))
    expect(slug).toMatch(SLUG_PATTERN)
    expect(slug.length).toBeLessThanOrEqual(80)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run from `web/`: `npx vitest run course-slug`
Expected: FAIL (cannot resolve `../lib/courses/slug`).

- [ ] **Step 4: Implement the slug module**

Create `web/lib/courses/slug.ts`:

```ts
const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Lowercase ASCII slug, at most 60 characters, no leading/trailing hyphen. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function randomSuffix(length = 4, random: () => number = Math.random): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += SUFFIX_CHARS[Math.floor(random() * SUFFIX_CHARS.length)]
  }
  return out
}

/** Slug for a new course: slugified title plus a short random suffix (max 65 chars, DB allows 80). */
export function buildSlug(title: string, random: () => number = Math.random): string {
  const base = slugify(title) || 'cours'
  return `${base}-${randomSuffix(4, random)}`
}
```

- [ ] **Step 5: Run to verify it passes**

Run from `web/`: `npx vitest run course-slug`
Expected: all PASS.

- [ ] **Step 6: Write the failing outline tests**

Create `web/__tests__/course-outline.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildOutline,
  computeProgress,
  flattenLessons,
  nextLessonId,
  publishBlocker,
  resumeLessonId,
} from '../lib/courses/outline'
import type { Lesson, Section } from '../lib/courses/types'

const section = (id: string, position: number): Section => ({
  id,
  course_id: 'c1',
  title: `Section ${id}`,
  position,
})

const lesson = (id: string, sectionId: string, position: number): Lesson => ({
  id,
  section_id: sectionId,
  course_id: 'c1',
  title: `Leçon ${id}`,
  position,
  kind: 'text',
  is_preview: false,
})

const outline = buildOutline(
  [section('s2', 1), section('s1', 0)],
  [lesson('b', 's1', 1), lesson('a', 's1', 0), lesson('c', 's2', 0)],
)
const flat = flattenLessons(outline)

describe('buildOutline', () => {
  it('orders sections and lessons by position and groups lessons by section', () => {
    expect(outline.map(s => s.id)).toEqual(['s1', 's2'])
    expect(outline[0].lessons.map(l => l.id)).toEqual(['a', 'b'])
    expect(outline[1].lessons.map(l => l.id)).toEqual(['c'])
  })

  it('gives sections without lessons an empty list', () => {
    expect(buildOutline([section('s1', 0)], [])[0].lessons).toEqual([])
  })
})

describe('flattenLessons', () => {
  it('returns lessons in reading order', () => {
    expect(flat.map(l => l.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('computeProgress', () => {
  it('counts completed lessons and rounds the percentage', () => {
    expect(computeProgress(['a', 'b', 'c'], ['a'])).toEqual({ completed: 1, total: 3, percent: 33 })
  })

  it('returns zero for a course without lessons', () => {
    expect(computeProgress([], [])).toEqual({ completed: 0, total: 0, percent: 0 })
  })

  it('ignores completed ids that do not belong to the course', () => {
    expect(computeProgress(['a'], ['a', 'zzz'])).toEqual({ completed: 1, total: 1, percent: 100 })
  })
})

describe('nextLessonId', () => {
  it('returns the following lesson, or null at the end or for an unknown id', () => {
    expect(nextLessonId(flat, 'a')).toBe('b')
    expect(nextLessonId(flat, 'c')).toBeNull()
    expect(nextLessonId(flat, 'zzz')).toBeNull()
  })
})

describe('resumeLessonId', () => {
  it('returns the first unfinished lesson', () => {
    expect(resumeLessonId(flat, ['a'])).toBe('b')
  })

  it('returns the first lesson when nothing is done or everything is done', () => {
    expect(resumeLessonId(flat, [])).toBe('a')
    expect(resumeLessonId(flat, ['a', 'b', 'c'])).toBe('a')
  })

  it('returns null when there are no lessons', () => {
    expect(resumeLessonId([], [])).toBeNull()
  })
})

describe('publishBlocker', () => {
  it('blocks publishing a course with no lessons', () => {
    expect(publishBlocker([])).toMatch(/au moins une leçon/)
    expect(publishBlocker(buildOutline([section('s1', 0)], []))).toMatch(/au moins une leçon/)
  })

  it('allows publishing once a lesson exists', () => {
    expect(publishBlocker(outline)).toBeNull()
  })
})
```

- [ ] **Step 7: Run to verify it fails**

Run from `web/`: `npx vitest run course-outline`
Expected: FAIL (cannot resolve `../lib/courses/outline`).

- [ ] **Step 8: Implement the outline module**

Create `web/lib/courses/outline.ts`:

```ts
import type { Lesson, OutlineSection, Section } from './types'

export function buildOutline(sections: Section[], lessons: Lesson[]): OutlineSection[] {
  const bySection = new Map<string, Lesson[]>()
  for (const lesson of [...lessons].sort((a, b) => a.position - b.position)) {
    const list = bySection.get(lesson.section_id) ?? []
    list.push(lesson)
    bySection.set(lesson.section_id, list)
  }
  return [...sections]
    .sort((a, b) => a.position - b.position)
    .map(section => ({ ...section, lessons: bySection.get(section.id) ?? [] }))
}

export function flattenLessons(outline: OutlineSection[]): Lesson[] {
  return outline.flatMap(section => section.lessons)
}

export interface Progress {
  completed: number
  total: number
  percent: number
}

export function computeProgress(lessonIds: string[], completedIds: Iterable<string>): Progress {
  const done = new Set(completedIds)
  const total = lessonIds.length
  const completed = lessonIds.filter(id => done.has(id)).length
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) }
}

export function nextLessonId(flat: Lesson[], currentId: string): string | null {
  const index = flat.findIndex(lesson => lesson.id === currentId)
  if (index === -1 || index === flat.length - 1) return null
  return flat[index + 1].id
}

/** First unfinished lesson; the first lesson when nothing (or everything) is done; null with no lessons. */
export function resumeLessonId(flat: Lesson[], completedIds: Iterable<string>): string | null {
  if (flat.length === 0) return null
  const done = new Set(completedIds)
  return (flat.find(lesson => !done.has(lesson.id)) ?? flat[0]).id
}

/** A French message explaining why the course cannot be published yet, or null when it can. */
export function publishBlocker(outline: OutlineSection[]): string | null {
  if (flattenLessons(outline).length === 0) return 'Ajoutez au moins une leçon avant de publier.'
  return null
}
```

- [ ] **Step 9: Run to verify it passes**

Run from `web/`: `npx vitest run course-outline`
Expected: all PASS.

- [ ] **Step 10: Write the failing reorder tests**

Create `web/__tests__/course-reorder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { changedPositions, moveItem, nextPosition } from '../lib/courses/reorder'

const items = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 },
]

describe('moveItem', () => {
  it('moves an item down by swapping with its neighbour', () => {
    expect(moveItem(items, 'a', 1)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
      { id: 'c', position: 2 },
    ])
  })

  it('moves an item up', () => {
    expect(moveItem(items, 'c', -1).map(i => i.id)).toEqual(['a', 'c', 'b'])
  })

  it('leaves the order unchanged at the edges and for unknown ids', () => {
    expect(moveItem(items, 'a', -1).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(moveItem(items, 'c', 1).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(moveItem(items, 'zzz', 1).map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('renumbers positions from zero, closing gaps', () => {
    const gappy = [
      { id: 'a', position: 0 },
      { id: 'b', position: 5 },
      { id: 'c', position: 9 },
    ]
    expect(moveItem(gappy, 'zzz', 1).map(i => i.position)).toEqual([0, 1, 2])
  })

  it('keeps extra properties and does not mutate the input', () => {
    const rich = [
      { id: 'a', position: 0, title: 'A' },
      { id: 'b', position: 1, title: 'B' },
    ]
    const moved = moveItem(rich, 'a', 1)
    expect(moved[1]).toEqual({ id: 'a', position: 1, title: 'A' })
    expect(rich[0]).toEqual({ id: 'a', position: 0, title: 'A' })
  })
})

describe('changedPositions', () => {
  it('returns only the items whose position changed', () => {
    const after = moveItem(items, 'a', 1)
    expect(changedPositions(items, after)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ])
  })

  it('returns nothing when no position changed', () => {
    expect(changedPositions(items, moveItem(items, 'a', -1))).toEqual([])
  })
})

describe('nextPosition', () => {
  it('returns one past the highest position, or 0 for an empty list', () => {
    expect(nextPosition([])).toBe(0)
    expect(nextPosition(items)).toBe(3)
    expect(nextPosition([{ position: 7 }, { position: 2 }])).toBe(8)
  })
})
```

- [ ] **Step 11: Run to verify it fails**

Run from `web/`: `npx vitest run course-reorder`
Expected: FAIL (cannot resolve `../lib/courses/reorder`).

- [ ] **Step 12: Implement the reorder module**

Create `web/lib/courses/reorder.ts`:

```ts
interface Positioned {
  id: string
  position: number
}

/** Moves one item a step up (-1) or down (1) and renumbers every position from zero. */
export function moveItem<T extends Positioned>(items: T[], id: string, direction: -1 | 1): T[] {
  const sorted = [...items].sort((a, b) => a.position - b.position)
  const from = sorted.findIndex(item => item.id === id)
  const to = from + direction
  if (from !== -1 && to >= 0 && to < sorted.length) {
    ;[sorted[from], sorted[to]] = [sorted[to], sorted[from]]
  }
  return sorted.map((item, index) => ({ ...item, position: index }))
}

/** The minimal set of position updates that turns `before` into `after`. */
export function changedPositions<T extends Positioned>(
  before: T[],
  after: T[],
): { id: string; position: number }[] {
  const previous = new Map(before.map(item => [item.id, item.position]))
  return after
    .filter(item => previous.get(item.id) !== item.position)
    .map(item => ({ id: item.id, position: item.position }))
}

export function nextPosition(items: { position: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map(item => item.position)) + 1
}
```

- [ ] **Step 13: Run the full unit suite and type-check**

Run from `web/`: `npm test`
Expected: all unit tests PASS.
Run from `web/`: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add web/lib/courses/types.ts web/lib/courses/labels.ts web/lib/courses/slug.ts web/lib/courses/outline.ts web/lib/courses/reorder.ts web/__tests__/course-slug.test.ts web/__tests__/course-outline.test.ts web/__tests__/course-reorder.test.ts
git commit -m "feat(courses): pure course library (types, slug, outline, reorder)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Safe Markdown renderer

A small in-house Markdown subset instead of `react-markdown`: it adds no dependency (Safari 16.1 constraint), and it is safe by construction because it produces React elements from an AST and never injects HTML. **Supported:** `#`/`##`/`###` headings (rendered as h2/h3/h4), paragraphs (single newlines become line breaks), `-`/`*` and `1.` lists, `>` quotes, `---` rules, `**bold**`, `*italic*`, `` `code` `` and `[text](url)` links. **Not supported:** images, tables, raw HTML, nested lists.

**Files:**
- Create: `web/lib/courses/markdown.ts`
- Create: `web/components/LessonMarkdown.tsx`
- Test: `web/__tests__/course-markdown.test.ts`, `web/__tests__/lesson-markdown.test.tsx`

**Interfaces (Produces):**
- `markdown.ts`: types `Inline`, `Block`; `safeHref(raw: string): { href: string; external: boolean } | null`; `parseInline(text: string): Inline[]`; `parseMarkdown(source: string): Block[]`.
- `LessonMarkdown({ source, className? })`: pure component, usable in server and client components.

- [ ] **Step 1: Write the failing parser tests**

Create `web/__tests__/course-markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown, safeHref } from '../lib/courses/markdown'

const text = (value: string) => ({ type: 'text', value })

describe('safeHref', () => {
  it('accepts http(s), mailto and site-relative links', () => {
    expect(safeHref('https://example.com/a?b=1')).toEqual({ href: 'https://example.com/a?b=1', external: true })
    expect(safeHref('http://example.com')).toEqual({ href: 'http://example.com', external: true })
    expect(safeHref('mailto:a@b.com')).toEqual({ href: 'mailto:a@b.com', external: true })
    expect(safeHref('/lexicon/abc')).toEqual({ href: '/lexicon/abc', external: false })
  })

  it('rejects everything else', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,x')).toBeNull()
    expect(safeHref('ftp://example.com')).toBeNull()
    expect(safeHref('//evil.example.com')).toBeNull()
    expect(safeHref('https://a b')).toBeNull()
    expect(safeHref('')).toBeNull()
  })
})

describe('parseInline', () => {
  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** *c* `d`')).toEqual([
      text('a '),
      { type: 'strong', children: [text('b')] },
      text(' '),
      { type: 'em', children: [text('c')] },
      text(' '),
      { type: 'code', value: 'd' },
    ])
  })

  it('parses safe links', () => {
    expect(parseInline('[x](https://a.com/p)')).toEqual([
      { type: 'link', href: 'https://a.com/p', external: true, children: [text('x')] },
    ])
  })

  it('drops the link but keeps the text when the URL is unsafe', () => {
    const nodes = parseInline('[x](javascript:alert(1))')
    expect(nodes.some(n => n.type === 'link')).toBe(false)
    expect(JSON.stringify(nodes)).not.toContain('javascript')
  })

  it('keeps an unpaired asterisk as plain text', () => {
    expect(parseInline('la forme *kpa')).toEqual([text('la forme *kpa')])
  })
})

describe('parseMarkdown', () => {
  it('returns no blocks for empty input', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n  \n')).toEqual([])
  })

  it('maps # to h2, ## to h3 and ### to h4, and ignores deeper levels', () => {
    expect(parseMarkdown('# A')[0]).toEqual({ type: 'heading', level: 2, children: [text('A')] })
    expect(parseMarkdown('## A')[0]).toMatchObject({ level: 3 })
    expect(parseMarkdown('### A')[0]).toMatchObject({ level: 4 })
    expect(parseMarkdown('#### A')[0]).toEqual({ type: 'paragraph', lines: [[text('#### A')]] })
  })

  it('splits paragraphs on blank lines and keeps single newlines as lines', () => {
    expect(parseMarkdown('a\nb\n\nc')).toEqual([
      { type: 'paragraph', lines: [[text('a')], [text('b')]] },
      { type: 'paragraph', lines: [[text('c')]] },
    ])
  })

  it('parses unordered and ordered lists', () => {
    expect(parseMarkdown('- a\n- b')).toEqual([
      { type: 'list', ordered: false, items: [[text('a')], [text('b')]] },
    ])
    expect(parseMarkdown('1. a\n2) b')).toEqual([
      { type: 'list', ordered: true, items: [[text('a')], [text('b')]] },
    ])
  })

  it('parses quotes and rules', () => {
    expect(parseMarkdown('> a\n> b')).toEqual([{ type: 'quote', lines: [[text('a')], [text('b')]] }])
    expect(parseMarkdown('---')).toEqual([{ type: 'rule' }])
  })

  it('ends a paragraph when another block starts', () => {
    const blocks = parseMarkdown('intro\n- item')
    expect(blocks.map(b => b.type)).toEqual(['paragraph', 'list'])
  })

  it('does not mistake a bold opener for a list item', () => {
    expect(parseMarkdown('**gras** au début')[0].type).toBe('paragraph')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run from `web/`: `npx vitest run course-markdown`
Expected: FAIL (cannot resolve `../lib/courses/markdown`).

- [ ] **Step 3: Implement the parser**

Create `web/lib/courses/markdown.ts`:

```ts
// A deliberately small Markdown subset for lesson text. It produces an AST that
// React renders as elements, so user input is never injected as HTML.
// Unsupported on purpose: images, tables, raw HTML, nested lists.

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; external: boolean; children: Inline[] }

export type Block =
  | { type: 'heading'; level: 2 | 3 | 4; children: Inline[] }
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; lines: Inline[][] }
  | { type: 'rule' }

/** Only http(s), mailto and site-relative URLs may become links. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const url = raw.trim()
  if (/^https?:\/\/\S+$/i.test(url)) return { href: url, external: true }
  if (/^mailto:\S+$/i.test(url)) return { href: url, external: true }
  if (url.startsWith('/') && !url.startsWith('//') && !/\s/.test(url)) {
    return { href: url, external: false }
  }
  return null
}

const INLINE_PATTERN = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = []
  let cursor = 0
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push({ type: 'text', value: text.slice(cursor, start) })
    if (match[1] !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(match[1]) })
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'em', children: parseInline(match[2]) })
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'code', value: match[3] })
    } else {
      const target = safeHref(match[5])
      if (target) {
        nodes.push({ type: 'link', ...target, children: parseInline(match[4]) })
      } else {
        // Unsafe URL: keep the visible text, drop the link.
        nodes.push({ type: 'text', value: match[4] })
      }
    }
    cursor = start + match[0].length
  }
  if (cursor < text.length) nodes.push({ type: 'text', value: text.slice(cursor) })
  return nodes
}

const HEADING = /^(#{1,3})\s+(.+?)\s*$/
const RULE = /^(-{3,}|\*{3,})\s*$/
const UNORDERED = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/

function startsBlock(line: string): boolean {
  return (
    HEADING.test(line) ||
    RULE.test(line) ||
    UNORDERED.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line)
  )
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  const collect = (pattern: RegExp): Inline[][] => {
    const items: Inline[][] = []
    while (i < lines.length) {
      const match = pattern.exec(lines[i])
      if (!match) break
      items.push(parseInline(match[1]))
      i++
    }
    return items
  }

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1].length + 1) as 2 | 3 | 4,
        children: parseInline(heading[2]),
      })
      i++
      continue
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }
    if (UNORDERED.test(line)) {
      blocks.push({ type: 'list', ordered: false, items: collect(UNORDERED) })
      continue
    }
    if (ORDERED.test(line)) {
      blocks.push({ type: 'list', ordered: true, items: collect(ORDERED) })
      continue
    }
    if (QUOTE.test(line)) {
      blocks.push({ type: 'quote', lines: collect(QUOTE) })
      continue
    }

    const paragraph: Inline[][] = []
    while (i < lines.length && lines[i].trim() !== '' && !startsBlock(lines[i])) {
      paragraph.push(parseInline(lines[i].trim()))
      i++
    }
    blocks.push({ type: 'paragraph', lines: paragraph })
  }

  return blocks
}
```

- [ ] **Step 4: Run to verify it passes**

Run from `web/`: `npx vitest run course-markdown`
Expected: all PASS.

- [ ] **Step 5: Write the failing render tests**

Create `web/__tests__/lesson-markdown.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LessonMarkdown } from '../components/LessonMarkdown'

const html = (source: string) => renderToStaticMarkup(<LessonMarkdown source={source} />)

describe('LessonMarkdown', () => {
  it('escapes raw HTML instead of rendering it', () => {
    const out = html('<script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;script&gt;')
  })

  it('escapes HTML inside link text and drops javascript: links', () => {
    expect(html('[<b>x</b>](https://a.com)')).toContain('&lt;b&gt;')
    const out = html('[x](javascript:alert(1))')
    expect(out).not.toContain('href')
    expect(out).not.toContain('javascript:')
  })

  it('opens external links safely in a new tab', () => {
    const out = html('[a](https://example.com)')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="nofollow ugc noopener noreferrer"')
  })

  it('keeps internal links in the same tab', () => {
    const out = html('[a](/lexicon)')
    expect(out).toContain('href="/lexicon"')
    expect(out).not.toContain('target=')
  })

  it('never renders images', () => {
    expect(html('![alt](https://example.com/x.png)')).not.toContain('<img')
  })

  it('renders headings one level down so the lesson title stays the only h1', () => {
    const out = html('# Titre')
    expect(out).toContain('<h2')
    expect(out).not.toContain('<h1')
  })

  it('renders lists, quotes and emphasis', () => {
    const out = html('- un\n- deux\n\n> cité\n\n**gras** et *italique*')
    expect(out).toContain('<ul')
    expect(out).toContain('<li>un</li>')
    expect(out).toContain('<blockquote')
    expect(out).toContain('<strong>gras</strong>')
    expect(out).toContain('<em>italique</em>')
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run from `web/`: `npx vitest run lesson-markdown`
Expected: FAIL (cannot resolve `../components/LessonMarkdown`).

- [ ] **Step 7: Implement the component**

Create `web/components/LessonMarkdown.tsx`:

```tsx
import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { parseMarkdown, type Block, type Inline } from '@/lib/courses/markdown'

const LINK_CLASS = 'text-primary underline underline-offset-2'

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={i}>{node.value}</Fragment>
      case 'strong':
        return <strong key={i}>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={i}>{renderInline(node.children)}</em>
      case 'code':
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {node.value}
          </code>
        )
      case 'link':
        return node.external ? (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="nofollow ugc noopener noreferrer"
            className={LINK_CLASS}
          >
            {renderInline(node.children)}
          </a>
        ) : (
          <a key={i} href={node.href} className={LINK_CLASS}>
            {renderInline(node.children)}
          </a>
        )
    }
  })
}

function renderLines(lines: Inline[][]): ReactNode {
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line)}
    </Fragment>
  ))
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4'
      const size = block.level === 2 ? 'text-2xl' : block.level === 3 ? 'text-xl' : 'text-lg'
      return (
        <Tag key={key} className={cn('font-heading font-bold mt-6', size)}>
          {renderInline(block.children)}
        </Tag>
      )
    }
    case 'paragraph':
      return <p key={key}>{renderLines(block.lines)}</p>
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key} className={cn('pl-6 space-y-1', block.ordered ? 'list-decimal' : 'list-disc')}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'quote':
      return (
        <blockquote key={key} className="border-l-4 border-primary pl-4 italic text-muted-foreground">
          {renderLines(block.lines)}
        </blockquote>
      )
    case 'rule':
      return <hr key={key} className="border-border" />
  }
}

export function LessonMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn('space-y-4 leading-relaxed', className)}>
      {parseMarkdown(source).map(renderBlock)}
    </div>
  )
}
```

- [ ] **Step 8: Run to verify it passes**

Run from `web/`: `npx vitest run lesson-markdown`
Expected: all PASS. If `renderToStaticMarkup` reports a JSX runtime error, confirm `web/tsconfig.json` has `"jsx": "react-jsx"` (it does) and that the alias in `vitest.config.ts` (Task 1) is in place.

- [ ] **Step 9: Commit**

```bash
git add web/lib/courses/markdown.ts web/components/LessonMarkdown.tsx web/__tests__/course-markdown.test.ts web/__tests__/lesson-markdown.test.tsx
git commit -m "feat(courses): safe Markdown subset renderer for lessons" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Data layer (server queries and client mutations)

**Files:**
- Create: `web/lib/courses/queries.ts`
- Create: `web/lib/courses/mutations.ts`
- Test: `web/__tests__/course-mutations.test.ts`

**Interfaces:**
- Consumes (Task 4): `buildOutline`, `computeProgress`, `Progress`, `buildSlug`, types.
- Produces (`queries.ts`, server-only; every function takes a `SupabaseClient` first):
  - `getPublishedCourses(client, filters?: { dialect?: DialectKey | null; level?: CourseLevel | null }, limit?): Promise<Course[]>`
  - `getCourseBySlug(client, slug): Promise<Course | null>`
  - `getCourseById(client, id): Promise<Course | null>`
  - `getCourseOutline(client, courseId): Promise<OutlineSection[]>`
  - `getLessonContent(client, lessonId): Promise<string | null>`
  - `getCompletedLessonIds(client, userId, lessonIds): Promise<string[]>`
  - `isEnrolled(client, userId, courseId): Promise<boolean>`
  - `getMyCourses(client, userId): Promise<Course[]>`
  - `getMyEnrollments(client, userId): Promise<EnrollmentSummary[]>` with `EnrollmentSummary { course: Course; progress: Progress }`
  - `isAdmin(client): Promise<boolean>`
  - `getOpenReports(client): Promise<OpenReport[]>` with `OpenReport { id; reason; created_at; course: Pick<Course, 'id'|'title'|'slug'|'status'> | null }`
  - `getSuspendedCourses(client): Promise<Course[]>`
- Produces (`mutations.ts`, all return `Promise<Result<…>>`):
  - `createCourse(client, input: CourseInput, random?): Result<{ id: string; slug: string }>`
  - `updateCourse(client, courseId, input: CourseInput): Result<null>`
  - `setCourseStatus(client, courseId, status: 'draft' | 'published' | 'archived'): Result<null>`
  - `deleteCourse(client, courseId): Result<null>`
  - `addSection(client, courseId, title, position): Result<{ id: string }>`
  - `renameSection(client, sectionId, title): Result<null>`
  - `deleteSection(client, sectionId): Result<null>`
  - `addLesson(client, { courseId, sectionId, title, position }): Result<{ id: string }>`
  - `updateLesson(client, lessonId, patch: { title?: string; is_preview?: boolean }): Result<null>`
  - `deleteLesson(client, lessonId): Result<null>`
  - `saveLessonContent(client, lessonId, body): Result<null>`
  - `applyPositions(client, table: 'course_sections' | 'lessons', changes): Result<null>`
  - `enroll(client, courseId): Result<null>`
  - `setLessonCompleted(client, lessonId, completed): Result<null>`
  - `reportCourse(client, courseId, reason): Result<null>`
  - `resolveReport(client, reportId): Result<null>`
  - `suspendCourse(client, courseId): Result<null>`
  - `restoreCourse(client, courseId): Result<null>`

- [ ] **Step 1: Write the failing test for `createCourse`**

`createCourse` holds the only non-trivial logic (validation and slug-collision retry); the other mutations are thin wrappers over RLS-protected calls and are covered by the RLS suite plus manual checks.

Create `web/__tests__/course-mutations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCourse } from '../lib/courses/mutations'

type Reply = {
  data: { id: string; slug: string } | null
  error: { code?: string; message: string } | null
}

function fakeClient(replies: Reply[], user: { id: string } | null = { id: 'user-1' }) {
  const inserted: Record<string, unknown>[] = []
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted.push(row)
        return {
          select: () => ({
            single: async () => replies.shift() ?? { data: null, error: { message: 'no reply' } },
          }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { client, inserted }
}

// Deterministic "random" that differs on each call, so retried slugs differ.
const counting = () => {
  let n = 0
  return () => (n++ % 36) / 36
}

const input = {
  title: 'Salutations',
  summary: 'Les bases',
  dialect: 'western' as const,
  level: 'beginner' as const,
}

describe('createCourse', () => {
  it('inserts a course owned by the signed-in user and returns its id and slug', async () => {
    const { client, inserted } = fakeClient([{ data: { id: 'c1', slug: 'salutations-abcd' }, error: null }])
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: { id: 'c1', slug: 'salutations-abcd' }, error: null })
    expect(inserted).toHaveLength(1)
    expect(inserted[0]).toMatchObject({ owner_id: 'user-1', title: 'Salutations', summary: 'Les bases' })
    expect(inserted[0].slug).toMatch(/^salutations-[a-z0-9]{4}$/)
    expect(inserted[0]).not.toHaveProperty('status')
    expect(inserted[0]).not.toHaveProperty('access')
  })

  it('retries with a new slug on a unique-violation', async () => {
    const { client, inserted } = fakeClient([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: { id: 'c2', slug: 'salutations-efgh' }, error: null },
    ])
    const result = await createCourse(client, input, counting())
    expect(result.error).toBeNull()
    expect(inserted).toHaveLength(2)
    expect(inserted[0].slug).not.toBe(inserted[1].slug)
  })

  it('gives up after three collisions', async () => {
    const collision: Reply = { data: null, error: { code: '23505', message: 'duplicate key' } }
    const { client, inserted } = fakeClient([collision, collision, collision])
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: null, error: 'Impossible de générer une adresse unique, réessayez.' })
    expect(inserted).toHaveLength(3)
  })

  it('surfaces other database errors without retrying', async () => {
    const { client, inserted } = fakeClient([{ data: null, error: { code: '42501', message: 'permission denied' } }])
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: null, error: 'permission denied' })
    expect(inserted).toHaveLength(1)
  })

  it('refuses to create a course when signed out', async () => {
    const { client, inserted } = fakeClient([], null)
    const result = await createCourse(client, input, counting())
    expect(result).toEqual({ data: null, error: 'Connectez-vous pour créer un cours.' })
    expect(inserted).toHaveLength(0)
  })

  it('rejects titles outside 3 to 120 characters before touching the database', async () => {
    const { client, inserted } = fakeClient([])
    const tooShort = await createCourse(client, { ...input, title: 'ab' }, counting())
    const tooLong = await createCourse(client, { ...input, title: 'x'.repeat(121) }, counting())
    expect(tooShort.error).toBe('Le titre doit contenir entre 3 et 120 caractères.')
    expect(tooLong.error).toBe('Le titre doit contenir entre 3 et 120 caractères.')
    expect(inserted).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run from `web/`: `npx vitest run course-mutations`
Expected: FAIL (cannot resolve `../lib/courses/mutations`).

- [ ] **Step 3: Implement the mutations**

Create `web/lib/courses/mutations.ts`:

```ts
// lib/courses/mutations.ts — client-side writes for the course platform.
// Authorization is enforced by RLS; these helpers add validation and friendly
// French errors. Pass a client created with createClient() from supabase-browser.
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSlug } from './slug'
import type { CourseInput, Result } from './types'

const PG_UNIQUE_VIOLATION = '23505'

function ok<T>(data: T): Result<T> {
  return { data, error: null }
}

function fail(error: string): Result<never> {
  return { data: null, error }
}

function done(error: { message: string } | null): Result<null> {
  return error ? fail(error.message) : ok(null)
}

async function getAuthUser(client: SupabaseClient) {
  const {
    data: { user },
  } = await client.auth.getUser()
  return user
}

const TITLE_ERROR = 'Le titre doit contenir entre 3 et 120 caractères.'

// ── Courses ────────────────────────────────────────────────────────────────

/** Creates a draft course owned by the current user. Retries with a fresh slug on collision. */
export async function createCourse(
  client: SupabaseClient,
  input: CourseInput,
  random: () => number = Math.random,
): Promise<Result<{ id: string; slug: string }>> {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) return fail(TITLE_ERROR)

  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour créer un cours.')

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await client
      .from('courses')
      .insert({
        owner_id: user.id,
        title,
        slug: buildSlug(title, random),
        summary: input.summary.trim(),
        dialect: input.dialect,
        level: input.level,
      })
      .select('id, slug')
      .single()
    if (!error && data) {
      const row = data as { id: string; slug: string }
      return ok({ id: row.id, slug: row.slug })
    }
    if (error?.code !== PG_UNIQUE_VIOLATION) return fail(error?.message ?? 'Erreur inattendue.')
  }
  return fail('Impossible de générer une adresse unique, réessayez.')
}

export async function updateCourse(
  client: SupabaseClient,
  courseId: string,
  input: CourseInput,
): Promise<Result<null>> {
  const title = input.title.trim()
  if (title.length < 3 || title.length > 120) return fail(TITLE_ERROR)
  const { error } = await client
    .from('courses')
    .update({
      title,
      summary: input.summary.trim(),
      dialect: input.dialect,
      level: input.level,
    })
    .eq('id', courseId)
  return done(error)
}

export async function setCourseStatus(
  client: SupabaseClient,
  courseId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<Result<null>> {
  const { error } = await client.from('courses').update({ status }).eq('id', courseId)
  return done(error)
}

export async function deleteCourse(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const { error } = await client.from('courses').delete().eq('id', courseId)
  return done(error)
}

// ── Sections and lessons ───────────────────────────────────────────────────

export async function addSection(
  client: SupabaseClient,
  courseId: string,
  title: string,
  position: number,
): Promise<Result<{ id: string }>> {
  const clean = title.trim()
  if (!clean) return fail('Le titre est obligatoire.')
  const { data, error } = await client
    .from('course_sections')
    .insert({ course_id: courseId, title: clean, position })
    .select('id')
    .single()
  if (error || !data) return fail(error?.message ?? 'Erreur inattendue.')
  return ok({ id: (data as { id: string }).id })
}

export async function renameSection(
  client: SupabaseClient,
  sectionId: string,
  title: string,
): Promise<Result<null>> {
  const clean = title.trim()
  if (!clean) return fail('Le titre est obligatoire.')
  const { error } = await client.from('course_sections').update({ title: clean }).eq('id', sectionId)
  return done(error)
}

export async function deleteSection(client: SupabaseClient, sectionId: string): Promise<Result<null>> {
  const { error } = await client.from('course_sections').delete().eq('id', sectionId)
  return done(error)
}

export async function addLesson(
  client: SupabaseClient,
  input: { courseId: string; sectionId: string; title: string; position: number },
): Promise<Result<{ id: string }>> {
  const clean = input.title.trim()
  if (!clean) return fail('Le titre est obligatoire.')
  const { data, error } = await client
    .from('lessons')
    .insert({
      course_id: input.courseId,
      section_id: input.sectionId,
      title: clean,
      position: input.position,
      kind: 'text',
    })
    .select('id')
    .single()
  if (error || !data) return fail(error?.message ?? 'Erreur inattendue.')
  return ok({ id: (data as { id: string }).id })
}

export async function updateLesson(
  client: SupabaseClient,
  lessonId: string,
  patch: { title?: string; is_preview?: boolean },
): Promise<Result<null>> {
  const update: { title?: string; is_preview?: boolean } = {}
  if (patch.title !== undefined) {
    const clean = patch.title.trim()
    if (!clean) return fail('Le titre est obligatoire.')
    update.title = clean
  }
  if (patch.is_preview !== undefined) update.is_preview = patch.is_preview
  const { error } = await client.from('lessons').update(update).eq('id', lessonId)
  return done(error)
}

export async function deleteLesson(client: SupabaseClient, lessonId: string): Promise<Result<null>> {
  const { error } = await client.from('lessons').delete().eq('id', lessonId)
  return done(error)
}

export async function saveLessonContent(
  client: SupabaseClient,
  lessonId: string,
  body: string,
): Promise<Result<null>> {
  if (body.length > 50000) return fail('Le texte est trop long (50 000 caractères maximum).')
  const { error } = await client.from('lesson_contents').update({ body_md: body }).eq('lesson_id', lessonId)
  return done(error)
}

export async function applyPositions(
  client: SupabaseClient,
  table: 'course_sections' | 'lessons',
  changes: { id: string; position: number }[],
): Promise<Result<null>> {
  const results = await Promise.all(
    changes.map(change => client.from(table).update({ position: change.position }).eq('id', change.id)),
  )
  const failed = results.find(r => r.error)
  return done(failed?.error ?? null)
}

// ── Learner actions ────────────────────────────────────────────────────────

export async function enroll(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour vous inscrire.')
  const { error } = await client.from('enrollments').insert({ user_id: user.id, course_id: courseId })
  if (error && error.code !== PG_UNIQUE_VIOLATION) return fail(error.message)
  return ok(null)
}

export async function setLessonCompleted(
  client: SupabaseClient,
  lessonId: string,
  completed: boolean,
): Promise<Result<null>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour suivre votre progression.')
  if (completed) {
    const { error } = await client.from('lesson_progress').insert({ user_id: user.id, lesson_id: lessonId })
    if (error && error.code !== PG_UNIQUE_VIOLATION) return fail(error.message)
    return ok(null)
  }
  const { error } = await client
    .from('lesson_progress')
    .delete()
    .eq('user_id', user.id)
    .eq('lesson_id', lessonId)
  return done(error)
}

export async function reportCourse(
  client: SupabaseClient,
  courseId: string,
  reason: string,
): Promise<Result<null>> {
  const clean = reason.trim()
  if (clean.length < 5) return fail('Précisez le motif (5 caractères minimum).')
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour signaler un cours.')
  const { error } = await client
    .from('course_reports')
    .insert({ course_id: courseId, reporter_id: user.id, reason: clean })
  if (error?.code === PG_UNIQUE_VIOLATION) return fail('Vous avez déjà signalé ce cours.')
  return done(error)
}

// ── Moderation (admin only, enforced by RLS) ───────────────────────────────

export async function resolveReport(client: SupabaseClient, reportId: string): Promise<Result<null>> {
  const { error } = await client
    .from('course_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  return done(error)
}

export async function suspendCourse(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const { error } = await client.from('courses').update({ status: 'suspended' }).eq('id', courseId)
  if (error) return fail(error.message)
  const { error: reportError } = await client
    .from('course_reports')
    .update({ resolved_at: new Date().toISOString() })
    .eq('course_id', courseId)
    .is('resolved_at', null)
  return done(reportError)
}

export async function restoreCourse(client: SupabaseClient, courseId: string): Promise<Result<null>> {
  const { error } = await client.from('courses').update({ status: 'draft' }).eq('id', courseId)
  return done(error)
}
```

- [ ] **Step 4: Run to verify it passes**

Run from `web/`: `npx vitest run course-mutations`
Expected: all 6 tests PASS.

- [ ] **Step 5: Implement the server queries**

Create `web/lib/courses/queries.ts`:

```ts
import 'server-only'
// lib/courses/queries.ts — server-side reads for the course platform.
// Visibility is decided by RLS: an anonymous client sees published courses,
// a signed-in client additionally sees its own, enrolled and (admins) all courses.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DialectKey } from '../dialect'
import { buildOutline, computeProgress, type Progress } from './outline'
import type { Course, CourseLevel, Lesson, OutlineSection, Section } from './types'

export async function getPublishedCourses(
  client: SupabaseClient,
  filters: { dialect?: DialectKey | null; level?: CourseLevel | null } = {},
  limit = 60,
): Promise<Course[]> {
  let query = client
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (filters.dialect) query = query.eq('dialect', filters.dialect)
  if (filters.level) query = query.eq('level', filters.level)
  const { data } = await query
  return (data ?? []) as Course[]
}

export async function getCourseBySlug(client: SupabaseClient, slug: string): Promise<Course | null> {
  const { data } = await client.from('courses').select('*').eq('slug', slug).maybeSingle()
  return (data ?? null) as Course | null
}

export async function getCourseById(client: SupabaseClient, id: string): Promise<Course | null> {
  const { data } = await client.from('courses').select('*').eq('id', id).maybeSingle()
  return (data ?? null) as Course | null
}

export async function getCourseOutline(client: SupabaseClient, courseId: string): Promise<OutlineSection[]> {
  const [sections, lessons] = await Promise.all([
    client.from('course_sections').select('*').eq('course_id', courseId).order('position'),
    client.from('lessons').select('*').eq('course_id', courseId).order('position'),
  ])
  return buildOutline((sections.data ?? []) as Section[], (lessons.data ?? []) as Lesson[])
}

/** The lesson body, or null when RLS withholds it (not enrolled, not a preview, suspended…). */
export async function getLessonContent(client: SupabaseClient, lessonId: string): Promise<string | null> {
  const { data } = await client
    .from('lesson_contents')
    .select('body_md')
    .eq('lesson_id', lessonId)
    .maybeSingle()
  return data ? (data as { body_md: string }).body_md : null
}

export async function getCompletedLessonIds(
  client: SupabaseClient,
  userId: string,
  lessonIds: string[],
): Promise<string[]> {
  if (lessonIds.length === 0) return []
  const { data } = await client
    .from('lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .in('lesson_id', lessonIds)
  return ((data ?? []) as { lesson_id: string }[]).map(row => row.lesson_id)
}

export async function isEnrolled(client: SupabaseClient, userId: string, courseId: string): Promise<boolean> {
  const { data } = await client
    .from('enrollments')
    .select('course_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle()
  return data !== null
}

export async function getMyCourses(client: SupabaseClient, userId: string): Promise<Course[]> {
  const { data } = await client
    .from('courses')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as Course[]
}

export interface EnrollmentSummary {
  course: Course
  progress: Progress
}

export async function getMyEnrollments(client: SupabaseClient, userId: string): Promise<EnrollmentSummary[]> {
  const { data: rows } = await client.from('enrollments').select('course_id').eq('user_id', userId)
  const courseIds = ((rows ?? []) as { course_id: string }[]).map(row => row.course_id)
  if (courseIds.length === 0) return []

  const [courses, lessons, done] = await Promise.all([
    client.from('courses').select('*').in('id', courseIds),
    client.from('lessons').select('id, course_id').in('course_id', courseIds),
    client.from('lesson_progress').select('lesson_id').eq('user_id', userId),
  ])
  const lessonRows = (lessons.data ?? []) as { id: string; course_id: string }[]
  const doneIds = ((done.data ?? []) as { lesson_id: string }[]).map(row => row.lesson_id)

  return ((courses.data ?? []) as Course[]).map(course => ({
    course,
    progress: computeProgress(
      lessonRows.filter(lesson => lesson.course_id === course.id).map(lesson => lesson.id),
      doneIds,
    ),
  }))
}

export async function isAdmin(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.rpc('is_admin')
  return data === true
}

export interface OpenReport {
  id: string
  reason: string
  created_at: string
  course: Pick<Course, 'id' | 'title' | 'slug' | 'status'> | null
}

interface ReportRow {
  id: string
  reason: string
  created_at: string
  courses: OpenReport['course'] | OpenReport['course'][]
}

export async function getOpenReports(client: SupabaseClient): Promise<OpenReport[]> {
  const { data } = await client
    .from('course_reports')
    .select('id, reason, created_at, courses(id, title, slug, status)')
    .is('resolved_at', null)
    .order('created_at', { ascending: true })
  return ((data ?? []) as unknown as ReportRow[]).map(row => ({
    id: row.id,
    reason: row.reason,
    created_at: row.created_at,
    course: Array.isArray(row.courses) ? (row.courses[0] ?? null) : (row.courses ?? null),
  }))
}

export async function getSuspendedCourses(client: SupabaseClient): Promise<Course[]> {
  const { data } = await client
    .from('courses')
    .select('*')
    .eq('status', 'suspended')
    .order('updated_at', { ascending: false })
  return (data ?? []) as Course[]
}
```

- [ ] **Step 6: Type-check and lint**

Run from `web/`: `npx tsc --noEmit`
Expected: no errors.
Run from `web/`: `npx eslint lib/courses`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add web/lib/courses/queries.ts web/lib/courses/mutations.ts web/__tests__/course-mutations.test.ts
git commit -m "feat(courses): server queries and client mutations" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Catalog page, navigation, sitemap, robots

**Files:**
- Create: `web/components/courses/styles.ts`
- Create: `web/components/courses/CourseCard.tsx`
- Create: `web/app/courses/page.tsx`
- Create: `web/app/teach/layout.tsx`, `web/app/admin/layout.tsx`
- Modify: `web/components/Navbar.tsx`, `web/app/sitemap.ts`, `web/app/robots.ts`

**Interfaces:**
- Consumes: `getPublishedCourses`, `isDialect`, `isLevel`, `LEVELS`, `LEVEL_LABELS`, `DIALECTS`, `DIALECT_KEYS`.
- Produces: `styles.ts` exports `primaryLinkClass`, `secondaryLinkClass`, `selectClass` (Tailwind class strings reused by later tasks); `CourseCard({ course })`; the `/courses` route.

- [ ] **Step 1: Create the shared style constants**

Create `web/components/courses/styles.ts`:

```ts
// Shared Tailwind class strings for the course pages (opacity utilities limited
// to those with an iOS <16.2 fallback in globals.css).
export const primaryLinkClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors'

export const secondaryLinkClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors'

export const selectClass =
  'w-full border border-input rounded-md px-3 py-2 text-sm bg-background'
```

- [ ] **Step 2: Create the course card**

Create `web/components/courses/CourseCard.tsx`:

```tsx
import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { DIALECTS } from '@/lib/dialect'
import { LEVEL_LABELS } from '@/lib/courses/labels'
import type { Course } from '@/lib/courses/types'

export function CourseCard({ course }: { course: Course }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:border-primary transition-colors"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5">
          <GraduationCap className="w-3 h-3" />
          {LEVEL_LABELS[course.level]}
        </span>
        <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5">
          {DIALECTS[course.dialect].name}
        </span>
        <span className="rounded-full bg-secondary/10 text-secondary px-2.5 py-0.5">
          {course.access === 'free' ? 'Gratuit' : 'Payant'}
        </span>
      </div>
      <h2 className="font-heading font-semibold text-base group-hover:text-primary transition-colors">
        {course.title}
      </h2>
      {course.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">{course.summary}</p>
      )}
    </Link>
  )
}
```

- [ ] **Step 3: Create the catalog page**

Create `web/app/courses/page.tsx`:

```tsx
import Link from 'next/link'
import type { Metadata } from 'next'
import { PlusCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { CourseCard } from '@/components/courses/CourseCard'
import { primaryLinkClass } from '@/components/courses/styles'
import { createClient } from '@/lib/supabase-server'
import { getPublishedCourses } from '@/lib/courses/queries'
import { LEVELS, LEVEL_LABELS, isDialect, isLevel } from '@/lib/courses/labels'
import { DIALECTS, DIALECT_KEYS } from '@/lib/dialect'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Cours de bhété',
  description:
    'Cours en ligne pour apprendre le bhété (bété) de Côte d’Ivoire : leçons créées par la communauté, gratuites et accessibles sur mobile.',
  alternates: { canonical: '/courses' },
}

interface Props {
  searchParams: Promise<{ dialect?: string; level?: string }>
}

function filterHref(dialect: string | null, level: string | null) {
  const params = new URLSearchParams()
  if (dialect) params.set('dialect', dialect)
  if (level) params.set('level', level)
  const query = params.toString()
  return query ? `/courses?${query}` : '/courses'
}

const pill = (active: boolean) =>
  cn(
    'rounded-full px-4 py-2 text-sm whitespace-nowrap border transition-colors shrink-0',
    active ? 'bg-primary text-white border-primary' : 'bg-muted border-transparent hover:border-primary',
  )

export default async function CoursesPage({ searchParams }: Props) {
  const params = await searchParams
  const dialect = isDialect(params.dialect) ? params.dialect : null
  const level = isLevel(params.level) ? params.level : null

  const supabase = await createClient()
  const courses = await getPublishedCourses(supabase, { dialect, level })

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Cours"
        title="Apprendre le bhété"
        subtitle="Des cours créés par la communauté. Choisissez un parcours, inscrivez-vous et avancez à votre rythme."
      />

      <div className="flex flex-col gap-3 mb-8">
        <div className="flex overflow-x-auto gap-2 pb-1" aria-label="Filtrer par dialecte">
          <Link href={filterHref(null, level)} className={pill(dialect === null)}>
            Tous les dialectes
          </Link>
          {DIALECT_KEYS.map(key => (
            <Link key={key} href={filterHref(key, level)} className={pill(dialect === key)}>
              {DIALECTS[key].name}
            </Link>
          ))}
        </div>
        <div className="flex overflow-x-auto gap-2 pb-1" aria-label="Filtrer par niveau">
          <Link href={filterHref(dialect, null)} className={pill(level === null)}>
            Tous les niveaux
          </Link>
          {LEVELS.map(key => (
            <Link key={key} href={filterHref(dialect, key)} className={pill(level === key)}>
              {LEVEL_LABELS[key]}
            </Link>
          ))}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <p className="text-muted-foreground">
            {dialect || level
              ? 'Aucun cours ne correspond à ces filtres pour le moment.'
              : 'Aucun cours n’est encore publié. Soyez le premier à partager le vôtre !'}
          </p>
          <Link href="/teach/new" className={primaryLinkClass}>
            <PlusCircle className="w-4 h-4" />
            Créer un cours
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/teach/new" className={primaryLinkClass}>
              <PlusCircle className="w-4 h-4" />
              Créer un cours
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add the noindex layouts for `/teach` and `/admin`**

Create `web/app/teach/layout.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Espace enseignant',
  robots: { index: false, follow: false },
}

export default function TeachLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

Create `web/app/admin/layout.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
```

- [ ] **Step 5: Add "Cours" to the navbar**

In `web/components/Navbar.tsx`, replace:

```tsx
  { href: '/grammar',   label: 'Grammaire' },
```

with:

```tsx
  { href: '/grammar',   label: 'Grammaire' },
  { href: '/courses',   label: 'Cours' },
```

- [ ] **Step 6: Add courses to the sitemap and robots**

In `web/app/sitemap.ts`, replace:

```ts
  { path: '/grammar',    changeFrequency: 'weekly',  priority: 0.7 },
```

with:

```ts
  { path: '/grammar',    changeFrequency: 'weekly',  priority: 0.7 },
  { path: '/courses',    changeFrequency: 'weekly',  priority: 0.8 },
```

Replace:

```ts
    const [lex, threads] = await Promise.all([
      supabase.from('lexicon').select('id, bete_word, bete_phonetic').limit(50000),
      supabase.from('forum_threads').select('id, created_at').limit(50000),
    ])
```

with:

```ts
    const [lex, threads, courses] = await Promise.all([
      supabase.from('lexicon').select('id, bete_word, bete_phonetic').limit(50000),
      supabase.from('forum_threads').select('id, created_at').limit(50000),
      supabase.from('courses').select('slug, updated_at').eq('status', 'published').limit(50000),
    ])
```

Replace:

```ts
    return [...staticEntries, ...lexEntries, ...threadEntries]
```

with:

```ts
    const courseEntries: MetadataRoute.Sitemap = (courses.data ?? []).map((row) => ({
      url: `${SITE_URL}/courses/${row.slug}`,
      lastModified: row.updated_at ? new Date(row.updated_at as string) : now,
      changeFrequency: 'weekly',
      priority: 0.6,
    }))

    return [...staticEntries, ...lexEntries, ...threadEntries, ...courseEntries]
```

In `web/app/robots.ts`, replace:

```ts
      disallow: ['/auth', '/profile', '/forum/new', '/resources/new', '/api/'],
```

with:

```ts
      disallow: ['/auth', '/profile', '/forum/new', '/resources/new', '/teach', '/admin', '/api/'],
```

- [ ] **Step 7: Point the dev server at the local Supabase (gitignored)**

Run from the repo root:

```bash
eval "$(supabase status -o env)"
printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' "$API_URL" "$ANON_KEY" "$SERVICE_ROLE_KEY" > web/.env.development.local
git check-ignore -v web/.env.development.local
```

Expected: `git check-ignore` prints a matching rule from `web/.gitignore` (`.env*`). This file overrides `.env.local` only under `npm run dev`, so development never touches the production database. If your CLI prints `PUBLISHABLE_KEY`/`SECRET_KEY` instead of `ANON_KEY`/`SERVICE_ROLE_KEY`, use those variables.

- [ ] **Step 8: Type-check, lint, and verify in the browser**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/courses app/teach app/admin components/courses components/Navbar.tsx app/sitemap.ts app/robots.ts`
Expected: no errors.
Run from `web/`: `npm run dev`, open `http://localhost:3000/courses`.
Expected: the header, two filter rows, and the empty state with a "Créer un cours" button; the navbar shows "Cours" highlighted. Click a filter pill: the URL gains `?dialect=…` and the pill turns active. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add web/components/courses/styles.ts web/components/courses/CourseCard.tsx web/app/courses/page.tsx web/app/teach/layout.tsx web/app/admin/layout.tsx web/components/Navbar.tsx web/app/sitemap.ts web/app/robots.ts
git commit -m "feat(courses): public catalog, nav item, sitemap and robots" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Teacher dashboard and course form

**Files:**
- Create: `web/components/courses/CourseForm.tsx`
- Create: `web/app/teach/page.tsx`
- Create: `web/app/teach/new/page.tsx`

**Interfaces:**
- Consumes: `createCourse`, `updateCourse`, `getMyCourses`, `isAdmin`, `selectClass`, `primaryLinkClass`, `secondaryLinkClass`, `STATUS_LABELS`, `STATUS_STYLES`, `LEVEL_LABELS`, `DIALECTS`.
- Produces: `CourseForm({ mode: 'create' | 'edit'; course?: Course; disabled?: boolean })`; routes `/teach` and `/teach/new`.

- [ ] **Step 1: Create the course form**

Create `web/components/courses/CourseForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { createCourse, updateCourse } from '@/lib/courses/mutations'
import { DEFAULT_DIALECT, DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { LEVELS, LEVEL_LABELS } from '@/lib/courses/labels'
import type { Course, CourseLevel } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { selectClass } from './styles'

interface Props {
  mode: 'create' | 'edit'
  course?: Course
  disabled?: boolean
}

export function CourseForm({ mode, course, disabled = false }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [title, setTitle] = useState(course?.title ?? '')
  const [summary, setSummary] = useState(course?.summary ?? '')
  const [dialect, setDialect] = useState<DialectKey>(course?.dialect ?? DEFAULT_DIALECT)
  const [level, setLevel] = useState<CourseLevel>(course?.level ?? 'beginner')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(false)
    const input = { title, summary, dialect, level }

    if (mode === 'create') {
      const { data, error: err } = await createCourse(supabase, input)
      setLoading(false)
      if (err || !data) {
        setError(err ?? 'Erreur inattendue.')
        return
      }
      router.push(`/teach/${data.id}`)
      return
    }

    if (!course) return
    const { error: err } = await updateCourse(supabase, course.id, input)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="course-title">Titre du cours</label>
        <Input
          id="course-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ex : Les salutations en bhété"
          maxLength={120}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="course-summary">Description</label>
        <Textarea
          id="course-summary"
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Ce que les apprenants sauront faire à la fin du cours."
          maxLength={500}
          rows={4}
          disabled={disabled}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="course-dialect">Dialecte</label>
          <select
            id="course-dialect"
            value={dialect}
            onChange={e => setDialect(e.target.value as DialectKey)}
            className={selectClass}
            disabled={disabled}
          >
            {DIALECT_KEYS.map(key => (
              <option key={key} value={key}>{DIALECTS[key].name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="course-level">Niveau</label>
          <select
            id="course-level"
            value={level}
            onChange={e => setLevel(e.target.value as CourseLevel)}
            className={selectClass}
            disabled={disabled}
          >
            {LEVELS.map(key => (
              <option key={key} value={key}>{LEVEL_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!disabled && (
        <Button type="submit" size="lg" disabled={loading || title.trim().length < 3} className="w-full sm:w-auto">
          {loading ? 'Enregistrement…' : mode === 'create' ? 'Créer le cours' : saved ? 'Enregistré ✓' : 'Enregistrer'}
        </Button>
      )}
    </form>
  )
}
```

- [ ] **Step 2: Create the teacher dashboard**

Create `web/app/teach/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlusCircle, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { primaryLinkClass, secondaryLinkClass } from '@/components/courses/styles'
import { createClient } from '@/lib/supabase-server'
import { getMyCourses, isAdmin } from '@/lib/courses/queries'
import { LEVEL_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import { DIALECTS } from '@/lib/dialect'

export const dynamic = 'force-dynamic'

export default async function TeachPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/teach')

  const [courses, admin] = await Promise.all([getMyCourses(supabase, user.id), isAdmin(supabase)])

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Espace enseignant"
        title="Mes cours"
        subtitle="Créez des cours, organisez vos leçons et publiez-les pour toute la communauté."
      />

      <div className="flex flex-wrap gap-3 mb-8">
        <Link href="/teach/new" className={primaryLinkClass}>
          <PlusCircle className="w-4 h-4" />
          Nouveau cours
        </Link>
        {admin && (
          <Link href="/admin/reports" className={secondaryLinkClass}>
            <ShieldCheck className="w-4 h-4" />
            Modération
          </Link>
        )}
      </div>

      {courses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
          Vous n’avez pas encore créé de cours.
        </div>
      ) : (
        <ul className="space-y-3">
          {courses.map(course => (
            <li
              key={course.id}
              className="bg-card border border-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className={`rounded-full px-2.5 py-0.5 ${STATUS_STYLES[course.status]}`}>
                    {STATUS_LABELS[course.status]}
                  </span>
                  <span className="text-muted-foreground">
                    {LEVEL_LABELS[course.level]} · {DIALECTS[course.dialect].name}
                  </span>
                </div>
                <h2 className="font-heading font-semibold truncate">{course.title}</h2>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link href={`/teach/${course.id}`} className={primaryLinkClass}>
                  Modifier
                </Link>
                {course.status === 'published' && (
                  <Link href={`/courses/${course.slug}`} className={secondaryLinkClass}>
                    Voir
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create the new-course page**

Create `web/app/teach/new/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CourseForm } from '@/components/courses/CourseForm'
import { createClient } from '@/lib/supabase-server'

export default async function NewCoursePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/teach/new')

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 py-10">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Mes cours
      </Link>
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold mb-2">Nouveau cours</h1>
        <p className="text-muted-foreground text-sm">
          Commencez par les informations générales. Vous ajouterez sections et leçons à l’étape suivante.
        </p>
      </div>
      <div className="bg-card border border-border rounded-xl p-6">
        <CourseForm mode="create" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check, lint, verify**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/teach components/courses`
Expected: no errors. (Type errors on `/teach/${data.id}` links are impossible here because routes are untyped strings; the builder page arrives in Task 9.)
Manual check needs a user: with `npm run dev` running against the local stack, create a confirmed user in Supabase Studio (`http://127.0.0.1:54323` → Authentication → Add user, tick auto-confirm; use an email like `teacher@test.local`) and sign in at `/auth`. Visit `/teach`: expect the empty state; click "Nouveau cours", submit a title: expect a redirect to `/teach/<id>` (a 404 until Task 9 — that proves the course was created). Confirm the row in Studio's table editor: `status = draft`, `access = free`.

- [ ] **Step 5: Commit**

```bash
git add web/components/courses/CourseForm.tsx web/app/teach/page.tsx web/app/teach/new/page.tsx
git commit -m "feat(courses): teacher dashboard and course creation" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Course builder and lesson editor

**Files:**
- Create: `web/components/courses/CourseStatusPanel.tsx`
- Create: `web/components/courses/CourseBuilder.tsx`
- Create: `web/components/courses/LessonEditor.tsx`
- Create: `web/app/teach/[courseId]/page.tsx`
- Create: `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `getCourseById`, `getCourseOutline`, `getLessonContent`, `publishBlocker`, `flattenLessons`, `moveItem`, `changedPositions`, `nextPosition`, all section/lesson/status mutations, `LessonMarkdown`, `CourseForm`.
- Produces: `CourseStatusPanel({ course, blocker })`, `CourseBuilder({ course, outline, readOnly })`, `LessonEditor({ courseId, lesson, initialBody, readOnly })`; routes `/teach/[courseId]` and `/teach/[courseId]/lessons/[lessonId]`.

- [ ] **Step 1: Create the status panel**

Create `web/components/courses/CourseStatusPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { deleteCourse, setCourseStatus } from '@/lib/courses/mutations'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import type { Course } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'

interface Props {
  course: Course
  /** Why the course cannot be published yet (from publishBlocker), or null. */
  blocker: string | null
}

export function CourseStatusPanel({ course, blocker }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function changeStatus(status: 'draft' | 'published' | 'archived') {
    setBusy(true)
    setError(null)
    const { error: err } = await setCourseStatus(supabase, course.id, status)
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    router.refresh()
  }

  async function handleDelete() {
    if (!window.confirm('Supprimer définitivement ce brouillon ?')) return
    setBusy(true)
    setError(null)
    const { error: err } = await deleteCourse(supabase, course.id)
    if (err) {
      setBusy(false)
      setError(err)
      return
    }
    router.push('/teach')
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-heading font-bold text-base">Publication</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[course.status]}`}>
          {STATUS_LABELS[course.status]}
        </span>
      </div>

      {course.status === 'suspended' && (
        <p className="text-sm text-destructive">
          Ce cours a été suspendu par un administrateur. Il n’est plus modifiable ni visible. Contactez l’équipe pour
          en savoir plus.
        </p>
      )}

      {(course.status === 'draft' || course.status === 'archived') && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {course.status === 'draft'
              ? 'Ce cours est un brouillon : seul vous pouvez le voir.'
              : 'Ce cours est archivé : il n’apparaît plus dans le catalogue, mais les apprenants inscrits y gardent accès.'}
          </p>
          {blocker && <p className="text-sm text-destructive">{blocker}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || blocker !== null} onClick={() => changeStatus('published')}>
              Publier le cours
            </Button>
            {course.status === 'draft' && (
              <Button variant="destructive" disabled={busy} onClick={handleDelete}>
                Supprimer le brouillon
              </Button>
            )}
          </div>
        </div>
      )}

      {course.status === 'published' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Ce cours est visible par tous dans le catalogue.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => changeStatus('draft')}>
              Repasser en brouillon
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => changeStatus('archived')}>
              Archiver
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create the builder**

Create `web/components/courses/CourseBuilder.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import {
  addLesson,
  addSection,
  applyPositions,
  deleteLesson,
  deleteSection,
  renameSection,
  updateLesson,
} from '@/lib/courses/mutations'
import { changedPositions, moveItem, nextPosition } from '@/lib/courses/reorder'
import type { Course, OutlineSection } from '@/lib/courses/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  course: Course
  outline: OutlineSection[]
  readOnly: boolean
}

type Outcome = { error: string | null }

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  )
}

export function CourseBuilder({ course, outline, readOnly }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSection, setNewSection] = useState('')
  const [newLessons, setNewLessons] = useState<Record<string, string>>({})

  async function run(action: () => Promise<Outcome>) {
    setBusy(true)
    setError(null)
    const { error: err } = await action()
    setBusy(false)
    if (err) {
      setError(err)
      return false
    }
    router.refresh()
    return true
  }

  function moveSection(id: string, direction: -1 | 1) {
    const changes = changedPositions(outline, moveItem(outline, id, direction))
    if (changes.length > 0) run(() => applyPositions(supabase, 'course_sections', changes))
  }

  function moveLesson(section: OutlineSection, id: string, direction: -1 | 1) {
    const changes = changedPositions(section.lessons, moveItem(section.lessons, id, direction))
    if (changes.length > 0) run(() => applyPositions(supabase, 'lessons', changes))
  }

  async function handleAddSection(e: React.FormEvent) {
    e.preventDefault()
    const title = newSection.trim()
    if (!title) return
    const ok = await run(() => addSection(supabase, course.id, title, nextPosition(outline)))
    if (ok) setNewSection('')
  }

  async function handleAddLesson(e: React.FormEvent, section: OutlineSection) {
    e.preventDefault()
    const title = (newLessons[section.id] ?? '').trim()
    if (!title) return
    setBusy(true)
    setError(null)
    const result = await addLesson(supabase, {
      courseId: course.id,
      sectionId: section.id,
      title,
      position: nextPosition(section.lessons),
    })
    setBusy(false)
    if (result.error || !result.data) {
      setError(result.error ?? 'Erreur inattendue.')
      return
    }
    router.push(`/teach/${course.id}/lessons/${result.data.id}`)
  }

  return (
    <div className="space-y-6">
      <h2 className="font-heading font-bold text-lg">Plan du cours</h2>

      {outline.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune section pour l’instant. Ajoutez-en une pour commencer (par exemple « Introduction »).
        </p>
      )}

      {outline.map(section => (
        <section key={section.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              key={section.title}
              defaultValue={section.title}
              disabled={readOnly || busy}
              aria-label="Titre de la section"
              className="font-heading font-semibold"
              onBlur={e => {
                const value = e.target.value.trim()
                if (value && value !== section.title) run(() => renameSection(supabase, section.id, value))
              }}
            />
            {!readOnly && (
              <>
                <IconButton label="Monter la section" disabled={busy} onClick={() => moveSection(section.id, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </IconButton>
                <IconButton label="Descendre la section" disabled={busy} onClick={() => moveSection(section.id, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </IconButton>
                <IconButton
                  label="Supprimer la section"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm('Supprimer cette section et toutes ses leçons ?')) {
                      run(() => deleteSection(supabase, section.id))
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </>
            )}
          </div>

          <ul className="space-y-2">
            {section.lessons.map(lesson => (
              <li
                key={lesson.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2"
              >
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">{lesson.title}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={lesson.is_preview}
                    disabled={readOnly || busy}
                    onChange={e => run(() => updateLesson(supabase, lesson.id, { is_preview: e.target.checked }))}
                  />
                  Aperçu
                </label>
                {!readOnly && (
                  <>
                    <IconButton label="Monter la leçon" disabled={busy} onClick={() => moveLesson(section, lesson.id, -1)}>
                      <ArrowUp className="w-4 h-4" />
                    </IconButton>
                    <IconButton label="Descendre la leçon" disabled={busy} onClick={() => moveLesson(section, lesson.id, 1)}>
                      <ArrowDown className="w-4 h-4" />
                    </IconButton>
                    <Link
                      href={`/teach/${course.id}/lessons/${lesson.id}`}
                      aria-label="Modifier la leçon"
                      title="Modifier la leçon"
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <IconButton
                      label="Supprimer la leçon"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Supprimer cette leçon ?')) run(() => deleteLesson(supabase, lesson.id))
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </>
                )}
              </li>
            ))}
          </ul>

          {!readOnly && (
            <form onSubmit={e => handleAddLesson(e, section)} className="flex gap-2">
              <Input
                value={newLessons[section.id] ?? ''}
                onChange={e => setNewLessons(prev => ({ ...prev, [section.id]: e.target.value }))}
                placeholder="Titre de la nouvelle leçon"
                maxLength={120}
                disabled={busy}
              />
              <Button type="submit" variant="outline" disabled={busy || !(newLessons[section.id] ?? '').trim()}>
                <Plus className="w-4 h-4" />
                Leçon
              </Button>
            </form>
          )}
        </section>
      ))}

      {!readOnly && (
        <form onSubmit={handleAddSection} className="flex gap-2">
          <Input
            value={newSection}
            onChange={e => setNewSection(e.target.value)}
            placeholder="Titre de la nouvelle section"
            maxLength={120}
            disabled={busy}
          />
          <Button type="submit" disabled={busy || !newSection.trim()}>
            <Plus className="w-4 h-4" />
            Section
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Create the lesson editor**

Create `web/components/courses/LessonEditor.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { saveLessonContent, updateLesson } from '@/lib/courses/mutations'
import type { Lesson } from '@/lib/courses/types'
import { LessonMarkdown } from '@/components/LessonMarkdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Props {
  courseId: string
  lesson: Lesson
  initialBody: string
  readOnly: boolean
}

export function LessonEditor({ courseId, lesson, initialBody, readOnly }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [title, setTitle] = useState(lesson.title)
  const [isPreview, setIsPreview] = useState(lesson.is_preview)
  const [body, setBody] = useState(initialBody)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const meta = await updateLesson(supabase, lesson.id, { title, is_preview: isPreview })
    if (meta.error) {
      setSaving(false)
      setError(meta.error)
      return
    }
    const content = await saveLessonContent(supabase, lesson.id, body)
    setSaving(false)
    if (content.error) {
      setError(content.error)
      return
    }
    setSaved(true)
    router.refresh()
  }

  const tabClass = (active: boolean) =>
    cn(
      'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
      active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div className="space-y-6">
      <Link
        href={`/teach/${courseId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour au plan du cours
      </Link>

      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="lesson-title">Titre de la leçon</label>
          <Input
            id="lesson-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            disabled={readOnly}
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary"
            checked={isPreview}
            onChange={e => setIsPreview(e.target.checked)}
            disabled={readOnly}
          />
          <span className="text-sm">
            Leçon d’aperçu : visible par tous, même sans inscription (utile pour donner envie de suivre le cours)
          </span>
        </label>
      </div>

      <div className="flex gap-1 lg:hidden">
        <button type="button" className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
          Écrire
        </button>
        <button type="button" className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
          Aperçu
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className={cn('space-y-2', tab === 'preview' && 'hidden lg:block')}>
          <label className="text-sm font-medium" htmlFor="lesson-body">Contenu</label>
          <Textarea
            id="lesson-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={18}
            disabled={readOnly}
            className="font-mono min-h-[360px]"
            placeholder="Écrivez votre leçon ici…"
          />
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Aide à la mise en forme</summary>
            <ul className="mt-2 space-y-1">
              <li>{'# Titre, ## Sous-titre, ### Petit titre'}</li>
              <li>{'**gras**, *italique*, `code`'}</li>
              <li>{'[texte du lien](https://exemple.com)'}</li>
              <li>{'- liste à puces, 1. liste numérotée'}</li>
              <li>{'> citation'}</li>
              <li>{'--- ligne de séparation'}</li>
              <li>Les images, tableaux et le HTML ne sont pas pris en charge.</li>
            </ul>
          </details>
        </div>
        <div className={cn('space-y-2', tab === 'write' && 'hidden lg:block')}>
          <p className="text-sm font-medium">Aperçu</p>
          <div className="bg-card border border-border rounded-xl p-5 min-h-[200px]">
            {body.trim() ? (
              <LessonMarkdown source={body} />
            ) : (
              <p className="text-sm text-muted-foreground">Rien à afficher pour l’instant.</p>
            )}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!readOnly && (
        <Button size="lg" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer la leçon'}
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create the builder page**

Create `web/app/teach/[courseId]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { CourseBuilder } from '@/components/courses/CourseBuilder'
import { CourseForm } from '@/components/courses/CourseForm'
import { CourseStatusPanel } from '@/components/courses/CourseStatusPanel'
import { createClient } from '@/lib/supabase-server'
import { getCourseById, getCourseOutline } from '@/lib/courses/queries'
import { publishBlocker } from '@/lib/courses/outline'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ courseId: string }>
}

export default async function BuilderPage({ params }: Props) {
  const { courseId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/teach/${courseId}`)

  const course = await getCourseById(supabase, courseId)
  if (!course || course.owner_id !== user.id) notFound()

  const outline = await getCourseOutline(supabase, course.id)
  const readOnly = course.status === 'suspended'

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10 space-y-8">
      <Link
        href="/teach"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Mes cours
      </Link>

      <h1 className="font-heading text-3xl font-bold">{course.title}</h1>

      <CourseStatusPanel course={course} blocker={publishBlocker(outline)} />

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-bold text-base">Informations</h2>
        <CourseForm mode="edit" course={course} disabled={readOnly} />
      </div>

      <CourseBuilder course={course} outline={outline} readOnly={readOnly} />
    </div>
  )
}
```

- [ ] **Step 5: Create the lesson editor page**

Create `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { LessonEditor } from '@/components/courses/LessonEditor'
import { createClient } from '@/lib/supabase-server'
import { getCourseById, getCourseOutline, getLessonContent } from '@/lib/courses/queries'
import { flattenLessons } from '@/lib/courses/outline'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonEditorPage({ params }: Props) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/teach/${courseId}/lessons/${lessonId}`)

  const course = await getCourseById(supabase, courseId)
  if (!course || course.owner_id !== user.id) notFound()

  const outline = await getCourseOutline(supabase, course.id)
  const lesson = flattenLessons(outline).find(l => l.id === lessonId)
  if (!lesson) notFound()

  const body = (await getLessonContent(supabase, lesson.id)) ?? ''

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-10 py-10">
      <LessonEditor
        courseId={course.id}
        lesson={lesson}
        initialBody={body}
        readOnly={course.status === 'suspended'}
      />
    </div>
  )
}
```

- [ ] **Step 6: Type-check, lint, and verify the whole authoring flow**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/teach components/courses`
Expected: no errors.
Manual check (`npm run dev`, signed in as the Task 8 user):
1. Open the course created in Task 8 at `/teach/<id>`: the status shows "Brouillon", "Publier le cours" is disabled with "Ajoutez au moins une leçon avant de publier."
2. Add a section "Introduction", rename it by editing the field and clicking away, add a second section, move it up/down, delete it.
3. Add a lesson "Bonjour": you land on the editor. Type `# Salut` then a blank line, `**Bonjour** se dit *…*`, a `- liste`. The preview shows an `h2`, bold and a list. Save; "Enregistré ✓" appears.
4. Back on the plan, tick "Aperçu" on the lesson, then "Publier le cours": the status becomes "Publié".
5. Confirm in Studio that `lesson_contents.body_md` holds your text.

- [ ] **Step 7: Commit**

```bash
git add web/components/courses/CourseStatusPanel.tsx web/components/courses/CourseBuilder.tsx web/components/courses/LessonEditor.tsx web/app/teach
git commit -m "feat(courses): course builder and lesson editor" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Public course page (outline, enroll, report)

**Files:**
- Create: `web/components/courses/LessonOutline.tsx`
- Create: `web/components/courses/EnrollButton.tsx`
- Create: `web/components/courses/ReportCourseButton.tsx`
- Create: `web/app/courses/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCourseBySlug`, `getCourseOutline`, `isEnrolled`, `getCompletedLessonIds`, `computeProgress`, `flattenLessons`, `resumeLessonId`, `enroll`, `reportCourse`, `JsonLd`.
- Produces:
  - `LessonOutline({ slug, outline, currentLessonId?, completedIds, hasFullAccess })` — server-compatible, reused by Task 11.
  - `EnrollButton({ courseId, slug, isAuthed, isOwner, enrolled, startHref, percent })`.
  - `ReportCourseButton({ courseId })`.
  - Route `/courses/[slug]`.

- [ ] **Step 1: Create the outline component**

Create `web/components/courses/LessonOutline.tsx`:

```tsx
import Link from 'next/link'
import { CheckCircle2, Circle, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OutlineSection } from '@/lib/courses/types'

interface Props {
  slug: string
  outline: OutlineSection[]
  currentLessonId?: string
  completedIds: string[]
  /** True for enrolled learners and the owner; others may only open preview lessons. */
  hasFullAccess: boolean
}

export function LessonOutline({ slug, outline, currentLessonId, completedIds, hasFullAccess }: Props) {
  const done = new Set(completedIds)

  return (
    <nav aria-label="Plan du cours" className="space-y-5">
      {outline.map(section => (
        <div key={section.id}>
          <h3 className="font-heading font-semibold text-sm mb-2">{section.title}</h3>
          <ul className="space-y-1">
            {section.lessons.map(lesson => {
              const open = hasFullAccess || lesson.is_preview
              const isDone = done.has(lesson.id)
              const Icon = isDone ? CheckCircle2 : open ? Circle : Lock
              const row = (
                <>
                  <Icon className={cn('w-4 h-4 shrink-0', isDone ? 'text-secondary' : 'text-muted-foreground')} />
                  <span className="flex-1">{lesson.title}</span>
                  {lesson.is_preview && !hasFullAccess && <span className="text-xs text-primary">Aperçu</span>}
                </>
              )
              return (
                <li key={lesson.id}>
                  {open ? (
                    <Link
                      href={`/courses/${slug}/learn/${lesson.id}`}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors',
                        lesson.id === currentLessonId && 'bg-muted font-medium',
                      )}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">{row}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Create the enroll button**

Create `web/components/courses/EnrollButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { enroll } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'
import { primaryLinkClass } from './styles'

interface Props {
  courseId: string
  slug: string
  isAuthed: boolean
  isOwner: boolean
  enrolled: boolean
  /** First unfinished lesson (or first lesson); null when the course has no lessons. */
  startHref: string | null
  percent: number
}

export function EnrollButton({ courseId, slug, isAuthed, isOwner, enrolled, startHref, percent }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!startHref) {
    return <p className="text-sm text-muted-foreground">Ce cours n’a pas encore de leçon.</p>
  }
  const target = startHref

  if (enrolled || isOwner) {
    return (
      <Link href={target} className={primaryLinkClass}>
        {enrolled && percent > 0 ? `Continuer (${percent} %)` : 'Commencer le cours'}
      </Link>
    )
  }

  if (!isAuthed) {
    return (
      <Link href={`/auth?next=${encodeURIComponent(`/courses/${slug}`)}`} className={primaryLinkClass}>
        Se connecter pour suivre ce cours
      </Link>
    )
  }

  async function handleEnroll() {
    setLoading(true)
    setError(null)
    const { error: err } = await enroll(supabase, courseId)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    router.push(target)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={handleEnroll} disabled={loading}>
        {loading ? 'Inscription…' : 'S’inscrire gratuitement'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Create the report button**

Create `web/components/courses/ReportCourseButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { reportCourse } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ReportCourseButton({ courseId }: { courseId: string }) {
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setLoading(true)
    setError(null)
    const { error: err } = await reportCourse(supabase, courseId, reason)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setSent(true)
  }

  if (sent) {
    return <p className="text-sm text-muted-foreground">Merci, votre signalement a été transmis à l’équipe.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
        Signaler ce cours
      </button>
    )
  }

  return (
    <div className="space-y-2 max-w-md">
      <Textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Pourquoi signalez-vous ce cours ?"
        rows={3}
        maxLength={1000}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={loading || reason.trim().length < 5}>
          {loading ? 'Envoi…' : 'Envoyer le signalement'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create the course page**

Create `web/app/courses/[slug]/page.tsx`:

```tsx
import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import {
  getCompletedLessonIds,
  getCourseBySlug,
  getCourseOutline,
  isEnrolled,
} from '@/lib/courses/queries'
import { computeProgress, flattenLessons, resumeLessonId } from '@/lib/courses/outline'
import { LEVEL_LABELS, STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import { DIALECTS } from '@/lib/dialect'
import { LessonOutline } from '@/components/courses/LessonOutline'
import { EnrollButton } from '@/components/courses/EnrollButton'
import { ReportCourseButton } from '@/components/courses/ReportCourseButton'
import { secondaryLinkClass } from '@/components/courses/styles'
import { JsonLd } from '@/components/JsonLd'
import { SITE_NAME, SITE_URL } from '@/lib/site'

export const dynamic = 'force-dynamic'

// Shared by generateMetadata and the page so the course is fetched once per request.
const getCourseCached = cache(async (slug: string) => {
  const supabase = await createClient()
  return getCourseBySlug(supabase, slug)
})

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const course = await getCourseCached(slug)
  if (!course) return { title: 'Cours introuvable', robots: { index: false } }

  const description =
    course.summary.trim().slice(0, 160) || `Cours de bhété : ${course.title}, gratuit et créé par la communauté.`
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${slug}` },
    openGraph: { title: course.title, description, type: 'article', url: `/courses/${slug}` },
    robots: { index: course.status === 'published', follow: true },
  }
}

export default async function CoursePage({ params }: Props) {
  const { slug } = await params
  const course = await getCourseCached(slug)
  if (!course) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const outline = await getCourseOutline(supabase, course.id)
  const flat = flattenLessons(outline)
  const isOwner = user?.id === course.owner_id
  const enrolled = user ? await isEnrolled(supabase, user.id, course.id) : false
  const completed = user ? await getCompletedLessonIds(supabase, user.id, flat.map(l => l.id)) : []
  const progress = computeProgress(flat.map(l => l.id), completed)
  const resumeId = resumeLessonId(flat, completed)
  const startHref = resumeId ? `/courses/${course.slug}/learn/${resumeId}` : null

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-8">
      {course.status === 'published' && (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Course',
            name: course.title,
            description: course.summary || course.title,
            url: `${SITE_URL}/courses/${course.slug}`,
            provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
            isAccessibleForFree: course.access === 'free',
          }}
        />
      )}

      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Tous les cours
      </Link>

      {isOwner && (
        <div className="bg-muted rounded-xl p-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[course.status]}`}>
            {STATUS_LABELS[course.status]}
          </span>
          <span className="flex-1 text-muted-foreground">
            {course.status === 'published'
              ? 'Vous êtes l’auteur de ce cours.'
              : 'Ce cours n’est pas visible dans le catalogue.'}
          </span>
          <Link href={`/teach/${course.id}`} className={secondaryLinkClass}>
            <Pencil className="w-4 h-4" />
            Modifier
          </Link>
        </div>
      )}

      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5">{LEVEL_LABELS[course.level]}</span>
          <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5">
            {DIALECTS[course.dialect].name}
          </span>
          <span className="rounded-full bg-secondary/10 text-secondary px-2.5 py-0.5">
            {course.access === 'free' ? 'Gratuit' : 'Payant'}
          </span>
        </div>
        <h1 className="font-heading text-3xl md:text-4xl font-bold">{course.title}</h1>
        {course.summary && <p className="text-lg text-muted-foreground leading-relaxed">{course.summary}</p>}
        <p className="text-sm text-muted-foreground">
          {flat.length} leçon{flat.length > 1 ? 's' : ''}
          {enrolled && flat.length > 0 ? ` · ${progress.completed}/${progress.total} terminée${progress.completed > 1 ? 's' : ''}` : ''}
        </p>
        <EnrollButton
          courseId={course.id}
          slug={course.slug}
          isAuthed={user !== null}
          isOwner={isOwner}
          enrolled={enrolled}
          startHref={startHref}
          percent={progress.percent}
        />
      </header>

      <section className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-heading font-bold text-lg mb-4">Au programme</h2>
        {outline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Le plan de ce cours n’est pas encore publié.</p>
        ) : (
          <LessonOutline
            slug={course.slug}
            outline={outline}
            completedIds={completed}
            hasFullAccess={enrolled || isOwner}
          />
        )}
      </section>

      {user && !isOwner && course.status === 'published' && <ReportCourseButton courseId={course.id} />}
    </div>
  )
}
```

- [ ] **Step 5: Type-check, lint, verify**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/courses components/courses`
Expected: no errors.
Manual check (`npm run dev`):
1. Signed out, open `/courses`: the published course from Task 9 appears; open it: the header, "Au programme" with the lesson marked "Aperçu", and "Se connecter pour suivre ce cours". View source shows `application/ld+json` with `"@type":"Course"`.
2. Create a second confirmed user in Studio (`learner@test.local`) and sign in as them: "S’inscrire gratuitement" enrolls and redirects to the lesson URL (a 404 until Task 11 — expected); reloading the course page now shows "Commencer le cours" and no lock icons.
3. As that learner, click "Signaler ce cours", type a reason, submit: "Merci, votre signalement…". Confirm a row in `course_reports`.
4. As the owner, the course page shows the "Vous êtes l’auteur" banner with "Modifier".

- [ ] **Step 6: Commit**

```bash
git add web/components/courses/LessonOutline.tsx web/components/courses/EnrollButton.tsx web/components/courses/ReportCourseButton.tsx web/app/courses/[slug]/page.tsx
git commit -m "feat(courses): course page with enrollment and reporting" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: Lesson player

**Files:**
- Create: `web/components/courses/CompleteButton.tsx`
- Create: `web/app/courses/[slug]/learn/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `LessonOutline`, `LessonMarkdown`, `getLessonContent`, `nextLessonId`, `setLessonCompleted`.
- Produces: `CompleteButton({ lessonId, completed })`; route `/courses/[slug]/learn/[lessonId]`.

- [ ] **Step 1: Create the completion button**

Create `web/components/courses/CompleteButton.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { setLessonCompleted } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'

export function CompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setLoading(true)
    setError(null)
    const { error: err } = await setLessonCompleted(supabase, lessonId, !completed)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <Button size="lg" variant={completed ? 'outline' : 'default'} onClick={toggle} disabled={loading}>
        {loading ? 'Enregistrement…' : completed ? 'Terminée ✓ (annuler)' : 'Marquer comme terminée'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create the lesson page**

Create `web/app/courses/[slug]/learn/[lessonId]/page.tsx`:

```tsx
import { cache } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import {
  getCompletedLessonIds,
  getCourseBySlug,
  getCourseOutline,
  getLessonContent,
  isEnrolled,
} from '@/lib/courses/queries'
import { flattenLessons, nextLessonId } from '@/lib/courses/outline'
import { LessonMarkdown } from '@/components/LessonMarkdown'
import { LessonOutline } from '@/components/courses/LessonOutline'
import { CompleteButton } from '@/components/courses/CompleteButton'
import { primaryLinkClass, secondaryLinkClass } from '@/components/courses/styles'

export const dynamic = 'force-dynamic'

const getLessonData = cache(async (slug: string, lessonId: string) => {
  const supabase = await createClient()
  const course = await getCourseBySlug(supabase, slug)
  if (!course) return null
  const outline = await getCourseOutline(supabase, course.id)
  const flat = flattenLessons(outline)
  const lesson = flat.find(l => l.id === lessonId)
  if (!lesson) return null
  return { course, outline, flat, lesson }
})

interface Props {
  params: Promise<{ slug: string; lessonId: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, lessonId } = await params
  const data = await getLessonData(slug, lessonId)
  if (!data) return { title: 'Leçon introuvable', robots: { index: false } }
  // Only preview lessons of published courses are public and indexable.
  const indexable = data.course.status === 'published' && data.lesson.is_preview
  return {
    title: `${data.lesson.title} — ${data.course.title}`,
    alternates: { canonical: `/courses/${slug}/learn/${lessonId}` },
    robots: { index: indexable, follow: true },
  }
}

export default async function LessonPage({ params }: Props) {
  const { slug, lessonId } = await params
  const data = await getLessonData(slug, lessonId)
  if (!data) notFound()
  const { course, outline, flat, lesson } = data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // RLS withholds the body from anyone without access; send them to sign in or to the course page.
  const body = await getLessonContent(supabase, lesson.id)
  if (body === null) {
    redirect(user ? `/courses/${slug}` : `/auth?next=${encodeURIComponent(`/courses/${slug}/learn/${lessonId}`)}`)
  }

  const isOwner = user?.id === course.owner_id
  const enrolled = user ? await isEnrolled(supabase, user.id, course.id) : false
  const hasFullAccess = enrolled || isOwner
  const completed = user ? await getCompletedLessonIds(supabase, user.id, flat.map(l => l.id)) : []

  const next = flat.find(l => l.id === nextLessonId(flat, lesson.id))
  const nextHref = next && (hasFullAccess || next.is_preview) ? `/courses/${slug}/learn/${next.id}` : null

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-10 py-8 grid lg:grid-cols-[280px_1fr] gap-8">
      <aside className="order-2 lg:order-1 space-y-4">
        <Link
          href={`/courses/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {course.title}
        </Link>
        <LessonOutline
          slug={slug}
          outline={outline}
          currentLessonId={lesson.id}
          completedIds={completed}
          hasFullAccess={hasFullAccess}
        />
      </aside>

      <article className="order-1 lg:order-2 space-y-8 min-w-0">
        <h1 className="font-heading text-3xl font-bold">{lesson.title}</h1>

        {lesson.kind === 'text' ? (
          <LessonMarkdown source={body} />
        ) : (
          <p className="text-muted-foreground">Ce type de leçon sera bientôt disponible.</p>
        )}

        <div className="border-t border-border pt-6 flex flex-wrap items-start gap-4">
          {user ? (
            <CompleteButton lessonId={lesson.id} completed={completed.includes(lesson.id)} />
          ) : (
            <Link
              href={`/auth?next=${encodeURIComponent(`/courses/${slug}/learn/${lessonId}`)}`}
              className={secondaryLinkClass}
            >
              Connectez-vous pour suivre votre progression
            </Link>
          )}
          {nextHref && (
            <Link href={nextHref} className={primaryLinkClass}>
              Leçon suivante
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </article>
    </div>
  )
}
```

- [ ] **Step 3: Type-check, lint, verify**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/courses components/courses`
Expected: no errors.
Manual check (`npm run dev`), using the course from Task 9 with two lessons (mark the first "Aperçu", leave the second locked; add the second lesson in the builder if needed):
1. Signed out, open the preview lesson URL: the Markdown renders; "Connectez-vous pour suivre votre progression" shows; the locked lesson appears with a lock in the outline and its URL redirects to `/auth?next=…`.
2. Signed in as the learner from Task 10 (enrolled): open lesson 1, click "Marquer comme terminée": the button changes to "Terminée ✓ (annuler)" and the outline shows a green check; "Leçon suivante" opens lesson 2.
3. Signed in as a third user who is not enrolled: the locked lesson URL redirects to the course page.
4. Put `<script>alert(1)</script>` and `[x](javascript:alert(1))` in a lesson body and save: the lesson shows the text literally, and no alert fires.

- [ ] **Step 4: Commit**

```bash
git add web/components/courses/CompleteButton.tsx web/app/courses/[slug]/learn
git commit -m "feat(courses): lesson player with progress tracking" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Admin moderation

**Files:**
- Create: `web/components/courses/ModerationActions.tsx`
- Create: `web/app/admin/reports/page.tsx`

**Interfaces:**
- Consumes: `getOpenReports`, `getSuspendedCourses`, `isAdmin`, `resolveReport`, `suspendCourse`, `restoreCourse`.
- Produces: `ReportActions({ reportId, courseId, canSuspend })`, `RestoreButton({ courseId })`; route `/admin/reports`.

- [ ] **Step 1: Create the moderation actions**

Create `web/components/courses/ModerationActions.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { resolveReport, restoreCourse, suspendCourse } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'

type Outcome = { error: string | null }

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<Outcome>) {
    setBusy(true)
    setError(null)
    const { error: err } = await action()
    setBusy(false)
    if (err) {
      setError(err)
      return
    }
    router.refresh()
  }
  return { busy, error, run }
}

export function ReportActions({
  reportId,
  courseId,
  canSuspend,
}: {
  reportId: string
  courseId: string
  canSuspend: boolean
}) {
  const [supabase] = useState(() => createClient())
  const { busy, error, run } = useAction()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canSuspend && (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Suspendre ce cours ? Il disparaîtra du catalogue et de l’accès des apprenants.')) {
                run(() => suspendCourse(supabase, courseId))
              }
            }}
          >
            Suspendre le cours
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => resolveReport(supabase, reportId))}>
          Ignorer le signalement
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function RestoreButton({ courseId }: { courseId: string }) {
  const [supabase] = useState(() => createClient())
  const { busy, error, run } = useAction()

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => restoreCourse(supabase, courseId))}>
        Rétablir en brouillon
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Create the moderation page**

Create `web/app/admin/reports/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { ReportActions, RestoreButton } from '@/components/courses/ModerationActions'
import { createClient } from '@/lib/supabase-server'
import { getOpenReports, getSuspendedCourses, isAdmin } from '@/lib/courses/queries'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'

export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth?next=/admin/reports')
  if (!(await isAdmin(supabase))) notFound()

  const [reports, suspended] = await Promise.all([getOpenReports(supabase), getSuspendedCourses(supabase)])

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-10 py-10 space-y-10">
      <PageHeader badge="Administration" title="Modération des cours" subtitle="Signalements ouverts et cours suspendus." />

      <section className="space-y-3">
        <h2 className="font-heading font-bold text-lg">Signalements ouverts ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun signalement en attente.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map(report => (
              <li key={report.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {report.course ? (
                    <Link href={`/courses/${report.course.slug}`} className="font-heading font-semibold hover:text-primary">
                      {report.course.title}
                    </Link>
                  ) : (
                    <span className="font-heading font-semibold">Cours supprimé</span>
                  )}
                  {report.course && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[report.course.status]}`}>
                      {STATUS_LABELS[report.course.status]}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{report.reason}</p>
                <ReportActions
                  reportId={report.id}
                  courseId={report.course?.id ?? ''}
                  canSuspend={report.course !== null && report.course.status !== 'suspended'}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading font-bold text-lg">Cours suspendus ({suspended.length})</h2>
        {suspended.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun cours suspendu.</p>
        ) : (
          <ul className="space-y-3">
            {suspended.map(course => (
              <li
                key={course.id}
                className="bg-card border border-border rounded-xl p-5 flex flex-wrap items-center justify-between gap-3"
              >
                <Link href={`/courses/${course.slug}`} className="font-heading font-semibold hover:text-primary">
                  {course.title}
                </Link>
                <RestoreButton courseId={course.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Make one user an admin on the local database**

Run from the repo root (replace the email with a confirmed local user you created in Studio):

```bash
docker exec "$(docker ps --format '{{.Names}}' | grep -m1 "^supabase_db_$(cat supabase/.temp/project-ref 2>/dev/null || echo traduction_b_t_)$")" psql -U postgres -c "insert into user_roles (user_id, role) select id, 'admin' from auth.users where email = 'teacher@test.local' on conflict do nothing;"
```

Expected: `INSERT 0 1`. (The container is named `supabase_db_` plus the linked project ref from `supabase/.temp/project-ref`, or the `project_id` from `supabase/config.toml` when the project is not linked; `docker ps` lists it. If Docker port-range errors make `supabase start` fail, see the port overrides in the Task 1 report.)

- [ ] **Step 4: Type-check, lint, verify**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/admin components/courses`
Expected: no errors.
Manual check (`npm run dev`):
1. As a non-admin user, `/admin/reports` returns a 404 page. Signed out, it redirects to `/auth`.
2. As the admin (`teacher@test.local`), `/teach` shows a "Modération" button; `/admin/reports` lists the report filed in Task 10.
3. Click "Suspendre le cours" and confirm: the report disappears and the course appears under "Cours suspendus". As the owner, `/teach/<id>` shows "Suspendu" and read-only controls; the course no longer appears in `/courses`; an enrolled learner opening a locked lesson is redirected to the course page.
4. Click "Rétablir en brouillon": the course becomes an editable draft again.

- [ ] **Step 5: Commit**

```bash
git add web/components/courses/ModerationActions.tsx web/app/admin/reports/page.tsx
git commit -m "feat(courses): admin moderation queue" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Profile sections and retiring the old "course" resource type

**Files:**
- Create: `web/components/courses/ProfileCourses.tsx`
- Modify: `web/app/profile/layout.tsx`
- Modify: `web/app/resources/page.tsx`
- Modify: `web/components/ResourceSubmitForm.tsx`

**Interfaces:**
- Consumes: `getMyCourses`, `getMyEnrollments`, `STATUS_LABELS`, `STATUS_STYLES`.
- Produces: `ProfileCourses()` — async server component rendering "Mes formations" and "Mes cours".

- [ ] **Step 1: Create the profile sections**

Create `web/components/courses/ProfileCourses.tsx`:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getMyCourses, getMyEnrollments } from '@/lib/courses/queries'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/courses/labels'
import { primaryLinkClass } from './styles'

export async function ProfileCourses() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [mine, learning] = await Promise.all([
    getMyCourses(supabase, user.id),
    getMyEnrollments(supabase, user.id),
  ])

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-10 pb-10 space-y-8">
      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-heading font-bold text-base">Mes formations</h2>
        {learning.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Vous n’êtes inscrit à aucun cours.{' '}
            <Link href="/courses" className="text-primary underline underline-offset-2">
              Parcourir les cours
            </Link>
          </p>
        ) : (
          <ul className="space-y-3">
            {learning.map(({ course, progress }) => (
              <li key={course.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/courses/${course.slug}`} className="text-sm font-medium hover:text-primary truncate">
                    {course.title}
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {progress.completed}/{progress.total}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading font-bold text-base">Mes cours</h2>
          <Link href="/teach" className={primaryLinkClass}>
            Espace enseignant
          </Link>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">Vous n’avez pas encore créé de cours.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map(course => (
              <li key={course.id} className="flex items-center justify-between gap-3">
                <Link href={`/teach/${course.id}`} className="text-sm font-medium hover:text-primary truncate">
                  {course.title}
                </Link>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${STATUS_STYLES[course.status]}`}>
                  {STATUS_LABELS[course.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Render it from the profile layout**

Replace the contents of `web/app/profile/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
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
    </>
  )
}
```

- [ ] **Step 3: Retire the `course` resource type**

In `web/app/resources/page.tsx`:

Replace the import line:

```tsx
import { Music, BookOpen, Feather, Quote, Mic, HelpCircle, Layers, PlusCircle, PlayCircle, Video, GraduationCap } from 'lucide-react'
```

with:

```tsx
import { Music, BookOpen, Feather, Quote, Mic, HelpCircle, Layers, PlusCircle, PlayCircle, Video } from 'lucide-react'
```

Add after the `import Link from 'next/link'` line:

```tsx
import { redirect } from 'next/navigation'
```

Delete this line from the `TYPES` array:

```tsx
  { value: 'course',  label: 'Cours',      icon: GraduationCap },
```

Delete this line from `TYPE_COLORS`:

```tsx
  course:  'bg-teal-100 text-teal-700',
```

Replace:

```tsx
  const { type } = await searchParams
```

with:

```tsx
  const { type } = await searchParams
  // Courses now live in their own section.
  if (type === 'course') redirect('/courses')
```

In `web/components/ResourceSubmitForm.tsx`, delete this line from the `TYPES` array:

```tsx
  { value: 'course',  label: 'Cours' },
```

Leave the `ContentType` union in `web/lib/types.ts` unchanged (existing rows, if any, keep rendering).

- [ ] **Step 4: Type-check, lint, verify**

Run from `web/`: `npx tsc --noEmit` then `npx eslint app/profile app/resources components/ResourceSubmitForm.tsx components/courses`
Expected: no errors (in particular no unused `GraduationCap` import).
Manual check (`npm run dev`):
1. `/profile` (signed in as the learner) still shows the profile form, followed by "Mes formations" with the enrolled course and a progress bar, and "Mes cours".
2. `/resources?type=course` redirects to `/courses`; the resources filter pills no longer include "Cours"; `/resources/new` no longer offers "Cours".

- [ ] **Step 5: Commit**

```bash
git add web/components/courses/ProfileCourses.tsx web/app/profile/layout.tsx web/app/resources/page.tsx web/components/ResourceSubmitForm.tsx
git commit -m "feat(courses): profile course sections; redirect old course resource type" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Final verification and rollout notes

**Files:** none created (verification only). Do not modify the production database without the user's go-ahead.

- [ ] **Step 1: Run every automated check**

Run from `web/`:

```bash
npm test
npm run test:rls
npx tsc --noEmit
npm run lint
npm run build
```

Expected: unit tests PASS; every RLS test file PASSES; no type errors; lint clean for the files this plan added (pre-existing lint findings in untouched files are not this plan's concern; report them but do not fix them); `next build` succeeds and lists `/courses`, `/courses/[slug]`, `/courses/[slug]/learn/[lessonId]`, `/teach`, `/teach/new`, `/teach/[courseId]`, `/teach/[courseId]/lessons/[lessonId]`, `/admin/reports` among the routes.

- [ ] **Step 2: Confirm the Safari constraint held**

Run from the repo root: `git diff master --stat -- web/package.json web/package-lock.json`
Expected: `web/package.json` shows only the added `test:rls` script line, and `package-lock.json` is unchanged (no new dependencies).
Run: `grep -rnE "bg-[a-z-]+/[0-9]+|border-[a-z-]+/[0-9]+|text-[a-z-]+/[0-9]+" web/components/courses web/components/LessonMarkdown.tsx web/app/courses web/app/teach web/app/admin`
Expected: every opacity utility that appears (for example `bg-primary/10`, `bg-secondary/10`, `bg-destructive/10`, `bg-primary/90`) is also listed in the `@supports not (color: color-mix(...))` block at the end of `web/app/globals.css`. If one is missing, replace it with a listed utility or add its `rgba` fallback to that block.

- [ ] **Step 3: Check the live `community_texts` data (ask the user)**

The migrations reviewed allow only `song | story | poem | proverb | speech | riddle | other` in the `community_texts` type CHECK. Ask the user to run in the Supabase SQL editor (production):

```sql
select type, count(*) from community_texts group by type order by 2 desc;
```

Report the result. If `course` or `video` rows exist, tell the user: they still render under "Tous" with a raw type label, and can be migrated or deleted at their discretion. If not, the retired `course` type had no data to migrate.

- [ ] **Step 4: Stop the local stack**

Run from the repo root: `supabase stop`
Expected: containers stopped. (`web/.env.development.local` stays on disk, gitignored; delete it if the local stack is no longer used.)

- [ ] **Step 5: Hand back to the user, do not deploy**

Report that phase 1 is implemented and verified locally, and list the two production steps that need the user's explicit go-ahead (they change a shared database):

1. Apply the three migrations (`20260925000000_fix_handle_new_user_search_path.sql`, `20260925000001_courses_core.sql`, `20260925000002_progress_reports.sql`) to the production Supabase project. Note the first one replaces the existing `handle_new_user()` signup trigger function (same behavior, pinned `search_path`), so it touches production signup; tell the user before they apply it (for example `supabase link` then `supabase db push`, or the Supabase MCP `apply_migration`).
2. Make the first admin, in the production SQL editor:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'curtiscapre@gmail.com'
on conflict do nothing;
```

Then deploy the web app. Until the migrations are applied, `/courses` shows its empty state (queries return no rows) and the sitemap falls back to static entries.
