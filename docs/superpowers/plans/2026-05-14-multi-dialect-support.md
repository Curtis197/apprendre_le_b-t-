# Multi-Dialect Bété Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the pipeline and web UI to support three Bété dialects (Western/Guiberoua, Northern/Gagnoa, Eastern/Daloa), each with its own full scrape→align→lexicon pipeline and a dialect selector on the Lexicon, Translator, Grammar, and Contribute pages.

**Architecture:** A `DIALECTS` registry in `config.py` is the single source of truth. Every pipeline script gains a `--dialect` CLI arg that resolves corpus paths under `corpus/<dialect>/` and tags all Supabase writes. The web UI stores the selected dialect in a React context (`DialectContext`) backed by `localStorage` and filters Supabase queries with `.eq('dialect', selectedDialect)`.

**Tech Stack:** Python (argparse, asyncio, Playwright), Supabase PostgreSQL, Next.js 15 App Router, React context, TypeScript, Tailwind CSS.

---

## File Map

**Create:**
- `supabase/migrations/20260514000001_add_dialect.sql`
- `pipeline/run_dialect.py`
- `web/lib/dialect.ts`
- `web/context/DialectContext.tsx`
- `web/components/DialectSelector.tsx`
- `tests/test_config_dialect.py`

**Modify:**
- `pipeline/config.py`
- `pipeline/scraper.py`
- `pipeline/prepare_corpus.py`
- `pipeline/align.py`
- `pipeline/bootstrap_lexicon.py`
- `pipeline/vectorize.py`
- `pipeline/populate_examples.py`
- `pipeline/tag_pos.py`
- `tests/test_scraper.py`
- `tests/test_bootstrap_lexicon.py`
- `web/lib/types.ts`
- `web/app/layout.tsx`
- `web/app/lexicon/page.tsx`
- `web/app/translator/page.tsx`
- `web/components/TranslatorInput.tsx`
- `web/app/api/translate/route.ts`
- `web/lib/translator.ts`
- `web/app/grammar/page.tsx`
- `web/app/contribute/page.tsx`

---

## Task 1: Dialect Registry in config.py

**Files:** Modify `pipeline/config.py` · Create `tests/test_config_dialect.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_config_dialect.py
from pipeline.config import DIALECTS, corpus_paths

def test_dialect_keys():
    assert set(DIALECTS.keys()) == {"western", "northern", "eastern"}

def test_dialect_fields():
    for d in DIALECTS.values():
        assert "bible_id" in d and "version" in d and "name" in d

def test_western_values():
    assert DIALECTS["western"]["bible_id"] == 3284
    assert DIALECTS["western"]["version"] == "BET"

def test_northern_values():
    assert DIALECTS["northern"]["bible_id"] == 3837
    assert DIALECTS["northern"]["version"] == "BTG"

def test_eastern_values():
    assert DIALECTS["eastern"]["bible_id"] == 4606
    assert DIALECTS["eastern"]["version"] == "BNT96"

def test_corpus_paths_structure():
    p = corpus_paths("western")
    for key in ("corpus_dir", "parallel_jsonl", "french_txt", "bete_txt",
                "forward_align", "reverse_align", "alignments_jsonl"):
        assert key in p

def test_corpus_paths_northern():
    p = corpus_paths("northern")
    assert p["parallel_jsonl"] == "corpus/northern/nt_parallel.jsonl"

def test_corpus_paths_invalid():
    try:
        corpus_paths("invalid")
        assert False
    except ValueError:
        pass
```

- [ ] **Step 2: Run — expect FAIL**

```
pytest tests/test_config_dialect.py -v
```

- [ ] **Step 3: Replace pipeline/config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()
load_dotenv(".env.local", override=True)

_project_id = os.environ.get("SUPABASE_PROJECT_ID", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", f"https://{_project_id}.supabase.co" if _project_id else "")
SUPABASE_SERVICE_KEY = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
)

DIALECTS: dict[str, dict] = {
    "western":  {"bible_id": 3284, "version": "BET",   "name": "Bété Occidental (Guiberoua)"},
    "northern": {"bible_id": 3837, "version": "BTG",   "name": "Bété Septentrional (Gagnoa)"},
    "eastern":  {"bible_id": 4606, "version": "BNT96", "name": "Bété Oriental (Daloa)"},
}

# Backward-compat constants
BETE_BIBLE_ID = DIALECTS["western"]["bible_id"]
BETE_VERSION  = DIALECTS["western"]["version"]
FRENCH_BIBLE_ID = 93
FRENCH_VERSION  = "LSG"

NT_BOOKS = {
    "MAT": 28, "MRK": 16, "LUK": 24, "JHN": 21,
    "ACT": 28, "ROM": 16, "1CO": 16, "2CO": 13,
    "GAL": 6,  "EPH": 6,  "PHP": 4,  "COL": 4,
    "1TH": 5,  "2TH": 3,  "1TI": 6,  "2TI": 4,
    "TIT": 3,  "PHM": 1,  "HEB": 13, "JAS": 5,
    "1PE": 5,  "2PE": 3,  "1JN": 5,  "2JN": 1,
    "3JN": 1,  "JUD": 1,  "REV": 22,
}

ALIGNMENT_THRESHOLD = 0.1
RATE_LIMIT_SECONDS  = 2
CORPUS_DIR = "corpus"


def corpus_paths(dialect: str) -> dict[str, str]:
    """Return per-dialect corpus file paths. Raises ValueError for unknown dialects."""
    if dialect not in DIALECTS:
        raise ValueError(f"Unknown dialect {dialect!r}. Valid: {list(DIALECTS)}")
    base = f"{CORPUS_DIR}/{dialect}"
    return {
        "corpus_dir":      base,
        "parallel_jsonl":  f"{base}/nt_parallel.jsonl",
        "french_txt":      f"{base}/french.txt",
        "bete_txt":        f"{base}/bete.txt",
        "forward_align":   f"{base}/forward.align",
        "reverse_align":   f"{base}/reverse.align",
        "alignments_jsonl": f"{base}/alignments.jsonl",
    }


