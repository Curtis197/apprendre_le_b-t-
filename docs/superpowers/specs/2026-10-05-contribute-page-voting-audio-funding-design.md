# Contribute page: pronunciation recording, no voting, no funding UI

Date: 2026-10-05

Three independent parts, one spec, one plan with separate tasks. Part A changes the data model; B and C are web changes.

## Goal

- **A. Remove voting.** Contributions are usable at once; the community corrects them afterwards (the model already used for resources). The vote buttons, the vote counts shown on pages, and the 3-vote validation go away.
- **B. Record the pronunciation while contributing a word.** The word form on `/contribute` gets an optional recording, attached to the entry the form creates.
- **C. Hide the funding UI for the moment.** The donate form disappears from the home page and from `/contribute`; the code and data stay so it can return.

## Decisions (agreed)

- Without votes, an expression or grammar rule is **validated immediately** (no admin step, no self-validation checkbox). The translator keeps reading `validated = true` rows, so nothing changes for it.
- Voting is removed as a **feature, not as data**: the `upvotes` columns and the `user_votes` table stay, inert.
- The "En attente de validation" section of `/contribute` is **removed**, not turned into a "recent contributions" list.
- Recording on the contribution page is for **words only** (lexicon entries). Expressions get no audio.
- The funding UI is **hidden, not deleted**; the Stripe webhook stays active.

## Out of scope

- Audio for expressions or grammar rules; a "recent contributions" list; changing how the lexicon `validated` flag works (clients still cannot set it); dropping the `upvotes` columns or `user_votes`; removing the donate API routes, the `contributions` table or the `FundingWidget` component; any change to the corrections system.

## Part A: remove voting

### Database (one migration: `supabase/migrations/20261010000000_remove_voting.sql`)

Re-runnable (`drop … if exists`, idempotent updates).

1. Mark existing rows as validated: `update expressions set validated = true where not validated;` and the same for `grammar_rules`.
2. New rows are validated: `alter table expressions alter column validated set default true;` and the same for `grammar_rules`.
3. Drop the three triggers `trg_auto_validate_grammar_rules`, `trg_auto_validate_expressions`, `trg_auto_validate_community_texts` and the function `auto_validate_on_upvotes()`.
4. Drop the functions `vote(text, uuid, text)` and `increment_upvotes(text, uuid, int)` (check `pg_proc` for the exact signatures present, including older overloads of `increment_upvotes`).
5. Drop the policies `"grammar_rules vote"` and `"expressions vote"`. They allow any signed-in user to update any column of any row; nothing needs them once voting is gone. The lexicon's update policy is **kept**: the description editing and `lexicon_guard_update` rely on it.
6. Kept as they are: `upvotes` columns, `user_votes` (table, policies), `community_texts.validated`.

### Web

- Delete `web/components/VoteButtons.tsx` and `web/components/PendingContributions.tsx`; remove the section and its imports from `web/app/contribute/page.tsx` (the `Clock` icon and `DialectSelector` imports if they become unused; keep `ContributeRefreshProvider` only if the form still uses `useContributeRefresh`).
- Remove the `▲ n` vote counts: `web/app/forum/page.tsx`, `web/app/forum/[id]/page.tsx` (threads, posts, and the `InteractionCounter` of the JSON-LD), `web/app/grammar/page.tsx`, `web/app/resources/page.tsx`.
- Ordering: `web/app/grammar/page.tsx` and `web/lib/community.ts` stop ordering by `upvotes`; they order by `created_at` descending.
- Hero text of `/contribute`: « Vos contributions sont immédiatement disponibles. » in place of « Les contributions avec 3 votes sont intégrées au traducteur. ». The level progress card is unchanged (it counts validated contributions, which now means all of them); its text « contribution(s) validée(s) » stays.
- `web/lib/types.ts` keeps `upvotes` on the interfaces (the columns still exist) so no unrelated code breaks.

### Tests

