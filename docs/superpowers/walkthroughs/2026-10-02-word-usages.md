# Walkthrough: Word Usages in Community Texts

**Date:** 2026-10-02
**Branch:** `feat/word-usages`
**Plan:** `docs/superpowers/plans/2026-10-02-word-usages.md`
**Design Spec:** `docs/superpowers/specs/2026-10-02-word-usages-design.md`
**Corrected:** 2026-10-02, after a review that compared this document with the code, the local database and production. Corrections are listed in section 6.

---

## 1. Overview & Objectives

This feature lets users see where a word (Bété or French) is used across the community corpus:

1. **Cross-corpus usages index.** Aligned lines from four sources:
   - `community_texts` (resources: stories, proverbs, songs…)
   - `lexicon_examples` (the examples attached to a lexicon entry)
   - `expressions` (idiomatic expressions and phrases)
   - `grammar_rules` (the Bété/French example of a rule)
2. **Bété matching** (side `'bete'`):
   - Exact word match on a normalised form (case, accents, tone marks, apostrophes and hyphens are ignored).
   - Spelling variants by trigram similarity (`similarity >= 0.4` by default) for words longer than 3 characters.
   - Very short words (3 characters or fewer): one edit away (`levenshtein <= 1`) and a length within ±1.
   - Latin/IPA bridge, for **one-word queries only**: if the word is the western (`bete_phonetic`) or IPA (`bete_word`) form of a lexicon entry, the entry's other form is searched too.
3. **French matching** (side `'fr'`): same stem, using PostgreSQL's `french_stem` dictionary (`ts_lexize`), so plurals, conjugations and feminine endings match. French matches count as exact.
4. **Multi-word queries:** up to 6 words; **every** word must appear on the same line.
5. **UI:** a usages block on lexicon pages, a per-word usages page with "Charger plus", and a free-text search page.

---

## 2. Key Changes & Architecture

### Database migrations (`supabase/migrations/`)

- **`20261003000000_word_usages.sql`**
  - Extensions: `fuzzystrmatch` and `pg_trgm`. It also depends on `search_norm()`, defined in `20261002000000_search_lexicon_index.sql`.
  - Tables:
    - `usage_lines` (`source_type` in `resource | example | expression | grammar`, `source_id`, `ref_id`, `line_no`, `bete`, `literal`, `french`, `dialect`, `title`, `created_at`; unique on `(source_type, source_id, line_no)`).
    - `usage_tokens` (`line_id`, `side` in **`'bete' | 'fr'`**, `token`, `token_norm`, `token_stem` for French).
  - Indexes on `usage_tokens`: by line, by `(side, token_norm)`, a partial one on `(side, token_stem)` for French, by `(side, char_length(token_norm))`, and a partial trigram GIN index on `token_norm` for the Bété side.
  - **Access:** both tables have a single public `SELECT` policy and **no** insert, update or delete policy. Only the security-definer functions below write. Execute on `usage_add_line` and `rebuild_usage_lines` is revoked from `public`, `anon` and `authenticated`.
  - Helper functions:
    - `usage_token_norm(text)`: folds case, accents and tone marks; drops apostrophes and hyphens.
    - `usage_tokenize(text, side)`: splits into words. Bété keeps apostrophes inside a word; French also splits on apostrophes (`l'été` → `l`, `été`) and adds a stem.
    - `usage_split(text)`: stanzas (blank-line separated) and lines, using the same rules as `web/lib/verses.ts`.
    - `usage_same_shape(a, b)`: same stanza count and same line count in every stanza.
    - `usage_add_line(...)`: writes one line and its tokens.
    - `rebuild_usage_lines(type, id)`: deletes and recreates the lines of one source row.
  - How a **resource** becomes lines: a single-line text is one line (`line_no = 0`) with its translations joined; a multi-line text is indexed line by line. Each translation (mot à mot, French) is attached **on its own** when it has the same stanza and line shape as the Bété text; one that does not line up is left out without affecting the other (migration `20261003000002`). The dialect is derived from the region: `Guiberoua` → `western`, `Gagnoa` → `northern`, `Daloa` → `eastern`, anything else → null. It is stored but not used for filtering yet.
  - Triggers (`usage_sync`, calling the security-definer `usage_sync_trigger`), each also firing on delete:
    - on `community_texts`: insert, or update of `title`, `region`, `content_bete`, `content_literal`, `content_french`;
    - on `lexicon_examples`: `lexicon_id`, `bete_snippet`, `french_snippet`, `french_literal`, `dialect`;
    - on `expressions`: `bete_phrase`, `bete_phonetic`, `french_phrase`, `french_literal`, `type`;
    - on `grammar_rules`: `example_bete`, `example_french`, `example_bete_phonetic`.
  - An initial backfill rebuilds every existing row of the four sources.

