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
