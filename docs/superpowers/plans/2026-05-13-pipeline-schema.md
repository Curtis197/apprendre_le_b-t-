# Bété Language Platform — Data Pipeline & Schema
# Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape the Bété and French New Testament from bible.com, align them with eflomal, bootstrap a Supabase lexicon with word probabilities, and store French word embeddings for the AI translator.

**Architecture:** Eight offline Python scripts, each idempotent and independently runnable. Data flows linearly: scraper → JSONL corpus → eflomal text files → alignment file → Supabase (schema, lexicon, vectors). No server required at this stage.

**Tech Stack:** Python 3.11+, Playwright (scraping), eflomal (word alignment), sentence-transformers (embeddings), supabase-py (database client), pytest (tests), python-dotenv (config)

---

## File Structure

```
traduction bété/
├── pipeline/
│   ├── config.py              # constants: Supabase creds, bible IDs, thresholds, paths
│   ├── phonetic.py            # Bété standard → phonetic character mapping
│   ├── scraper.py             # Playwright scraper for bible.com
│   ├── prepare_corpus.py      # JSONL → line-aligned text files for eflomal
│   ├── align.py               # eflomal wrapper + probability extraction
│   ├── bootstrap_lexicon.py   # load alignments into Supabase lexicon table
│   └── vectorize.py           # generate French embeddings, store in pgvector
├── corpus/                    # generated files, git-ignored
│   └── .gitkeep
├── supabase/
│   └── migrations/
│       └── 20260513000000_initial_schema.sql
├── tests/
│   ├── conftest.py
│   ├── test_phonetic.py
│   ├── test_scraper.py
│   ├── test_prepare_corpus.py
│   ├── test_align.py
│   └── test_bootstrap_lexicon.py
├── requirements.txt
├── .env.example
└── .gitignore
```

---

## Task 1: Project Setup

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `corpus/.gitkeep`
- Create: `pipeline/config.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Create requirements.txt**

```
playwright==1.44.0
eflomal==0.5.0
sentence-transformers==3.0.1
supabase==2.5.0
python-dotenv==1.0.1
pytest==8.2.2
pytest-asyncio==0.23.7
```

- [ ] **Step 2: Create .env.example**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
```

Copy `.env.example` to `.env` and fill in real values from your Supabase project dashboard (Settings → API).

- [ ] **Step 3: Create .gitignore**

```
.env
corpus/
__pycache__/
*.pyc
.pytest_cache/
*.egg-info/
dist/
.venv/
```

- [ ] **Step 4: Create corpus/.gitkeep**

```
# Generated files — do not commit
```

- [ ] **Step 5: Create pipeline/config.py**

```python
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

BETE_BIBLE_ID = 3284
FRENCH_BIBLE_ID = 93
BETE_VERSION = "BET"
FRENCH_VERSION = "LSG"

# NT books mapped to their chapter counts
NT_BOOKS = {
    "MAT": 28, "MRK": 16, "LUK": 24, "JHN": 21,
    "ACT": 28, "ROM": 16, "1CO": 16, "2CO": 13,
    "GAL": 6,  "EPH": 6,  "PHP": 4,  "COL": 4,
    "1TH": 5,  "2TH": 3,  "1TI": 6,  "2TI": 4,
    "TIT": 3,  "PHM": 1,  "HEB": 13, "JAS": 5,
    "1PE": 5,  "2PE": 3,  "1JN": 5,  "2JN": 1,
    "3JN": 1,  "JUD": 1,  "REV": 22,
}

ALIGNMENT_THRESHOLD = 0.1   # minimum probability score to include in lexicon
RATE_LIMIT_SECONDS = 2      # pause between bible.com requests

CORPUS_DIR = "corpus"
PARALLEL_JSONL  = f"{CORPUS_DIR}/nt_parallel.jsonl"
FRENCH_TXT      = f"{CORPUS_DIR}/french.txt"
BETE_TXT        = f"{CORPUS_DIR}/bete.txt"
FORWARD_ALIGN   = f"{CORPUS_DIR}/forward.align"
REVERSE_ALIGN   = f"{CORPUS_DIR}/reverse.align"
ALIGNMENTS_JSONL = f"{CORPUS_DIR}/alignments.jsonl"
```

- [ ] **Step 6: Create tests/conftest.py**

```python
import pytest

# Sample verse pair used across multiple test modules
SAMPLE_VERSE = {
    "book": "MAT",
    "chapter": 1,
    "verse": 2,
    "bete_text": "Ablaamö mɔɔ gwälɩɛ Yizaakö",
    "french_text": "Abraham engendra Isaac",
}

SAMPLE_CORPUS = [
    SAMPLE_VERSE,
    {
        "book": "MAT",
        "chapter": 1,
        "verse": 3,
        "bete_text": "Yizaakö mɔɔ gwälɩɛ Zakɔɔbö",
        "french_text": "Isaac engendra Jacob",
    },
]
```

