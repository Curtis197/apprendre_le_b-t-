# Implementation Plan Authoring Standards & Quality Benchmark

> **Reference Document:** This document codifies the design, architectural, and planning conventions established in `docs/superpowers/plans/2026-09-25-course-platform-phase-1.md`. Use this as the definitive benchmark for all future implementation plans in this repository and across Antigravity projects.

---

## 1. Core Philosophy: The Plan as a Compiled Specification

A high-quality implementation plan is **not a loose task list or high-level architectural sketch**. It is a **compiled executable specification**.

### The Golden Rule
> **A plan must contain 100% full-resolution, copy-paste-ready code for every file.** An agent, subagent, or engineer should be able to execute the plan step-by-step without having to make unguided architectural, typing, or styling decisions on the fly.

### Comparative Distinction
| Dimension | Common / Baseline AI Plan | Claude Benchmark Plan |
|---|---|---|
| **Code Completeness** | Outlines, function signatures, partial snippets with `// ... implement rest` | Complete, production-ready code with all imports, types, error branches, and styles |
| **Dependency Bias** | Rapidly installs external packages (`react-markdown`, `dnd-kit`, `zod`, etc.) | **Zero new runtime dependencies**; writes tight domain utilities adhering to platform floors |
| **Task Contracts** | Implicit expectations across tasks | Explicit **Files** (Create/Modify/Test) and **Interfaces** (`Consumes` / `Produces`) |
| **TDD Mechanics** | "Write unit tests to verify behavior" | Exact test file code, **predicted red-phase failure message**, implementation code, green verification |
| **Security & RLS** | Writes SQL policies and assumes they work | Standalone **RLS test harness** running live against Docker Supabase testing all actors (`anon`, `learner`, `owner`, `admin`) |
| **Platform Defensiveness**| Generic web code | Strict compliance with browser floors (Safari 15.4/16.1), framework changes (Next.js 16 async params), and DB traps (`search_path`) |
| **Git Hygiene** | Vague commit notes or batch `git add .` | Atomic commits per task with explicit paths, standardized commit messages, and author trailers |

---

## 2. Document Anatomy: Standard Sections of a Plan

Every implementation plan must follow this exact section structure:

```markdown
# [Feature Name] — Phase [N] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [1-2 concise sentences defining user outcome and scope.]

**Architecture:** [Key architectural decisions, state management, security model, and data flow.]

**Tech Stack:** [Specific runtime versions: Next.js, React, Supabase, Tailwind, Vitest, etc. Explicit dependency constraints.]

**Spec:** [Path to design spec, noting any approved amendments or phase boundaries.]

## Global Constraints
- [Scope boundaries: what is strictly excluded in this phase]
- [Authorization rules: role sources of truth, RLS invariants]
- [Value sets: exhaustive TypeScript unions/Postgres check constraints]
- [Copy & Typography: language, typographic apostrophes `’` (U+2019)]
- [Browser floor: minimum Safari/iOS version, Tailwind opacity fallback rules]
- [Framework-specific rules: Next.js 16 Promise params/searchParams, server vs client components]
- [Database conventions: RLS subquery wrapping `(select auth.uid())`, pinned `search_path = public`]
- [Git hygiene: atomic commits, explicit paths only, commit message and trailer format]
- [Shell conventions: OS, command cwd, path quoting rules]

## File Structure & Responsibilities Table
[Markdown table listing every file to be created/modified and its exact single responsibility]

---

### Task 1: [Task Title]
...
```

---

## 3. Task Anatomy & Execution Protocol

Every task in the plan must be atomic, self-contained, and structured as follows:

### Task Header Template
```markdown
### Task [N]: [Title]

**Files:**
- Modify: `path/to/existing-file.ts`
- Create: `path/to/new-file.ts`
- Test: `path/to/test-file.test.ts`

**Interfaces:**
- Consumes: [List functions, types, and constants imported from previous tasks]
- Produces: [List functions, types, components, and routes exposed for future tasks]
```

### Standard Step Sequence for Every Task
1. **Step 1 (Red Phase):** Write the failing test.
   - Provide full test code with descriptive test cases (happy path, edge cases, negative/forbidden cases).
2. **Step 2 (Verify Red):** Execute test command.
   - Explicitly predict the exact failure message (e.g. `Expected: FAIL (cannot resolve ../lib/courses/slug)` or `Could not find table public.courses`).
   - If the failure is not the predicted failure, the test is broken and must be fixed before coding.
3. **Step 3 (Green Phase):** Implement the production module or component.
   - Full code with strict TypeScript types, error handling, and inline comments for non-obvious logic.
4. **Step 4 (Verify Green):** Run the test suite.
   - Explicit verification command: `npx vitest run <file>`. Expected: all tests PASS.
5. **Step 5 (Static Analysis & Typecheck):**
   - Run `npx tsc --noEmit`.
   - Run `npx eslint <target-path>`.
