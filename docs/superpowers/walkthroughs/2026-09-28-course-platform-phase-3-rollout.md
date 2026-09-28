# Walkthrough — Course Platform Phase 3: Video Lessons & Mux Direct Upload Integration

Date: 2026-09-28  
Branch: `feat/course-platform-phase-3`  
Spec: [`docs/superpowers/specs/2026-09-25-course-platform-design.md`](file:///c:/Users/DELL%20LATITUDE%207480/traduction%20bété/docs/superpowers/specs/2026-09-25-course-platform-design.md) (Phase 3: Video)  
Implementation Plan: [`docs/superpowers/plans/2026-09-28-course-platform-phase-3.md`](file:///c:/Users/DELL%20LATITUDE%207480/traduction%20bété/docs/superpowers/plans/2026-09-28-course-platform-phase-3.md)

---

## 1. Executive Summary

Phase 3 implements full end-to-end video lesson capabilities backed by Mux Direct Upload, server-side signed HLS playback security, teacher video quota tracking, and an idempotent webhook lifecycle processor. All features were implemented with **zero external npm runtime dependencies**, leveraging Web Crypto / native Node `crypto` for HMAC-SHA256 signature verification and RS256 JWT playback token signing.

All database schema additions and RLS policies were tested locally against Docker Supabase and verified 100% green before remote Supabase deployment via MCP.

---

## 2. Changes Made

### A. Database Migration & RLS Security (`supabase/migrations/20260928000001_courses_phase3_video.sql`)
- Created `video_quotas` table to store per-teacher limits (default 30 minutes).
- Created `media_assets` table tracking Mux upload IDs, asset IDs, signed playback IDs, duration, status (`uploading`, `processing`, `ready`, `errored`), and errors.
- Created `get_user_video_quota(p_user_id)` PL/pgSQL function with explicit column aliasing to prevent Postgres error `42702` (ambiguous column reference).
- Added RLS policies ensuring video assets are accessible only via `can_access_lesson(lesson_id)` and editable only by course owners or admins.

### B. Pure Video Domain & HMAC/JWT Library (`web/lib/courses/video.ts`)
- `hasAvailableVideoQuota`: Enforces stored minute limits.
- `formatVideoDuration`: Formats seconds into `mm:ss` or `hh:mm:ss`.
- `verifyMuxWebhookSignature`: Verifies `mux-signature` headers using HMAC-SHA256 with length checks for `timingSafeEqual`.
- `generateMuxPlaybackToken`: Mints RS256 JWT tokens for 1-hour signed HLS streams.

### C. Server Queries & Direct Upload Mutations (`web/lib/courses/queries.ts`, `web/lib/courses/mutations.ts`)
- `getMediaAssetForLesson`: Fetches asset status and signed playback IDs.
- `getVideoQuota`: Fetches teacher quota usage.
- `getSignedMuxPlaybackToken`: Mints short-lived token when signed playback is enabled.
- `createVideoUploadUrl`: Requests direct upload URL from Mux API and creates initial `uploading` record.
- `deleteMediaAsset`: Deletes asset from Mux API and local database.

### D. Idempotent Mux Webhook Endpoint (`web/app/api/mux/webhook/route.ts`)
- Validates `mux-signature` header against `MUX_WEBHOOK_SECRET`.
- Handles `video.upload.asset_created` (`status` → `processing`).
- Handles `video.asset.ready` (`status` → `ready`, stores `duration_seconds` and `mux_playback_id`).
- Handles `video.asset.errored` (`status` → `errored`, stores error message).

### E. UI Components & Route Integration
- **`VideoPlayer.tsx`**: Custom zero-dependency HLS player supporting native HLS, play/pause, scrub slider, 10s rewind, speed toggle (0.8x, 1x, 1.25x, 1.5x), mute toggle, and fullscreen.
- **`VideoUploader.tsx`**: Teacher direct upload widget with progress bar, quota usage meter, processing status indicator, and delete control.
- **`LessonEditor.tsx` & Teacher Route**: Added `video` option to lesson format selector and pre-fetched quota/asset state.
- **Learner Lesson Page Route**: Displays signed HLS video player when asset is ready, or processing/empty fallback state.

---

## 3. Verification & Test Results

### Unit Test Suite
Ran `npm test` across all unit test files:
```text
✓ __tests__/course-slug.test.ts (8 tests)
✓ __tests__/course-markdown.test.ts (13 tests)
✓ __tests__/lesson-markdown.test.tsx (7 tests)
✓ __tests__/course-mutations.test.ts (6 tests)
✓ __tests__/course-outline.test.ts (12 tests)
✓ __tests__/course-audio.test.ts (4 tests)
✓ __tests__/donation.test.ts (8 tests)
✓ __tests__/course-reorder.test.ts (8 tests)
✓ __tests__/course-video.test.ts (5 tests)
✓ __tests__/course-quiz.test.ts (4 tests)

Test Files: 10 passed (10)
Tests: 75 passed (75)
```

### RLS Security Test Suite
Ran `npm run test:rls` against local Supabase Docker stack:
```text
✓ __tests__/rls/phase3-video-assets.test.ts (5 tests)
✓ __tests__/rls/courses-core.test.ts (26 tests)
✓ __tests__/rls/progress-reports.test.ts (11 tests)
✓ __tests__/rls/phase2-audio-quiz.test.ts (7 tests)
✓ __tests__/rls/smoke.test.ts (3 tests)

Test Files: 5 passed (5)
Tests: 52 passed (52)
```

---

## 4. Feature Inventory & Integrity Check

Updated `docs/FEATURE_INVENTORY.md` to register Phase 3 capabilities.
