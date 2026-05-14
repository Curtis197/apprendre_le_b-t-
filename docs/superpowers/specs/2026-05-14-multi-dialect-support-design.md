# Multi-Dialect Bété Support

**Date:** 2026-05-14
**Status:** Approved

## Overview

Extend the pipeline and web UI to support all three Bété dialects:

| Dialect | Region | bible_id | version |
|---------|--------|----------|---------|
| Western (`western`) | Guiberoua | 3284 | BET |
| Northern (`northern`) | Gagnoa | 3837 | BTG |
| Eastern (`eastern`) | Daloa | 4606 | BNT96 |

Each dialect gets its own full pipeline run (scrape → align → lexicon → vectorize → examples) producing independent lexicon entries tagged by dialect. The web UI adds a dialect selector on all four main pages.

## 1. Dialect Registry & Config

`pipeline/config.py` gains a `DIALECTS` dict as the single source of truth:

```python
DIALECTS = {
    "western":  {"bible_id": 3284, "version": "BET",   "name": "Bété Occidental (Guiberoua)"},
    "northern": {"bible_id": 3837, "version": "BTG",   "name": "Bété Septentrional (Gagnoa)"},
    "eastern":  {"bible_id": 4606, "version": "BNT96", "name": "Bété Oriental (Daloa)"},
}
```

Existing constants (`BETE_BIBLE_ID`, `BETE_VERSION`) are derived from `DIALECTS["western"]` for backward compatibility.

Corpus paths become per-dialect:
- `corpus/western/nt_parallel.jsonl`
- `corpus/northern/nt_parallel.jsonl`
- `corpus/eastern/nt_parallel.jsonl`

(And equivalently for `french.txt`, `bete.txt`, `forward.align`, `reverse.align`, `alignments.jsonl`.)

## 2. Database Schema

One new migration (`20260514000001_add_dialect.sql`) adds `dialect text NOT NULL DEFAULT 'western'` to four tables and updates their unique constraints:

**Tables updated:** `verses`, `lexicon`, `alignments`, `lexicon_examples`

```sql
ALTER TABLE verses  ADD COLUMN dialect text NOT NULL DEFAULT 'western';
ALTER TABLE lexicon ADD COLUMN dialect text NOT NULL DEFAULT 'western';
ALTER TABLE alignments ADD COLUMN dialect text NOT NULL DEFAULT 'western';
ALTER TABLE lexicon_examples ADD COLUMN dialect text NOT NULL DEFAULT 'western';

ALTER TABLE verses  DROP CONSTRAINT verses_book_chapter_verse_key;
ALTER TABLE verses  ADD CONSTRAINT verses_book_chapter_verse_dialect_key
  UNIQUE (book, chapter, verse, dialect);

ALTER TABLE lexicon DROP CONSTRAINT lexicon_bete_word_key;
ALTER TABLE lexicon ADD CONSTRAINT lexicon_bete_word_dialect_key
  UNIQUE (bete_word, dialect);
```

Existing rows are automatically backfilled as `'western'` via the column default. `grammar_rules` and `expressions` are user-contributed and not dialect-scoped — untouched.

## 3. Pipeline Changes

### 3a. Per-script parameterization

Every pipeline script (`scraper.py`, `prepare_corpus.py`, `align.py`, `bootstrap_lexicon.py`, `vectorize.py`, `populate_examples.py`, `tag_pos.py`, `mine_grammar.py`, `apply_feedback.py`) gains a `--dialect` CLI argument that:
- Selects `bible_id` and `version` from `DIALECTS`
- Resolves corpus paths under `corpus/<dialect>/`
- Tags all DB writes with `dialect=<dialect>`

### 3b. Orchestrator entry point

New file `pipeline/run_dialect.py` runs the full sequence for one dialect:

```
python -m pipeline.run_dialect --dialect northern
```

Steps in order:
1. Scrape Bible.com → `corpus/northern/nt_parallel.jsonl`
2. Prepare corpus → `corpus/northern/french.txt`, `bete.txt`
3. Align (eflomal) → `corpus/northern/forward.align`, `reverse.align`, `alignments.jsonl`
4. Bootstrap lexicon → upsert into `lexicon` with `dialect='northern'`
5. Vectorize → embed northern lexicon entries
6. Populate examples → link to northern verses

Each step has resume support: it checks whether its output already exists before re-running, matching the existing scraper pattern.

Running `--dialect western` is equivalent to the current pipeline — no breaking change.

## 4. Web UI Dialect Selector

### 4a. DialectContext

A new React context (`web/context/DialectContext.tsx`) holds the active dialect string. It defaults to `'western'` and persists the selection in `localStorage`.

### 4b. DialectSelector component

A dropdown/tab-strip component (`web/components/DialectSelector.tsx`) renders the three dialect names from the registry. It is placed in the shared sub-nav on the four affected pages.

### 4c. Affected pages

| Page | Change |
|------|--------|
| Translator | Append `dialect` to lexicon context query; pass dialect to AI translation API route |
| Lexicon | Filter all queries with `.eq('dialect', selectedDialect)` |
| Grammar | Filter grammar rule examples by dialect |
| Contribute | Tag new submissions with the selected dialect |

### 4d. API routes

Translation API routes that query `lexicon` or `verses` receive the dialect as a parameter and filter accordingly.

## 5. Error Handling

- If a chapter returns 0 verses for a dialect (dialect Bible may have gaps), the scraper logs a warning and continues — same as the existing timeout handling.
- If `DIALECTS[dialect]` is not found, pipeline scripts exit with a clear error message listing valid dialect keys.

## 6. Testing

- Extend `tests/test_scraper.py` to mock scraping for `northern` and `eastern` and verify verse pairs are tagged with the correct dialect.
- Extend `tests/test_bootstrap_lexicon.py` to verify lexicon entries carry the dialect field.
- Manual smoke test: run `--dialect northern` on a single NT book (e.g. `MAT`) end-to-end before running all 27 books.
