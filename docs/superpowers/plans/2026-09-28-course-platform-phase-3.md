# Phase 3: Video Lessons & Mux Direct Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 3 of the Course Platform: Video lessons backed by Mux Direct Upload, server-side signed HLS playback tokens, Mux webhook lifecycle processing, teacher video quotas, custom zero-dependency HLS video player, and local-first DB/RLS verification.

**Architecture:**
- **Upload Flow:** Teacher initiates upload → Server checks teacher video quota (`video_quotas` table) and creates a Mux Direct Upload URL → Browser PUTs video file directly to Mux (large files bypass Next.js server).
- **Processing Lifecycle:** Mux sends webhooks (`video.upload.asset_created`, `video.asset.ready`, `video.asset.errored`) to `/api/mux/webhook` → Server verifies Mux HMAC-SHA256 signature and updates `media_assets` table (`uploading` → `processing` → `ready`).
- **Playback Security:** Signed Mux HLS playback. Server verifies learner enrollment or preview access (`can_access_lesson(lessonId)`), then mints a short-lived (1 hour) RS256 JWT playback token. Video streams natively via HLS (`https://stream.mux.com/{playbackId}.m3u8?token={token}`).
- **Zero New Dependencies:** Mux API calls, Webhook HMAC signature verification, and JWT RS256 signing use Web Crypto / Node.js native `crypto`. HLS video playback uses HTML5 `<video>` with native Safari HLS support and graceful fallback.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase SSR & RLS (Postgres 17), Mux Direct Upload & Webhook API, Vitest 4, Tailwind CSS 4.

