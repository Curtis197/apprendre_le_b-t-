# Semantic Translator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace string-based lexicon lookup with a vector-first pipeline that resolves French inflected forms, retrieves semantically relevant Bété candidates and grammar rules, then asks Claude to assemble one fluent Bété sentence.

**Architecture:** Each French token is resolved via `inflected_forms` table first (exact match), then via pgvector similarity on the lemmatized word. Top-K Bété candidates plus the 5 most relevant grammar rules are passed to Claude Haiku, which picks candidates and applies rules to produce a fluent sentence. Two output forms are returned: `sentence` (western Latin alphabet, from `bete_phonetic` DB column) and `sentence_phonetic` (IPA/Bible form, from `bete_word` DB column).

**Column naming warning:** In the DB, `bete_word` stores the **phonetic/IPA Bible form** and `bete_phonetic` stores the **western Latin everyday form**. The names are inverted from intuition. Never swap them.

**Tech Stack:** Next.js 16 App Router, Supabase (pgvector), Claude Haiku (`claude-haiku-4-5-20251001`), HuggingFace Inference API (`paraphrase-multilingual-MiniLM-L12-v2`), Python 3 + pytest for pipeline scripts.

---

## File Map

**Create:**
- `supabase/migrations/20260517000001_semantic_translator.sql` — schema additions + RPC functions
- `web/lib/lemmatizer.ts` — rule-based French suffix stripper
- `web/lib/lemmatizer.test.ts` — manual test script (run with `npx tsx`)
- `web/lib/embedder.ts` — HuggingFace inference wrapper
- `pipeline/update_lemmas.py` — populate `lexicon.french_lemma`
- `pipeline/vectorize_grammar.py` — embed grammar rules into `grammar_rules.embedding`
- `pipeline/mine_inflections.py` — mine corpus for inflected form pairs

**Modify:**
- `web/lib/types.ts` — replace `TranslationToken`/`TranslationResult` with new shape
- `web/lib/translator.ts` — full rewrite of translation pipeline
- `web/lib/translation-cache.ts` — update cache shape validation
- `web/components/TranslatorOutput.tsx` — render sentence + unknowns + phonetic + disclaimer
- `web/components/FeedbackButton.tsx` — adapt to sentence-level feedback
- `web/.env.local` — add `HUGGINGFACE_API_KEY`
- `pipeline/run_dialect.py` — wire in steps 8–10

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260517000001_semantic_translator.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260517000001_semantic_translator.sql

-- ── lexicon additions ────────────────────────────────────────────────────────
ALTER TABLE lexicon
  ADD COLUMN IF NOT EXISTS french_lemma     text,
  ADD COLUMN IF NOT EXISTS french_synonyms  text[],
  ADD COLUMN IF NOT EXISTS sense_tag        text,
  ADD COLUMN IF NOT EXISTS lemma            text,
  ADD COLUMN IF NOT EXISTS inflected_forms  jsonb;

-- Index for lemma-level lookup (used by update_lemmas.py and vector search)
CREATE INDEX IF NOT EXISTS lexicon_french_lemma_idx ON lexicon (french_lemma);

-- ── inflected_forms table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inflected_forms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexicon_id     uuid NOT NULL REFERENCES lexicon(id) ON DELETE CASCADE,
  french_form    text NOT NULL,
  bete_form      text NOT NULL,     -- western Latin (everyday) form
  bete_phonetic  text NOT NULL,     -- IPA/Bible phonetic form
  pos            text,
  inflection_tag text,
  validated      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inflected_forms_french_form_idx ON inflected_forms (french_form);
CREATE INDEX IF NOT EXISTS inflected_forms_lexicon_id_idx  ON inflected_forms (lexicon_id);

-- ── grammar_rules additions ──────────────────────────────────────────────────
ALTER TABLE grammar_rules
  ADD COLUMN IF NOT EXISTS embedding vector(384);