# Backward-compat flat constants (western)
_w = corpus_paths("western")
PARALLEL_JSONL   = _w["parallel_jsonl"]
FRENCH_TXT       = _w["french_txt"]
BETE_TXT         = _w["bete_txt"]
FORWARD_ALIGN    = _w["forward_align"]
REVERSE_ALIGN    = _w["reverse_align"]
ALIGNMENTS_JSONL = _w["alignments_jsonl"]
```

- [ ] **Step 4: Run — expect PASS**

```
pytest tests/test_config_dialect.py tests/ -v
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/config.py tests/test_config_dialect.py
git commit -m "feat: dialect registry and corpus_paths() in config"
```

---

## Task 2: DB Migration

**Files:** Create `supabase/migrations/20260514000001_add_dialect.sql`

- [ ] **Step 1: Create the migration**

```sql
-- supabase/migrations/20260514000001_add_dialect.sql
ALTER TABLE verses        ADD COLUMN IF NOT EXISTS dialect text NOT NULL DEFAULT 'western';
ALTER TABLE lexicon       ADD COLUMN IF NOT EXISTS dialect text NOT NULL DEFAULT 'western';
ALTER TABLE alignments    ADD COLUMN IF NOT EXISTS dialect text NOT NULL DEFAULT 'western';
ALTER TABLE lexicon_examples ADD COLUMN IF NOT EXISTS dialect text NOT NULL DEFAULT 'western';

ALTER TABLE verses  DROP CONSTRAINT IF EXISTS verses_book_chapter_verse_key;
ALTER TABLE verses  ADD CONSTRAINT verses_book_chapter_verse_dialect_key
  UNIQUE (book, chapter, verse, dialect);

ALTER TABLE lexicon DROP CONSTRAINT IF EXISTS lexicon_bete_word_key;
ALTER TABLE lexicon ADD CONSTRAINT lexicon_bete_word_dialect_key
  UNIQUE (bete_word, dialect);
```

- [ ] **Step 2: Apply via Supabase MCP or CLI**

Using Supabase MCP (`apply_migration`) or:
```bash
supabase db push
```

- [ ] **Step 3: Verify**

Run in Supabase SQL editor:
```sql
SELECT table_name, column_default
FROM information_schema.columns
WHERE column_name = 'dialect'
  AND table_name IN ('verses','lexicon','alignments','lexicon_examples');
```
Expected: 4 rows, default `'western'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260514000001_add_dialect.sql
git commit -m "feat: add dialect column to verses, lexicon, alignments, lexicon_examples"
```

---

## Task 3: Parameterize scraper.py

**Files:** Modify `pipeline/scraper.py` · Modify `tests/test_scraper.py`

- [ ] **Step 1: Add failing test to tests/test_scraper.py**

```python
def test_merge_verse_pairs_includes_dialect():
    from pipeline.scraper import merge_verse_pairs
    bete = [{"verse": 1, "text": "bete text"}]
    french = [{"verse": 1, "text": "french text"}]
    pairs = merge_verse_pairs("MAT", 1, "northern", bete, french)
    assert pairs[0]["dialect"] == "northern"

def test_merge_verse_pairs_western():
    from pipeline.scraper import merge_verse_pairs
    pairs = merge_verse_pairs("MAT", 1, "western",
                               [{"verse": 1, "text": "a"}], [{"verse": 1, "text": "b"}])
    assert pairs[0]["dialect"] == "western"
```

- [ ] **Step 2: Run — expect FAIL**

```
pytest tests/test_scraper.py::test_merge_verse_pairs_includes_dialect -v
```

- [ ] **Step 3: Replace pipeline/scraper.py**

```python
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from pipeline.config import (
    NT_BOOKS, FRENCH_BIBLE_ID, FRENCH_VERSION,
    DIALECTS, corpus_paths, RATE_LIMIT_SECONDS,
)

BIBLE_URL = "https://www.bible.com/bible/{bible_id}/{book}.{chapter}.{version}"


def parse_verses(raw: list[dict]) -> list[dict]:
    return [{"verse": v["verse"], "text": v["text"].strip()} for v in raw]


def merge_verse_pairs(
    book: str, chapter: int, dialect: str,
    bete_verses: list[dict],
    french_verses: list[dict],
) -> list[dict]:
    french_map = {v["verse"]: v["text"] for v in french_verses}
    pairs = []
    for bv in bete_verses:
        fn = french_map.get(bv["verse"])
        if fn is not None:
            pairs.append({
                "book": book, "chapter": chapter, "verse": bv["verse"],
                "dialect": dialect, "bete_text": bv["text"], "french_text": fn,
            })
    return pairs


async def _scrape_chapter(page, book: str, chapter: int, bible_id: int, version: str) -> list[dict]:
    url = BIBLE_URL.format(bible_id=bible_id, book=book, chapter=chapter, version=version)
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_selector("[data-usfm]", timeout=15_000)
    except PlaywrightTimeout:
        print(f"  Timeout: {book} {chapter} {version} — skipping")
        return []
    verses = await page.evaluate("""([book, chapter]) => {
        const prefix = book + '.' + chapter + '.';
        const results = [];
        document.querySelectorAll('[data-usfm]').forEach(el => {
            const usfm = el.getAttribute('data-usfm');
            if (!usfm.startsWith(prefix)) return;
            const parts = usfm.split('.');
            if (parts.length !== 3) return;
            const verseNum = parseInt(parts[2], 10);
            if (isNaN(verseNum)) return;
            const clone = el.cloneNode(true);
            const label = clone.querySelector('.label');
            if (label) label.remove();
            const text = (clone.innerText || clone.textContent || '').trim().replace(/\\s+/g, ' ');
            if (text) results.push({ verse: verseNum, text });
        });
        return results;
    }""", [book, chapter])
    return verses


