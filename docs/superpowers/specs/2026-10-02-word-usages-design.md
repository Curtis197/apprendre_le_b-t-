# Word usages: list where a word is used, with spelling-variant matching

Date: 2026-10-02

## Goal

For any word typed or opened, list where it is used in the community's texts: 5 examples by default, every usage on request. Bété spelling is not fixed in the Latin alphabet, so a search also finds spelling variants. The same works from the French side. The result is better contextualization today, and a clean per-line store that embeddings can attach to later.

## Decisions (agreed)

- Sources are **community content only**: resources (`community_texts`), `lexicon_examples`, `expressions`, and the example fields of `grammar_rules`. The NT corpus stays out of the database.
- Variant matching is **pure fuzzy similarity**, no phonetic or orthographic rule table (contributors do not know the phonetic alphabet). Accent/case folding and the lexicon's own Latin/IPA pairing are the only "knowledge" used.
- Entry points: a "Usages" section on the word page, and a free-text page (the lexicon has only 2 translated words today, so word-page-only would almost never fire).

## Data model (one migration)

### `usage_lines`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| source_type | text not null | check in `('resource','example','expression','grammar')` |
| source_id | uuid not null | id in the source table (no FK: four tables) |
| ref_id | uuid null | page the usage links to: the resource id for a resource, the lexicon entry id for a lexicon example, null otherwise |
| line_no | int not null | 0-based order inside the source |
| bete | text not null | the Bété line, as written |
| literal | text null | word-for-word (mot à mot) line |
| french | text null | French line |
| dialect | text null | `western`/`northern`/`eastern`; resources map region Guiberoua→western, Gagnoa→northern, Daloa→eastern, Autre→null |
| title | text null | source label shown in the UI (resource title, "Exemple", expression type) |
| created_at | timestamptz | |

Unique `(source_type, source_id, line_no)`. RLS: select for everyone, **no** client insert/update/delete (only the sync functions write).

### `usage_tokens`
`line_id` (FK `usage_lines`, on delete cascade), `side` (`'bete'` or `'fr'`), `token` (raw word), `token_norm` (`search_norm(token)` with combining marks, apostrophes and hyphens removed), `token_stem` (French side only: the `french_stem` stem of `token_norm`, falling back to `token_norm` for stop words). Indexes: trigram GIN on `token_norm` for Bété tokens (operator class resolved through the search path, as in migration `20261002000000_search_lexicon_index.sql`), btree on `(side, token_norm)`, btree on `(side, token_stem)` for French, btree on `(side, char_length(token_norm))` for short-word edit distance. Same RLS as `usage_lines`. `fuzzystrmatch` (`levenshtein`) is installed by the migration; it is available but not yet installed in production or locally.

### Sync
`security definer` function `rebuild_usage_lines(p_type, p_id)` deletes the source's lines (tokens cascade) and rebuilds them. After-insert/update/delete triggers on the four source tables call it (delete just removes). Source mapping:

- **resource** (`community_texts`): split `content_bete` into lines; if every provided translation field has exactly the same stanza/line shape, pair them by position, otherwise store the Bété lines with `literal`/`french` null (so a misaligned resource is searchable from Bété only, not from French). This mirrors the line-by-line case of `web/lib/verses.ts` `alignVerses` (stanzas split on blank lines, lines trimmed, empty lines dropped). A resource with a single line is a single usage; unlike `alignVerses` it is not split into sentences, so a one-line paragraph is one long usage.
- **example** (`lexicon_examples`): one line (`bete_snippet`, `french_literal`, `french_snippet`).
- **expression** (`expressions`): one line (`bete_phrase`, `french_literal`, `french_phrase`); the written Latin form `bete_phonetic` is indexed as extra Bété tokens of the same line.
- **grammar** (`grammar_rules`): one line when `example_bete` is set (`example_bete`, `example_french`); `example_bete_phonetic` indexed as extra tokens.

Tokenisation: lower-case, split on whitespace and punctuation except apostrophes inside a word; `token_norm` also drops apostrophes and hyphens so `'wa`, `wa` and `ʼwa` meet.

