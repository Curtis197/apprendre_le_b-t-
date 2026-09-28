# Walkthrough: Course Platform Phase 1 Implementation & Rollout

**Date:** 2026-09-28  
**Scope:** Foundation of Course Platform (Phase 1) — Text lessons, Catalog, Teacher Builder, Learner Progress, RLS, Admin Moderation, Supabase Migrations via MCP & Vercel Production Deployment.

---

## 1. Summary of Changes

### Database Layer (Supabase Migrations via MCP)
Applied three production migrations to project `agdqbzbjcxrzfhkvempe` via `supabase-mcp-server`:
- `20260925000000_fix_handle_new_user_search_path.sql`: Pinned `search_path = public` on `handle_new_user()`.
- `20260925000001_courses_core.sql`: Added `user_roles`, `courses`, `course_sections`, `lessons`, `lesson_contents`, `enrollments`, security functions (`is_admin()`, `is_enrolled()`, `can_access_lesson()`), and RLS policies.
- `20260925000002_progress_reports.sql`: Added `lesson_progress`, `course_reports`, and associated RLS policies.
- Seeded initial admin role for `curtiscapre@gmail.com`.

### Pure Domain Library (`web/lib/courses/`)
- `types.ts`: Core data structures (`Course`, `Section`, `Lesson`, `OutlineSection`, `CourseInput`, `Result<T>`).
- `labels.ts`: French labels, status styles, type guards (`isDialect`, `isLevel`).
- `slug.ts`: Clean URL slugification and collision-resistant suffixes (`slugify`, `buildSlug`).
- `outline.ts`: Outline tree construction, progress calculation (`computeProgress`), lesson sequencing (`nextLessonId`, `resumeLessonId`), and publish blocker validations.
- `reorder.ts`: Zero-dependency position calculation (`moveItem`, `changedPositions`, `nextPosition`).
- `markdown.ts`: Zero-dependency safe Markdown parser generating React AST without HTML injection.
- `queries.ts`: Server-only cached database queries.
- `mutations.ts`: Client-side write mutations enforced through Supabase RLS.

### UI Components (`web/components/courses/` & `web/components/`)
- `LessonMarkdown.tsx`: AST renderer for headings, lists, blockquotes, code, and safe outbound links.
- `CourseCard.tsx`: Catalog course preview card with level, dialect, and access badges.
- `CourseForm.tsx`: Course metadata creation and editing form.
- `CourseBuilder.tsx`: Section and lesson organizer with reordering and preview toggling.
- `LessonEditor.tsx`: Split-screen live preview text editor for lesson bodies.
- `CourseStatusPanel.tsx`: Publish, unpublish, archive, and draft deletion controls.
- `LessonOutline.tsx`: Course navigation sidebar tracking completed and locked states.
- `EnrollButton.tsx`: Dynamic enrollment and lesson resumption CTA button.
- `CompleteButton.tsx`: Interactive lesson completion toggle button.
- `ReportCourseButton.tsx`: Modal for reporting inappropriate courses.
- `ModerationActions.tsx`: Admin queue buttons to suspend or restore reported courses.
- `ProfileCourses.tsx`: User profile widgets for enrolled courses and authored courses.

### App Router Routes
- `/courses`: Public catalog with dialect and level filter pills.
- `/courses/[slug]`: Public course overview with outline, enrollment CTA, and JSON-LD Course schema.
- `/courses/[slug]/learn/[lessonId]`: Interactive lesson player with outline and progress tracker.
- `/teach`: Teacher dashboard listing authored courses and status badges.
- `/teach/new`: Creation form for new courses.
- `/teach/[courseId]`: Course builder and outline editor.
- `/teach/[courseId]/lessons/[lessonId]`: Lesson editor and markdown writing interface.
- `/admin/reports`: Moderation dashboard for reported and suspended courses.

---

## 2. Testing & Verification

1. **Unit Test Suite (`vitest run`):**
   - 62 passed tests across `course-slug`, `course-outline`, `course-reorder`, `course-markdown`, `lesson-markdown`, `course-mutations`, and `donation`.
2. **RLS Integration Suite (`npm run test:rls`):**
   - 40 passed tests against local Docker Supabase testing anonymous visitors, learners, teachers, and admins.
3. **Typecheck & Lint:**
   - `npx tsc --noEmit`: 0 errors.
   - `npx eslint`: 0 errors in all course platform files.
4. **Next.js Production Build:**
   - `npm run build`: Successful compilation and prerendering of all 8 course platform routes.
5. **Safari Floor & Dependency Audit:**
   - 0 new runtime dependencies added to `package.json`.
   - All Tailwind opacity utilities validated against iOS < 16.2 fallback declarations in `globals.css`.

---

## 3. Deployment

- **Git Branch:** `feat/course-platform-phase-1` pushed to remote repository `Curtis197/apprendre_le_b-t-`.
- **Vercel Preview Deployment:**
  - Deployment ID: `dpl_BDXW49MaodYxkNwcPDQKCqTg9sWd`
  - URL: `https://apprendre-le-b-5ijvtpjw5-curtis-projects-6551631e.vercel.app`
  - Status: `READY`