- [ ] **Step 7: Install dependencies**

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
playwright install chromium
```

> **Windows note:** `eflomal` compiles C code on install. If it fails, install Visual Studio Build Tools first (free): https://visualstudio.microsoft.com/visual-cpp-build-tools/ — check "Desktop development with C++". Alternative: run the pipeline inside WSL.

- [ ] **Step 8: Commit**

```bash
git init
git add requirements.txt .env.example .gitignore corpus/.gitkeep pipeline/config.py tests/conftest.py
git commit -m "feat: project scaffold and config"
```

---

## Task 2: Supabase Schema

**Files:**
- Create: `supabase/migrations/20260513000000_initial_schema.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Enable pgvector extension
create extension if not exists vector;

-- Raw parallel corpus
create table if not exists verses (
  id          uuid primary key default gen_random_uuid(),
  book        text not null,
  chapter     int  not null,
  verse       int  not null,
  bete_text   text not null,
  french_text text not null,
  unique (book, chapter, verse)
);

-- Core lexicon
create table if not exists lexicon (
  id                uuid    primary key default gen_random_uuid(),
  bete_word         text    not null unique,
  bete_phonetic     text    not null,
  french_candidates jsonb   not null,   -- [{word, score}, ...]
  top_french        text    not null,
  probability       float   not null,
  embedding         vector(384),        -- French word embedding
  pos               text,               -- part of speech, user-contributed
  notes             text,
  validated         bool    not null default false,
  upvotes           int     not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists lexicon_embedding_idx
  on lexicon using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists lexicon_top_french_idx  on lexicon (top_french);
create index if not exists lexicon_phonetic_idx    on lexicon (bete_phonetic);

-- NT example sentences per lexicon entry
create table if not exists lexicon_examples (
  id           uuid primary key default gen_random_uuid(),
  lexicon_id   uuid references lexicon(id) on delete cascade,
  verse_id     uuid references verses(id),
  bete_snippet   text not null,
  french_snippet text not null
);

-- Raw eflomal output (kept for retraining)
create table if not exists alignments (
  id          uuid  primary key default gen_random_uuid(),
  french_word text  not null,
  bete_word   text  not null,
  score       float not null,
  verse_id    uuid  references verses(id)
);

-- Grammar rules (user-contributed)
create table if not exists grammar_rules (
  id                   uuid primary key default gen_random_uuid(),
  category             text not null,        -- verb|noun|tense|agreement|other
  pattern_french       text not null,
  pattern_bete         text not null,
  description          text not null,
  example_french       text,
  example_bete         text,
  example_bete_phonetic text,
  validated            bool not null default false,
  upvotes              int  not null default 0,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now()
);

-- Idiomatic / fixed expressions (user-contributed)
create table if not exists expressions (
  id               uuid primary key default gen_random_uuid(),
  french_phrase    text not null,
  bete_phrase      text not null,
  bete_phonetic    text not null,
  type             text not null,   -- idiomatic|fixed|proverb
  embedding        vector(384),
  example_verse_id uuid references verses(id),
  validated        bool not null default false,
  upvotes          int  not null default 0,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists expressions_embedding_idx
  on expressions using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- User feedback on translations and lexicon entries
create table if not exists user_feedback (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid references auth.users(id),
  lexicon_id              uuid references lexicon(id),
  type                    text not null,   -- confirm|reject|suggest
  suggested_bete          text,
  suggested_bete_phonetic text,
  translator_phrase       text,
  created_at              timestamptz not null default now()
);
```

- [ ] **Step 2: Apply migration in Supabase**

Open your Supabase project → SQL Editor → paste the full migration → Run.

Verify by checking Table Editor — you should see: `verses`, `lexicon`, `lexicon_examples`, `alignments`, `grammar_rules`, `expressions`, `user_feedback`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513000000_initial_schema.sql
git commit -m "feat: initial supabase schema with pgvector"
```

---

## Task 3: Phonetic Module

**Files:**
- Create: `pipeline/phonetic.py`
- Create: `tests/test_phonetic.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_phonetic.py
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from phonetic import to_phonetic

def test_maps_iota_to_i():
    assert to_phonetic("ɩ") == "i"

def test_maps_epsilon_to_e():
    assert to_phonetic("ɛ") == "e"

def test_maps_open_o_to_o():
    assert to_phonetic("ɔ") == "o"

def test_maps_upsilon_to_v():
    assert to_phonetic("ʋ") == "v"

def test_maps_o_umlaut_to_o():
    assert to_phonetic("ö") == "o"

def test_maps_a_umlaut_to_a():
    assert to_phonetic("ä") == "a"

def test_removes_apostrophe_prefix():
    # 'sɔ → so
    assert to_phonetic("'sɔ") == "so"

def test_removes_non_breaking_hyphen():
    # ‑nyɛ → nye
    assert to_phonetic("‑nyɛ") == "nye"

def test_full_word_gwalie():
    assert to_phonetic("gwälɩɛ") == "gwalie"

def test_full_word_mva():
    assert to_phonetic("mʋa") == "mva"

def test_lowercase_output():
    assert to_phonetic("Ablaamö") == "ablaamo"

def test_empty_string():
    assert to_phonetic("") == ""

def test_plain_ascii_unchanged():
    assert to_phonetic("bete") == "bete"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_phonetic.py -v
```
Expected: `ModuleNotFoundError: No module named 'phonetic'`

- [ ] **Step 3: Implement pipeline/phonetic.py**

```python
# pipeline/phonetic.py

# Map Bété special characters to their phonetic ASCII equivalents
CHAR_MAP: dict[str, str] = {
    # Vowels
    "ɩ": "i",  "Ɩ": "i",
    "ɛ": "e",  "Ɛ": "e",
    "ɔ": "o",  "Ɔ": "o",
    "ö": "o",  "Ö": "o",
    "ä": "a",  "Ä": "a",
    "ë": "e",  "Ë": "e",
    "ü": "u",  "Ü": "u",
    "ï": "i",  "Ï": "i",
    # Consonants
    "ʋ": "v",  "Ʋ": "v",
    "ŋ": "ng", "Ŋ": "ng",
}

# Characters to strip entirely (tone markers, prefix apostrophes, hyphens)
STRIP_CHARS: frozenset[str] = frozenset([
    "'",       # apostrophe prefix
    "‘",  # left single quotation mark
    "’",  # right single quotation mark
    "ʼ",  # modifier letter apostrophe
    "‑",  # non-breaking hyphen
    "‐",  # hyphen
    "‒",  # figure dash
    "‑",       # non-breaking hyphen (literal)
])


def to_phonetic(word: str) -> str:
    """
    Convert a Bété word in standard orthography to its simplified phonetic form.

    Rules:
    - Special Bété characters are mapped to ASCII equivalents (CHAR_MAP)
    - Tone markers and prefix apostrophes are removed (STRIP_CHARS)
    - Output is lowercased
    """
    result: list[str] = []
    for ch in word:
        if ch in STRIP_CHARS:
            continue
        result.append(CHAR_MAP.get(ch, ch))
    return "".join(result).lower()
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_phonetic.py -v
```
Expected: all 13 tests PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/phonetic.py tests/test_phonetic.py
git commit -m "feat: bete phonetic character mapping module"
```

---

## Task 4: Bible.com Scraper

**Files:**
- Create: `pipeline/scraper.py`
- Create: `tests/test_scraper.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_scraper.py
import pytest
import json
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from scraper import parse_verses, merge_verse_pairs


def test_parse_verses_returns_list_of_dicts():
    raw = [
        {"verse": 1, "text": "Zezwii Kliisɩ"},
        {"verse": 2, "text": "Ablaamö mɔɔ gwälɩɛ Yizaakö"},
    ]
    result = parse_verses(raw)
    assert isinstance(result, list)
    assert len(result) == 2
    assert result[0]["verse"] == 1
    assert result[0]["text"] == "Zezwii Kliisɩ"


def test_parse_verses_strips_whitespace():
    raw = [{"verse": 1, "text": "  Zezwii Kliisɩ  \n"}]
    result = parse_verses(raw)
    assert result[0]["text"] == "Zezwii Kliisɩ"


def test_merge_verse_pairs_aligns_by_verse_number():
    bete = [{"verse": 1, "text": "bete one"}, {"verse": 2, "text": "bete two"}]
    french = [{"verse": 1, "text": "french one"}, {"verse": 2, "text": "french two"}]
    result = merge_verse_pairs("MAT", 1, bete, french)
    assert len(result) == 2
    assert result[0]["bete_text"] == "bete one"
    assert result[0]["french_text"] == "french one"
    assert result[0]["book"] == "MAT"
    assert result[0]["chapter"] == 1
    assert result[0]["verse"] == 1


def test_merge_verse_pairs_skips_missing_french():
    bete = [{"verse": 1, "text": "bete one"}, {"verse": 2, "text": "bete two"}]
    french = [{"verse": 1, "text": "french one"}]  # verse 2 missing
    result = merge_verse_pairs("MAT", 1, bete, french)
    assert len(result) == 1
    assert result[0]["verse"] == 1


def test_merge_verse_pairs_skips_missing_bete():
    bete = [{"verse": 2, "text": "bete two"}]  # verse 1 missing
    french = [{"verse": 1, "text": "french one"}, {"verse": 2, "text": "french two"}]
    result = merge_verse_pairs("MAT", 1, bete, french)
    assert len(result) == 1
    assert result[0]["verse"] == 2
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_scraper.py -v
```
Expected: `ModuleNotFoundError: No module named 'scraper'`

- [ ] **Step 3: Implement pipeline/scraper.py**

```python
# pipeline/scraper.py
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from config import (
    NT_BOOKS, BETE_BIBLE_ID, FRENCH_BIBLE_ID,
    BETE_VERSION, FRENCH_VERSION,
    PARALLEL_JSONL, CORPUS_DIR, RATE_LIMIT_SECONDS,
)

BIBLE_URL = "https://www.bible.com/bible/{bible_id}/{book}.{chapter}.{version}"


def parse_verses(raw: list[dict]) -> list[dict]:
    """Normalise raw verse dicts: strip whitespace from text."""
    return [{"verse": v["verse"], "text": v["text"].strip()} for v in raw]


def merge_verse_pairs(
    book: str, chapter: int,
    bete_verses: list[dict],
    french_verses: list[dict],
) -> list[dict]:
    """
    Align Bété and French verses by verse number.
    Only verses present in BOTH lists are included.
    """
    french_map = {v["verse"]: v["text"] for v in french_verses}
    pairs = []
    for bv in bete_verses:
        fn = french_map.get(bv["verse"])
        if fn:
            pairs.append({
                "book": book,
                "chapter": chapter,
                "verse": bv["verse"],
                "bete_text": bv["text"],
                "french_text": fn,
            })
    return pairs


async def _scrape_chapter(
    page,
    book: str,
    chapter: int,
    bible_id: int,
    version: str,
) -> list[dict]:
    """
    Scrape a single chapter from bible.com.
    Returns list of {verse, text} dicts.
    """
    url = BIBLE_URL.format(
        bible_id=bible_id, book=book, chapter=chapter, version=version
    )
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_selector("[data-usfm]", timeout=15_000)
    except PlaywrightTimeout:
        print(f"  Timeout: {book} {chapter} {version} — skipping")
        return []

    verses = await page.evaluate("""() => {
        const results = [];
        document.querySelectorAll('[data-usfm]').forEach(el => {
            const usfm = el.getAttribute('data-usfm');
            const parts = usfm.split('.');
            if (parts.length !== 3) return;
            const verseNum = parseInt(parts[2], 10);
            if (isNaN(verseNum)) return;
            const clone = el.cloneNode(true);
            const label = clone.querySelector('.label');
            if (label) label.remove();
            const text = (clone.innerText || clone.textContent || '')
                .trim().replace(/\\s+/g, ' ');
            if (text) results.push({ verse: verseNum, text });
        });
        return results;
    }""")
    return verses


async def scrape_nt(output_path: str = PARALLEL_JSONL) -> None:
    """
    Scrape the full NT in Bété and French, saving verse pairs to JSONL.
    Safe to re-run: resumes from where it left off if output file exists.
    """
    Path(CORPUS_DIR).mkdir(exist_ok=True)

    # Build set of already-scraped (book, chapter) pairs for resume support
    done: set[tuple[str, int]] = set()
    if Path(output_path).exists():
        with open(output_path, "r", encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                done.add((rec["book"], rec["chapter"]))

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Research project — Bété language preservation)"
            )
        )
        page = await context.new_page()

        with open(output_path, "a", encoding="utf-8") as out:
            for book, num_chapters in NT_BOOKS.items():
                for chapter in range(1, num_chapters + 1):
                    if (book, chapter) in done:
                        print(f"  Skip (cached): {book} {chapter}")
                        continue

                    print(f"  Scraping {book} {chapter}...")
                    bete = parse_verses(
                        await _scrape_chapter(
                            page, book, chapter, BETE_BIBLE_ID, BETE_VERSION
                        )
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)

                    french = parse_verses(
                        await _scrape_chapter(
                            page, book, chapter, FRENCH_BIBLE_ID, FRENCH_VERSION
                        )
                    )
                    await asyncio.sleep(RATE_LIMIT_SECONDS)

                    pairs = merge_verse_pairs(book, chapter, bete, french)
                    for pair in pairs:
                        out.write(json.dumps(pair, ensure_ascii=False) + "\n")
                    print(f"    → {len(pairs)} verse pairs")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(scrape_nt())
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_scraper.py -v
```
Expected: all 5 tests PASS

- [ ] **Step 5: Run the scraper against real bible.com**

```bash
python pipeline/scraper.py
```
Expected: ~7,900 lines written to `corpus/nt_parallel.jsonl`. Takes 20-40 minutes.
Check the first few lines: `head -5 corpus/nt_parallel.jsonl` (or open in a text editor on Windows).

> **Note:** bible.com renders with JavaScript. If you see 0 verse pairs for a chapter, the DOM selector may have changed. Inspect the page in a browser (F12 → Elements) and look for elements with a `data-usfm` attribute to confirm the selector.

- [ ] **Step 6: Commit**

```bash
git add pipeline/scraper.py tests/test_scraper.py
git commit -m "feat: bible.com scraper with resume support"
```

---

## Task 5: Corpus Preparation

**Files:**
- Create: `pipeline/prepare_corpus.py`
- Create: `tests/test_prepare_corpus.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_prepare_corpus.py
import json
import os
import sys
import tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from prepare_corpus import write_aligned_text_files, count_lines


