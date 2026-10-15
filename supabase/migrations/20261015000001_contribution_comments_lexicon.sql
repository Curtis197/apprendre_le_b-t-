-- Allow comments on lexicon entries (the lexicon page now shows the comment section).
ALTER TABLE contribution_comments
  DROP CONSTRAINT IF EXISTS contribution_comments_target_table_check;

ALTER TABLE contribution_comments
  ADD CONSTRAINT contribution_comments_target_table_check
  CHECK (target_table IN ('expressions', 'grammar_rules', 'lexicon'));