**Spec:** [`docs/superpowers/specs/2026-09-25-course-platform-design.md`](file:///c:/Users/DELL%20LATITUDE%207480/traduction%20bété/docs/superpowers/specs/2026-09-25-course-platform-design.md) (Phase 3: Video).

---

## Global Constraints

- **Zero Accidental Deletion Policy**: NEVER delete existing feature code, routes, or database columns.
- **Local-First Testing Protocol**:
  1. Write migration in `supabase/migrations/20260928000001_courses_phase3_video.sql`.
  2. Run `npx supabase migration up` on local Docker stack (`127.0.0.1:54322`).
  3. Execute `npm run test:rls` to verify RLS policies against local test actors.
  4. Only after local tests pass 100%, apply to remote Supabase via `supabase-mcp-server:apply_migration`.
- **Typographic Curly Apostrophes**: All French user-facing copy MUST use strict typographic apostrophes (`’`, `U+2019`).
- **Browser Floor**: iOS Safari >= 15.4 (`safari >= 15.4`), native HLS playback via standard HTML5 `<video>`.
- **Git Hygiene**: Atomic commits per task with explicit file paths and `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer.

---

## File Structure & Responsibilities Table

| File Path | Single Responsibility |
|---|---|
| `supabase/migrations/20260928000001_courses_phase3_video.sql` | Phase 3 DB migration: `video_quotas`, `media_assets`, `get_user_video_quota()`, and RLS policies |
| `web/__tests__/rls/phase3-video-assets.test.ts` | RLS integration test suite for video assets and quotas |
| `web/lib/courses/video.ts` | Pure video domain types, quota validators, Mux HMAC signature verifier, and JWT token signer |
| `web/__tests__/course-video.test.ts` | Unit tests for video domain logic and signature verification |
| `web/lib/courses/queries.ts` | Server-side queries for `media_assets`, video quotas, and signed Mux playback tokens |
| `web/lib/courses/mutations.ts` | Mutations for creating Mux direct uploads and deleting media assets |
| `web/app/api/mux/webhook/route.ts` | Idempotent Mux webhook endpoint with HMAC-SHA256 signature verification |
| `web/components/courses/VideoPlayer.tsx` | Custom zero-dependency HLS video player component with play/pause, scrub bar, speed switcher, and fullscreen |
| `web/components/courses/VideoUploader.tsx` | Teacher video upload widget with quota meter, upload progress, and processing status indicator |
| `web/components/courses/LessonEditor.tsx` | Updated lesson editor adding video kind support and video uploader tab |
| `web/app/courses/[slug]/learn/[lessonId]/page.tsx` | Updated learner player page rendering signed HLS video player |
| `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx` | Updated teacher page pre-fetching video asset state and signed tokens |

---

### Task 1: Database Migration for Video Media Assets & Quotas

**Files:**
- Create: `supabase/migrations/20260928000001_courses_phase3_video.sql`

**Interfaces:**
- Consumes: `courses`, `lessons`, `is_admin()`, `can_access_lesson()`.
- Produces: `video_quotas`, `media_assets`, `get_user_video_quota(uuid)`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260928000001_courses_phase3_video.sql`:

```sql
-- Course Platform, Phase 3: Video lessons & Mux Direct Upload integration.
-- Design: docs/superpowers/specs/2026-09-25-course-platform-design.md

-- ── 1. Video Quotas Table ───────────────────────────────────────────────────
-- Tracks per-teacher video quota (default 30 stored minutes, editable by admins).
create table if not exists video_quotas (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  max_minutes int not null default 30 check (max_minutes >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table video_quotas enable row level security;

-- Course owners can read their own quota; admins can read and manage all quotas.
create policy video_quotas_select_own_or_admin on video_quotas
  for select to authenticated
  using (user_id = (select auth.uid()) or (select is_admin()));

create policy video_quotas_admin_write on video_quotas
  for all to authenticated
  using ((select is_admin()))
  with check ((select is_admin()));

-- ── 2. Media Assets Table ───────────────────────────────────────────────────
create table if not exists media_assets (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  lesson_id        uuid not null references lessons(id) on delete cascade,
  mux_upload_id    text unique not null check (char_length(mux_upload_id) <= 255),
  mux_asset_id     text check (mux_asset_id is null or char_length(mux_asset_id) <= 255),
  mux_playback_id  text check (mux_playback_id is null or char_length(mux_playback_id) <= 255),
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  status           text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'errored')),
  error_message    text check (error_message is null or char_length(error_message) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists media_assets_lesson_idx on media_assets (lesson_id);
create index if not exists media_assets_owner_idx on media_assets (owner_id);

alter table media_assets enable row level security;

-- Readable by anyone with access to the lesson (enrolled learner, preview, owner, or admin)
create policy media_assets_select on media_assets
  for select using (can_access_lesson(lesson_id));

-- Writable only by the course owner (or admin)
create policy media_assets_write_owner on media_assets
  for all to authenticated
  using (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = media_assets.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  )
  with check (
    exists (
      select 1 from lessons l
      join courses c on c.id = l.course_id
      where l.id = media_assets.lesson_id
        and (c.owner_id = (select auth.uid()) or (select is_admin()))
    )
  );

-- ── 3. Helper Function: Get User Video Quota Usage ──────────────────────────
create or replace function get_user_video_quota(p_user_id uuid)
returns table (
  max_minutes int,
  used_seconds bigint,
  used_minutes numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max int;
  v_used bigint;
begin
  select coalesce(q.max_minutes, 30) into v_max
  from (select p_user_id) u
  left join video_quotas q on q.user_id = p_user_id;

  select coalesce(sum(ma.duration_seconds), 0) into v_used
  from media_assets ma
  where ma.owner_id = p_user_id
    and ma.status <> 'errored';

  return query
  select
    v_max as max_minutes,
    v_used as used_seconds,
    round((v_used::numeric / 60.0), 1) as used_minutes;
end;
$$;

revoke all on function get_user_video_quota(uuid) from public;
grant execute on function get_user_video_quota(uuid) to authenticated;
```

- [ ] **Step 2: Apply migration to local Supabase Docker stack**

Run from repo root:
```bash
npx supabase migration up
```
Expected: `Applying migration 20260928000001_courses_phase3_video.sql...` with exit code 0.

- [ ] **Step 3: Commit migration**

```bash
git add supabase/migrations/20260928000001_courses_phase3_video.sql
git commit -m "feat(db): phase 3 media assets and video quotas schema with RLS" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: RLS Test Suite for Video Media Assets & Quotas

**Files:**
- Create: `web/__tests__/rls/phase3-video-assets.test.ts`

**Interfaces:**
- Consumes: `admin`, `createUser`, `makeAdmin`, `seedCourse`, `must`, `TestUser`, `Seed`.
- Tests: Owner asset creation, learner video access, non-enrolled user access block, and admin quota management.

- [ ] **Step 1: Write the RLS test file**

Create `web/__tests__/rls/phase3-video-assets.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, makeAdmin, seedCourse, must, type Seed, type TestUser } from './helpers'

