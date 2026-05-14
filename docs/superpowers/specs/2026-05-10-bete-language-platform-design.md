# Bété Language Learning Platform — Design Spec
**Date:** 2026-05-10  
**Status:** Approved

---

## Overview

A platform to document, preserve, and learn the Bété language (Côte d'Ivoire) starting from the New Testament as a parallel corpus. The system aligns Bété and French texts verse-by-verse, bootstraps a community lexicon, and provides an AI-assisted French → Bété translator that improves through community contributions.

---

## Scope (Phase 1 + 2)

This spec covers:
1. The data pipeline (scraping, alignment, lexicon bootstrap, vectorization)
2. The Supabase database schema
3. The AI translator engine
4. The web application

Future phases (fine-tuning NLLB-200, mobile app) are out of scope.

---

## Language Pair

- **Source (input):** French — Louis Segond 1910 (LSG)
- **Target (output):** Bété
- **Corpus:** New Testament (~7,900 verse pairs)
- **Bété corpus URL pattern:** `https://www.bible.com/bible/3284/{BOOK}.{CH}.BET`
- **French corpus URL pattern:** `https://www.bible.com/bible/93/{BOOK}.{CH}.LSG`

Each Bété word has two stored forms:
- **Standard:** true orthography with special characters (e.g. `gwälɩɛ`)
- **Phonetic:** simplified typeable form (e.g. `gwaliae`)

---

## 1. Data Pipeline

### 1.1 Scraper
- Language: Python
- Libraries: `httpx`, `BeautifulSoup4`
- Iterates all 27 NT books, all chapters
- Extracts verse-by-verse pairs: `(book, chapter, verse, bete_text, french_text)`
- Handles Bété Unicode characters (ɩ, ɛ, ʋ, ö, ä, etc.) correctly
- Output: JSONL file `corpus/nt_parallel.jsonl`
- Rate-limited to respect bible.com (1 request/second)

### 1.2 Alignment — eflomal
- Input: two plain text files, one sentence per line (Bété and French), verse-aligned
- Output: word alignment probabilities `(bete_word, french_word, score)`
- Run bidirectionally and symmetrize (grow-diag-final heuristic)
- Output: `corpus/alignments.jsonl`

### 1.3 Lexicon Bootstrap
- Filter alignments by minimum probability threshold (default: 0.1)
- For each unique Bété word: collect top French candidates sorted by score
- Generate phonetic form programmatically (character mapping table)
- Load into Supabase `lexicon` table as draft entries (`validated = false`)
- Load raw alignments into `alignments` table for future retraining

### 1.4 Vectorization
- Model: `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions, multilingual)
- Embed each **French** word/phrase (used as lookup key for French → Bété)
- Store embedding in `lexicon.embedding` (pgvector column)
- Also embed `expressions.bete_phrase` for expression matching
- Script: `pipeline/vectorize.py`

---

## 2. Database Schema (Supabase + pgvector)

```sql
-- Raw parallel corpus
create table verses (
  id uuid primary key default gen_random_uuid(),
  book text not null,
  chapter int not null,
  verse int not null,
  bete_text text not null,
  french_text text not null
);

-- Core lexicon
create table lexicon (
  id uuid primary key default gen_random_uuid(),
  bete_word text not null,           -- standard orthography
  bete_phonetic text not null,       -- simplified typeable form
  french_candidates jsonb not null,  -- [{word, score}, ...]
  top_french text not null,          -- highest-score candidate
  probability float not null,
  embedding vector(384),             -- French word embedding for lookup
  pos text,                          -- part of speech (added by users)
  notes text,
  validated bool default false,
  upvotes int default 0,
  created_at timestamptz default now()
);
create index on lexicon using ivfflat (embedding vector_cosine_ops);
create index on lexicon (top_french);
create index on lexicon (bete_phonetic);

-- NT example sentences per lexicon entry
create table lexicon_examples (
  id uuid primary key default gen_random_uuid(),
  lexicon_id uuid references lexicon(id) on delete cascade,
  verse_id uuid references verses(id),
  bete_snippet text not null,
  french_snippet text not null
);

-- Raw eflomal output (kept for retraining)
create table alignments (
  id uuid primary key default gen_random_uuid(),
  bete_word text not null,
  french_word text not null,
  score float not null,
  verse_id uuid references verses(id)
);

-- Grammar rules (user-contributed)
create table grammar_rules (
  id uuid primary key default gen_random_uuid(),
  category text not null,        -- 'verb' | 'noun' | 'tense' | 'agreement' | 'other'
  pattern_french text not null,  -- trigger pattern in French
  pattern_bete text not null,    -- corresponding Bété pattern
  description text not null,
  example_french text,
  example_bete text,
  example_bete_phonetic text,
  validated bool default false,
  upvotes int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Idiomatic / fixed expressions (user-contributed)
create table expressions (
  id uuid primary key default gen_random_uuid(),
  french_phrase text not null,
  bete_phrase text not null,
  bete_phonetic text not null,
  type text not null,            -- 'idiomatic' | 'fixed' | 'proverb'
  embedding vector(384),         -- French phrase embedding for matching
  example_verse_id uuid references verses(id),
  validated bool default false,
  upvotes int default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);
create index on expressions using ivfflat (embedding vector_cosine_ops);

-- User feedback on translations and lexicon entries
create table user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  lexicon_id uuid references lexicon(id),
  type text not null,            -- 'confirm' | 'reject' | 'suggest'
  suggested_bete text,           -- user's proposed Bété word
  suggested_bete_phonetic text,
  translator_phrase text,        -- full phrase context if from translator
  created_at timestamptz default now()
);
```

---

## 3. AI Translator Engine (French → Bété)

### 3.1 Translation Pipeline (per request)

1. **Expression scan:** embed input French phrase, run pgvector similarity search on `expressions` — any match above threshold (0.85) is treated as an atomic unit, bypassing word-level lookup
2. **Tokenization:** remaining French text split into tokens (Unicode-aware)
3. **Word lookup:** for each token:
   - Exact match on `lexicon.top_french`
   - If no match: pgvector cosine similarity on `lexicon.embedding`
   - Candidate score = `probability × (1 + upvotes) / (1 + rejects)`
4. **Grammar rule injection:** fetch relevant rules by category matching detected POS tags
5. **LLM assembly:** send to Claude Haiku (Anthropic API) with structured prompt:
   ```
   Translate French → Bété. Output phonetic form only.
   Lexicon matches: [token → {bete_phonetic, bete_word, score}]
   Matched expressions: [french_phrase → {bete_phonetic, bete_word}]
   Grammar rules: [relevant rules]
   Input: {french_text}
   ```
6. **Output:** LLM returns phonetic Bété → system resolves standard form from lexicon → returns both forms word-aligned

### 3.2 Feedback Loop
- User flags a word or full phrase as wrong → `user_feedback` row inserted
- Rejection increments effective reject count → candidate score drops
- Next translation call for the same word returns a different candidate
- No retraining required for basic corrections

### 3.3 API Route
`POST /api/translate` — Next.js API route, calls Supabase directly via JS client and Anthropic API. No separate Python server at runtime.

---

## 4. Web Application (Next.js App Router)

### 4.1 Auth
- Supabase Auth (email + Google OAuth)
- Anonymous: view lexicon, use translator
- Authenticated: contribute, vote, flag
- Admin role: approve entries below upvote threshold, manage corpus

### 4.2 Lexicon Browser
- Search by French word or Bété phonetic form
- Entry view: standard + phonetic Bété, French candidates with scores, POS, NT examples
- Actions: upvote/downvote candidate, propose alternative Bété, add notes

### 4.3 Translator
- Input: French text
- Output: Bété translation (phonetic + standard) displayed word-aligned
- Matched expressions shown as highlighted blocks
- Per-word flag button → opens feedback form
- Full-phrase flag button

### 4.4 Contribution Panel
- Add grammar rule (category, French pattern, Bété pattern, description, example)
- Add expression (French phrase, Bété phrase + phonetic, type)
- Browse pending contributions with upvote/downvote
- Entries crossing 3 upvotes auto-activate in translator context

---

## 5. Tech Stack

| Layer | Choice |
|-------|--------|
| Scraping + alignment pipeline | Python (`httpx`, `beautifulsoup4`, `eflomal`, `sentence-transformers`) |
| Database + Auth | Supabase (PostgreSQL + pgvector + Auth) |
| Backend API | Next.js App Router API routes |
| Frontend | Next.js App Router + Tailwind CSS |
| LLM (translator) | Claude Haiku via Anthropic API |
| Embeddings | `paraphrase-multilingual-MiniLM-L12-v2` (local, pipeline only) |
| Hosting | Vercel (Next.js) |

---

## 6. Out of Scope (Future Phases)

- Fine-tuning NLLB-200 on the validated corpus
- Mobile application
- Audio/pronunciation recordings
- Bété → French direction (reverse translator)
- Automated grammar rule extraction from aligned corpus
