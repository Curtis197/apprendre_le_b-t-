# Semantic Translator Design
**Date:** 2026-05-17  
**Status:** Approved for implementation

## Problem

The current translator does string-based lexicon lookup (exact + ilike) and asks Claude Haiku to produce a token-by-token mapping. This approach fails on three fronts:

1. **Polysemy** — one French word can have multiple Bété translations depending on sense (e.g. *aimer* = romantic love vs. divine love)
2. **Coverage gaps** — if a French word has no exact lexicon entry, the lookup fails silently
3. **Grammar** — Bété word order and morphology differ from French; token-by-token output is not fluent Bété

## Goal

Produce one fluent Bété sentence per French input, using pre-computed lexicon data + validated grammar rules. Claude's role is strictly assembly — it never invents vocabulary. Quality improves automatically as the community validates inflected forms and grammar rules.

A disclaimer informs users the translator is in construction and enriched by community contributions.

---

## Architecture

```
French sentence
       │
       ▼
1. SEGMENT + LEMMATIZE
   Per token: check inflected_forms table (exact French form)
   If found   → use linked lexicon entry directly
   If not     → strip inflection via rule-based French lemmatizer → lemma

       │
       ▼
2. VECTOR LOOKUP (per unresolved lemma)
   Embed French lemma → pgvector similarity search on lexicon.embedding
   Return top-3 candidates: { bete_word, sense_tag, score }
   If score < threshold → mark token as unknown (keep French form)

       │
       ▼
3. GRAMMAR RULE RETRIEVAL
   Embed full French sentence (one call)
   pgvector similarity search on grammar_rules.embedding
   Return top-5 validated rules most relevant to this sentence

       │
       ▼
4. CLAUDE PROMPT (~400 tokens input)
   Input: candidates per token + relevant grammar rules + examples
   Task:  pick best candidate per token, apply grammar rules, output one fluent Bété sentence
   Constraint: never invent words; unknown tokens kept as French
   Output: { sentence: string, unknowns: string[], rules_applied: string[] }

       │
       ▼
5. RESPONSE to client
   { sentence, unknowns, rules_applied, cached }
```

**Fallback chain (no Claude call):**
- Full phrase found in `expressions` table → return directly (free)
- All tokens resolved via `inflected_forms` + zero candidate ambiguity → rule-based assembly, skip Claude

---

## Data Model

### `lexicon` table — new columns

| Column | Type | Purpose |
|---|---|---|
| `french_lemma` | text | Base/dictionary form of the French word (for lemma-level vector search) |
| `french_synonyms` | text[] | Near-synonyms to widen coverage |
| `sense_tag` | text | Disambiguates polysemy (e.g. `"love-romantic"`, `"love-divine"`) |
| `lemma` | text | Base form of the Bété word |
| `inflected_forms` | jsonb | Pre-computed Bété inflections `{"past": "...", "plural": "..."}` |

### `inflected_forms` table — new

Each row is one inflected French→Bété pair, linked to a lexicon entry.

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | PK |
| `lexicon_id` | uuid | FK → lexicon |
| `french_form` | text | Inflected French form (e.g. `"aimons"`, `"aimait"`) |
| `bete_form` | text | Corresponding Bété inflected form |
| `pos` | text | verb / noun / adj |
| `inflection_tag` | text | e.g. `"past"`, `"plural"`, `"feminine"` |
| `validated` | boolean | Community-validated flag |

### `grammar_rules` table — new columns

| Column | Type | Purpose |
|---|---|---|
| `embedding` | vector(384) | Embedded from `pattern_french + description` |
| `example_french` | text | Concrete example sentence in French |
| `example_bete` | text | Its Bété translation |

---

## Components

### French Lemmatizer (`lib/lemmatizer.ts`)

Rule-based suffix-stripping for common French inflections. No external dependency.

```
Verbs:      aimons/aimait/aimé/aimant → aimer
            finissons/finissait       → finir
Nouns:      enfants → enfant, chevaux → cheval
Adjectives: grandes → grand, belles → beau
```

Coverage target: ~80% of tokens resolved without vector search. Unknown forms fall through to vector search on raw form.

### Vector lookup (`lib/translator.ts` — refactored)

1. `resolveToken(frenchForm)` → check `inflected_forms` first, then embed lemma, then pgvector search
2. `retrieveGrammarRules(frenchSentence)` → embed sentence, pgvector search on `grammar_rules.embedding`
3. `buildPrompt(candidates, rules)` → structured ~400-token prompt
4. `assembleWithClaude(prompt)` → single Claude Haiku call, returns structured JSON