describe('phase 3 video assets & quotas RLS', () => {
  let teacher: TestUser
  let learner: TestUser
  let outsider: TestUser
  let boss: TestUser
  let seed: Seed
  let videoLessonId: string
  let mediaAssetId: string

  beforeAll(async () => {
    ;[teacher, learner, outsider, boss] = await Promise.all([
      createUser('p3-teacher'),
      createUser('p3-learner'),
      createUser('p3-outsider'),
      createUser('p3-boss'),
    ])
    await makeAdmin(boss.id)
    seed = await seedCourse(teacher.id)

    // Enroll learner
    await learner.client.from('enrollments').insert({ user_id: learner.id, course_id: seed.course.id })

    // Create a video lesson
    const lesson = must(
      await admin.from('lessons').insert({
        section_id: seed.section.id,
        course_id: seed.course.id,
        title: 'Introduction en Vidéo',
        position: 3,
        kind: 'video',
        is_preview: false,
      }).select('id').single(),
      'create video lesson',
    )
    videoLessonId = lesson.id

    // Insert a media asset as teacher
    const asset = must(
      await teacher.client.from('media_assets').insert({
        owner_id: teacher.id,
        lesson_id: videoLessonId,
        mux_upload_id: 'upload_test_123',
        mux_asset_id: 'asset_test_123',
        mux_playback_id: 'playback_test_123',
        duration_seconds: 120,
        status: 'ready',
      }).select('id').single(),
      'create media asset',
    )
    mediaAssetId = asset.id
  })

  describe('media_assets visibility', () => {
    it('allows an enrolled learner to read ready video media assets', async () => {
      const { data, error } = await learner.client
        .from('media_assets')
        .select('mux_playback_id, duration_seconds, status')
        .eq('id', mediaAssetId)

      expect(error).toBeNull()
      expect(data).toHaveLength(1)
      expect(data?.[0].mux_playback_id).toBe('playback_test_123')
    })

    it('denies locked video media assets to non-enrolled users', async () => {
      const { data } = await outsider.client
        .from('media_assets')
        .select('id')
        .eq('id', mediaAssetId)

      expect(data).toEqual([])
    })

    it('allows course owner to update media asset status', async () => {
      const res = await teacher.client
        .from('media_assets')
        .update({ duration_seconds: 180 })
        .eq('id', mediaAssetId)

      expect(res.error).toBeNull()
    })
  })

  describe('video_quotas & RPC get_user_video_quota()', () => {
    it('returns default 30 minutes quota and tracks used seconds for teacher', async () => {
      const { data, error } = await teacher.client.rpc('get_user_video_quota', { p_user_id: teacher.id })
      expect(error).toBeNull()
      expect(data?.[0].max_minutes).toBe(30)
      expect(data?.[0].used_seconds).toBe(180)
    })

    it('allows admin to increase a teacher video quota', async () => {
      const res = await boss.client
        .from('video_quotas')
        .upsert({ user_id: teacher.id, max_minutes: 120 })

      expect(res.error).toBeNull()

      const { data } = await teacher.client.rpc('get_user_video_quota', { p_user_id: teacher.id })
      expect(data?.[0].max_minutes).toBe(120)
    })
  })
})
```

- [ ] **Step 2: Run local RLS tests**

Run from `web/`:
```bash
npm run test:rls -- phase3-video-assets
```
Expected: PASS with 0 failures.

- [ ] **Step 3: Commit RLS tests**

```bash
git add web/__tests__/rls/phase3-video-assets.test.ts
git commit -m "test(rls): phase 3 video assets and quota security tests" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Pure Video Domain Library & Mux Signing Utilities

**Files:**
- Create: `web/lib/courses/video.ts`
- Create: `web/__tests__/course-video.test.ts`

**Interfaces:**
- Produces: 
  - `MediaAsset`, `VideoQuota`, `MuxUploadResponse`.
  - `hasAvailableVideoQuota(usedSeconds, maxMinutes, requestedSeconds?)`.
  - `verifyMuxWebhookSignature(rawBody, signatureHeader, secret)`.
  - `generateMuxPlaybackToken(playbackId, signingKeyId, privateKeyPem, expiresInSeconds?)`.

- [ ] **Step 1: Write failing unit tests**

Create `web/__tests__/course-video.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  hasAvailableVideoQuota,
  verifyMuxWebhookSignature,
  formatVideoDuration,
} from '../lib/courses/video'

describe('video quota check', () => {
  it('allows upload when within max minutes limit', () => {
    // 10 minutes used out of 30 max
    expect(hasAvailableVideoQuota(600, 30)).toBe(true)
  })

  it('blocks upload when quota is exceeded', () => {
    // 30 minutes used out of 30 max
    expect(hasAvailableVideoQuota(1800, 30)).toBe(false)
    expect(hasAvailableVideoQuota(1801, 30)).toBe(false)
  })
})

describe('formatVideoDuration', () => {
  it('formats video duration into hh:mm:ss or mm:ss', () => {
    expect(formatVideoDuration(45)).toBe('0:45')
    expect(formatVideoDuration(125)).toBe('2:05')
    expect(formatVideoDuration(3665)).toBe('1:01:05')
  })
})

describe('verifyMuxWebhookSignature', () => {
  it('verifies valid HMAC-SHA256 signature header', async () => {
    const rawBody = '{"type":"video.asset.ready"}'
    const secret = 'super_secret_webhook_key'
    const timestamp = Math.floor(Date.now() / 1000)

    // Compute expected signature
    const crypto = await import('node:crypto')
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')

    const header = `t=${timestamp},v1=${signature}`

    const isValid = await verifyMuxWebhookSignature(rawBody, header, secret)
    expect(isValid).toBe(true)
  })

  it('rejects invalid signature header', async () => {
    const rawBody = '{"type":"video.asset.ready"}'
    const secret = 'super_secret_webhook_key'
    const header = 't=12345,v1=invalid_hash'

    const isValid = await verifyMuxWebhookSignature(rawBody, header, secret)
    expect(isValid).toBe(false)
  })
})
```

