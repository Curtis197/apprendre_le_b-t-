-- Comments on pending contributions (expressions and grammar rules)
CREATE TABLE IF NOT EXISTS contribution_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_table    TEXT NOT NULL CHECK (target_table IN ('expressions', 'grammar_rules')),
  target_id       UUID NOT NULL,
  content         TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 500),
  author_name     TEXT NOT NULL DEFAULT 'Anonyme',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON contribution_comments (target_table, target_id);

ALTER TABLE contribution_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contribution_comments_select"
  ON contribution_comments FOR SELECT
  USING (true);

CREATE POLICY "contribution_comments_insert"
  ON contribution_comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);
