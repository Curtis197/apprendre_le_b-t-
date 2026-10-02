# Walkthrough: Word Usages in Community Texts

**Date:** 2026-10-02  
**Branch:** `feat/word-usages`  
**Plan:** `docs/superpowers/plans/2026-10-02-word-usages.md`  
**Design Spec:** `docs/superpowers/specs/2026-10-02-word-usages-design.md`  

---

## 1. Overview & Objectives

This feature enables users to discover and inspect where any word (Bété or French) appears across community texts and linguistic records:
1. **Cross-Corpus Usages Index:** Aggregates aligned text lines from 4 sources:
   - `community_texts` (resources: stories, proverbs, songs, etc.)
   - `lexicon.examples` (in-entry usage examples)
   - `expressions` (idiomatic expressions and phrases)
   - `grammar_rules.examples` (grammar usage examples)
2. **Variant & Phonetic Matching for Bété:**
   - Exact token matches.
   - Trigram similarity (`similarity >= 0.4` for tokens with length > 3) to match spelling variants (tone diacritics, apostrophes, minor spelling differences).
   - Short-word edit distance (`levenshtein <= 1` with length window for tokens with length ≤ 3) to capture short variants without false positives.
   - Lexicon Latin/IPA bridging: cross-references western Latin (`bete_phonetic`) and Bible/IPA (`bete_word`) forms.
3. **Stem Matching for French:**
   - Matches inflected French forms (plurals, verb conjugations, feminine endings) using PostgreSQL's French text search dictionary (`to_tsquery('french', ...)`).
4. **Interactive UI & Exploration:**
   - **Lexicon Detail Page (`/lexicon/[id]`):** Usages section displaying the top 5 occurrences, with a link to view all usages if more exist.
   - **Dedicated Usages View (`/lexicon/[id]/usages`):** Paginated usages page with incremental loading ("Charger plus").
   - **Free-Text Usages Search (`/usages`):** Standalone search page allowing arbitrary word or query lookups across the corpus.
   - **Highlighted Terms:** Exact and variant matched words are highlighted with `<mark>` tags, and variant badges indicate matched spellings.

---

## 2. Key Changes & Architecture

### Database Migrations (`supabase/migrations/`)

- **`20261003000000_word_usages.sql`**:
  - Created tables:
    - `usage_lines`: Stores aligned source lines (`source_type`, `source_id`, `ref_id`, `line_no`, `bete`, `literal`, `french`, `dialect`, `title`). RLS allows public `SELECT` and restricts writes to `authenticated` users / triggers.
    - `usage_tokens`: Stores extracted tokens for each line (`line_id`, `side` ['bete' | 'french'], `token`, `token_norm`, `token_stem`).
  - Implemented helper & normalization functions:
    - `usage_token_norm(text)`: Lowercases, unaccents, normalizes apostrophes/curly quotes, and strips punctuation.
    - `usage_tokenize(text, side)`: Tokenizes input text into individual normalized words and generates French stems where applicable.
    - `usage_split(text)`: Splits multiline text by stanza and line.
    - `usage_same_shape(...)`: Validates whether multi-tier translations share the exact line shape before aligning French/literal lines with Bété.
    - `rebuild_usage_lines(type, id)`: Idempotently extracts and re-tokenizes lines for any source record.
  - Configured automatic triggers on `community_texts`, `lexicon`, `expressions`, and `grammar_rules` to keep `usage_lines` and `usage_tokens` synchronized on `INSERT`, `UPDATE`, and `DELETE`.
  - Performed initial backfill across all existing rows in the 4 source tables.