- [ ] **Step 2: Run vitest to verify fail**

Run from `web/`:
```bash
npx vitest run course-video
```
Expected: FAIL (cannot resolve `../lib/courses/video`).

- [ ] **Step 3: Implement `web/lib/courses/video.ts`**

Create `web/lib/courses/video.ts`:

```ts
import crypto from 'node:crypto'

export interface MediaAsset {
  id: string
  owner_id: string
  lesson_id: string
  mux_upload_id: string
  mux_asset_id: string | null
  mux_playback_id: string | null
  duration_seconds: number
  status: 'uploading' | 'processing' | 'ready' | 'errored'
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface VideoQuota {
  max_minutes: number
  used_seconds: number
  used_minutes: number
}

export interface MuxUploadResponse {
  id: string
  url: string
  status: string
}

export function hasAvailableVideoQuota(usedSeconds: number, maxMinutes: number, requestedSeconds = 0): boolean {
  const totalSeconds = usedSeconds + requestedSeconds
  const maxSeconds = maxMinutes * 60
  return totalSeconds < maxSeconds
}

export function formatVideoDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Verifies Mux webhook signature header: t=<timestamp>,v1=<signature> */
export async function verifyMuxWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false

  const parts = signatureHeader.split(',')
  const timestampPart = parts.find(p => p.startsWith('t='))
  const signaturePart = parts.find(p => p.startsWith('v1='))

  if (!timestampPart || !signaturePart) return false

  const timestamp = timestampPart.slice(2)
  const expectedSignature = signaturePart.slice(3)

  const payload = `${timestamp}.${rawBody}`
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(expectedSignature))
}

/** Generates an RS256 JWT playback token for Mux signed playback. */
export function generateMuxPlaybackToken(
  playbackId: string,
  signingKeyId: string,
  privateKeyPemBase64: string,
  expiresInSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + expiresInSeconds

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: signingKeyId,
  }

  const payload = {
    sub: playbackId,
    aud: 'v',
    exp,
  }

  const base64UrlEncode = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

  const encodedHeader = base64UrlEncode(header)
  const encodedPayload = base64UrlEncode(payload)
  const tokenInput = `${encodedHeader}.${encodedPayload}`

  // Decode base64 PEM private key if needed
  let pem = privateKeyPemBase64
  if (!pem.includes('-----BEGIN')) {
    pem = Buffer.from(privateKeyPemBase64, 'base64').toString('utf8')
  }

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(tokenInput)
  const signature = signer.sign(pem, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${tokenInput}.${signature}`
}
```

- [ ] **Step 4: Run unit tests**

Run from `web/`:
```bash
npx vitest run course-video
```
Expected: PASS with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add web/lib/courses/video.ts web/__tests__/course-video.test.ts
git commit -m "feat(courses): pure video domain logic and Mux signature verification" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Server Queries & Client Mutations for Video

**Files:**
- Modify: `web/lib/courses/queries.ts`
- Modify: `web/lib/courses/mutations.ts`

**Interfaces:**
- Produces: 
  - `queries.ts`: `getMediaAssetForLesson`, `getVideoQuota`, `getSignedMuxPlaybackToken`.
  - `mutations.ts`: `createVideoUploadUrl`, `deleteMediaAsset`.

- [ ] **Step 1: Add queries in `web/lib/courses/queries.ts`**

Append to `web/lib/courses/queries.ts`:

```ts
import type { MediaAsset, VideoQuota } from './video'
import { generateMuxPlaybackToken } from './video'

/** Fetches ready or processing media asset for a lesson. */
export async function getMediaAssetForLesson(client: SupabaseClient, lessonId: string): Promise<MediaAsset | null> {
  const { data } = await client
    .from('media_assets')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (data ?? null) as MediaAsset | null
}

