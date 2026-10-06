# Suggest existing words from the French meaning

Date: 2026-10-06. Status: spec, not implemented.

## Problem

When someone adds a lexicon entry, the Bété spelling is checked against existing entries (`find_lexicon_candidates`, shown by `SimilarWords` and the resource `LexiconPanel`), so a variant spelling is added to the existing entry instead of duplicating it. The French side is not checked. The "Mot en français" sense field of `EntryForm` is free text, so two contributors can add the same word with the same meaning under two different spellings and nothing warns them.

Prod today (2026-10-06): 25 entries, 25 translations, 3 spellings, and no French meaning shared by two entries. There is nothing to clean up; this is prevention.

## Decisions

1. **Suggest on the French meaning.** While a French sense is typed, existing entries that already have that meaning are proposed.
2. **Hint plus action.** Each suggestion can be opened, or the typed spelling can be added to it as a variant (the existing `addSpelling`). It never blocks creating a new entry.
3. **Normalised exact match only.** Ignore case, accents, surrounding whitespace and a leading article (le, la, les, l', un, une, des, du, de la). No near or contains matching.
4. **Same dialect only**, like the `SimilarWords` filter. The same French meaning in another dialect is a different form, not a variant.
5. **No cleanup tooling, no change to the translator.**

## Design

### Database (one migration)

- `french_match_norm(text) returns text`, immutable: lowercase, strip accents, collapse and trim whitespace, drop one leading article. Built on the same helper as `usage_token_norm` (wrapped so it is usable in an index).
- Expression index on `lexicon_translations (french_match_norm(french))`.
- `find_lexicon_by_french(p_french text, p_dialect text, p_kind text default 'word', p_limit int default 6)` returns `(matched text, context text, entry jsonb)`: the matched French, its context, and `lexicon_summary(id)`.
  - Empty input, input over 200 characters, or an input that is empty after normalisation returns nothing.
  - Filters on `p_dialect` and `p_kind`, orders by `created_at`.
  - Same security as `find_lexicon_candidates`: security definer, `search_path = public, extensions`, `revoke execute from public`, `grant execute to anon, authenticated`.
- The existing unique index on `lexicon_translations` is unchanged.

### Client

- `findByFrench(client, { text, dialect, kind, limit })` in `lib/lexicon-links-data.ts`, next to `findCandidates`. It returns `[]` on error.
- New `components/word-link/FrenchMatches.tsx`, rendered by `EntryForm` under each sense input:
  - Props: the typed French, the dialect, the spelling currently typed in the form.
  - Searches 400 ms after typing, from 2 characters. Shows up to 3 matches. Results carry the text they were searched for (`forText` guard), so stale results never show for newer text.
  - Each match shows the Bété spelling, the matched French and its context (so homonyms are visible).
  - Actions: **Ouvrir** (link to `/lexicon/[id]`) and **Ajouter « spelling » comme variante** (calls `addSpelling`). The second is disabled while the spelling field is empty or no user is signed in.
  - A dismiss button hides the hint for that text. After adding a variant, a confirmation replaces the hint, as in `SimilarWords`.
  - Any RPC or `addSpelling` failure shows no hint (search) or the existing error message (add).
- `EntryForm` is shared by `/contribute` and the resource panel, so both flows get this without extra wiring.

### Out of scope

- Near and contains matching, other dialects, the translator, and cleanup tooling.

## Tests

- RLS-style test for `find_lexicon_by_french` (beside `search-lexicon.test.ts`): article, accent and case variants match; other dialect is excluded; kind filter; empty and too-long input return nothing; no match returns nothing.
- Component test for `FrenchMatches` (beside `similar-words.test.tsx`): debounce, minimum length, stale results, add-variant disabled without a spelling, dismiss, failure shows nothing.
- `__tests__/migrations.test.ts` stays green with the new migration.

## Constraints

- Safari 16.1 compatibility: no features beyond what the existing components use.
- No new dependencies.
- Work happens in the main folder on `master`, no new branch or worktree, per the project's branches policy.