def _write_jsonl(path: str, records: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def test_writes_one_line_per_verse():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        bete_txt = os.path.join(tmp, "bete.txt")
        french_txt = os.path.join(tmp, "french.txt")
        _write_jsonl(jsonl, [
            {"bete_text": "Ablaamö mɔɔ gwälɩɛ", "french_text": "Abraham engendra"},
            {"bete_text": "Yizaakö mɔɔ gwälɩɛ", "french_text": "Isaac engendra"},
        ])
        write_aligned_text_files(jsonl, bete_txt, french_txt)
        assert count_lines(bete_txt) == 2
        assert count_lines(french_txt) == 2


def test_bete_and_french_lines_stay_in_sync():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        bete_txt = os.path.join(tmp, "bete.txt")
        french_txt = os.path.join(tmp, "french.txt")
        _write_jsonl(jsonl, [
            {"bete_text": "bete line one", "french_text": "french line one"},
            {"bete_text": "bete line two", "french_text": "french line two"},
        ])
        write_aligned_text_files(jsonl, bete_txt, french_txt)
        bete_lines = open(bete_txt, encoding="utf-8").readlines()
        french_lines = open(french_txt, encoding="utf-8").readlines()
        assert bete_lines[0].strip() == "bete line one"
        assert french_lines[0].strip() == "french line one"
        assert bete_lines[1].strip() == "bete line two"
        assert french_lines[1].strip() == "french line two"


def test_count_lines():
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8"
    ) as f:
        f.write("line1\nline2\nline3\n")
        path = f.name
    assert count_lines(path) == 3
    os.unlink(path)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_prepare_corpus.py -v