### Column naming note — critical

The DB column names are **inverted** from intuition:

| Column | Actual content | Display label |
|---|---|---|
| `bete_word` | Phonetic/IPA-like form from the Bible scrape (uses ɩ, ɛ, ɔ, ŋ, ʋ) | "phonétique" |
| `bete_phonetic` | Western/Latin alphabet form produced by `to_phonetic()` (maps ɩ→i, ɛ→e, etc.) | "mot bété" |

The Bible used a phonetic alphabet to transcribe Bété sounds. Everyday Bété writing uses the standard Latin alphabet. The pipeline converts the Bible form to Latin and stores it in `bete_phonetic` — but that column holds what is effectively the natural written word, not a phonetic transcription.

**Both values must always be returned and displayed with correct labels.** Never swap them.

### Response type (`lib/types.ts` — updated)

```typescript
interface TranslationResult {
  input:         string
  sentence:      string        // fluent Bété output (replaces tokens array)
  sentence_phonetic: string    // same sentence using bete_word (phonetic/Bible) forms
  unknowns:      string[]      // French words with no Bété candidate
  rules_applied: string[]      // grammar rule IDs used
  cached:        boolean
}
```

---

## Pipeline Changes

### Step 8 — Vectorize grammar rules (`pipeline/vectorize_grammar.py`)

- Fetch validated grammar rules from Supabase
- Embed `pattern_french + " " + description` using `paraphrase-multilingual-MiniLM-L12-v2`
- Store in `grammar_rules.embedding`
- Safe to re-run: skips already-embedded rows
- Should run automatically when new rules are validated

### Step 9 — Mine inflected forms (`pipeline/mine_inflections.py`)

- For each lexicon entry, scan the parallel corpus for French variants appearing in different inflected contexts
- Use IBM1 alignments to find which Bété form aligns with each French inflected form
- Insert candidates into `inflected_forms` with `validated=false`
- Community validates/corrects via web UI

### Step 10 — Update french_lemma (`pipeline/update_lemmas.py`)

- Apply suffix-stripping lemmatizer to each `lexicon.top_french`
- Store result in `lexicon.french_lemma`
- One-time migration; also runs on new entries

---

## Database Migration

```sql
-- lexicon additions
ALTER TABLE lexicon
  ADD COLUMN french_lemma      text,
  ADD COLUMN french_synonyms   text[],
  ADD COLUMN sense_tag         text,
  ADD COLUMN lemma             text,
  ADD COLUMN inflected_forms   jsonb;

-- inflected_forms table
CREATE TABLE inflected_forms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexicon_id     uuid REFERENCES lexicon(id) ON DELETE CASCADE,
  french_form    text NOT NULL,
  bete_form      text NOT NULL,
  pos            text,
  inflection_tag text,
  validated      boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX ON inflected_forms (french_form);
CREATE INDEX ON inflected_forms (lexicon_id);
CREATE INDEX ON grammar_rules USING ivfflat (embedding vector_cosine_ops);

-- grammar_rules additions
ALTER TABLE grammar_rules
  ADD COLUMN embedding      vector(384),
  ADD COLUMN example_french text,
  ADD COLUMN example_bete   text;
```

---

## Build Order

1. DB migration (schema changes)
2. `pipeline/update_lemmas.py` — populate `french_lemma`
3. `pipeline/mine_inflections.py` — populate `inflected_forms` candidates
4. `pipeline/vectorize_grammar.py` — embed grammar rules
5. `lib/lemmatizer.ts` — French lemmatizer
6. `lib/translator.ts` — refactor translation flow
7. `lib/types.ts` — update `TranslationResult`
8. `app/api/translate/route.ts` — update response handling
9. `app/translator/page.tsx` + components — update UI for fluent output + unknowns display + disclaimer

---

## Quality & Improvement Loop

- **Unknown words** are surfaced in the UI as contribution opportunities
- **Inflected forms** mined by the pipeline start unvalidated; community validates them → step 1 resolves more tokens → cheaper prompts → better quality
- **Grammar rules** gain embeddings as they are validated → step 3 retrieves more relevant rules
- **Expressions table** handles idiomatic phrases entirely without Claude

---

## Out of Scope

- Full statistical machine translation model
- spaCy or other NLP library dependencies
- Real-time grammar rule mining (rules are validated manually by community)
- Sentence-level embeddings for translation memory (future)
