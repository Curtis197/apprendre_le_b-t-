# Walkthrough: Reports and corrections ("signalements")

**Date:** 2026-10-02
**Branch:** `feat/corrections`
**Migration:** `supabase/migrations/20261003000005_corrections.sql`

---

## 1. What it does

Any signed-in user can flag a field of community content as wrong and, optionally, propose the replacement text. Corrections are **public**. The content's **author** can accept or reject them; **admins** can do both for any content, and are the only ones for content that has no known author.

Content that can be reported, and its fields:

| Kind | Fields |
|---|---|
| Translation of a word | French, context |
| Word | everyday spelling (`bete_phonetic`), phonetic form (`bete_word`), description |
| Expression | Bhété, phonetic, French, mot à mot |
| Grammar rule | French pattern, Bhété pattern, description, Bhété example, French example |
| Resource | title, Bhété text, mot à mot, French translation |

Accepting a correction **replaces the field with the proposed text**.

Decisions taken with the user: report everything above; the author applies (accept), admins can too; the model stays "no review step" like resources.

---

## 2. Database (`20261003000005_corrections.sql`)

- **`correction_column(type, field)`** is the single allow-list mapping a (kind, field) pair to a table and column. Anything else is refused. It is a pure lookup, not security definer.
- **`corrections`** holds: target (`target_type`, `target_id`, `field`), `kind` (`mistranslation | spelling | other`), `message`, `suggestion`, and the columns the server fills in: `original` (the field's text at report time), `label`, `ref_id` (the page showing it), `owner_id` (the author at report time), `reporter_id`, `reporter_name`, `status` (`open | accepted | rejected`), `resolved_by`, `resolved_at`. At least a message or a suggestion is required (check constraint).
- **RLS:** public `SELECT`; `INSERT` for `authenticated` with `reporter_id = auth.uid()`; `DELETE` of your own open report (or any, for an admin). There is **no UPDATE policy**: a correction is resolved only through the two functions below.
- **One open report per person, target and field** (partial unique index); at most 50 open reports per person.
- **`corrections_guard`** (before insert, runs as the caller): validates the field, loads the target, trims text, refuses a suggestion identical to the current text, refuses reporting your own content (you edit it directly), and fills in `original`, `owner_id`, `label`, `ref_id`, `reporter_name`. For `authenticated` callers it also forces `reporter_id`, `status`, `created_at` — a forged `reporter_id` is simply replaced by the real caller.
- **`accept_correction(id)`** (security definer): requires the author or an admin; refuses a report with no suggestion; refuses a **stale** correction (the field's text changed since the report); applies the update to the allow-listed column only; marks it accepted. If the database refuses the new text (for example a duplicate translation) the whole call rolls back and the report stays open.
- **`reject_correction(id)`**: same permission, marks it rejected.
- **Cleanup:** deleting a word, translation, expression, grammar rule or resource deletes its corrections (`corrections_target_deleted`).
- **Grants:** the two actions are executable by `authenticated` only; the trigger functions are not executable by clients (see the earlier grants migration).

Content with no known author (`owner_id` null) can only be resolved by an admin.

---

## 3. Application

- `web/lib/corrections.ts`: pure logic. Field catalog with French labels, input validation, `isStale`, `canResolve`, `correctionHref`. A test reads the migration and checks that this catalog matches `correction_column()` entry for entry.
- `web/lib/corrections-mutations.ts`: `createCorrection`, `withdrawCorrection`, `acceptCorrection`, `rejectCorrection`, and reads (`getOpenCorrections`, `getCorrectionsToReview`, `getMyOpenCorrections`). Errors from the database functions are already in French and are shown as is.
- **`CorrectionBox`** (client): "Signaler une erreur" with a form (field, kind, what is wrong, proposed text pre-filled with the current text), a count of open reports, and the list. Nothing is shown until the session is known, so a signed-in reader never sees a login link flash. The author is not offered the report button.
- **`CorrectionItem`**: one report with the before/after text, a "text changed since" warning, and the actions the viewer may take (Accepter / Refuser for the author or an admin, "Retirer mon signalement" for the reporter, Supprimer for an admin).
- Placed on: each word (its spelling and description) and **each translation** row on `/lexicon/[id]`, `/resources/[id]`, the cards on `/grammar`, and the word, expression and rule cards on `/contribute`.
- **`/corrections`**: the author's queue ("Corrections à traiter"; "Corrections en attente" for an admin, who sees all) and "Mes signalements". Signed-out visitors are sent to the login page. The profile page shows a link with the count when something is waiting.

---

## 4. Verification

**Run for this change (local database):**
- `vitest` unit suite: 23 files, **221** tests pass (18 new, including the migration-vs-catalog check).
- `corrections.test.ts` (RLS): **25** tests. They were checked by mutation: with the guard trigger disabled **15** fail; with the stale check removed exactly the stale test fails; with the permission check removed exactly the two permission tests fail.
- `corrections-helpers.test.ts`: **5** tests that call the app's own functions with real signed-in clients (report, list, accept, error messages, withdraw, admin view).
- **Existing RLS suite not disturbed:** all 14 other RLS files pass (172 tests) with the new migration applied, and the 2 corrections files pass (30 tests): 16 files, 202 tests, every file green. They had to be run in groups (see the harness note below); run as a single command, a few files fail at setup with the signup rate limit, and which ones varies from run to run. The two files that failed in one such run (audio/quiz and video) pass when run alone, 12 of 12.
- `tsc --noEmit`: 0 errors. `eslint`: clean on the files touched.
- Pages rendered by the dev server with seeded data as the author, the reporter, an admin and an anonymous visitor:
  - the author's `/corrections` lists 5 reports, with "Accepter" on the 4 that propose a text (the 5th is a comment only) and "Refuser" on all 5;
  - the reporter sees none to review and 5 under "Mes signalements", each with "Retirer mon signalement" and no accept button;
  - the admin sees all 5 with Accepter, Refuser and Supprimer;
  - anonymous visitors are redirected to `/auth?next=/corrections`;
  - the profile link shows the count for the author and the admin, and nothing for the reporter;
  - the word, resource, grammar and contribute pages return 200, and the box adds nothing to the server HTML.

**Not verified:**
- The box itself (opening the form, typing, submitting, the buttons) runs in the browser, and no browser was driven. It is covered by the helper-level tests and the TypeScript checks, not by clicking.
- One request to `/corrections` as the author was redirected to login the first time after the dev server started and was fine on the next three tries. It was not reproduced and not explained.
- Production: the migration has not been applied.

**Test harness note:** the full RLS suite signs up about 52 users in one run (7 of them from this change), but the local auth service allows 30 signups per 5 minutes per IP (`[auth.rate_limit] sign_in_sign_ups` in `supabase/config.toml`). Run the suite in groups, or wait out the window between runs. The limit is deliberately not raised in `config.toml` here: `supabase config push` would apply that file's auth settings to the remote project.

---

## 5. Known limitations

- A correction replaces the **whole field**. For a long text (a song) the reporter proposes the full new text, and the author sees before/after in full.
- A report goes stale as soon as the text changes; the author must ask for it again. Other open reports on the same field become stale after one is accepted.
- No notification is sent: authors find reports on the content, under the profile link and on `/corrections`.
- The translator's per-token "✗" button still writes to the older `user_feedback` table, which nobody can read. It is not connected to this feature.
- `lexicon.description` can be edited by any signed-in user, so reporting it is mainly a flag.
