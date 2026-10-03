# Walkthrough: migration history, re-runnable policies, translator report button

**Date:** 2026-10-02
**Branch:** `fix/migrations-and-feedback`

---

## 1. Migration history reconciliation

**Problem.** Production applied the migrations through the Supabase tool and the SQL editor, so its history table (`supabase_migrations.schema_migrations`) did not match the files in `supabase/migrations/`: different timestamps (`20260926211734` for `20260925000001_courses_core`), names with the version baked in, three superseded pre-releases of the video migration, a duplicate `semantic_translator` row where the files have `user_votes`, and four migrations applied by hand that have no row at all. `supabase db push` / `migration list` could not be used.

**Fix, in two parts.**

1. **Files.** Two files shared the version `20260925000002` (`lexicon_examples_contrib` and `progress_reports`), which the CLI refuses. `progress_reports` is now `20260925000004` (it only needs `courses_core`, version `…01`). Nothing else in the repo refers to the file by version except the old plan and rollout documents, which are left as they were written.
2. **History table.** [2026-10-02-migration-history-reconcile.sql](2026-10-02-migration-history-reconcile.sql) rewrites the production table so its versions are exactly the 49 files:
   - 20 rows get the file's version and name (same row, so its `statements` are kept);
   - the `20260517000001` row (a copy of `semantic_translator`) is renamed `user_votes`; the table exists in production;
   - the three superseded rows `20260928090327`, `…091408`, `…092110` are deleted (the final video migration `20260928101038` replaces them; they lose their stored statements);
   - four rows are inserted for migrations applied by hand and checked in production on 2026-10-02: `20260925000003_lexicon_reconcile_prod_drift`, `20260930000001_course_review_hardening`, `20261003000004_find_usages_exclude_own_examples`, `20261003000005_corrections`.
   - It runs in one transaction and ends with a check that the table holds exactly the 49 versions, otherwise it raises and nothing is changed.

   **Status: not run.** The tool that applies SQL to production declined it, so it has to be pasted into the Supabase SQL editor. It only edits bookkeeping; no schema or data changes.

Afterwards `supabase migration list --linked` should show 49 rows with Local and Remote equal.

## 2. Re-runnable policies

`20260930000001_course_review_hardening.sql` (2 policies) and `20260930000005_resources_community_model.sql` (4 policies) now `drop policy if exists` before each `create policy`. Both files were run twice in a row against the local database without error. `web/__tests__/migrations.test.ts` checks that no version is used twice and that every policy created from `20260930000000` on is dropped first (it fails when a guard is removed).

Older migrations (before `20260930000000`) still create policies without dropping them; they have been applied once and are not re-run, so they were left alone.

## 3. The translator's "✗" button

The button wrote to `user_feedback`, a table nobody can read. It now opens the corrections form for the word behind the token: the Latin spelling (`bete_phonetic`) and the phonetic form (`bete_word`), with "mistranslation" preselected and a message field. A token that is not tied to a lexicon entry has no button. Reports go to the same `/corrections` queue as everywhere else, so the word's author (or an admin) accepts or rejects them, and signed-out visitors are sent to the login page.

`user_feedback` and `pipeline/apply_feedback.py` are untouched; the table is empty in production.

**Not verified:** the form was not driven in a browser (type check, lint and the unit suite pass; the reporting itself is covered by the corrections RLS tests).