async def scrape_nt(dialect: str = "western", output_path: str | None = None) -> None:
    """Scrape full NT for the given dialect. Safe to re-run (resumes)."""
    if dialect not in DIALECTS:
        raise ValueError(f"Unknown dialect {dialect!r}. Valid: {list(DIALECTS)}")
    info = DIALECTS[dialect]
    paths = corpus_paths(dialect)
    if output_path is None:
        output_path = paths["parallel_jsonl"]

    Path(paths["corpus_dir"]).mkdir(parents=True, exist_ok=True)

    done: set[tuple[str, int]] = set()
    if Path(output_path).exists():
        with open(output_path, "r", encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                done.add((rec["book"], rec["chapter"]))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Research project — Bété language preservation)"
        )
        page = await context.new_page()
        with open(output_path, "a", encoding="utf-8") as out:
            for book, num_chapters in NT_BOOKS.items():
                for chapter in range(1, num_chapters + 1):
                    if (book, chapter) in done:
                        print(f"  Skip (cached): {book} {chapter}")
                        continue
                    print(f"  Scraping {dialect}/{book} {chapter}...")
                    bete = parse_verses(
                        await _scrape_chapter(page, book, chapter, info["bible_id"], info["version"])
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)
                    french = parse_verses(
                        await _scrape_chapter(page, book, chapter, FRENCH_BIBLE_ID, FRENCH_VERSION)
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)
                    pairs = merge_verse_pairs(book, chapter, dialect, bete, french)
                    for pair in pairs:
                        out.write(json.dumps(pair, ensure_ascii=False) + "\n")
                    out.flush()
                    print(f"    -> {len(pairs)} verse pairs")
        await browser.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    asyncio.run(scrape_nt(dialect=args.dialect))
```

- [ ] **Step 4: Run — expect PASS**

```
pytest tests/test_scraper.py -v
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/scraper.py tests/test_scraper.py
git commit -m "feat: parameterize scraper with --dialect"
```

---

## Task 4: Parameterize prepare_corpus.py and align.py

**Files:** Modify `pipeline/prepare_corpus.py` · Modify `pipeline/align.py`

Both files already accept explicit path kwargs — only their `__main__` blocks need updating.

- [ ] **Step 1: Replace `__main__` block in pipeline/prepare_corpus.py**

```python
if __name__ == "__main__":
    import argparse
    from pipeline.config import DIALECTS, corpus_paths
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    paths = corpus_paths(args.dialect)
    write_aligned_text_files(
        parallel_jsonl=paths["parallel_jsonl"],
        bete_txt=paths["bete_txt"],
        french_txt=paths["french_txt"],
    )
    n = count_lines(paths["bete_txt"])
    assert n == count_lines(paths["french_txt"]), "Line counts do not match!"
    print(f"Wrote {n} aligned sentence pairs.")
```

- [ ] **Step 2: Replace `__main__` block in pipeline/align.py**

```python
if __name__ == "__main__":
    import argparse
    from pipeline.config import DIALECTS, corpus_paths
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    paths = corpus_paths(args.dialect)
    run_alignment(
        french_txt=paths["french_txt"], bete_txt=paths["bete_txt"],
        forward_align=paths["forward_align"], reverse_align=paths["reverse_align"],
    )
    alignments = extract_probabilities(
        french_txt=paths["french_txt"], bete_txt=paths["bete_txt"],
        forward_align=paths["forward_align"],
    )
    save_alignments(alignments, output_path=paths["alignments_jsonl"])
```

- [ ] **Step 3: Run all tests — expect PASS**

```
pytest tests/ -v
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/prepare_corpus.py pipeline/align.py
git commit -m "feat: parameterize prepare_corpus and align with --dialect"
```

---

## Task 5: Parameterize bootstrap_lexicon.py

**Files:** Modify `pipeline/bootstrap_lexicon.py` · Modify `tests/test_bootstrap_lexicon.py`

- [ ] **Step 1: Add failing tests**

```python
# Add to tests/test_bootstrap_lexicon.py
def test_build_lexicon_entries_tagged_with_dialect():
    from pipeline.bootstrap_lexicon import build_lexicon_from_alignments
    alns = [{"bete_word": "n", "french_word": "je", "score": 0.9}]
    entries = build_lexicon_from_alignments(alns, dialect="northern")
    assert entries[0]["dialect"] == "northern"

def test_build_lexicon_entries_default_western():
    from pipeline.bootstrap_lexicon import build_lexicon_from_alignments
    alns = [{"bete_word": "n", "french_word": "je", "score": 0.9}]
    entries = build_lexicon_from_alignments(alns)
    assert entries[0]["dialect"] == "western"
```

- [ ] **Step 2: Run — expect FAIL**

```
pytest tests/test_bootstrap_lexicon.py::test_build_lexicon_entries_tagged_with_dialect -v
```

- [ ] **Step 3: Replace pipeline/bootstrap_lexicon.py**

```python
# pipeline/bootstrap_lexicon.py
import json
from collections import defaultdict
from pipeline.phonetic import to_phonetic


def group_by_bete_word(alignments: list[dict]) -> dict[str, list[dict]]:
    grouped: defaultdict[str, list[dict]] = defaultdict(list)
    for a in alignments:
        grouped[a["bete_word"]].append({"word": a["french_word"], "score": a["score"]})
    for bete_word in grouped:
        grouped[bete_word].sort(key=lambda x: x["score"], reverse=True)
    return dict(grouped)