/** Fetches video quota and used minutes for a teacher. */
export async function getVideoQuota(client: SupabaseClient, userId: string): Promise<VideoQuota> {
  const { data } = await client.rpc('get_user_video_quota', { p_user_id: userId })
  if (data && data.length > 0) {
    return data[0] as VideoQuota
  }
  return { max_minutes: 30, used_seconds: 0, used_minutes: 0 }
}

/** Generates a short-lived (1 hour) signed Mux playback URL token for an asset. */
export async function getSignedMuxPlaybackToken(playbackId: string | null): Promise<string | null> {
  if (!playbackId) return null
  const keyId = process.env.MUX_SIGNING_KEY_ID
  const privateKey = process.env.MUX_PRIVATE_KEY

  if (!keyId || !privateKey) {
    // If signed keys are not configured in environment, return unsigned token (or null)
    return null
  }

  try {
    return generateMuxPlaybackToken(playbackId, keyId, privateKey, 3600)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add mutations in `web/lib/courses/mutations.ts`**

Append to `web/lib/courses/mutations.ts`:

```ts
import type { MediaAsset } from './video'

/** Requests a Mux direct upload URL and inserts a media_assets row in status 'uploading'. */
export async function createVideoUploadUrl(
  client: SupabaseClient,
  lessonId: string,
): Promise<Result<{ uploadUrl: string; assetId: string }>> {
  const user = await getAuthUser(client)
  if (!user) return fail('Connectez-vous pour verser une vidéo.')

  // Call Mux API via server route or direct fetch
  const muxTokenId = process.env.MUX_TOKEN_ID
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET

  if (!muxTokenId || !muxTokenSecret) {
    return fail('Le service Mux n’est pas configuré sur le serveur.')
  }

  const authHeader = `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`
  const response = await fetch('https://api.mux.com/video/v1/uploads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      new_asset_settings: {
        playback_policy: ['signed'],
      },
      cors_origin: '*',
    }),
  })

  if (!response.ok) {
    return fail('Erreur lors de la création du lien de versement Mux.')
  }

  const json = await response.json()
  const uploadData = json.data as { id: string; url: string }

  // Delete previous uploading assets for this lesson
  await client.from('media_assets').delete().eq('lesson_id', lessonId).eq('status', 'uploading')

  const { data: assetRow, error: dbError } = await client
    .from('media_assets')
    .insert({
      owner_id: user.id,
      lesson_id: lessonId,
      mux_upload_id: uploadData.id,
      status: 'uploading',
    })
    .select('id')
    .single()

  if (dbError || !assetRow) return fail(dbError?.message ?? 'Erreur lors de l’enregistrement de la vidéo.')

  return ok({ uploadUrl: uploadData.url, assetId: assetRow.id })
}

/** Deletes a media asset from database and Mux API. */
export async function deleteMediaAsset(
  client: SupabaseClient,
  assetId: string,
  muxAssetId: string | null,
): Promise<Result<null>> {
  if (muxAssetId) {
    const muxTokenId = process.env.MUX_TOKEN_ID
    const muxTokenSecret = process.env.MUX_TOKEN_SECRET
    if (muxTokenId && muxTokenSecret) {
      const authHeader = `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString('base64')}`
      await fetch(`https://api.mux.com/video/v1/assets/${muxAssetId}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader },
      }).catch(() => null)
    }
  }

  const { error } = await client.from('media_assets').delete().eq('id', assetId)
  return done(error)
}
```

- [ ] **Step 3: Typecheck and lint**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/courses/queries.ts web/lib/courses/mutations.ts
git commit -m "feat(courses): video queries and Mux direct upload mutations" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Mux Webhook API Route

**Files:**
- Create: `web/app/api/mux/webhook/route.ts`

**Interfaces:**
- Consumes: `verifyMuxWebhookSignature`, `createAdminClient` (or service role client).
- Updates: `media_assets` status (`uploading` → `processing` → `ready`/`errored`).

- [ ] **Step 1: Create the Mux Webhook route**

Create `web/app/api/mux/webhook/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyMuxWebhookSignature } from '@/lib/courses/video'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('mux-signature')
  const webhookSecret = process.env.MUX_WEBHOOK_SECRET

  if (webhookSecret) {
    const isValid = await verifyMuxWebhookSignature(rawBody, signatureHeader, webhookSecret)
    if (!isValid) {
      return NextResponse.json({ error: 'Signature webhook Mux invalide.' }, { status: 401 })
    }
  }

  let event: { type: string; data: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Payload JSON invalide.' }, { status: 400 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuration Supabase incomplète.' }, { status: 500 })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // Handle Mux webhook events
  switch (event.type) {
    case 'video.upload.asset_created': {
      const uploadId = event.data.id as string
      const assetId = event.data.asset_id as string

      if (uploadId && assetId) {
        await adminClient
          .from('media_assets')
          .update({
            mux_asset_id: assetId,
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('mux_upload_id', uploadId)
      }
      break
    }

    case 'video.asset.ready': {
      const assetId = event.data.id as string
      const playbackIds = (event.data.playback_ids ?? []) as { id: string; policy: string }[]
      const duration = Number(event.data.duration ?? 0)
      const primaryPlayback = playbackIds.find(p => p.policy === 'signed') ?? playbackIds[0]

      if (assetId && primaryPlayback) {
        await adminClient
          .from('media_assets')
          .update({
            mux_playback_id: primaryPlayback.id,
            duration_seconds: Math.round(duration),
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('mux_asset_id', assetId)
      }
      break
    }

    case 'video.asset.errored': {
      const assetId = event.data.id as string
      const errors = (event.data.errors ?? {}) as { messages?: string[] }
      const message = errors.messages?.[0] ?? 'Erreur de traitement de la vidéo par Mux.'

      if (assetId) {
        await adminClient
          .from('media_assets')
          .update({
            status: 'errored',
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq('mux_asset_id', assetId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
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
git add web/app/api/mux/webhook/route.ts
git commit -m "feat(api): idempotent Mux webhook endpoint for video asset processing" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Custom HLS Video Player Component

**Files:**
- Create: `web/components/courses/VideoPlayer.tsx`

**Interfaces:**
- Produces: `VideoPlayer({ playbackId, signedToken?, title?, posterUrl? })`.
- Features: Native HLS stream loading (`https://stream.mux.com/{playbackId}.m3u8?token={signedToken}`), play/pause, scrub bar, duration, playback speed, and fullscreen button.

- [ ] **Step 1: Create the VideoPlayer component**

Create `web/components/courses/VideoPlayer.tsx`:

```tsx
'use client'
import { useRef, useState, useEffect } from 'react'
import { Play, Pause, Maximize, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { formatVideoDuration } from '@/lib/courses/video'
import { Button } from '@/components/ui/button'

interface Props {
  playbackId: string
  signedToken?: string | null
  title?: string
  className?: string
}

const SPEEDS = [0.8, 1.0, 1.25, 1.5]

export function VideoPlayer({ playbackId, signedToken, title, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIndex, setSpeedIndex] = useState(1)
  const [isMuted, setIsMuted] = useState(false)

  const streamUrl = signedToken
    ? `https://stream.mux.com/${playbackId}.m3u8?token=${signedToken}`
    : `https://stream.mux.com/${playbackId}.m3u8`

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const updateTime = () => setCurrentTime(video.currentTime)
    const updateDuration = () => setDuration(video.duration || 0)
    const onEnded = () => setIsPlaying(false)

    video.addEventListener('timeupdate', updateTime)
    video.addEventListener('loadedmetadata', updateDuration)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('timeupdate', updateTime)
      video.removeEventListener('loadedmetadata', updateDuration)
      video.removeEventListener('ended', onEnded)
    }
  }, [playbackId, signedToken])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
      setIsPlaying(false)
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const toggleSpeed = () => {
    const nextIndex = (speedIndex + 1) % SPEEDS.length
    const nextSpeed = SPEEDS[nextIndex]
    setSpeedIndex(nextIndex)
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => null)
      } else {
        document.exitFullscreen().catch(() => null)
      }
    }
  }

  return (
    <div ref={containerRef} className={`relative bg-black rounded-xl overflow-hidden border border-border group ${className}`}>
      <video
        ref={videoRef}
        src={streamUrl}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        className="w-full aspect-video object-contain cursor-pointer"
      />

      {/* Overlay controls */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 flex flex-col gap-2 transition-opacity duration-200 opacity-90 group-hover:opacity-100">
        {title && <p className="text-xs font-semibold text-white/90 truncate">{title}</p>}

        {/* Scrubber */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-white/80 w-12 text-right">
            {formatVideoDuration(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            aria-label="Progression vidéo"
            className="flex-1 accent-primary h-1.5 bg-white/20 rounded-lg cursor-pointer"
          />
          <span className="text-xs font-mono text-white/80 w-12">
            {formatVideoDuration(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={togglePlay}
              className="text-white hover:bg-white/20 p-2 h-8 w-8"
              aria-label={isPlaying ? 'Mettre en pause' : 'Lire'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10)
              }}
              title="Reculer de 10 secondes"
              className="text-white/80 hover:text-white p-1.5 text-xs flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              10s
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSpeed}
              className="px-2 py-0.5 rounded text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {SPEEDS[speedIndex]}x
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              className="text-white/80 hover:text-white p-1.5"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-destructive" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Plein écran"
              className="text-white/80 hover:text-white p-1.5"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
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
git add web/components/courses/VideoPlayer.tsx
git commit -m "feat(courses): custom zero-dependency HLS video player" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Teacher Video Uploader Component

**Files:**
- Create: `web/components/courses/VideoUploader.tsx`

**Interfaces:**
- Consumes: `MediaAsset`, `VideoQuota`, `createVideoUploadUrl`, `deleteMediaAsset`.
- Produces: `VideoUploader({ lessonId, mediaAsset, videoQuota, disabled, onUpdated })`.

- [ ] **Step 1: Create the VideoUploader component**

Create `web/components/courses/VideoUploader.tsx`:

```tsx
'use client'
import { useState, useRef } from 'react'
import { Upload, Trash2, Video, RefreshCw, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { createVideoUploadUrl, deleteMediaAsset } from '@/lib/courses/mutations'
import type { MediaAsset, VideoQuota } from '@/lib/courses/video'
import { formatVideoDuration } from '@/lib/courses/video'
import { Button } from '@/components/ui/button'

interface Props {
  lessonId: string
  mediaAsset: MediaAsset | null
  videoQuota: VideoQuota
  disabled?: boolean
  onUpdated: () => void
}

export function VideoUploader({ lessonId, mediaAsset, videoQuota, disabled = false, onUpdated }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [supabase] = useState(() => createClient())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    setProgress(5)

    // 1. Request direct upload URL from server
    const res = await createVideoUploadUrl(supabase, lessonId)
    if (res.error || !res.data) {
      setUploading(false)
      setError(res.error ?? 'Erreur lors de la création du lien de versement.')
      return
    }

    // 2. Upload video file directly to Mux via XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', res.data.uploadUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')

    xhr.upload.onprogress = event => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 90) + 5
        setProgress(percent)
      }
    }

    xhr.onload = () => {
      setUploading(false)
      if (xhr.status >= 200 && xhr.status < 300) {
        onUpdated()
      } else {
        setError(`Erreur lors du versement de la vidéo (statut HTTP ${xhr.status}).`)
      }
    }

    xhr.onerror = () => {
      setUploading(false)
      setError('Erreur réseau lors du versement de la vidéo.')
    }

    xhr.send(file)
  }

  async function handleDelete() {
    if (!mediaAsset || !window.confirm('Supprimer cette vidéo ?')) return
    setUploading(true)
    setError(null)
    const res = await deleteMediaAsset(supabase, mediaAsset.id, mediaAsset.mux_asset_id)
    setUploading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    onUpdated()
  }

  return (
    <div className="space-y-4">
      {/* Quota meter */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">Quota vidéo enseignant :</span>
        <span className="font-mono font-semibold">
          {videoQuota.used_minutes} / {videoQuota.max_minutes} min utilisées
        </span>
      </div>

      {mediaAsset && mediaAsset.status === 'ready' && (
        <div className="border border-border rounded-xl p-4 bg-card space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Video className="w-4 h-4 text-primary" />
              <span>Vidéo prête ({formatVideoDuration(mediaAsset.duration_seconds)})</span>
            </div>
            {!disabled && (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={uploading}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Supprimer
              </Button>
            )}
          </div>
        </div>
      )}

      {mediaAsset && mediaAsset.status === 'processing' && (
        <div className="border border-border rounded-xl p-5 bg-card text-center space-y-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Traitement de la vidéo en cours par Mux…
          </div>
          <p className="text-xs text-muted-foreground">
            Votre vidéo a été transmise. Elle sera lisible automatiquement dans quelques instants.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onUpdated}>
            Actualiser le statut
          </Button>
        </div>
      )}

      {mediaAsset && mediaAsset.status === 'errored' && (
        <div className="border border-destructive/40 bg-destructive/10 rounded-xl p-4 text-destructive space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="w-4 h-4" />
            Échec du traitement vidéo
          </div>
          <p className="text-xs">{mediaAsset.error_message ?? 'Format vidéo non supporté.'}</p>
          {!disabled && (
            <Button type="button" variant="outline" size="sm" onClick={handleDelete}>
              Réessayer le versement
            </Button>
          )}
        </div>
      )}

      {(!mediaAsset || mediaAsset.status === 'uploading') && (
        <div className="border-2 border-dashed border-border rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Sélectionnez une vidéo (MP4, MOV, 30 min max).
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            disabled={disabled || uploading}
          />

          {uploading ? (
            <div className="space-y-2 max-w-xs mx-auto">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs font-mono text-muted-foreground">Versement : {progress}%</p>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
            >
              <Upload className="w-4 h-4 mr-2" />
              Choisir un fichier vidéo
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
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
git add web/components/courses/VideoUploader.tsx
git commit -m "feat(courses): teacher video direct uploader with quota display" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Integrate Video Format into Lesson Editor

**Files:**
- Modify: `web/components/courses/LessonEditor.tsx`
- Modify: `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `VideoUploader`, `mediaAsset`, `videoQuota`.

- [ ] **Step 1: Add Video option and Uploader in `LessonEditor.tsx`**

In `web/components/courses/LessonEditor.tsx`:
- Accept props `initialMediaAsset: MediaAsset | null`, `initialVideoQuota: VideoQuota`.
- Add `<option value="video">Vidéo (cours vidéo hébergé sur Mux)</option>` to the format selector.
- When `kind === 'video'`, render `<VideoUploader>`:

```tsx
{kind === 'video' && (
  <div className="bg-card border border-border rounded-xl p-5 space-y-3">
    <h3 className="text-sm font-semibold">Vidéo de la leçon</h3>
    <VideoUploader
      lessonId={lesson.id}
      mediaAsset={initialMediaAsset}
      videoQuota={initialVideoQuota}
      disabled={readOnly}
      onUpdated={() => router.refresh()}
    />
  </div>
)}
```

- [ ] **Step 2: Update teacher lesson route `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`**

In `web/app/teach/[courseId]/lessons/[lessonId]/page.tsx`:
- Prefetch `mediaAsset` via `getMediaAssetForLesson(supabase, lesson.id)`.
- Prefetch `videoQuota` via `getVideoQuota(supabase, user.id)`.
- Pass to `<LessonEditor>`.

- [ ] **Step 3: Typecheck and lint**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/courses/LessonEditor.tsx web/app/teach/[courseId]/lessons/[lessonId]/page.tsx
git commit -m "feat(courses): integrate video uploader into teacher lesson editor" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Learner Video Player Route Integration

**Files:**
- Modify: `web/app/courses/[slug]/learn/[lessonId]/page.tsx`

**Interfaces:**
- Consumes: `getMediaAssetForLesson`, `getSignedMuxPlaybackToken`, `VideoPlayer`.

- [ ] **Step 1: Update learner lesson page `web/app/courses/[slug]/learn/[lessonId]/page.tsx`**

Update `web/app/courses/[slug]/learn/[lessonId]/page.tsx`:
- Fetch `mediaAsset`:
  ```ts
  const mediaAsset = lesson.kind === 'video' ? await getMediaAssetForLesson(supabase, lesson.id) : null
  const signedPlaybackToken = mediaAsset?.mux_playback_id
    ? await getSignedMuxPlaybackToken(mediaAsset.mux_playback_id)
    : null
  ```
- Render when `lesson.kind === 'video'`:
  ```tsx
  {lesson.kind === 'video' && (
    <div className="space-y-6">
      {mediaAsset && mediaAsset.status === 'ready' && mediaAsset.mux_playback_id ? (
        <VideoPlayer
          playbackId={mediaAsset.mux_playback_id}
          signedToken={signedPlaybackToken}
          title={lesson.title}
        />
      ) : mediaAsset && mediaAsset.status === 'processing' ? (
        <div className="p-8 border border-border rounded-xl text-center space-y-2 bg-card">
          <p className="font-semibold text-primary">Vidéo en cours de traitement…</p>
          <p className="text-xs text-muted-foreground">La vidéo sera disponible d’ici quelques minutes.</p>
        </div>
      ) : (
        <div className="p-8 border border-dashed border-border rounded-xl text-center text-muted-foreground text-sm">
          La vidéo de cette leçon n’a pas encore été versée.
        </div>
      )}
      {body.trim() && <LessonMarkdown source={body} />}
    </div>
  )}
  ```

- [ ] **Step 2: Typecheck and lint**

Run from `web/`:
```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/courses/[slug]/learn/[lessonId]/page.tsx
git commit -m "feat(courses): integrate video player into learner lesson page" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
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
- All unit tests PASS (slug, outline, reorder, markdown, audio, quiz, video).
- All RLS tests PASS (`courses-core`, `progress-reports`, `phase2-audio-quiz`, `phase3-video-assets`, `smoke`).
- TypeScript typecheck passes with 0 errors.
- Next.js production build succeeds.

- [ ] **Step 2: Commit and verify git clean state**

Ensure working tree is clean and push branch `feat/course-platform-phase-3`.