- SQL (RLS, one file): existing expressions and rules are validated after the migration; a new expression and a new rule are validated by default; `vote` and `increment_upvotes` no longer exist; `user_votes` still exists; a signed-in user who is not the author can no longer update an expression or a grammar rule; the author insert policy still works; the lexicon description update by a signed-in user still works.
- Update the existing RLS tests that call `vote` / `increment_upvotes` or rely on the "vote" policies (`web/__tests__/rls/function-grants.test.ts`, `lexicon-translations.test.ts`, `resources-community.test.ts`, `corrections.test.ts`, `usage-lines.test.ts` and `lexicon-from-word-links.test.ts` mention votes: read each reference and keep only what still applies).
- Unit: pages no longer render a vote count (static markup of the grammar and resources cards if they have tests); `PendingContributions` and `VoteButtons` have no remaining import (`tsc`).

## Part B: record the pronunciation in the word form

### Behaviour

- In `web/components/ContributionForm.tsx`, word branch, a block « Prononciation (optionnel) » under the example sentence, using `PronunciationRecorder` (10 seconds, « Enregistrer la prononciation »). The recorder does not send anything by itself: the form keeps the recorded blob (state `pronunciation: Blob | null`) and shows a preview with « Recommencer ».
- On submit, after the entry exists (insert, or claim of an untranslated placeholder), the form uploads the blob with `uploadPronunciation(client, { userId, lexiconId, blob })` from `web/lib/lexicon-audio-data.ts`, next to the example-sentence write.
- If the word is saved but the upload fails, the word stays saved and the form shows « Mot enregistré, mais l'enregistrement audio n'a pas pu être envoyé : vous pourrez le refaire depuis la fiche du mot. » (state `audioSaveFailed`, same pattern as `exampleSaveFailed`). A refusal reason from the database (for example 3 recordings already) is appended.
- Only the word branch shows the block; expression and grammar-rule branches are unchanged. The block is cleared with the rest of the form after a successful submit and when the contribution type changes.
- A small pure helper in `web/lib/contribution.ts`, `audioOutcome(result)` → `'none' | 'saved' | 'failed'`, decides what the form tells the user, so the logic is unit tested.

### Tests

- Unit: `audioOutcome`; the word payload builders are unchanged (existing tests keep passing).
- Static markup: the word branch shows « Prononciation (optionnel) » and the recorder start button; the expression and grammar branches do not.
- Manual: real microphone and upload from the form cannot be automated; the plan lists the check and the report says what was not verified.

## Part C: hide the funding UI

- Remove `<Suspense><DonateForm /></Suspense>` and its import from `web/app/page.tsx` (the `Suspense` import only if it becomes unused) and from `web/app/contribute/page.tsx`. On the home page, if `PatternDivider` above it is only a separator for that block, leave it unless it would end the page awkwardly: look at the page and keep the layout clean.
- Untouched: `web/components/DonateForm.tsx`, `web/components/FundingWidget.tsx`, `web/lib/donation.ts`, `/api/donate/checkout`, `/api/donate/webhook`, the `contributions` table. The webhook stays active so a payment started before the deploy is still recorded. Bringing the UI back is two lines.
- Test: static check that the home and contribute page modules no longer import `DonateForm` (a small test reading the two files' source), plus `tsc`/build.

## Rollout

One migration (Part A). Apply it by hand in the SQL editor of project `agdqbzbjcxrzfhkvempe` (it drops policies and triggers; the MCP tool may refuse). Order: apply first, then deploy: the old pages only call `vote` from the pending section, which stays harmless until the new pages replace it, but a vote attempted between the two steps would fail with a missing function, which is acceptable for a few minutes. Parts B and C are web-only.

## Open decisions (defaults chosen, change if you disagree)

1. Existing unvalidated expressions and rules become validated by the migration (they were waiting for votes).
2. The checkout route stays reachable (nothing links to it); say so if it should answer « fonction désactivée ».
3. Grammar rules and resources are ordered newest first.