```
Expected: `ModuleNotFoundError: No module named 'prepare_corpus'`

- [ ] **Step 3: Implement pipeline/prepare_corpus.py**

```python
# pipeline/prepare_corpus.py
import json
from config import PARALLEL_JSONL, BETE_TXT, FRENCH_TXT


def write_aligned_text_files(
    parallel_jsonl: str = PARALLEL_JSONL,
    bete_txt: str = BETE_TXT,
    french_txt: str = FRENCH_TXT,
) -> None:
    """
    Convert the JSONL parallel corpus to two line-aligned plain text files
    suitable for eflomal input.
    Line N in bete.txt corresponds to line N in french.txt.
    """
    with (
        open(parallel_jsonl, "r", encoding="utf-8") as src,
        open(bete_txt,       "w", encoding="utf-8") as bf,
        open(french_txt,     "w", encoding="utf-8") as ff,
    ):
        for line in src:
            record = json.loads(line)
            bf.write(record["bete_text"].strip() + "\n")
            ff.write(record["french_text"].strip() + "\n")


def count_lines(path: str) -> int:
    """Return the number of lines in a text file."""
    with open(path, "r", encoding="utf-8") as f:
        return sum(1 for _ in f)


if __name__ == "__main__":
    write_aligned_text_files()
    bete_count = count_lines(BETE_TXT)
    french_count = count_lines(FRENCH_TXT)
    assert bete_count == french_count, "Line counts do not match!"
    print(f"Wrote {bete_count} aligned sentence pairs.")
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_prepare_corpus.py -v
```
Expected: all 3 tests PASS

- [ ] **Step 5: Run against real corpus**

```bash
python pipeline/prepare_corpus.py
```
Expected output: `Wrote 7894 aligned sentence pairs.` (exact count varies by book availability)

- [ ] **Step 6: Commit**

```bash
git add pipeline/prepare_corpus.py tests/test_prepare_corpus.py
git commit -m "feat: prepare aligned text files for eflomal"
```

---

## Task 6: Eflomal Alignment

**Files:**
- Create: `pipeline/align.py`
- Create: `tests/test_align.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_align.py
import os
import sys
import tempfile
import json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from align import extract_probabilities


