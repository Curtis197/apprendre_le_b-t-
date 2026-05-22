-- Add source column to lexicon to distinguish alignment seeds from community contributions.
-- All existing rows are back-filled as 'seed'; new inserts from ContributionForm
-- default to 'contributed' without any change to the insert statement.

ALTER TABLE lexicon
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'contributed'
  CHECK (source IN ('seed', 'contributed'));

UPDATE lexicon SET source = 'seed' WHERE source = 'contributed';

CREATE INDEX IF NOT EXISTS lexicon_source_idx ON lexicon (source);