6. **Step 6 (Manual Verification):**
   - Clear, step-by-step instructions for developer/browser verification (URLs, expected DOM elements, user role transitions).
7. **Step 7 (Atomic Commit):**
   - Explicit `git add <file1> <file2> ...` (never `git add .` or `git add -A`).
   - Explicit `git commit -m "feat/fix(...): ..." -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"`.

---

## 4. Architectural Patterns Established by the Claude Benchmark

### 1. Zero-Dependency Domain Engineering
Before reaching for an `npm install`, evaluate if the required capability can be built cleanly in a few dozen lines of pure TypeScript:
- **Markdown Subset Parser:** Rather than pulling in `react-markdown` (and dealing with CSS bundle issues, HTML injection sanitizers, and bundle bloat), Claude implemented a custom parser (`lib/courses/markdown.ts`) and AST renderer (`components/LessonMarkdown.tsx`) in ~150 LOC.
  - Generates React elements directly from an AST.
  - Safe by design: impossible to execute XSS or inject raw HTML.
  - Replaces external links with `rel="nofollow ugc noopener noreferrer"` and targets them in new tabs.
- **Pure Reordering Utility (`reorder.ts`):** Instead of drag-and-drop libraries, built `moveItem`, `changedPositions`, and `nextPosition` as pure data transformations tested in isolation.

### 2. Live RLS Integration Test Harness
Never rely on code inspection for database security. Claude introduced a dedicated RLS harness:
- `web/vitest.rls.config.ts` runs tests against local Docker Supabase (`http://127.0.0.1:54321`).
- `web/scripts/test-rls.mjs` extracts local Supabase env tokens dynamically via `supabase status -o env`.
- `web/__tests__/rls/helpers.ts` provides authenticated clients for different actors (`createUser('learner')`, `anonClient()`, `makeAdmin()`).
- Tests explicitly verify that unauthorized users receive empty arrays or RLS errors on queries and mutations.

### 3. Database Security & Integrity Invariants
- **Row-Level Splitting:** When metadata is public (e.g. course outline) but content is gated (e.g. lesson text), split into two tables (`lessons` metadata vs `lesson_contents` body).
- **Composite Foreign Keys:** When denormalizing parent IDs (e.g. storing `course_id` on both `course_sections` and `lessons`), always enforce a composite foreign key:
  ```sql
  foreign key (section_id, course_id) references course_sections (id, course_id) on delete cascade
  ```
  This makes it impossible for a lesson to belong to Section A of Course 1 while having its `course_id` set to Course 2.
- **Pinned Search Path:** Every `SECURITY DEFINER` function MUST specify `SET search_path = public` to prevent privilege escalation and search-path resolution failures in GoTrue/Auth triggers:
  ```sql
  CREATE OR REPLACE FUNCTION public.my_function()
  RETURNS ... SECURITY DEFINER SET search_path = public AS $$ ... $$;
  ```
- **RLS Query Plan Caching:** Wrap `auth.uid()` calls as `(select auth.uid())` and helper functions as `(select is_admin())` so PostgreSQL treats the call as a stable scalar subquery rather than evaluating it per row.

### 4. Next.js 16 & React 19 Alignment
- In Next.js 16 App Router, `params` and `searchParams` in server components and metadata generators are Promises:
  ```tsx
  interface Props {
    params: Promise<{ slug: string }>
    searchParams: Promise<{ dialect?: string }>
  }
  export default async function Page({ params, searchParams }: Props) {
    const { slug } = await params
    const { dialect } = await searchParams
    ...
  }
  ```
- Use `React.cache()` to deduplicate server queries between `generateMetadata` and the page component within the same request lifecycle.

### 5. Defensive CSS & Browser Floor Compliance
- iOS Safari < 16.2 does not support `color-mix()` in CSS color palettes.
- Whenever using Tailwind opacity modifiers (e.g. `bg-primary/10`, `text-secondary/80`), ensure the class is either already declared in the `@supports not (color: color-mix(...))` fallback block in `globals.css` or provide an exact RGB/HEX fallback.

### 6. Linguistic & Typographic Rigor
- In French site copy, **never use a straight apostrophe (`'`)** in JSX text. Always use the typographic curly apostrophe `’` (`U+2019`).
- Straight apostrophes trigger `react/no-unescaped-entities` lint errors and fail the production build.

---

## 5. Pre-Flight Checklist for New Implementation Plans

Before presenting an implementation plan for review or execution, verify:
- [ ] Are all target files listed in a file responsibility table?
- [ ] Does every task specify exact `Consumes` and `Produces` interfaces?
- [ ] Is every code snippet complete (no ellipses, no TODOs, all imports declared)?
- [ ] Are all test commands explicit with predicted red-phase failure messages?
- [ ] Are all database operations covered by RLS policies and integration tests?
- [ ] Are all Next.js 16 and browser compatibility constraints respected?
- [ ] Are git commits strictly mapped to explicit file paths with trailers?
