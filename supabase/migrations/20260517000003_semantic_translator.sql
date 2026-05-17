-- supabase/migrations/20260517000001_semantic_translator.sql

-- ── lexicon additions ────────────────────────────────────────────────────────
ALTER TABLE lexicon
  ADD COLUMN IF NOT EXISTS french_lemma     text,
  ADD COLUMN IF NOT EXISTS french_synonyms  text[],
  ADD COLUMN IF NOT EXISTS sense_tag        text,
  ADD COLUMN IF NOT EXISTS lemma            text,
  ADD COLUMN IF NOT EXISTS inflected_forms  jsonb;

-- Index for lemma-level lookup
CREATE INDEX IF NOT EXISTS lexicon_french_lemma_idx ON lexicon (french_lemma);

-- ── inflected_forms table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inflected_forms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexicon_id     uuid NOT NULL REFERENCES lexicon(id) ON DELETE CASCADE,
  french_form    text NOT NULL,
  bete_form      text NOT NULL,
  bete_phonetic  text NOT NULL,
  pos            text,
  inflection_tag text,
  validated      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inflected_forms_french_form_lexicon_id_key UNIQUE (french_form, lexicon_id)
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
  id            uuid,
  bete_word     text,
  bete_phonetic text,
  french_lemma  text,
  top_french    text,
  sense_tag     text,
  probability   float,
  similarity    float
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