- **`20261003000001_find_usages.sql`**
  - `find_usages(q text, p_side text default 'bete', p_limit int default 5, p_offset int default 0, p_threshold real default 0.4)`.
  - `language sql stable`, security **invoker**, `search_path = public, extensions`; execute granted to `anon` and `authenticated`.
  - The function sets `pg_trgm.similarity_threshold = '0.3'` so the trigram index returns candidates, then applies the caller's `p_threshold`.
  - The query is cleaned of `%`, `_` and `\` (harmless: no `LIKE` is used), reduced to at most 6 words, and `p_limit` is clamped to 1–50. An unknown side returns nothing.
  - Returns: `line_id, source_type, source_id, ref_id, line_no, title, dialect, bete, literal, french, created_at, match_kind ('exact' | 'variant'), matched_tokens, similarity, total_count`.
  - Order: exact matches first, then by similarity, then newest first.

- **`20261003000002_usage_translations_aligned_independently.sql`** (added after the review)
  - Replaces `rebuild_usage_lines` (grants unchanged) so a resource's mot à mot and French translation are judged separately: each is attached when it has the Bété text's shape, whatever the other one does. Only the resource branch changed.
  - Re-indexes the existing resources (idempotent).

- **`20261003000004_find_usages_exclude_own_examples.sql`** (added after the review)
  - `find_usages` gains an optional sixth argument, `p_exclude_ref uuid default null`. When it is the id of a lexicon entry, that entry's own examples are left out of the results **and of `total_count`**; resources, other entries' examples and the other sources are never hidden.
  - The old 5-argument function is dropped first (adding a parameter with `create or replace` would leave both versions and the API could not choose between them). Calls that pass 5 arguments keep working through the default. Grants are re-applied to `anon` and `authenticated`. Re-run safe.

### Client helpers (`web/lib/usages.ts`)

- Types: `UsageSide = 'bete' | 'fr'`, `UsageSourceType`, `UsageRow`.
- `normalizeSide(value)`: `'fr'` stays `'fr'`, anything else becomes `'bete'`.
- `findUsages(client, { q, side, limit, offset, excludeRef })`: typed wrapper around the RPC; returns `{ rows, total, error }`. The threshold is left at its default. `excludeRef` is sent as `p_exclude_ref` only when given.
- `splitHighlight(text, tokens, side = 'bete')`: pure parser returning `{ text, match }` parts, whole words only, no regex lookbehind (Safari 16.1). `side` decides whether an apostrophe separates words: not for Bété (it stays inside the word), yes for French (`l'été` → `l`, `été`), matching `usage_tokenize`.
- `usageSourceLabel(row)`: a resource shows its title (or "Ressource"); an example shows "Exemple"; an expression shows "Expression idiomatique", "Expression figée" or "Proverbe" by type (else "Expression"); a grammar rule shows "Règle de grammaire".
- `usageHref(row)`: `/resources/{ref_id}` for a resource, `/lexicon/{ref_id}` for an example, `null` for expressions and grammar rules.

