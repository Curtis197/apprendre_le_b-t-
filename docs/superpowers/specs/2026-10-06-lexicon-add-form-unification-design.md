# Lexicon add form: one picker for resources and contributions

Date: 2026-10-06. Status: design approved in conversation, awaiting written-spec review.

## Problem

Two forms add a lexicon word and they have diverged.

- **Resource flow** (`components/word-link/LexiconPanel.tsx`, `EntryForm.tsx`): searches existing entries first (`find_lexicon_candidates`), then creates through the `create_lexicon_entry` RPC. Fields: several senses with context, synonyms, lemma, notes, optional category, description, optional example sentence.
- **Contribution flow** (`components/ContributionForm.tsx`, "Mot du lexique" tab): a direct insert into `lexicon`, one French meaning, a forced part of speech, no candidate search (only the `SimilarWords` hint), plus a pronunciation recorder and a placeholder-claim path (`?id=`).

Consequences: two sets of validation rules, a weaker contribution flow, and an RPC collision (`existed: true`) that the resource flow handles silently: the user's extra input is dropped and the block links to the existing entry without a word of explanation.

## Decisions

1. **Placeholders are gone.** Nothing in the code creates a `_pending_` row (the lexicon was emptied on 2026-10-04). The `?id=` claim path is removed from the contribution form. The `lexicon_guard_update` placeholder clause is left in place, with no migration in this change.
2. **One save path.** The contribution word tab saves through `create_lexicon_entry`, like the resource flow.
3. **The contribution flow searches first.** Same matching as the resource panel (exact, variant, near).
4. **Shared component (approach A).** The "search, then pick an existing entry or create a new one" part of `LexiconPanel` is extracted into a picker with no resource logic in it.
5. **Collisions are reported, not merged.** No RPC change.

## Design

### Shared picker

- Input: the typed spelling, the dialect and the entry kind (`word` or `marker`; `/contribute` always passes `word`). The kind only filters candidates and selects the `EntryForm` variant.
- Uses `findCandidates` and `createEntry` from `lib/lexicon-links-data.ts`, and `EntryForm` as it is.
- Output, as callbacks: `chose existing entry X` (with the chosen sense or a new one) and `created entry X`. A collision is reported as `chose existing entry X` plus a `notice`.
- It does not know about blocks, verses or markers. Those stay with `LexiconPanel`, which keeps the resource-specific parts: linking to a block, using the verse as the example, marker kind, the fast create, the linked view.

### Resource panel

- Uses the picker for the choose and create modes. Behaviour is unchanged except for the collision notice.
- On a collision it still links the block to the existing entry, then shows the notice once in the linked view.

### Contribution form (word tab)

- The inline fields are replaced by the picker. The expression and grammar-rule tabs are untouched.
- Choosing an existing entry opens `/lexicon/[id]`, which already lets people add a sense, a spelling and a pronunciation. No new actions are built.
- Creating an entry keeps the "Contribution envoyée" screen and "Ajouter une autre". The pronunciation recorder stays and uploads after creation, as today. An upload failure keeps the existing message.

### Collisions (`existed: true`)

- Existing entry of the other kind: the current error message stays.
- Otherwise: notice "Cette entrée existe déjà, vos informations n'ont pas été ajoutées. Ouvrez sa fiche pour ajouter un sens ou une graphie."
- `/contribute` shows the notice with a link to `/lexicon/[id]` and does not show "Contribution envoyée".
- Not doing: merging the new senses into the existing entry.

### Removed

- The `?id=` claim in `ContributionForm.tsx`, `buildWordClaimPayload`, `WORD_ALREADY_CLAIMED` and its message in `lib/contribution.ts`, and their tests.
- `buildWordPayload` if nothing else uses it once the word tab uses the RPC (grep before deleting).

### Out of scope, recorded as follow-ups

- The RPC dedupes on `(bete_word, dialect)`, where `bete_word` is the IPA form when given, not the Latin spelling. Two contributors giving different IPA for the same Latin spelling get two entries. Candidate search catches this in normal use.
- `p_pos` is not validated on the server. The form restricts it to a list.
- Removing the dead placeholder clause from `lexicon_guard_update`.

## Tests

- Picker: collision notice, other-kind error, existing-entry and created events (beside the existing resource-step tests).
- `__tests__/contribution.test.ts` and `__tests__/contribution-pronunciation.test.tsx`: updated for the new word tab. The recorder uploads after creation; an upload failure still shows its message.
- `__tests__/rls/lexicon-from-word-links.test.ts`: add a case for the `existed` path if it is not covered.
- No test for the claim path, since it is removed.

## Constraints

- Safari 16.1 compatibility applies to any new component (no features beyond what the existing components already use).
- Work happens in the main folder on `master`, no new branch or worktree, per the project's branches policy.
