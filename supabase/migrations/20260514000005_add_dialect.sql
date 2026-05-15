-- supabase/migrations/20260514000005_add_dialect.sql
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

-- Enforce closed set of valid dialect values
ALTER TABLE verses        ADD CONSTRAINT verses_dialect_check
  CHECK (dialect IN ('western','northern','eastern'));
ALTER TABLE lexicon       ADD CONSTRAINT lexicon_dialect_check
  CHECK (dialect IN ('western','northern','eastern'));
ALTER TABLE alignments    ADD CONSTRAINT alignments_dialect_check
  CHECK (dialect IN ('western','northern','eastern'));
ALTER TABLE lexicon_examples ADD CONSTRAINT lexicon_examples_dialect_check
  CHECK (dialect IN ('western','northern','eastern'));

-- Unique constraint for lexicon_examples re-run idempotency (partial: only when verse_id is not null)
CREATE UNIQUE INDEX IF NOT EXISTS lexicon_examples_lexicon_verse_dialect_idx
  ON lexicon_examples (lexicon_id, verse_id, dialect)
  WHERE verse_id IS NOT NULL;

-- Unique index on alignments for re-run idempotency
CREATE UNIQUE INDEX IF NOT EXISTS alignments_bete_french_dialect_idx
  ON alignments (bete_word, french_word, dialect);
