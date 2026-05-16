-- supabase/migrations/20260516000003_profile_extensions.sql

-- Extend profiles with public directory fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS type         TEXT NOT NULL DEFAULT 'member'
                                        CHECK (type IN ('member', 'group', 'teacher')),
  ADD COLUMN IF NOT EXISTS bio          TEXT,
  ADD COLUMN IF NOT EXISTS contact      TEXT,
  ADD COLUMN IF NOT EXISTS canal        TEXT
                                        CHECK (canal IN ('whatsapp', 'tiktok', 'instagram', 'facebook')),
  ADD COLUMN IF NOT EXISTS whatsapp_url  TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_url    TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url  TEXT,
  ADD COLUMN IF NOT EXISTS is_public    BOOLEAN NOT NULL DEFAULT false;

-- Gate increment_upvotes: anonymous callers get an auth error
CREATE OR REPLACE FUNCTION increment_upvotes(
  table_name text,
  row_id     uuid,
  delta      int default 1
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to vote';
  END IF;
  CASE table_name
    WHEN 'grammar_rules' THEN
      UPDATE grammar_rules
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'expressions' THEN
      UPDATE expressions
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'lexicon' THEN
      UPDATE lexicon
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'forum_threads' THEN
      UPDATE forum_threads
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'forum_posts' THEN
      UPDATE forum_posts
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    WHEN 'community_texts' THEN
      UPDATE community_texts
        SET upvotes = greatest(0, upvotes + delta)
        WHERE id = row_id
        RETURNING upvotes INTO new_count;
    ELSE
      RAISE EXCEPTION 'Unknown table: %', table_name;
  END CASE;
  RETURN new_count;
END;
$$;