def _write_file(path: str, content: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _write_jsonl(path: str, records: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def test_extract_basic_alignment():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        align = os.path.join(tmp, "forward.align")
        _write_jsonl(jsonl, [
            {"french_text": "Abraham engendra Isaac",
             "bete_text": "Ablaamö mɔɔ gwälɩɛ Yizaakö",
             "book": "MAT", "chapter": 1, "verse": 2},
        ])
        # "0-0 1-1 2-2 3-3" means word 0↔0, 1↔1, 2↔2, 3↔3
        _write_file(align, "0-0 1-1 2-2 3-3\n")
        results = extract_probabilities(jsonl, align, threshold=0.0)
        words = {r["french_word"]: r["bete_word"] for r in results}
        assert words["abraham"] == "ablaamö"
        assert words["engendra"] == "mɔɔ"


def test_extract_respects_threshold():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        align = os.path.join(tmp, "forward.align")
        # Two sentences; 'engendra' aligns to 'mɔɔ' only once out of two
        _write_jsonl(jsonl, [
            {"french_text": "Abraham engendra Isaac",
             "bete_text": "Ablaamö mɔɔ gwälɩɛ Yizaakö",
             "book": "MAT", "chapter": 1, "verse": 2},
            {"french_text": "Isaac engendra Jacob",
             "bete_text": "Yizaakö mɔɔ gwälɩɛ Zakɔɔbö",
             "book": "MAT", "chapter": 1, "verse": 3},
        ])
        _write_file(align, "0-0 1-1 2-2 3-3\n0-0 1-1 2-2 3-3\n")
        # 'abraham' appears once → score = 1.0
        # 'isaac' appears as source once, aligns to 'yizaakö' once → score = 1.0
        results_all = extract_probabilities(jsonl, align, threshold=0.0)
        results_high = extract_probabilities(jsonl, align, threshold=0.9)
        assert len(results_all) >= len(results_high)


def test_output_has_required_keys():
    with tempfile.TemporaryDirectory() as tmp:
        jsonl = os.path.join(tmp, "corpus.jsonl")
        align = os.path.join(tmp, "forward.align")
        _write_jsonl(jsonl, [
            {"french_text": "Abraham engendra",
             "bete_text": "Ablaamö mɔɔ",
             "book": "MAT", "chapter": 1, "verse": 2},
        ])
        _write_file(align, "0-0 1-1\n")
        results = extract_probabilities(jsonl, align, threshold=0.0)
        assert results
        for r in results:
            assert "french_word" in r
            assert "bete_word" in r
            assert "score" in r
            assert 0.0 <= r["score"] <= 1.0
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_align.py -v
```
Expected: `ModuleNotFoundError: No module named 'align'`

- [ ] **Step 3: Implement pipeline/align.py**

```python
# pipeline/align.py
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from config import (
    FRENCH_TXT, BETE_TXT, FORWARD_ALIGN, REVERSE_ALIGN,
    PARALLEL_JSONL, ALIGNMENTS_JSONL, ALIGNMENT_THRESHOLD,
)


def run_eflomal(
    french_txt: str = FRENCH_TXT,
    bete_txt: str = BETE_TXT,
    forward_align: str = FORWARD_ALIGN,
    reverse_align: str = REVERSE_ALIGN,
) -> None:
    """
    Run eflomal word alignment.
    French is the source (input language), Bété is the target (output language).
    Model 3 = HMM+fertility, highest quality.
    """
    cmd = [
        sys.executable, "-m", "eflomal",
        "-s", french_txt,
        "-t", bete_txt,
        "-f", forward_align,
        "-r", reverse_align,
        "--model", "3",
        "--overwrite",
    ]
    print("Running eflomal (this takes several minutes)...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"eflomal failed:\n{result.stderr}")
    print("Alignment complete.")


def extract_probabilities(
    parallel_jsonl: str = PARALLEL_JSONL,
    forward_align: str = FORWARD_ALIGN,
    threshold: float = ALIGNMENT_THRESHOLD,
) -> list[dict]:
    """
    Extract word-level alignment probabilities from eflomal output.

    Algorithm:
      1. For each sentence pair + alignment line, record every (french, bete) pair.
      2. Count occurrences of each pair and each source (french) word.
      3. Probability = pair_count / source_count.
      4. Filter by threshold.
    """
    # Load parallel corpus
    sentences: list[dict] = []
    with open(parallel_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            sentences.append({
                "french": rec["french_text"].split(),
                "bete":   rec["bete_text"].split(),
            })

    pair_counts:   defaultdict[tuple[str, str], int] = defaultdict(int)
    source_counts: defaultdict[str, int]             = defaultdict(int)

    with open(forward_align, "r", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= len(sentences):
                break
            french_words = sentences[i]["french"]
            bete_words   = sentences[i]["bete"]
            for token in line.strip().split():
                if "-" not in token:
                    continue
                src_idx_s, tgt_idx_s = token.split("-", 1)
                src_idx, tgt_idx = int(src_idx_s), int(tgt_idx_s)
                if src_idx < len(french_words) and tgt_idx < len(bete_words):
                    fw = french_words[src_idx].lower()
                    bw = bete_words[tgt_idx].lower()
                    pair_counts[(fw, bw)] += 1
                    source_counts[fw] += 1

    alignments: list[dict] = []
    for (fw, bw), count in pair_counts.items():
        score = count / source_counts[fw]
        if score >= threshold:
            alignments.append({
                "french_word": fw,
                "bete_word":   bw,
                "score":       round(score, 4),
            })

    return sorted(alignments, key=lambda x: x["score"], reverse=True)


def save_alignments(
    alignments: list[dict],
    output_path: str = ALIGNMENTS_JSONL,
) -> None:
    with open(output_path, "w", encoding="utf-8") as f:
        for a in alignments:
            f.write(json.dumps(a, ensure_ascii=False) + "\n")
    print(f"Saved {len(alignments)} alignment pairs to {output_path}")


if __name__ == "__main__":
    run_eflomal()
    alignments = extract_probabilities()
    save_alignments(alignments)
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_align.py -v
```
Expected: all 3 tests PASS

- [ ] **Step 5: Run alignment against real corpus**

```bash
python pipeline/align.py
```
Expected: eflomal runs for several minutes, then `alignments.jsonl` is written.
Check size: should contain tens of thousands of lines.

- [ ] **Step 6: Commit**

```bash
git add pipeline/align.py tests/test_align.py
git commit -m "feat: eflomal wrapper and probability extraction"
```

---

## Task 7: Load Verses and Lexicon into Supabase

**Files:**
- Create: `pipeline/bootstrap_lexicon.py`
- Create: `tests/test_bootstrap_lexicon.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_bootstrap_lexicon.py
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'pipeline'))
from bootstrap_lexicon import build_lexicon_from_alignments, group_by_bete_word


def test_group_by_bete_word_sorts_by_score():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
        {"french_word": "genera",   "bete_word": "gwälɩɛ", "score": 0.3},
        {"french_word": "fit",      "bete_word": "gwälɩɛ", "score": 0.5},
    ]
    result = group_by_bete_word(alignments)
    assert result["gwälɩɛ"][0]["word"] == "engendra"   # highest score first
    assert result["gwälɩɛ"][1]["word"] == "fit"
    assert result["gwälɩɛ"][2]["word"] == "genera"


def test_build_lexicon_entry_shape():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
    ]
    entries = build_lexicon_from_alignments(alignments)
    assert len(entries) == 1
    e = entries[0]
    assert e["bete_word"] == "gwälɩɛ"
    assert e["bete_phonetic"] == "gwalie"
    assert e["top_french"] == "engendra"
    assert e["probability"] == 0.8
    assert e["validated"] is False
    assert isinstance(e["french_candidates"], list)
    assert e["french_candidates"][0] == {"word": "engendra", "score": 0.8}


def test_build_lexicon_deduplicates_bete_words():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
        {"french_word": "genera",   "bete_word": "gwälɩɛ", "score": 0.3},
    ]
    entries = build_lexicon_from_alignments(alignments)
    assert len(entries) == 1     # one entry per Bété word