### UI components and routes (`web/components/`, `web/app/`)

- **`UsageCard.tsx`**: shows the Bété line, the mot à mot in italics and the French line. Matched words are wrapped in `<mark className="rounded bg-primary/15 px-0.5 text-foreground">`; the Bété line is highlighted for a Bété search and the French line for a French search. A variant match shows a badge `variante : <words>`. The source label links to the source when there is a page.
- **`UsageList.tsx`** (client): "Charger plus" pagination, with "Chargement…" while loading and an error message. It renders nothing when there are no rows; the pages show the empty state. No skeletons.
- **`/usages`**: GET form with the word (`q`, cut at 100 characters) and a language select (`side`: Bhété / Français). 20 results per page. **There is no dialect filter.** Not indexed by search engines. On the French side a note explains that only resources whose text and translation have the same number of lines are found.
- **`/lexicon/[id]`**: a "Usages" section with the first 5 usages of the entry's headword (the western form, else the IPA form), and a "Voir tous les usages (N) →" link when there are more. The entry's own examples are left out, since the "Exemples" section above already lists them.
- **`/lexicon/[id]/usages`**: all usages of that headword, 20 per page, not indexed. It searches **one** form (western, else IPA); the other form is reached through the lexicon bridge in the SQL. It leaves out the entry's own examples too (and `UsageList` passes the same rule to every "Charger plus" request), so its list matches the count on the entry page.
- **`/lexicon`**: when a dictionary search has no results, a link "Voir des usages de « … » dans les textes →".

---

## 3. Verification & Testing

**Reported by the author (not re-run in the review):** `npm run build`, the deletion audit, and the full RLS suite (13 files, 150 tests).

**Re-checked on 2026-10-02:**