CREATE INDEX IF NOT EXISTS grammar_rules_embedding_idx
  ON grammar_rules USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ── RPC: vector search on lexicon ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION match_lexicon(
  query_embedding vector(384),
  match_dialect   text,
  match_count     int DEFAULT 3
)
RETURNS TABLE (
  id           uuid,
  bete_word    text,
  bete_phonetic text,
  french_lemma text,
  top_french   text,
  sense_tag    text,
  probability  float,
  similarity   float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, bete_word, bete_phonetic, french_lemma, top_french, sense_tag, probability,
    1 - (embedding <=> query_embedding) AS similarity
  FROM lexicon
  WHERE dialect = match_dialect
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── RPC: vector search on grammar_rules ──────────────────────────────────────
CREATE OR REPLACE FUNCTION match_grammar_rules(
  query_embedding vector(384),
  match_count     int DEFAULT 5
)
RETURNS TABLE (
  id             uuid,
  category       text,
  pattern_french text,
  pattern_bete   text,
  description    text,
  example_french text,
  example_bete   text,
  similarity     float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, category, pattern_french, pattern_bete, description,
    example_french, example_bete,
    1 - (embedding <=> query_embedding) AS similarity
  FROM grammar_rules
  WHERE validated = true
    AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

- [ ] **Step 2: Apply migration via Supabase dashboard or CLI**

```bash
# Option A — Supabase CLI (if linked)
npx supabase db push

# Option B — paste into Supabase SQL editor at supabase.com/dashboard
```

Expected: no errors, new columns visible in table editor.

- [ ] **Step 3: Verify migration**

In the Supabase SQL editor, run:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'lexicon' AND column_name IN ('french_lemma','sense_tag','inflected_forms');

SELECT COUNT(*) FROM inflected_forms;

SELECT proname FROM pg_proc WHERE proname IN ('match_lexicon','match_grammar_rules');
```
Expected: 3 rows in first query, 0 in second, 2 rows in third.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260517000001_semantic_translator.sql
git commit -m "feat: add semantic translator schema — inflected_forms, grammar embeddings, vector RPCs"
```

---

## Task 2: Update Types

**Files:**
- Modify: `web/lib/types.ts`

The current `TranslationToken` and `TranslationResult` are replaced. `FeedbackToken` is a minimal new type for word-level feedback within the sentence.

- [ ] **Step 1: Replace translation types in `web/lib/types.ts`**

Remove the existing `TranslationToken` and `TranslationResult` interfaces (lines 119–132) and replace with:

```typescript
// ── Translation types ──────────────────────────────────────────────────────

/**
 * One resolved word used internally and for word-level feedback.
 * bete_word    = IPA/Bible phonetic form (stored in lexicon.bete_word column)
 * bete_western = western Latin everyday form (stored in lexicon.bete_phonetic column)
 */
export interface FeedbackToken {
  french_word:  string
  bete_western: string   // from lexicon.bete_phonetic (western Latin)
  bete_word:    string   // from lexicon.bete_word (IPA/Bible phonetic)
  lexicon_id?:  string
}

export interface TranslationResult {
  input:             string
  sentence:          string    // fluent Bété — western Latin alphabet (bete_phonetic values)
  sentence_phonetic: string    // fluent Bété — IPA/Bible phonetic form (bete_word values)
  unknowns:          string[]  // French words with no Bété candidate
  rules_applied:     string[]  // grammar rule descriptions used
  tokens:            FeedbackToken[]  // kept for word-level feedback
  cached:            boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/types.ts
git commit -m "feat: replace TranslationToken/TranslationResult with semantic translator types"
```

---

## Task 3: French Lemmatizer

**Files:**
- Create: `web/lib/lemmatizer.ts`
- Create: `web/lib/lemmatizer.test.ts`

The lemmatizer strips common French inflections to a base form. It must produce **the same output** when applied to both query words and stored `top_french` values — consistency matters more than perfect linguistics. Target: ~80% of tokens resolved without vector search.

- [ ] **Step 1: Write failing test first**

Create `web/lib/lemmatizer.test.ts`:

```typescript
// Run with: npx tsx web/lib/lemmatizer.test.ts
import assert from 'node:assert/strict'
import { lemmatize } from './lemmatizer.js'

const cases: [string, string][] = [
  // Irregular verbs
  ['sommes', 'être'],
  ['étaient', 'être'],
  ['avons', 'avoir'],
  ['avait', 'avoir'],
  ['vont', 'aller'],
  ['font', 'faire'],
  // -er verb inflections
  ['aimons', 'aimer'],
  ['aimait', 'aimer'],
  ['aimaient', 'aimer'],
  ['aimé', 'aimer'],
  ['aimée', 'aimer'],
  ['aimant', 'aimer'],
  // -ir verb inflections
  ['finissons', 'finir'],
  ['finissait', 'finir'],
  // Noun plurals
  ['chevaux', 'cheval'],
  ['enfants', 'enfant'],
  ['femmes', 'femme'],
  // Stopwords (unchanged)
  ['le', 'le'],
  ['et', 'et'],
  ['nous', 'nous'],
  // Already base form (unchanged)
  ['aimer', 'aimer'],
  ['père', 'père'],
  ['eau', 'eau'],
]

let passed = 0
for (const [input, expected] of cases) {
  const result = lemmatize(input)
  assert.strictEqual(result, expected, `lemmatize('${input}') → '${result}', expected '${expected}'`)
  passed++
}
console.log(`✓ ${passed}/${cases.length} tests passed`)
```

- [ ] **Step 2: Run test — expect failure (module not found)**

```bash
cd "c:\Users\DELL LATITUDE 7480\traduction bété\web"
npx tsx lib/lemmatizer.test.ts
```

Expected: `Error: Cannot find module './lemmatizer.js'`

- [ ] **Step 3: Implement `web/lib/lemmatizer.ts`**

```typescript
// lib/lemmatizer.ts

const IRREGULARS: Record<string, string> = {
  // être
  suis: 'être', es: 'être', est: 'être', sommes: 'être', êtes: 'être', sont: 'être',
  étais: 'être', était: 'être', étions: 'être', étiez: 'être', étaient: 'être',
  serai: 'être', seras: 'être', sera: 'être', serons: 'être', serez: 'être', seront: 'être',
  été: 'être',
  // avoir
  ai: 'avoir', as: 'avoir', avons: 'avoir', avez: 'avoir', ont: 'avoir',
  avais: 'avoir', avait: 'avoir', avions: 'avoir', aviez: 'avoir', avaient: 'avoir',
  aurai: 'avoir', auras: 'avoir', aura: 'avoir', aurons: 'avoir', aurez: 'avoir', auront: 'avoir',
  eu: 'avoir',
  // aller
  vais: 'aller', vas: 'aller', va: 'aller', allons: 'aller', allez: 'aller', vont: 'aller',
  allais: 'aller', allait: 'aller', allaient: 'aller',
  irai: 'aller', iras: 'aller', ira: 'aller', irons: 'aller', irez: 'aller', iront: 'aller',
  // faire
  fais: 'faire', fait: 'faire', faisons: 'faire', faites: 'faire', font: 'faire',
  faisais: 'faire', faisait: 'faire', faisaient: 'faire',
  ferai: 'faire', feras: 'faire', fera: 'faire', ferons: 'faire', ferez: 'faire', feront: 'faire',
  // pouvoir
  peux: 'pouvoir', peut: 'pouvoir', pouvons: 'pouvoir', pouvez: 'pouvoir', peuvent: 'pouvoir',
  pouvais: 'pouvoir', pouvait: 'pouvoir', pouvaient: 'pouvoir',
  // vouloir
  veux: 'vouloir', veut: 'vouloir', voulons: 'vouloir', voulez: 'vouloir', veulent: 'vouloir',
  voulais: 'vouloir', voulait: 'vouloir', voulaient: 'vouloir',
  // venir
  viens: 'venir', vient: 'venir', venons: 'venir', venez: 'venir', viennent: 'venir',
  venais: 'venir', venait: 'venir', venaient: 'venir',
  // voir
  vois: 'voir', voit: 'voir', voyons: 'voir', voyez: 'voir', voient: 'voir',
  voyais: 'voir', voyait: 'voir', voyaient: 'voir',
  // irregular plurals
  chevaux: 'cheval', journaux: 'journal', travaux: 'travail', yeux: 'œil',
}

const STOPWORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux', 'de',
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'si', 'que', 'qui', 'dont', 'où',
  'je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'on',
  'me', 'te', 'se', 'lui', 'y', 'en', 'ce', 'cet', 'cette', 'ces',
  'mon', 'ton', 'son', 'ma', 'ta', 'sa', 'nos', 'vos', 'leur', 'leurs',
  'pas', 'plus', 'très', 'bien', 'tout', 'aussi', 'même', 'ne',
])

// [suffix, replacement, minStemLength] — longest first
const RULES: [string, string, number][] = [
  ['issaient', 'ir', 3],
  ['issions',  'ir', 3],
  ['issaient', 'ir', 3],
  ['issons',   'ir', 3],
  ['issiez',   'ir', 3],
  ['issait',   'ir', 3],
  ['issant',   'ir', 3],
  ['issez',    'ir', 3],
  ['issent',   'ir', 3],
  ['aient',    'er', 3],
  ['eront',    'er', 3],
  ['erons',    'er', 3],
  ['erez',     'er', 3],
  ['aient',    'er', 3],
  ['ées',      'er', 3],
  ['ant',      'er', 3],
  ['ait',      'er', 3],
  ['ons',      'er', 3],
  ['ée',       'er', 3],
  ['és',       'er', 3],
  ['ez',       'er', 3],
  ['es',       'e',  4],
  ['s',        '',   4],
]

export function lemmatize(word: string): string {
  const w = word.toLowerCase().replace(/[.,!?;:«»"''']/g, '').trim()
  if (!w || w.length <= 2) return w
  if (STOPWORDS.has(w)) return w
  if (w in IRREGULARS) return IRREGULARS[w]

  for (const [suffix, replacement, minStem] of RULES) {
    if (w.endsWith(suffix) && w.length - suffix.length >= minStem) {
      return w.slice(0, w.length - suffix.length) + replacement
    }
  }

  return w
}
```

- [ ] **Step 4: Run test — expect all passing**

```bash
npx tsx lib/lemmatizer.test.ts
```

Expected: `✓ 23/23 tests passed`

- [ ] **Step 5: Commit**

```bash
git add web/lib/lemmatizer.ts web/lib/lemmatizer.test.ts
git commit -m "feat: add French rule-based lemmatizer with tests"
```

---

## Task 4: Embedding Utility

**Files:**
- Create: `web/lib/embedder.ts`
- Modify: `web/.env.local` (add key)

Wraps HuggingFace Inference API. Uses the **same model** as the Python pipeline (`paraphrase-multilingual-MiniLM-L12-v2`) so query vectors are compatible with stored `lexicon.embedding` values.

- [ ] **Step 1: Add `HUGGINGFACE_API_KEY` to `web/.env.local`**

Obtain a free key from https://huggingface.co/settings/tokens (read access is enough).

Append to `web/.env.local`:
```
HUGGINGFACE_API_KEY=hf_...your_key_here...
```

- [ ] **Step 2: Create `web/lib/embedder.ts`**

```typescript
import 'server-only'
// lib/embedder.ts
// Produces 384-dim vectors compatible with lexicon.embedding (same model as pipeline/vectorize.py)

const HF_URL =
  'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'

function meanPool(tokenEmbeddings: number[][]): number[] {
  const dim = tokenEmbeddings[0].length
  const pooled = new Array<number>(dim).fill(0)
  for (const tok of tokenEmbeddings) {
    for (let i = 0; i < dim; i++) pooled[i] += tok[i]
  }
  return pooled.map(v => v / tokenEmbeddings.length)
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(HF_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  })
  if (!res.ok) {
    throw new Error(`Embedding API error ${res.status}: ${await res.text()}`)
  }
  const raw: number[] | number[][] | number[][][] = await res.json()

  // HF returns flat [384], [seq][384], or [1][seq][384] depending on model/version
  if (typeof raw[0] === 'number') return raw as number[]
  if (typeof (raw as number[][])[0][0] === 'number') return meanPool(raw as number[][])
  return meanPool((raw as number[][][])[0])
}
```

- [ ] **Step 3: Verify manually — start dev server and call via curl**

```bash
# In a separate terminal, dev server should already be running on :3000
# Quick smoke test — paste this into browser console or run curl:
curl -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"père","dialect":"western"}'
```

This will fail until translator.ts is updated — that's expected at this stage.

- [ ] **Step 4: Commit**

```bash
git add web/lib/embedder.ts web/.env.local
git commit -m "feat: add HuggingFace embedding utility (paraphrase-multilingual-MiniLM-L12-v2)"
```

---

## Task 5: Refactor `translator.ts`

**Files:**
- Modify: `web/lib/translator.ts` (full rewrite)

This is the core of the new pipeline. Five internal functions, one exported `translate`.

**Column naming reminder:**
- `lexicon.bete_word` → IPA/Bible phonetic form → goes into `sentence_phonetic`
- `lexicon.bete_phonetic` → western Latin everyday form → goes into `sentence`

- [ ] **Step 1: Rewrite `web/lib/translator.ts`**

```typescript
import 'server-only'
// lib/translator.ts
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { embed } from './embedder'
import { lemmatize } from './lemmatizer'
import { FeedbackToken, TranslationResult } from './types'
import { type DialectKey } from './dialect'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types used only inside this module ───────────────────────────────────────

interface Candidate {
  lexicon_id:   string
  // bete_word column = IPA/Bible phonetic form
  bete_phonetic_form: string  // from lexicon.bete_word
  // bete_phonetic column = western Latin everyday form
  bete_western_form:  string  // from lexicon.bete_phonetic
  sense_tag:    string | null
  probability:  number
  similarity:   number
}

interface ResolvedToken {
  french_form:  string  // original input token (with punctuation)
  french_clean: string  // cleaned + lemmatized
  candidates:   Candidate[]
  source:       'inflected_forms' | 'vector' | 'unknown'
}

interface GrammarRule {
  id:            string
  pattern_french: string
  pattern_bete:   string
  description:    string
  example_french: string | null
  example_bete:   string | null
}

// ── Step 1: check full phrase as expression ───────────────────────────────────

async function findExpression(
  client: SupabaseClient,
  phrase: string,
): Promise<{ bete_western: string; bete_phonetic_form: string } | null> {
  const { data } = await client
    .from('expressions')
    .select('bete_phrase, bete_phonetic')
    .eq('french_phrase', phrase.toLowerCase())
    .eq('validated', true)
    .maybeSingle()
  if (!data) return null
  // expressions.bete_phrase = western Latin form, expressions.bete_phonetic = IPA form
  return { bete_western: data.bete_phrase, bete_phonetic_form: data.bete_phonetic }
}

// ── Step 2: resolve each token ───────────────────────────────────────────────

async function resolveToken(
  client: SupabaseClient,
  rawToken: string,
  dialect: DialectKey,
): Promise<ResolvedToken> {
  const clean = rawToken.replace(/[.,!?;:«»"''']/g, '').toLowerCase().trim()
  const lemma = lemmatize(clean)

  // 2a. Check inflected_forms (exact French form match — fastest, no embedding needed)
  const { data: inflected } = await client
    .from('inflected_forms')
    .select('lexicon_id, bete_form, bete_phonetic, inflection_tag')
    .eq('french_form', clean)
    .eq('validated', true)
    .limit(3)

  if (inflected && inflected.length > 0) {
    // Verify lexicon entry belongs to the correct dialect
    const ids = inflected.map(r => r.lexicon_id)
    const { data: lexRows } = await client
      .from('lexicon')
      .select('id, bete_word, bete_phonetic, sense_tag, probability')
      .in('id', ids)
      .eq('dialect', dialect)

    const dialectIds = new Set((lexRows ?? []).map(r => r.id))
    const valid = inflected.filter(r => dialectIds.has(r.lexicon_id))

    if (valid.length > 0) {
      const candidates: Candidate[] = valid.map(r => {
        const lex = (lexRows ?? []).find(l => l.id === r.lexicon_id)
        return {
          lexicon_id:          r.lexicon_id,
          bete_phonetic_form:  r.bete_phonetic,  // IPA form for this inflection
          bete_western_form:   r.bete_form,       // western Latin form for this inflection
          sense_tag:           lex?.sense_tag ?? null,
          probability:         lex?.probability ?? 0,
          similarity:          1.0,
        }
      })
      return { french_form: rawToken, french_clean: clean, candidates, source: 'inflected_forms' }
    }
  }

  // 2b. Vector search on lemma embedding
  let embedding: number[]
  try {
    embedding = await embed(lemma || clean)
  } catch {
    return { french_form: rawToken, french_clean: clean, candidates: [], source: 'unknown' }
  }

  const { data: matches } = await client.rpc('match_lexicon', {
    query_embedding: embedding,
    match_dialect:   dialect,
    match_count:     3,
  })

  if (!matches || matches.length === 0) {
    return { french_form: rawToken, french_clean: clean, candidates: [], source: 'unknown' }
  }

  const candidates: Candidate[] = matches.map((m: {
    id: string; bete_word: string; bete_phonetic: string;
    sense_tag: string | null; probability: number; similarity: number
  }) => ({
    lexicon_id:         m.id,
    bete_phonetic_form: m.bete_word,      // lexicon.bete_word = IPA/Bible form
    bete_western_form:  m.bete_phonetic,  // lexicon.bete_phonetic = western Latin form
    sense_tag:          m.sense_tag,
    probability:        m.probability,
    similarity:         m.similarity,
  }))

  return { french_form: rawToken, french_clean: clean, candidates, source: 'vector' }
}

// ── Step 3: retrieve grammar rules by sentence embedding ─────────────────────

async function retrieveGrammarRules(
  client: SupabaseClient,
  frenchSentence: string,
): Promise<GrammarRule[]> {
  let embedding: number[]
  try {
    embedding = await embed(frenchSentence)
  } catch {
    return []
  }

  const { data } = await client.rpc('match_grammar_rules', {
    query_embedding: embedding,
    match_count: 5,
  })

  return (data ?? []) as GrammarRule[]
}

// ── Step 4: build Claude prompt ───────────────────────────────────────────────

function buildPrompt(
  frenchText: string,
  resolvedTokens: ResolvedToken[],
  rules: GrammarRule[],
): string {
  const tokenLines = resolvedTokens.map(t => {
    if (t.candidates.length === 0) return `- "${t.french_form}" → [unknown — keep French word]`
    const opts = t.candidates
      .map(c => `${c.bete_western_form}${c.sense_tag ? ` (${c.sense_tag})` : ''} [score:${c.similarity.toFixed(2)}]`)
      .join(', ')
    return `- "${t.french_form}" → ${opts}`
  })

  const ruleLines = rules.length > 0
    ? rules.map(r =>
        `[${r.pattern_french} → ${r.pattern_bete}] ${r.description}` +
        (r.example_french ? `\n  ex: "${r.example_french}" → "${r.example_bete}"` : '')
      ).join('\n')
    : '(aucune règle disponible — utilisez votre meilleur jugement)'

  return `You are a French → Bété translator. Bété is a language from Côte d'Ivoire.
Use ONLY the candidate words provided — never invent Bété vocabulary.
Unknown words must remain as French.

French input: ${frenchText}

Resolved token candidates (western Latin Bété forms):
${tokenLines.join('\n')}

Active grammar rules:
${ruleLines}

Return ONLY this JSON (no explanation):
{
  "sentence": "<one fluent Bété sentence using western Latin forms>",
  "unknowns": ["<french word>", ...],
  "rules_applied": ["<short rule description>", ...]
}`
}

// ── Step 5: call Claude and parse ─────────────────────────────────────────────

async function assembleWithClaude(
  prompt: string,
): Promise<{ sentence: string; unknowns: string[]; rules_applied: string[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  // Strip markdown code fences if present
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = JSON.parse(json)
  return {
    sentence:      String(parsed.sentence ?? ''),
    unknowns:      Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
    rules_applied: Array.isArray(parsed.rules_applied) ? parsed.rules_applied : [],
  }
}

// ── Build phonetic sentence from western sentence ─────────────────────────────

function buildPhoneticSentence(
  westernSentence: string,
  resolvedTokens: ResolvedToken[],
): string {
  // Build map: western form → IPA/Bible form (from top candidate)
  const westernToPhonetic = new Map<string, string>()
  for (const t of resolvedTokens) {
    if (t.candidates.length > 0) {
      westernToPhonetic.set(
        t.candidates[0].bete_western_form.toLowerCase(),
        t.candidates[0].bete_phonetic_form,
      )
    }
  }

  return westernSentence
    .split(/\s+/)
    .map(w => westernToPhonetic.get(w.toLowerCase()) ?? w)
    .join(' ')
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function translate(
  client: SupabaseClient,
  frenchText: string,
  dialect: DialectKey = 'western',
): Promise<TranslationResult> {
  const input = frenchText.trim()

  // Check full phrase as expression first (cache-friendly, free)
  const expr = await findExpression(client, input)
  if (expr) {
    return {
      input,
      sentence:          expr.bete_western,
      sentence_phonetic: expr.bete_phonetic_form,
      unknowns:          [],
      rules_applied:     ['expression idiomatique'],
      tokens:            [],
      cached:            false,
    }
  }

  // Resolve each token in parallel
  const rawTokens = input.split(/\s+/).filter(Boolean)
  const resolvedTokens = await Promise.all(
    rawTokens.map(t => resolveToken(client, t, dialect))
  )

  // Retrieve grammar rules (sentence-level embedding)
  const rules = await retrieveGrammarRules(client, input)

  // Fallback: if all tokens resolved with single unambiguous candidate and no rules,
  // assemble directly without Claude
  const allUnambiguous = resolvedTokens.every(t => t.candidates.length === 1)
  const noRules = rules.length === 0

  let sentence: string
  let unknowns: string[]
  let rules_applied: string[]

  if (allUnambiguous && noRules) {
    sentence = resolvedTokens
      .map(t => t.candidates[0]?.bete_western_form ?? t.french_form)
      .join(' ')
    unknowns = resolvedTokens.filter(t => t.candidates.length === 0).map(t => t.french_form)
    rules_applied = []
  } else {
    const prompt = buildPrompt(input, resolvedTokens, rules)
    try {
      ;({ sentence, unknowns, rules_applied } = await assembleWithClaude(prompt))
    } catch {
      // Fallback: concatenate top candidates
      sentence = resolvedTokens
        .map(t => t.candidates[0]?.bete_western_form ?? t.french_form)
        .join(' ')
      unknowns = resolvedTokens.filter(t => t.candidates.length === 0).map(t => t.french_form)
      rules_applied = []
    }
  }

  const sentence_phonetic = buildPhoneticSentence(sentence, resolvedTokens)

  // Build FeedbackToken list from top candidates
  const tokens: FeedbackToken[] = resolvedTokens.map(t => ({
    french_word:  t.french_form,
    bete_western: t.candidates[0]?.bete_western_form ?? t.french_form,
    bete_word:    t.candidates[0]?.bete_phonetic_form ?? t.french_form,
    lexicon_id:   t.candidates[0]?.lexicon_id,
  }))

  return { input, sentence, sentence_phonetic, unknowns, rules_applied, tokens, cached: false }
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/translator.ts
git commit -m "feat: rewrite translator — vector lookup, inflected forms, Claude sentence assembly"
```

---

## Task 6: Update Translation Cache

**Files:**
- Modify: `web/lib/translation-cache.ts`

The cache validation checks for `result.tokens` (Array). Update to validate the new `sentence` (string) field.

- [ ] **Step 1: Update `getCached` validation in `web/lib/translation-cache.ts`**

Replace the validation block (lines 22–25):

```typescript
  // Old:
  // if (!result || typeof result !== 'object' || !Array.isArray(result.tokens)) {
  //   return null
  // }

  // New:
  if (!result || typeof result !== 'object' || typeof result.sentence !== 'string') {
    return null
  }
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/translation-cache.ts
git commit -m "fix: update translation cache validation for new TranslationResult shape"
```

---

## Task 7: Update UI Components

**Files:**
- Modify: `web/components/TranslatorOutput.tsx`
- Modify: `web/components/FeedbackButton.tsx`

`TranslatorOutput` now renders the fluent sentence, phonetic form, unknowns, rules, and disclaimer. `FeedbackButton` adapts to `FeedbackToken`.

- [ ] **Step 1: Rewrite `web/components/FeedbackButton.tsx`**

```tsx
'use client'
import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { FeedbackToken } from '@/lib/types'

interface Props {
  token: FeedbackToken
}

export function FeedbackButton({ token }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const supabaseRef = useRef(createClient())

  async function handleFlag() {
    if (state !== 'idle') return
    setState('loading')
    try {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      const { error } = await supabaseRef.current.from('user_feedback').insert({
        user_id:          user?.id ?? null,
        lexicon_id:       token.lexicon_id ?? null,
        type:             'reject',
        translator_phrase: `${token.french_word} → ${token.bete_western}`,
      })
      if (error) throw error
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done')  return <p className="text-xs text-muted-foreground mt-1">Signalé ✓</p>
  if (state === 'error') return <p className="text-xs text-red-500 mt-1">Erreur</p>

  return (
    <button
      onClick={handleFlag}
      disabled={state === 'loading'}
      className="text-xs text-red-400 hover:text-red-600 mt-1 block disabled:opacity-50"
      title="Signaler une erreur de traduction"
      aria-label="Signaler une erreur de traduction"
    >
      {state === 'loading' ? '…' : '✗'}
    </button>
  )
}
```

- [ ] **Step 2: Rewrite `web/components/TranslatorOutput.tsx`**

```tsx
import { TranslationResult } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { FeedbackButton } from './FeedbackButton'

interface Props {
  result: TranslationResult
}

export function TranslatorOutput({ result }: Props) {
  return (
    <div className="space-y-5">

      {/* Disclaimer */}
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Ce traducteur est en cours de construction. Les traductions sont automatiques et peuvent
        contenir des erreurs. Elles s'amélioreront grâce aux contributions de la communauté.
      </p>

      {/* Primary output — western Latin (everyday Bété) */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <p className="text-xs text-muted-foreground mb-1">Bété (écriture courante)</p>
        <p className="text-xl font-semibold">{result.sentence}</p>
      </div>

      {/* Secondary output — phonetic / Bible form */}
      <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground mb-1">Phonétique (forme biblique)</p>
        <p className="text-base font-mono">{result.sentence_phonetic}</p>
      </div>

      {/* Unknown words */}
      {result.unknowns.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Mots non traduits — aidez-nous à les ajouter au lexique :
          </p>
          <div className="flex flex-wrap gap-2">
            {result.unknowns.map(w => (
              <Badge key={w} variant="outline" className="text-red-600 border-red-300">
                {w}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Grammar rules applied */}
      {result.rules_applied.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Règles grammaticales appliquées :</p>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            {result.rules_applied.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Word-level breakdown + feedback */}
      {result.tokens.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Détail mot à mot
          </summary>
          <div className="flex flex-wrap gap-2 mt-3">
            {result.tokens.map((token, i) => (
              <div key={i} className="border rounded p-2 text-center min-w-[80px]">
                <p className="text-xs text-muted-foreground">{token.french_word}</p>
                <p className="font-bold text-sm">{token.bete_western}</p>
                <p className="text-xs font-mono text-muted-foreground">{token.bete_word}</p>
                <FeedbackButton token={token} />
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-muted-foreground">
        {result.cached ? '⚡ Depuis le cache' : '🤖 Traduction générée'}
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Test the translator live in browser**

Navigate to http://localhost:3000/translator and translate a short phrase (e.g. `le père aime`). Verify:
- Disclaimer banner shows
- Fluent sentence appears in both forms
- Unknown words (if any) show as red badges
- Word breakdown is available under "Détail mot à mot"

- [ ] **Step 4: Commit**

```bash
git add web/components/TranslatorOutput.tsx web/components/FeedbackButton.tsx
git commit -m "feat: update translator UI — fluent sentence, phonetic form, unknowns, disclaimer"
```

---

## Task 8: Pipeline — `update_lemmas.py`

**Files:**
- Create: `pipeline/update_lemmas.py`

Populates `lexicon.french_lemma` by applying a Python-side lemmatizer to each `lexicon.top_french`. Must use the same normalization logic as `lib/lemmatizer.ts` so query lemmas match stored lemmas.

- [ ] **Step 1: Write test first**

Add to `tests/test_update_lemmas.py`:

```python
# tests/test_update_lemmas.py
from pipeline.update_lemmas import lemmatize_fr

def test_irregular_verbs():
    assert lemmatize_fr("sommes") == "être"
    assert lemmatize_fr("avaient") == "avoir"
    assert lemmatize_fr("vont") == "aller"
    assert lemmatize_fr("font") == "faire"

def test_er_verb_inflections():
    assert lemmatize_fr("aimons") == "aimer"
    assert lemmatize_fr("aimait") == "aimer"
    assert lemmatize_fr("aimées") == "aimer"
    assert lemmatize_fr("aimant") == "aimer"

def test_ir_verb_inflections():
    assert lemmatize_fr("finissons") == "finir"
    assert lemmatize_fr("finissait") == "finir"

def test_noun_plurals():
    assert lemmatize_fr("chevaux") == "cheval"
    assert lemmatize_fr("enfants") == "enfant"
    assert lemmatize_fr("femmes") == "femme"

def test_stopwords_unchanged():
    assert lemmatize_fr("le") == "le"
    assert lemmatize_fr("et") == "et"

def test_base_forms_unchanged():
    assert lemmatize_fr("père") == "père"
    assert lemmatize_fr("aimer") == "aimer"
```

- [ ] **Step 2: Run test — expect failure**

```bash
cd "c:\Users\DELL LATITUDE 7480\traduction bété"
.venv\Scripts\python -m pytest tests/test_update_lemmas.py -v
```

Expected: `ImportError: cannot import name 'lemmatize_fr' from 'pipeline.update_lemmas'`

- [ ] **Step 3: Create `pipeline/update_lemmas.py`**

```python
# pipeline/update_lemmas.py
"""
Step 10: Populate lexicon.french_lemma by lemmatizing each lexicon.top_french.
Uses the same suffix-stripping rules as web/lib/lemmatizer.ts for consistency.
Safe to re-run: skips entries that already have french_lemma set.
"""
import re
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS

IRREGULARS = {
    # être
    "suis": "être", "es": "être", "est": "être", "sommes": "être", "êtes": "être", "sont": "être",
    "étais": "être", "était": "être", "étions": "être", "étiez": "être", "étaient": "être",
    "été": "être",
    # avoir
    "ai": "avoir", "as": "avoir", "avons": "avoir", "avez": "avoir", "ont": "avoir",
    "avais": "avoir", "avait": "avoir", "avions": "avoir", "aviez": "avoir", "avaient": "avoir",
    "eu": "avoir",
    # aller
    "vais": "aller", "vas": "aller", "va": "aller", "allons": "aller", "allez": "aller", "vont": "aller",
    "allais": "aller", "allait": "aller", "allaient": "aller",
    # faire
    "fais": "faire", "fait": "faire", "faisons": "faire", "faites": "faire", "font": "faire",
    "faisais": "faire", "faisait": "faire", "faisaient": "faire",
    # pouvoir
    "peux": "pouvoir", "peut": "pouvoir", "pouvons": "pouvoir", "pouvez": "pouvoir", "peuvent": "pouvoir",
    "pouvait": "pouvoir",
    # vouloir
    "veux": "vouloir", "veut": "vouloir", "voulons": "vouloir", "voulez": "vouloir", "veulent": "vouloir",
    "voulait": "vouloir",
    # venir
    "viens": "venir", "vient": "venir", "venons": "venir", "venez": "venir", "viennent": "venir",
    "venait": "venir",
    # voir
    "vois": "voir", "voit": "voir", "voyons": "voir", "voyez": "voir", "voient": "voir",
    "voyait": "voir",
    # irregular plurals
    "chevaux": "cheval", "journaux": "journal", "travaux": "travail", "yeux": "œil",
}

STOPWORDS = {
    "le", "la", "les", "un", "une", "des", "du", "au", "aux", "de",
    "et", "ou", "mais", "donc", "or", "ni", "car", "si", "que", "qui", "dont",
    "je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "on",
    "me", "te", "se", "lui", "y", "en", "ce", "cet", "cette", "ces",
    "mon", "ton", "son", "ma", "ta", "sa", "nos", "vos", "leur", "leurs",
    "pas", "plus", "très", "bien", "tout", "aussi", "même", "ne",
}

# (suffix, replacement, min_stem_length) — longest first
RULES = [
    ("issaient", "ir", 3),
    ("issions",  "ir", 3),
    ("issons",   "ir", 3),
    ("issiez",   "ir", 3),
    ("issait",   "ir", 3),
    ("issant",   "ir", 3),
    ("issez",    "ir", 3),
    ("issent",   "ir", 3),
    ("aient",    "er", 3),
    ("eront",    "er", 3),
    ("erons",    "er", 3),
    ("erez",     "er", 3),
    ("ées",      "er", 3),
    ("ant",      "er", 3),
    ("ait",      "er", 3),
    ("ons",      "er", 3),
    ("ée",       "er", 3),
    ("és",       "er", 3),
    ("ez",       "er", 3),
    ("es",       "e",  4),
    ("s",        "",   4),
]

_STRIP_RE = re.compile(r"[.,!?;:«»\"''']")


def lemmatize_fr(word: str) -> str:
    w = _STRIP_RE.sub("", word).lower().strip()
    if not w or len(w) <= 2:
        return w
    if w in STOPWORDS:
        return w
    if w in IRREGULARS:
        return IRREGULARS[w]
    for suffix, replacement, min_stem in RULES:
        if w.endswith(suffix) and len(w) - len(suffix) >= min_stem:
            return w[: len(w) - len(suffix)] + replacement
    return w


def update_lemmas(dialect: str = "western") -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    entries = (
        client.table("lexicon")
        .select("id,top_french")
        .eq("dialect", dialect)
        .is_("french_lemma", "null")
        .execute()
        .data or []
    )
    if not entries:
        print(f"All {dialect} entries already have french_lemma.")
        return

    print(f"Updating {len(entries)} {dialect} entries...")
    batch_size = 500
    for i in range(0, len(entries), batch_size):
        batch = entries[i : i + batch_size]
        for entry in batch:
            lemma = lemmatize_fr(entry["top_french"])
            client.table("lexicon").update({"french_lemma": lemma}).eq("id", entry["id"]).execute()
        print(f"  {min(i + batch_size, len(entries))}/{len(entries)}")
    print("Done.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    update_lemmas(dialect=args.dialect)
```

- [ ] **Step 4: Run tests — expect passing**

```bash
.venv\Scripts\python -m pytest tests/test_update_lemmas.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/update_lemmas.py tests/test_update_lemmas.py
git commit -m "feat: add update_lemmas pipeline step — populate lexicon.french_lemma"
```

---

## Task 9: Pipeline — `vectorize_grammar.py`

**Files:**
- Create: `pipeline/vectorize_grammar.py`

Embeds validated grammar rules into `grammar_rules.embedding` using the same model as `vectorize.py`. Safe to re-run: skips already-embedded rows.

- [ ] **Step 1: Write test**

Create `tests/test_vectorize_grammar.py`:

```python
# tests/test_vectorize_grammar.py
from pipeline.vectorize_grammar import build_rule_text

def test_build_rule_text_with_description():
    rule = {
        "pattern_french": "SVO",
        "description": "Le verbe suit le sujet directement",
    }
    text = build_rule_text(rule)
    assert "SVO" in text
    assert "verbe" in text

def test_build_rule_text_minimal():
    rule = {"pattern_french": "négation", "description": ""}
    text = build_rule_text(rule)
    assert "négation" in text
    assert isinstance(text, str)
    assert len(text) > 0
```

- [ ] **Step 2: Run test — expect failure**

```bash
.venv\Scripts\python -m pytest tests/test_vectorize_grammar.py -v
```

Expected: `ImportError`

- [ ] **Step 3: Create `pipeline/vectorize_grammar.py`**

```python
# pipeline/vectorize_grammar.py
"""
Step 8: Embed validated grammar rules into grammar_rules.embedding.
Safe to re-run: skips rows that already have an embedding.
"""
from sentence_transformers import SentenceTransformer
from supabase import create_client
from pipeline.config import SUPABASE_URL, SUPABASE_SERVICE_KEY

MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
BATCH_SIZE = 64


def build_rule_text(rule: dict) -> str:
    """Combine pattern and description into a single string for embedding."""
    parts = [rule.get("pattern_french", ""), rule.get("description", "")]
    return " ".join(p for p in parts if p).strip() or rule.get("pattern_french", "")


def vectorize_grammar_rules() -> None:
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    model = SentenceTransformer(MODEL_NAME)

    rows = (
        client.table("grammar_rules")
        .select("id,pattern_french,description")
        .eq("validated", True)
        .is_("embedding", "null")
        .execute()
        .data or []
    )

    if not rows:
        print("All validated grammar rules already have embeddings.")
        return

    print(f"Vectorizing {len(rows)} grammar rules...")
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        texts = [build_rule_text(r) for r in batch]
        embeddings = model.encode(texts, show_progress_bar=False)
        for row, emb in zip(batch, embeddings):
            try:
                client.table("grammar_rules").update(
                    {"embedding": emb.tolist()}
                ).eq("id", row["id"]).execute()
            except Exception as exc:
                print(f"  Warning: update failed for rule {row['id']}: {exc}")
        print(f"  {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")
    print("Vectorization complete.")


if __name__ == "__main__":
    vectorize_grammar_rules()
```

- [ ] **Step 4: Run tests — expect passing**

```bash
.venv\Scripts\python -m pytest tests/test_vectorize_grammar.py -v
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/vectorize_grammar.py tests/test_vectorize_grammar.py
git commit -m "feat: add vectorize_grammar pipeline step — embed grammar rules"
```

---

## Task 10: Pipeline — `mine_inflections.py`

**Files:**
- Create: `pipeline/mine_inflections.py`

Mines the parallel corpus for inflected French→Bété word pairs using IBM1 alignments, groups them by lemma, cross-references the lexicon, and inserts candidates into `inflected_forms` with `validated=false`.

- [ ] **Step 1: Write test**

Create `tests/test_mine_inflections.py`:

```python
# tests/test_mine_inflections.py
from pipeline.mine_inflections import extract_aligned_pairs, group_by_lemma

def test_extract_aligned_pairs_basic():
    french_words = ["le", "père", "aime"]
    bete_words   = ["na", "so", "amo"]
    align_line   = "0-0 1-1 2-2"
    pairs = extract_aligned_pairs(french_words, bete_words, align_line)
    assert ("père", "so") in pairs
    assert ("aime", "amo") in pairs
    assert len(pairs) == 3

def test_extract_aligned_pairs_skips_bad_index():
    french_words = ["père"]
    bete_words   = ["so"]
    align_line   = "0-0 5-99"  # out of bounds indices
    pairs = extract_aligned_pairs(french_words, bete_words, align_line)
    assert len(pairs) == 1

def test_group_by_lemma_groups_correctly():
    pairs = [("aimait", "amo"), ("aimons", "amo"), ("père", "so")]
    grouped = group_by_lemma(pairs)
    # aimait → aimer, aimons → aimer
    assert "aimer" in grouped
    assert len(grouped["aimer"]) == 2
    assert "père" in grouped
```

- [ ] **Step 2: Run test — expect failure**

```bash
.venv\Scripts\python -m pytest tests/test_mine_inflections.py -v
```

Expected: `ImportError`

- [ ] **Step 3: Create `pipeline/mine_inflections.py`**

```python
# pipeline/mine_inflections.py
"""
Step 9: Mine inflected French→Bété form pairs from the parallel corpus.
For each aligned sentence pair, extracts (french_word, bete_word) via IBM1 alignment.
Groups pairs by French lemma, cross-references the lexicon, inserts candidates
into inflected_forms with validated=false.
Safe to re-run: uses INSERT OR IGNORE pattern (upsert on french_form+lexicon_id).
"""
from collections import defaultdict
from pathlib import Path
from supabase import create_client
from pipeline.config import (
    SUPABASE_URL, SUPABASE_SERVICE_KEY, DIALECTS, corpus_paths,
)
from pipeline.update_lemmas import lemmatize_fr
from pipeline.phonetic import to_phonetic


def extract_aligned_pairs(
    french_words: list[str],
    bete_words: list[str],
    align_line: str,
) -> list[tuple[str, str]]:
    """Return (french_word, bete_word) pairs from a Pharaoh alignment line."""
    pairs: list[tuple[str, str]] = []
    for token in align_line.strip().split():
        if "-" not in token:
            continue
        s, t = token.split("-", 1)
        try:
            si, ti = int(s), int(t)
        except ValueError:
            continue
        if si < len(french_words) and ti < len(bete_words):
            pairs.append((french_words[si], bete_words[ti]))
    return pairs


def group_by_lemma(
    pairs: list[tuple[str, str]],
) -> dict[str, list[tuple[str, str]]]:
    """Group (french_inflected, bete_word) pairs by French lemma."""
    grouped: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for french_form, bete_form in pairs:
        lemma = lemmatize_fr(french_form)
        grouped[lemma].append((french_form, bete_form))
    return dict(grouped)


def mine_inflections(dialect: str = "western") -> None:
    paths = corpus_paths(dialect)
    french_txt   = Path(paths["french_txt"])
    bete_txt     = Path(paths["bete_txt"])
    forward_align = Path(paths["forward_align"])

    if not french_txt.exists() or not bete_txt.exists() or not forward_align.exists():
        print(f"Corpus files missing for {dialect} — run steps 1-3 first.")
        return

    # Load sentence pairs and alignments
    all_pairs: list[tuple[str, str]] = []
    with (
        open(french_txt, encoding="utf-8") as ff,
        open(bete_txt,   encoding="utf-8") as bf,
        open(forward_align, encoding="utf-8") as af,
    ):
        for fl, bl, al in zip(ff, bf, af):
            fr_words = fl.strip().lower().split()
            bt_words = bl.strip().lower().split()
            pairs = extract_aligned_pairs(fr_words, bt_words, al)
            all_pairs.extend(pairs)

    print(f"Extracted {len(all_pairs)} raw alignment pairs for {dialect}.")

    grouped = group_by_lemma(all_pairs)
    print(f"Grouped into {len(grouped)} lemma groups.")

    # Fetch lexicon for this dialect, keyed by french_lemma
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    lex_rows = (
        client.table("lexicon")
        .select("id,french_lemma,bete_word,bete_phonetic,pos")
        .eq("dialect", dialect)
        .not_.is_("french_lemma", "null")
        .execute()
        .data or []
    )
    lex_by_lemma: dict[str, dict] = {r["french_lemma"]: r for r in lex_rows}
    print(f"Lexicon has {len(lex_by_lemma)} entries with french_lemma.")

    records: list[dict] = []
    for lemma, pairs in grouped.items():
        lex = lex_by_lemma.get(lemma)
        if not lex:
            continue
        # Collect unique (french_form, bete_form) pairs, pick most frequent bete_form per french_form
        freq: dict[tuple[str, str], int] = defaultdict(int)
        for fr, bt in pairs:
            freq[(fr, bt)] += 1
        best_per_form: dict[str, tuple[str, int]] = {}
        for (fr, bt), count in freq.items():
            if fr not in best_per_form or count > best_per_form[fr][1]:
                best_per_form[fr] = (bt, count)

        for french_form, (bete_western, _) in best_per_form.items():
            if french_form == lemma:
                continue  # base form already in lexicon
            records.append({
                "lexicon_id":    lex["id"],
                "french_form":   french_form,
                "bete_form":     bete_western,      # western Latin (from corpus)
                "bete_phonetic": to_phonetic(bete_western),  # IPA simplified
                "pos":           (lex.get("pos") or [""])[0] if lex.get("pos") else None,
                "inflection_tag": None,
                "validated":     False,
            })

    print(f"Inserting {len(records)} inflected form candidates...")
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        client.table("inflected_forms").upsert(
            batch, on_conflict="french_form,lexicon_id"
        ).execute()
        print(f"  {min(i + batch_size, len(records))}/{len(records)}")
    print("Done.")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dialect", default="western", choices=list(DIALECTS))
    args = parser.parse_args()
    mine_inflections(dialect=args.dialect)
```

- [ ] **Step 4: Add upsert constraint to migration (if not already present)**

The `mine_inflections` upsert uses `on_conflict="french_form,lexicon_id"`. Add this constraint to the migration file:

```sql
-- Add at bottom of 20260517000001_semantic_translator.sql
ALTER TABLE inflected_forms
  ADD CONSTRAINT inflected_forms_french_form_lexicon_id_key
  UNIQUE (french_form, lexicon_id);
```

Re-apply the migration in Supabase SQL editor if needed.

- [ ] **Step 5: Run tests — expect passing**

```bash
.venv\Scripts\python -m pytest tests/test_mine_inflections.py -v
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/mine_inflections.py tests/test_mine_inflections.py
git commit -m "feat: add mine_inflections pipeline step — extract inflected form pairs from corpus"
```

---

## Task 11: Wire Pipeline Steps into `run_dialect.py`

**Files:**
- Modify: `pipeline/run_dialect.py`

- [ ] **Step 1: Add steps 8–10 to `run_dialect.py`**

Add imports at top:
```python
from pipeline.update_lemmas import update_lemmas
from pipeline.vectorize_grammar import vectorize_grammar_rules
from pipeline.mine_inflections import mine_inflections
```

Add at the end of the `run()` function, after Step 7c:
```python
    print("\nStep 8/10 — Update french_lemma")
    update_lemmas(dialect=dialect)

    print("\nStep 9/10 — Vectorize grammar rules")
    vectorize_grammar_rules()

    print("\nStep 10/10 — Mine inflected forms")
    mine_inflections(dialect=dialect)
```

- [ ] **Step 2: Run pipeline for one dialect to verify end-to-end**

```bash
cd "c:\Users\DELL LATITUDE 7480\traduction bété"
.venv\Scripts\python -m pipeline.run_dialect --dialect western
```

Expected: steps 8–10 complete without errors, Supabase has data in `inflected_forms` and `grammar_rules.embedding`.

- [ ] **Step 3: Commit**

```bash
git add pipeline/run_dialect.py
git commit -m "feat: wire update_lemmas, vectorize_grammar, mine_inflections into run_dialect"
```

---

## Task 12: End-to-End Verification

- [ ] **Step 1: Verify inflected_forms table has data**

In Supabase SQL editor:
```sql
SELECT COUNT(*) FROM inflected_forms;
SELECT french_form, bete_form, bete_phonetic, validated
FROM inflected_forms LIMIT 10;
```

- [ ] **Step 2: Verify grammar rules have embeddings**

```sql
SELECT COUNT(*) FROM grammar_rules WHERE embedding IS NOT NULL;
```

- [ ] **Step 3: Test translator with a known verb inflection**

Navigate to http://localhost:3000/translator. Translate `nous aimons le père`. Expect:
- Fluent Bété sentence in western Latin
- Phonetic (Bible) form below
- No unknowns for "père" (should be in lexicon)
- Word breakdown under "Détail mot à mot"

- [ ] **Step 4: Test with unknown word**

Translate `le téléphone sonne`. "téléphone" and "sonne" should appear as red unknown badges.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: semantic translator implementation complete"
```