def test_build_lexicon_multiple_words():
    alignments = [
        {"french_word": "engendra", "bete_word": "gwälɩɛ", "score": 0.8},
        {"french_word": "abraham",  "bete_word": "ablaamö", "score": 0.9},
    ]
    entries = build_lexicon_from_alignments(alignments)
    bete_words = {e["bete_word"] for e in entries}
    assert "gwälɩɛ" in bete_words
    assert "ablaamö" in bete_words
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pytest tests/test_bootstrap_lexicon.py -v
```
Expected: `ModuleNotFoundError: No module named 'bootstrap_lexicon'`

- [ ] **Step 3: Implement pipeline/bootstrap_lexicon.py**

```python
# pipeline/bootstrap_lexicon.py
import json
from collections import defaultdict
from supabase import create_client, Client
from config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY,
    PARALLEL_JSONL, ALIGNMENTS_JSONL,
)
from phonetic import to_phonetic


def group_by_bete_word(alignments: list[dict]) -> dict[str, list[dict]]:
    """
    Group alignment records by Bété word.
    Each group is a list of {word, score} dicts sorted by score descending.
    """
    grouped: defaultdict[str, list[dict]] = defaultdict(list)
    for a in alignments:
        grouped[a["bete_word"]].append({"word": a["french_word"], "score": a["score"]})
    for bete_word in grouped:
        grouped[bete_word].sort(key=lambda x: x["score"], reverse=True)
    return dict(grouped)