def build_lexicon_from_alignments(
    alignments: list[dict],
    dialect: str = "western",
) -> list[dict]:
    grouped = group_by_bete_word(alignments)
    entries = []
    for bete_word, candidates in grouped.items():
        top = candidates[0]
        entries.append({
            "bete_word":         bete_word,
            "bete_phonetic":     to_phonetic(bete_word),
            "french_candidates": candidates,
            "top_french":        top["word"],
            "probability":       top["score"],
            "validated":         False,
            "dialect":           dialect,
        })
    entries.sort(key=lambda e: e["bete_word"])
    return entries


def load_verses(client, parallel_jsonl: str | None = None, dialect: str = "western") -> None:
    from pipeline.config import corpus_paths
    if parallel_jsonl is None:
        parallel_jsonl = corpus_paths(dialect)["parallel_jsonl"]
    raw: list[dict] = []
    with open(parallel_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    seen: dict[tuple, dict] = {}
    for rec in raw:
        key = (rec["book"], rec["chapter"], rec["verse"])
        if key in seen:
            seen[key]["bete_text"]   += " " + rec["bete_text"]
            seen[key]["french_text"] += " " + rec["french_text"]
        else:
            entry = dict(rec)
            entry["dialect"] = dialect
            seen[key] = entry
    verses = list(seen.values())

    batch_size = 500
    for i in range(0, len(verses), batch_size):
        batch = verses[i : i + batch_size]
        result = client.table("verses").upsert(
            batch, on_conflict="book,chapter,verse,dialect"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error: {result.error}")
        print(f"  Verses: {min(i + batch_size, len(verses))}/{len(verses)}")


def load_lexicon(client, alignments_jsonl: str | None = None, dialect: str = "western") -> None:
    from pipeline.config import corpus_paths
    if alignments_jsonl is None:
        alignments_jsonl = corpus_paths(dialect)["alignments_jsonl"]
    raw: list[dict] = []
    with open(alignments_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    entries = build_lexicon_from_alignments(raw, dialect=dialect)
    batch_size = 500
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        result = client.table("lexicon").upsert(
            batch, on_conflict="bete_word,dialect"
        ).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error: {result.error}")
        print(f"  Lexicon: {min(i + batch_size, len(entries))}/{len(entries)}")


def load_alignments(client, alignments_jsonl: str | None = None, dialect: str = "western") -> None:
    from pipeline.config import corpus_paths
    if alignments_jsonl is None:
        alignments_jsonl = corpus_paths(dialect)["alignments_jsonl"]
    raw: list[dict] = []
    with open(alignments_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    records = [
        {"bete_word": r["bete_word"], "french_word": r["french_word"],
         "score": r["score"], "dialect": dialect}
        for r in raw
    ]
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        result = client.table("alignments").upsert(batch).execute()
        if getattr(result, "error", None) is not None:
            raise RuntimeError(f"Supabase error: {result.error}")
        print(f"  Alignments: {min(i + batch_size, len(records))}/{len(records)}")


if __name__ == "__main__":
    import argparse
    from supabase import create_client
    from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print(f"Loading verses for {args.dialect}...")
    load_verses(client, dialect=args.dialect)
    print(f"Loading lexicon for {args.dialect}...")
    load_lexicon(client, dialect=args.dialect)
    print(f"Loading alignments for {args.dialect}...")
    load_alignments(client, dialect=args.dialect)
    print("Done.")
```

- [ ] **Step 4: Run — expect PASS**

```
pytest tests/test_bootstrap_lexicon.py -v
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/bootstrap_lexicon.py tests/test_bootstrap_lexicon.py
git commit -m "feat: parameterize bootstrap_lexicon with dialect"
```

---

## Task 6: Parameterize vectorize.py, populate_examples.py, tag_pos.py

**Files:** Modify those three files.

- [ ] **Step 1: Replace vectorize_lexicon in pipeline/vectorize.py**

Add `dialect: str = "western"` parameter. Filter the fetch query:

```python
from sentence_transformers import SentenceTransformer
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
BATCH_SIZE = 128


def vectorize_lexicon(dialect: str = "western") -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    model = SentenceTransformer(MODEL_NAME)

    response = (
        client.table("lexicon")
        .select("id,top_french")
        .eq("dialect", dialect)
        .is_("embedding", "null")
        .execute()
    )
    if getattr(response, "error", None) is not None:
        raise RuntimeError(f"Supabase fetch error: {response.error}")
    entries = response.data or []
    if not entries:
        print(f"All {dialect} entries already have embeddings.")
        return

    print(f"Vectorizing {len(entries)} {dialect} entries...")
    for i in range(0, len(entries), BATCH_SIZE):
        batch = entries[i : i + BATCH_SIZE]
        embeddings = model.encode([e["top_french"] for e in batch], show_progress_bar=False)
        for entry, emb in zip(batch, embeddings):
            try:
                client.table("lexicon").update(
                    {"embedding": emb.tolist()}
                ).eq("id", entry["id"]).execute()
            except Exception as exc:
                print(f"  Warning: {entry['id']}: {exc}")
        print(f"  {min(i + BATCH_SIZE, len(entries))}/{len(entries)}")
    print("Vectorization complete.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    vectorize_lexicon(dialect=args.dialect)
```

- [ ] **Step 2: Replace populate_examples in pipeline/populate_examples.py**

```python
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS

MAX_PER_ENTRY = 3


def populate_examples(dialect: str = "western") -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    lexicon = (
        client.table("lexicon").select("id,bete_word").eq("dialect", dialect).execute().data or []
    )
    print(f"Processing {len(lexicon)} {dialect} lexicon entries...")
    inserted = skipped = no_match = 0

    for entry in lexicon:
        lexicon_id, bete_word = entry["id"], entry["bete_word"]
        existing = (
            client.table("lexicon_examples").select("id", count="exact")
            .eq("lexicon_id", lexicon_id).execute()
        )
        if (existing.count or 0) > 0:
            skipped += 1
            continue

        verses = (
            client.table("verses").select("id,bete_text,french_text")
            .eq("dialect", dialect).ilike("bete_text", f"% {bete_word} %")
            .limit(MAX_PER_ENTRY).execute().data or []
        )
        if len(verses) < MAX_PER_ENTRY:
            extra = (
                client.table("verses").select("id,bete_text,french_text")
                .eq("dialect", dialect).ilike("bete_text", f"{bete_word} %")
                .limit(MAX_PER_ENTRY - len(verses)).execute().data or []
            )
            seen_ids = {v["id"] for v in verses}
            verses += [v for v in extra if v["id"] not in seen_ids]

        if not verses:
            no_match += 1
            continue

        for verse in verses[:MAX_PER_ENTRY]:
            try:
                client.table("lexicon_examples").insert({
                    "lexicon_id": lexicon_id,
                    "verse_id": verse["id"],
                    "bete_snippet": verse["bete_text"],
                    "french_snippet": verse["french_text"],
                    "dialect": dialect,
                }).execute()
                inserted += 1
            except Exception as exc:
                print(f"  Warning: '{bete_word}': {exc}")

    print(f"Done: {inserted} inserted, {skipped} skipped, {no_match} no match.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    populate_examples(dialect=args.dialect)
```

- [ ] **Step 3: Update tag_pos function signature and query in pipeline/tag_pos.py**

Find the `tag_pos()` function definition (line 296) and replace it:

```python
def tag_pos(dialect: str = "western") -> None:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    entries = (
        supabase.table("lexicon")
        .select("id,bete_word,top_french")
        .eq("dialect", dialect)
        .is_("pos", "null")
        .execute()
        .data or []
    )
    if not entries:
        print(f"All {dialect} entries already tagged.")
        return
    print(f"Tagging {len(entries)} {dialect} entries...")
    counts: dict[str, int] = {}
    for entry in entries:
        tags = classify(entry["top_french"])
        supabase.table("lexicon").update({"pos": tags}).eq("id", entry["id"]).execute()
        counts[tags[0]] = counts.get(tags[0], 0) + 1
    print("Done. Distribution:")
    for tag, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {tag:12s} {n}")
```

Also replace the `__main__` block at the end of tag_pos.py:

```python
if __name__ == "__main__":
    import argparse
    from pipeline.config import DIALECTS
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    tag_pos(dialect=args.dialect)
```

- [ ] **Step 4: Run all tests — expect PASS**

```
pytest tests/ -v
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/vectorize.py pipeline/populate_examples.py pipeline/tag_pos.py
git commit -m "feat: parameterize vectorize, populate_examples, tag_pos with dialect"
```

---

## Task 7: Orchestrator pipeline/run_dialect.py

**Files:** Create `pipeline/run_dialect.py`

- [ ] **Step 1: Create pipeline/run_dialect.py**

```python
"""Full pipeline orchestrator for one Bété dialect.
Usage: python -m pipeline.run_dialect --dialect northern
"""
import argparse
import asyncio
from pathlib import Path

from pipeline.config import DIALECTS, corpus_paths
from pipeline.scraper import scrape_nt
from pipeline.prepare_corpus import write_aligned_text_files, count_lines
from pipeline.align import run_alignment, extract_probabilities, save_alignments
from pipeline.bootstrap_lexicon import (
    load_verses, load_lexicon, load_alignments as load_alignments_db
)
from pipeline.vectorize import vectorize_lexicon
from pipeline.populate_examples import populate_examples
from pipeline.tag_pos import tag_pos


def _client():
    from supabase import create_client
    from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def run(dialect: str) -> None:
    if dialect not in DIALECTS:
        raise ValueError(f"Unknown dialect {dialect!r}. Valid: {list(DIALECTS)}")
    paths = corpus_paths(dialect)
    name  = DIALECTS[dialect]["name"]
    print(f"\n=== Pipeline: {name} ===\n")

    print("Step 1/7 — Scrape Bible.com")
    asyncio.run(scrape_nt(dialect=dialect))

    print("\nStep 2/7 — Prepare corpus")
    if not Path(paths["bete_txt"]).exists():
        write_aligned_text_files(
            parallel_jsonl=paths["parallel_jsonl"],
            bete_txt=paths["bete_txt"],
            french_txt=paths["french_txt"],
        )
        print(f"  {count_lines(paths['bete_txt'])} sentence pairs")
    else:
        print("  Already prepared — skipping")

    print("\nStep 3/7 — Word alignment")
    if not Path(paths["alignments_jsonl"]).exists():
        run_alignment(
            french_txt=paths["french_txt"], bete_txt=paths["bete_txt"],
            forward_align=paths["forward_align"], reverse_align=paths["reverse_align"],
        )
        alignments = extract_probabilities(
            french_txt=paths["french_txt"], bete_txt=paths["bete_txt"],
            forward_align=paths["forward_align"],
        )
        save_alignments(alignments, output_path=paths["alignments_jsonl"])
    else:
        print("  Already aligned — skipping")

    client = _client()

    print("\nStep 4/7 — Load verses")
    load_verses(client, dialect=dialect)

    print("\nStep 5/7 — Load lexicon")
    load_lexicon(client, dialect=dialect)

    print("\nStep 6/7 — Load alignments")
    load_alignments_db(client, dialect=dialect)

    print("\nStep 7a/7 — Vectorize")
    vectorize_lexicon(dialect=dialect)

    print("\nStep 7b/7 — Populate examples")
    populate_examples(dialect=dialect)

    print("\nStep 7c/7 — Tag POS")
    tag_pos(dialect=dialect)

    print(f"\n=== Done: {name} ===\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", required=True, choices=list(DIALECTS))
    args = parser.parse_args()
    run(args.dialect)
```

- [ ] **Step 2: Smoke-test on one book**

Edit `NT_BOOKS` in config temporarily to only `{"MAT": 1}`, run:
```bash
python -m pipeline.run_dialect --dialect northern
```
Confirm it reaches Supabase load steps without error. Revert `NT_BOOKS`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/run_dialect.py
git commit -m "feat: run_dialect orchestrator"
```

---

## Task 8: Frontend — DialectContext and DialectSelector

**Files:** Create `web/lib/dialect.ts` · Create `web/context/DialectContext.tsx` · Create `web/components/DialectSelector.tsx` · Modify `web/app/layout.tsx` · Modify `web/lib/types.ts`

- [ ] **Step 1: Create web/lib/dialect.ts**

```typescript
// web/lib/dialect.ts
export type DialectKey = 'western' | 'northern' | 'eastern'

export const DIALECTS: Record<DialectKey, { name: string }> = {
  western:  { name: 'Bété Occidental (Guiberoua)' },
  northern: { name: 'Bété Septentrional (Gagnoa)' },
  eastern:  { name: 'Bété Oriental (Daloa)' },
}

export const DIALECT_KEYS = Object.keys(DIALECTS) as DialectKey[]
export const DEFAULT_DIALECT: DialectKey = 'western'
```

- [ ] **Step 2: Add re-export to web/lib/types.ts**

Add this line at the top of `web/lib/types.ts` (after the comment):

```typescript
export type { DialectKey } from './dialect'
```

- [ ] **Step 3: Create web/context/DialectContext.tsx**

```bash
mkdir -p web/context
```

```typescript
// web/context/DialectContext.tsx
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { type DialectKey, DEFAULT_DIALECT, DIALECT_KEYS } from '@/lib/dialect'

interface DialectContextValue {
  dialect: DialectKey
  setDialect: (d: DialectKey) => void
}

const DialectContext = createContext<DialectContextValue>({
  dialect: DEFAULT_DIALECT,
  setDialect: () => {},
})

export function DialectProvider({ children }: { children: React.ReactNode }) {
  const [dialect, setDialectState] = useState<DialectKey>(DEFAULT_DIALECT)

  useEffect(() => {
    const stored = localStorage.getItem('bete-dialect')
    if (stored && DIALECT_KEYS.includes(stored as DialectKey)) {
      setDialectState(stored as DialectKey)
    }
  }, [])

  function setDialect(d: DialectKey) {
    setDialectState(d)
    localStorage.setItem('bete-dialect', d)
  }

  return (
    <DialectContext.Provider value={{ dialect, setDialect }}>
      {children}
    </DialectContext.Provider>
  )
}

export function useDialect() {
  return useContext(DialectContext)
}
```

- [ ] **Step 4: Wrap layout in DialectProvider**

In `web/app/layout.tsx`, add import:
```typescript
import { DialectProvider } from '@/context/DialectContext'
```

Wrap `<main>{children}</main>`:
```tsx
<DialectProvider>
  <main>{children}</main>
</DialectProvider>
```

- [ ] **Step 5: Create web/components/DialectSelector.tsx**

```typescript
// web/components/DialectSelector.tsx
'use client'
import { DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { useDialect } from '@/context/DialectContext'

export function DialectSelector() {
  const { dialect, setDialect } = useDialect()
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
        Dialecte
      </span>
      <select
        value={dialect}
        onChange={e => setDialect(e.target.value as DialectKey)}
        className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        aria-label="Choisir un dialecte bété"
      >
        {DIALECT_KEYS.map(key => (
          <option key={key} value={key}>{DIALECTS[key].name}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 6: Build check**

```bash
cd web && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add web/lib/dialect.ts web/lib/types.ts web/context/DialectContext.tsx web/components/DialectSelector.tsx web/app/layout.tsx
git commit -m "feat: DialectContext, DialectSelector, dialect registry for web UI"
```

---

## Task 9: Lexicon page dialect filter

**Files:** Modify `web/app/lexicon/page.tsx`

- [ ] **Step 1: Replace web/app/lexicon/page.tsx**

```typescript
// web/app/lexicon/page.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { FilterPills } from '@/components/FilterPills'
import { WordCard } from '@/components/WordCard'
import { DialectSelector } from '@/components/DialectSelector'
import { useDialect } from '@/context/DialectContext'
import { createClient } from '@/lib/supabase-browser'
import type { LexiconEntry } from '@/lib/types'

const FILTERS: { label: string; tag: string | null }[] = [
  { label: 'Tous',      tag: null },
  { label: 'Noms',      tag: 'noun' },
  { label: 'Verbes',    tag: 'verb' },
  { label: 'Adjectifs', tag: 'adj' },
  { label: 'Famille',   tag: 'family' },
  { label: 'Religion',  tag: 'religion' },
  { label: 'Nature',    tag: 'nature' },
  { label: 'Animaux',   tag: 'animal' },
]
const FILTER_LABELS = FILTERS.map(f => f.label)
const PAGE_SIZE = 9

export default function LexiconPage() {
  const { dialect } = useDialect()
  const [category, setCategory] = useState('Tous')
  const [entries, setEntries] = useState<LexiconEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  useEffect(() => { setPage(0) }, [category, dialect])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const from = page * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1
    const filter = FILTERS.find(f => f.label === category)

    let q = supabaseRef.current
      .from('lexicon')
      .select('*', { count: 'exact' })
      .not('pos', 'cs', '{"fragment"}')
      .eq('dialect', dialect)
      .order('upvotes', { ascending: false })
      .range(from, to)

    if (filter?.tag) q = q.contains('pos', [filter.tag])

    q.then(({ data, count, error }) => {
      if (cancelled) return
      if (!error) {
        setEntries((data ?? []) as LexiconEntry[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [category, page, dialect])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const [featured, ...rest] = entries

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-10 py-10">
      <PageHeader
        badge="Dictionnaire"
        title="Lexique Bété"
        subtitle="Explorez les mots de la langue bété, leur prononciation et leur traduction en français."
      />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <DialectSelector />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <FilterPills options={FILTER_LABELS} value={category} onChange={setCategory} />
        <span className="text-sm text-muted-foreground shrink-0">
          {loading ? '…' : `${total} mot${total !== 1 ? 's' : ''} trouvé${total !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className="bg-muted rounded-xl h-48 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">
          Aucun mot trouvé pour cette catégorie.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {featured && (
            <WordCard key={featured.id} entry={featured} featured className="md:col-span-2 xl:col-span-1" />
          )}
          {rest.map(entry => <WordCard key={entry.id} entry={entry} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-10">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="w-10 h-10 border border-border rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors"
            aria-label="Page précédente">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from(
            { length: Math.min(totalPages, 5) },
            (_, i) => Math.max(0, Math.min(page - 2, totalPages - 5)) + i
          ).map(pageNum => (
            <button key={pageNum} onClick={() => setPage(pageNum)}
              className={`w-10 h-10 rounded-full text-sm font-semibold transition-colors ${
                page === pageNum ? 'bg-primary text-white' : 'border border-border hover:bg-muted'
              }`}>
              {pageNum + 1}
            </button>
          ))}
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
            className="w-10 h-10 border border-border rounded-full flex items-center justify-center hover:bg-muted disabled:opacity-40 transition-colors"
            aria-label="Page suivante">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build check**

```bash
cd web && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add web/app/lexicon/page.tsx
git commit -m "feat: dialect selector on Lexicon page"
```

---

## Task 10: Translator dialect filter

**Files:** Modify `web/app/translator/page.tsx` · `web/components/TranslatorInput.tsx` · `web/app/api/translate/route.ts` · `web/lib/translator.ts`

- [ ] **Step 1: Replace web/app/translator/page.tsx**

```typescript
export const dynamic = 'force-dynamic'
import { TranslatorInput } from '@/components/TranslatorInput'
import { DialectSelector } from '@/components/DialectSelector'

export default function TranslatorPage() {
  return (
    <main className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-2">Traducteur Français → Bété</h1>
      <p className="text-muted-foreground mb-4">
        Chaque mot est aligné avec sa correspondance en bété.
        Signalez les erreurs pour améliorer le lexique.
      </p>
      <div className="mb-6"><DialectSelector /></div>
      <TranslatorInput />
    </main>
  )
}
```

- [ ] **Step 2: Replace web/components/TranslatorInput.tsx**

```typescript
'use client'
import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { TranslatorOutput } from './TranslatorOutput'
import { TranslationResult } from '@/lib/types'
import { useDialect } from '@/context/DialectContext'

export function TranslatorInput() {
  const { dialect } = useDialect()
  const [text, setText] = useState('')
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleTranslate() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, dialect }),
      })
      if (!res.ok) throw new Error(await res.text())
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de traduction')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        placeholder="Entrez du texte en français…"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4} maxLength={500}
        className="text-base resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{text.length}/500</span>
        <Button onClick={handleTranslate} disabled={loading || !text.trim()}>
          {loading ? 'Traduction…' : 'Traduire en Bété'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <TranslatorOutput result={result} />}
    </div>
  )
}
```

- [ ] **Step 3: Replace web/app/api/translate/route.ts**

```typescript
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { translate } from '@/lib/translator'
import { getCached, setCached } from '@/lib/translation-cache'
import type { TranslationResult } from '@/lib/types'
import { DIALECT_KEYS, DEFAULT_DIALECT, type DialectKey } from '@/lib/dialect'

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body.text !== 'string' || !body.text.trim())
    return Response.json({ error: 'text field required' }, { status: 400 })

  const input: string = body.text.trim()
  if (input.length > 500)
    return Response.json({ error: 'text too long (max 500 chars)' }, { status: 400 })

  const dialect: DialectKey = DIALECT_KEYS.includes(body.dialect) ? body.dialect : DEFAULT_DIALECT
  const client = createServiceClient()

  const cached = await getCached(client, input)
  if (cached) return Response.json(cached)

  let result: TranslationResult
  try {
    result = await translate(client, input, dialect)
  } catch (err) {
    console.error('translate error:', err)
    return Response.json({ error: 'translation failed' }, { status: 500 })
  }

  try { await setCached(client, input, result) } catch (err) { console.error('cache write error:', err) }
  return Response.json(result)
}
```

- [ ] **Step 4: Replace web/lib/translator.ts**

Key changes: `translate()` accepts `dialect: DialectKey`. `lookupWord` filters by dialect. The `match_lexicon_by_french` RPC is replaced with a dialect-scoped ilike fallback to avoid RPC signature issues.

```typescript
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { LexiconEntry, Expression, GrammarRule, TranslationToken, TranslationResult } from './types'
import { type DialectKey } from './dialect'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function findExpression(client: SupabaseClient, frenchPhrase: string): Promise<Expression | null> {
  const { data } = await client.from('expressions').select('*')
    .eq('french_phrase', frenchPhrase.toLowerCase()).eq('validated', true).maybeSingle()
  return data ?? null
}

async function lookupWord(
  client: SupabaseClient, frenchWord: string, dialect: DialectKey
): Promise<LexiconEntry | null> {
  const { data: exact } = await client.from('lexicon').select('*')
    .eq('top_french', frenchWord.toLowerCase()).eq('dialect', dialect).maybeSingle()
  if (exact) return exact as LexiconEntry

  const { data: partial } = await client.from('lexicon').select('*')
    .eq('dialect', dialect)
    .ilike('top_french', `%${frenchWord.toLowerCase()}%`)
    .order('probability', { ascending: false })
    .limit(1).maybeSingle()
  return (partial as LexiconEntry) ?? null
}

async function fetchGrammarRules(client: SupabaseClient): Promise<GrammarRule[]> {
  const { data } = await client.from('grammar_rules').select('*')
    .eq('validated', true).order('upvotes', { ascending: false }).limit(10)
  return (data ?? []) as GrammarRule[]
}

export async function translate(
  client: SupabaseClient,
  frenchText: string,
  dialect: DialectKey = 'western',
): Promise<TranslationResult> {
  const tokens = frenchText.trim().split(/\s+/)
  const resolvedTokens: TranslationToken[] = []

  const fullExpression = await findExpression(client, frenchText)
  if (fullExpression) {
    return {
      input: frenchText,
      tokens: [{ french_word: frenchText, bete_word: fullExpression.bete_phrase,
        bete_phonetic: fullExpression.bete_phonetic, score: 1.0, is_expression: true }],
      cached: false,
    }
  }

  const cleanTokens = tokens.map(t => t.replace(/[.,!?;:«»"']/g, '').toLowerCase())
  const uniqueClean = [...new Set(cleanTokens.filter(Boolean))]
  const lookupResults = await Promise.all(uniqueClean.map(w => lookupWord(client, w, dialect)))
  const lexiconMatches: Record<string, LexiconEntry | null> = Object.fromEntries(
    uniqueClean.map((w, i) => [w, lookupResults[i]])
  )
  const grammarRules = await fetchGrammarRules(client)

  const lexiconContext = Object.entries(lexiconMatches)
    .map(([fr, e]) => e ? `${fr} → ${e.bete_phonetic} (score: ${e.probability})` : `${fr} → [unknown]`)
    .join('\n')
  const grammarContext = grammarRules
    .map(r => `[${r.category}] ${r.pattern_french} → ${r.pattern_bete}: ${r.description}`)
    .join('\n')

  const prompt = `You are a French to Bété translator assistant.
Bété is a language from Côte d'Ivoire. Use ONLY the phonetic forms provided — do not invent new Bété words.

Lexicon matches (French → Bété phonetic):
${lexiconContext || '(no matches found)'}

Active grammar rules:
${grammarContext || '(none)'}

Translate the following French text to Bété.
Return a JSON array: [{"french_word": "...", "bete_phonetic": "...", "score": 0.0-1.0}]
One object per French input token. For unknown words use the French word as bete_phonetic and score 0.
Return ONLY the JSON array.

French input: ${frenchText}`

  let llmTokens: { french_word: string; bete_phonetic: string; score: number }[] = []
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const firstBlock = message.content[0]
    const raw = firstBlock.type === 'text' ? firstBlock.text.trim() : ''
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) llmTokens = parsed
    else throw new Error('not an array')
  } catch {
    llmTokens = tokens.map(t => {
      const clean = t.replace(/[.,!?;:«»"']/g, '').toLowerCase()
      const entry = lexiconMatches[clean]
      return { french_word: t, bete_phonetic: entry?.bete_phonetic ?? t, score: entry?.probability ?? 0 }
    })
  }

  for (const lt of llmTokens) {
    const clean = lt.french_word.replace(/[.,!?;:«»"']/g, '').toLowerCase()
    const entry = lexiconMatches[clean]
    resolvedTokens.push({
      french_word: lt.french_word,
      bete_word: entry?.bete_word ?? lt.bete_phonetic,
      bete_phonetic: lt.bete_phonetic,
      score: lt.score,
      is_expression: false,
      lexicon_id: entry?.id,
    })
  }
  return { input: frenchText, tokens: resolvedTokens, cached: false }
}
```

- [ ] **Step 5: Build check**

```bash
cd web && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add web/app/translator/page.tsx web/components/TranslatorInput.tsx web/app/api/translate/route.ts web/lib/translator.ts
git commit -m "feat: dialect selector on Translator, pass dialect to translation API"
```

---

## Task 11: Grammar and Contribute pages

**Files:** Modify `web/app/grammar/page.tsx` · Modify `web/app/contribute/page.tsx`

`grammar_rules` and `expressions` have no dialect column — the selector appears for UX consistency and is not wired to a filter query.

- [ ] **Step 1: Add DialectSelector to web/app/grammar/page.tsx**

Add import after existing imports:
```typescript
import { DialectSelector } from '@/components/DialectSelector'
```

Add just below `<PageHeader ... />` and before `<div className="grid md:grid-cols-12 gap-6">`:
```tsx
<div className="mb-6">
  <DialectSelector />
</div>
```

- [ ] **Step 2: Add DialectSelector to web/app/contribute/page.tsx**

Add import after existing imports:
```typescript
import { DialectSelector } from '@/components/DialectSelector'
```

Add just before `<div className="grid lg:grid-cols-12 gap-8 mb-10">`:
```tsx
<div className="mb-6">
  <DialectSelector />
</div>
```

- [ ] **Step 3: Build check**

```bash
cd web && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add web/app/grammar/page.tsx web/app/contribute/page.tsx
git commit -m "feat: dialect selector on Grammar and Contribute pages"
```

---

## Task 12: Run pipelines for Northern and Eastern

- [ ] **Step 1: Run Northern Bété pipeline**

```bash
python -m pipeline.run_dialect --dialect northern
```
This will take several hours (27 NT books × 2 Bible requests each + alignment + Supabase loads). Safe to interrupt and resume.

- [ ] **Step 2: Run Eastern Bété pipeline**

```bash
python -m pipeline.run_dialect --dialect eastern
```

- [ ] **Step 3: Verify in Supabase**

```sql
SELECT dialect, count(*) FROM verses GROUP BY dialect;
SELECT dialect, count(*) FROM lexicon GROUP BY dialect;
```
Expected: 3 rows each, all with meaningful counts.

- [ ] **Step 4: Final commit**

```bash
git add corpus/northern/ corpus/eastern/
git commit -m "data: corpus files for northern and eastern Bété dialects"
```