A one-time backfill rebuilds every existing source row. Idempotent.

## Search

`find_usages(q text, p_side text default 'bete', p_limit int default 5, p_offset int default 0, p_threshold real default 0.4)` (stable, anon+authenticated may execute; `p_limit` capped at 50):

Returns one row per matching line: line columns, `source_type`, `source_id`, `ref_id`, `match_kind` (`'exact'` when every query word matched exactly, else `'variant'`), `matched_tokens` (the raw tokens to highlight, one per query word), `similarity` (lowest per-word similarity; 1 for exact), `total_count`. A query of several words matches lines that contain **all** of them; only a single-word query is widened by the lexicon bridge.

- **Bété side:**
  - Query normalised with `search_norm`, apostrophes/hyphens removed.
  - **Lexicon bridge:** if the normalised query equals the normalised `bete_phonetic` or `bete_word` of a lexicon entry, that entry's other form joins the query (Latin ↔ IPA), and counts as exact.
  - A token matches exactly on equal `token_norm`; otherwise as a variant when `similarity(token_norm, q) >= p_threshold` (pg_trgm: candidates come from the index-backed `%` operator at a fixed 0.3 floor, then are filtered by `p_threshold`). For queries of 3 characters or fewer, trigrams are useless: use edit distance <= 1 (`levenshtein`, from `fuzzystrmatch`) restricted by length.
  - Ranking: exact before variant, then similarity, then newest source. One row per line (best token).
- **French side:** stemmed full-text (`french` config over accent-folded text) match on `usage_lines.french`; Tokens are compared by `token_stem`; `matched_tokens` are the matching words of the line. No fuzzy matching; `match_kind` is always `exact`.
- Blank query returns nothing; the query is never interpreted as a pattern.

## UI

- **`/lexicon/[id]` "Usages" section** (server fetch via the RPC, `p_limit = 5`, using the word's Latin and IPA forms): usage cards plus "Voir tous les usages ({total})" linking to `/lexicon/[id]/usages`. Hidden when there is no usage.
- **`/lexicon/[id]/usages`:** all usages, 20 per page with "Charger plus" (client fetch with offset).
- **`/usages?q=…&side=bete|fr`:** free-text page with a search box and a Bété/Français toggle, same cards and pagination. The empty state of the `/lexicon` search links here ("Voir des usages de « … »").
- **Usage card:** the Bété line with the matched token highlighted (`<mark>`), mot à mot and French lines (reusing `InterlinearGloss` when it fits), a source badge (Chanson, Proverbe, Exemple, Expression…) linking to the resource page when `source_type = 'resource'`, and a "variante : {matched_tokens}" tag when `match_kind = 'variant'`.
- French UI copy; no new CSS features beyond existing components (Safari 16.1 floor).

## Limits (stated to users where relevant)
- Fuzzy matching will not link spellings that share almost no letters (e.g. `ɲ` vs `gn`) unless the lexicon holds both forms of the word.
- The threshold needs tuning on real data; it is a parameter with a default, not a constant.

## Out of scope
Computing embeddings (`usage_lines` is where they attach later), cross-language expansion (a French query also finding Bété lines through lexicon translations), loading the NT corpus, declaring or editing variants, normalising stored text.

## Testing
- RLS suite (`npm run test:rls`): sync triggers (insert, edit, delete each of the four sources and check lines/tokens follow; clients cannot write `usage_*`); resource alignment (matching line counts pair, mismatch leaves French null, stanza handling, blank lines dropped).
- `find_usages`: exact vs variant ranking and labels, accent/case insensitivity, apostrophe variants, a `ɓa`/`ba`-style variant, short-word edit distance, the lexicon bridge, French stemming (`mange` finds `manger`), `%`/`_`/`\` literal, blank query, limit cap and offset paging with `total_count`.
- Unit tests for any TypeScript helper (token highlighting, source labels).
- Migration check: backfill leaves every existing source with lines.