def build_lexicon_from_alignments(alignments: list[dict]) -> list[dict]:
    """Build lexicon entry dicts ready for Supabase upsert."""
    grouped = group_by_bete_word(alignments)
    entries = []
    for bete_word, candidates in grouped.items():
        top = candidates[0]
        entries.append({
            "bete_word":          bete_word,
            "bete_phonetic":      to_phonetic(bete_word),
            "french_candidates":  candidates,
            "top_french":         top["word"],
            "probability":        top["score"],
            "validated":          False,
        })
    return entries


def load_verses(client: Client, parallel_jsonl: str = PARALLEL_JSONL) -> None:
    """Load verse pairs into the verses table (upsert by book+chapter+verse)."""
    verses = []
    with open(parallel_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            verses.append(json.loads(line))

    batch_size = 500
    for i in range(0, len(verses), batch_size):
        batch = verses[i : i + batch_size]
        client.table("verses").upsert(
            batch, on_conflict="book,chapter,verse"
        ).execute()
        print(f"  Verses: {min(i + batch_size, len(verses))}/{len(verses)}")


def load_lexicon(client: Client, alignments_jsonl: str = ALIGNMENTS_JSONL) -> None:
    """Load alignment-derived lexicon entries into the lexicon table."""
    raw: list[dict] = []
    with open(alignments_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            raw.append(json.loads(line))

    entries = build_lexicon_from_alignments(raw)

    batch_size = 500
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        client.table("lexicon").upsert(
            batch, on_conflict="bete_word"
        ).execute()
        print(f"  Lexicon: {min(i + batch_size, len(entries))}/{len(entries)}")


if __name__ == "__main__":
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("Loading verses...")
    load_verses(client)
    print("Loading lexicon...")
    load_lexicon(client)
    print("Done.")
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pytest tests/test_bootstrap_lexicon.py -v
```
Expected: all 4 tests PASS

- [ ] **Step 5: Run against Supabase**

```bash
python pipeline/bootstrap_lexicon.py
```
Verify in Supabase Table Editor:
- `verses` table has ~7,900 rows
- `lexicon` table has thousands of rows, each with `bete_word`, `bete_phonetic`, `top_french`, `french_candidates`

- [ ] **Step 6: Commit**

```bash
git add pipeline/bootstrap_lexicon.py tests/test_bootstrap_lexicon.py
git commit -m "feat: bootstrap verses and lexicon into supabase"
```

---

## Task 8: Vectorization

**Files:**
- Create: `pipeline/vectorize.py`

> No unit tests for vectorize.py — it wraps a pre-trained model and a live Supabase call. Test by inspection (spot-check rows in Supabase after running).

- [ ] **Step 1: Implement pipeline/vectorize.py**

```python
# pipeline/vectorize.py
from sentence_transformers import SentenceTransformer
from supabase import create_client
from config import SUPABASE_URL, SUPABASE_SERVICE_KEY

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
BATCH_SIZE = 128


def vectorize_lexicon() -> None:
    """
    Generate embeddings for the French side of each lexicon entry
    and store them in the lexicon.embedding (pgvector) column.

    The French embedding is what the translator will use to find
    the closest Bété word given a French input token.

    Safe to re-run: skips entries that already have an embedding.
    """
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    model = SentenceTransformer(MODEL_NAME)

    # Fetch entries without embeddings
    response = (
        client.table("lexicon")
        .select("id,top_french")
        .is_("embedding", "null")
        .execute()
    )
    entries = response.data
    if not entries:
        print("All entries already have embeddings.")
        return

    print(f"Vectorizing {len(entries)} lexicon entries...")

    for i in range(0, len(entries), BATCH_SIZE):
        batch = entries[i : i + BATCH_SIZE]
        words = [e["top_french"] for e in batch]
        embeddings = model.encode(words, show_progress_bar=False)

        for entry, emb in zip(batch, embeddings):
            (
                client.table("lexicon")
                .update({"embedding": emb.tolist()})
                .eq("id", entry["id"])
                .execute()
            )

        done = min(i + BATCH_SIZE, len(entries))
        print(f"  {done}/{len(entries)}")

    print("Vectorization complete.")


if __name__ == "__main__":
    vectorize_lexicon()
```

- [ ] **Step 2: Run vectorize.py**

```bash
python pipeline/vectorize.py
```
Expected: processes entries in batches, prints progress. Takes a few minutes on first run (model download ~120MB). Safe to interrupt and resume.

- [ ] **Step 3: Spot-check in Supabase**

In Supabase SQL Editor, run:
```sql
select bete_word, top_french, embedding is not null as has_embedding
from lexicon
limit 10;
```
Expected: all rows show `has_embedding = true`.

- [ ] **Step 4: Commit**

```bash
git add pipeline/vectorize.py
git commit -m "feat: generate and store french word embeddings in pgvector"
```

---

## Pipeline Complete — How to Run End-to-End

```bash
# 1. Scrape NT from bible.com (~30 min)
python pipeline/scraper.py

# 2. Prepare corpus files for eflomal
python pipeline/prepare_corpus.py

# 3. Run word alignment (~10 min)
python pipeline/align.py

# 4. Load verses + lexicon into Supabase
python pipeline/bootstrap_lexicon.py

# 5. Generate and store French embeddings
python pipeline/vectorize.py
```

All scripts are idempotent — safe to re-run if interrupted.