1. **Unit tests (`npm test`):** 22 files, 203 tests pass. `web/__tests__/usages.test.ts` has 17 (4 added for French highlighting, 1 for `excludeRef`).
2. **RLS test files:** `usage-lines.test.ts` has 18 tests (the old "pairs nothing when the fields do not line up" case, which asserted the lossy behaviour, became four cases); `find-usages.test.ts` has 25 (17 cases plus an 8-case parameterised one; 5 cover leaving out an entry's own examples). The full RLS suite passes against the local database: 13 files, 158 tests.
3. **TypeScript and lint:** `npx tsc --noEmit` reports 0 errors; `npx eslint` is clean on `lib/usages.ts`, the card component and the two test files.
4. **Behaviour confirmed before the fix, in a rolled-back local experiment:**
   - A 3-line resource with a 2-line mot à mot and a 3-line French text produced lines with **no French at all**, and French search did not find it. The same text without a mot à mot kept the French on every line.
   - The French tokenizer stores `Voici l'été de l'eau` as `Voici, l, été, de, l, eau`, while `splitHighlight("Voici l'été", ['été'])` highlighted nothing.
5. **The fixes were checked red-then-green:** the three new RLS cases that exercise the mot-à-mot bug failed before the migration was applied and pass after it; the four exclusion cases that use `p_exclude_ref` failed against the old function and pass after `20261003000004`; the French highlighting cases are covered by unit tests.
6. **The duplicate was confirmed before the fix**, in a rolled-back local experiment: a lexicon entry's own example appeared both in its "Exemples" list and in the usages returned for its headword.

---

## 4. Remote Production Deployment & Verification

Applied to the production project (`agdqbzbjcxrzfhkvempe`) through the Supabase tool. The migration history records them as:

| History entry | Repository file |
|---|---|
| `20261002085129_word_usages` | `20261003000000_word_usages.sql` |
| `20261002085145_find_usages` | `20261003000001_find_usages.sql` |

`20261003000002_usage_translations_aligned_independently.sql` and `20261003000004_find_usages_exclude_own_examples.sql` were added after this deployment (see "Fixed after the review") and are applied separately.

Checked on production on 2026-10-02, before `20261003000004`:
- `find_usages` has the signature `(q text, p_side text, p_limit integer, p_offset integer, p_threshold real)` and is executable by `anon` and `authenticated`. (`20261003000004` adds a sixth argument.)
- `rebuild_usage_lines` is security definer and **not** executable by `anon` or `authenticated`.
- `usage_lines` and `usage_tokens` each have only a public `SELECT` policy.
- The index is small: 2 lines (both from resources) and 19 tokens. No example, expression or grammar line is indexed yet.
- Statement timeouts are `anon` = 3 s and `authenticated` = 8 s, which bound any runaway query.

The original verification query still applies:

```sql
select * from find_usages('test', 'bete', 5, 0, 0.4);
```

---

## 5. Known Limitations

1. **Cost per lexicon page view.** `find_usages` runs on every view of `/lexicon/[id]`, uncached, on pages that are public and listed in the sitemap. Measured on a synthetic corpus of 50,000 lines (550,000 tokens): about 60–130 ms warm, and one cold run reached 733 ms for the most common word; the cost grows with the number of matching lines (the total count scans them all). The index is tiny today (2 lines), and the 3 s anonymous timeout leaves a wide margin. Worth a cache or a lazy-loaded section at much larger scale.
2. **Unvalidated expressions and grammar rules would be indexed.** The sync ignores their `validated` flag, whereas the translator and the grammar page filter on it. This adds no new exposure: `expressions`, `grammar_rules` and `lexicon_examples` are already publicly readable. Nothing is indexed from those tables yet.
3. **No dialect filtering.** The dialect is stored on each line but no parameter or UI uses it.

### Fixed after the review (2026-10-02)

- **A mismatched mot à mot no longer drops the French** (and the other way round): each translation is attached on its own (`20261003000002`). A French search now finds a resource whose mot à mot is misaligned.
- **French words after an apostrophe are now highlighted** (`l'été`, `d'eau`, `qu'il`): `splitHighlight` splits French on apostrophes like the SQL tokenizer.
- **A lexicon entry's own examples no longer appear twice**: `find_usages` takes `p_exclude_ref`, and both lexicon pages pass the entry's id (`20261003000004`). The excluded lines are not counted either, so the "Voir tous les usages (N)" link matches the list.

---

## 6. Corrections to the first version of this document

| First version said | Actual |
|---|---|
| Token side is `'french'` | `'fr'` (database, RPC and client agree) |
| `find_usages(q, side, dialect, lim, off)` | `find_usages(q, p_side, p_limit, p_offset, p_threshold)`; no dialect parameter |
| "Side and dialect support" on `/usages` | Side only; there is no dialect filter |
| Triggers on `lexicon` | Triggers on `lexicon_examples` (plus `community_texts`, `expressions`, `grammar_rules`) |
| `usage_lines` writes restricted "to authenticated users" | No write policy at all: only the security-definer sync functions write |
| French stems via `to_tsquery('french', …)` | Stems stored with `ts_lexize('french_stem', …)` and compared by equality |
| Latin/IPA bridge for any Bété query | One-word Bété queries only |
| `splitHighlight` returns `{ text, highlight }` | Returns `{ text, match }` |
| Highlight style `bg-amber-100 text-amber-950 font-medium`; badge `« token »` | `bg-primary/15 px-0.5 text-foreground`; badge `variante : <words>` |
| Source labels "Texte communautaire", "Exemple de dictionnaire", … | A resource shows its title; "Exemple"; "Expression idiomatique / figée" or "Proverbe"; "Règle de grammaire" |
| `UsageList` shows loading skeletons | A "Chargement…" label only |
| Lexicon page section "Exemples d'utilisation" | "Usages" |
| The usages page pre-queries both Latin and IPA forms | Queries one form; the SQL bridge covers the other |
| Verification query `find_usages('test', 'bete', 5, 0, 0.4)` consistent with the described function | Consistent with the deployed function, not with the signature described in the first version |