- **`20261003000001_find_usages.sql`**:
  - Implemented `find_usages(q text, side text, dialect text, lim int, off int)` RPC:
    - Input sanitization: trims query, strips dangerous `%`, `_`, `\` patterns, and limits token length.
    - Bété search branch: matches normalized tokens against exact matches, trigram variants (`similarity >= 0.4`), short-word Levenshtein distances (`<= 1`), and bridged Latin/IPA equivalents from `lexicon`.
    - French search branch: matches normalized exact tokens or French stems (`to_tsquery('french', ...)`).
    - Returns match rank (0 = exact, 1 = variant), matched token, total count, and full line context.
    - Optimized with trigram GIN indexes on `usage_tokens(token_norm gin_trgm_ops)`.

### Business Logic & Client Helpers (`web/lib/`)

- **`usages.ts`**:
  - `findUsages(...)`: Typed wrapper around the `find_usages` RPC handling client parameters and returning `UsageResult`.
  - `splitHighlight(...)`: Pure text parser that identifies matched words (handling word boundaries without regex lookbehind for Safari 16.1+ compatibility) and outputs segments (`{ text, highlight }`).
  - `usageSourceLabel(...)`: Human-readable French labels for source categories ("Texte communautaire", "Exemple de dictionnaire", "Expression", "Règle de grammaire").
  - `usageHref(...)`: Generates direct navigation links to source items.
  - `normalizeSide(...)`: Safely normalizes side parameter to `'bete'` or `'french'`.

### UI Components & Routes (`web/components/` & `web/app/`)

- **`UsageCard.tsx`**:
  - Server-compatible card displaying Bété text, French translation, and literal/mot-à-mot translation when available.
  - Highlights matched terms with styling (`bg-amber-100 text-amber-950 font-medium px-0.5 rounded`).
  - Displays a variant badge (`« token »`) when a variant or stem matched rather than the exact query.
  - Links to the source resource or entry.
- **`UsageList.tsx`**:
  - Client component managing incremental pagination ("Charger plus").
  - Displays loading skeletons and empty/error states in French.
- **`app/usages/page.tsx`**:
  - Free-text search page with GET form and search input.
  - Dynamic result list with side and dialect support.
- **`app/lexicon/[id]/usages/page.tsx`**:
  - Dedicated usages page for a specific lexicon word with breadcrumbs back to the lexicon entry.
  - Pre-queries both Latin and Bible/IPA forms.
- **`app/lexicon/[id]/page.tsx`**:
  - Added an integrated "Exemples d'utilisation" section on the lexicon detail page.
  - Displays up to 5 usages with a "Voir toutes les utilisations (N) →" link if more are available.
- **`app/lexicon/page.tsx`**:
  - Added a contextual link to `/usages` when a dictionary search returns no entries.

---

## 3. Verification & Testing

1. **Unit Tests (`npm test`):**
   - 22 test files, 198 tests passed.
   - Added `web/__tests__/usages.test.ts` (12 tests) verifying `splitHighlight` with exact matches, accents, diacritics, and punctuation, `usageSourceLabel`, `usageHref`, and error handling.

2. **Database & RLS Integration Tests (`npm run test:rls`):**
   - 13 test files, 150 tests passed.
   - `web/__tests__/rls/usage-lines.test.ts` (15 tests): verifies triggers, cascading deletes, multi-tier shape alignment, and RLS policies on `usage_lines` and `usage_tokens`.
   - `web/__tests__/rls/find-usages.test.ts` (20 tests): verifies exact matching, Bété trigram variant matching, short-word edit distance, French stemming, Latin/IPA bridging, pagination, and punctuation safety.

3. **TypeScript & Static Analysis:**
   - `npx tsc --noEmit`: 0 errors.
   - `npx eslint`: 0 errors/warnings on all created and modified files.

4. **Production Build (`npm run build`):**
   - Successfully compiled and built all static and dynamic routes, including `/usages` and `/lexicon/[id]/usages`.

5. **Deletion & Preservation Audit:**
   - Verified with `git diff --name-status master...HEAD`: 0 unintended deletions across the entire repository.

---

## 4. Production Deployment Checklist

When deploying to remote Supabase (`agdqbzbjcxrzfhkvempe`), execute the migrations via the Supabase MCP:
1. Apply `supabase/migrations/20261003000000_word_usages.sql` (Creates `usage_lines`, `usage_tokens`, triggers, and backfills data).
2. Apply `supabase/migrations/20261003000001_find_usages.sql` (Creates `find_usages` RPC and trigram GIN indexes).
