-- Fix 1: Restrict SELECT on profiles to own row OR is_public = true
-- The previous policy "profiles_select_all" allowed any authenticated user to
-- read ALL profile rows, including private contact data. Replace it with a
-- policy that only exposes public profiles or the user's own row.
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;

CREATE POLICY "profiles_select_public_or_own"
  ON profiles FOR SELECT
  USING (is_public = true OR auth.uid() = id);

-- Fix 2: Enforce role restrictions on increment_upvotes at the DB level
-- Anonymous users should never be able to call this function.
REVOKE EXECUTE ON FUNCTION increment_upvotes(text, uuid, int) FROM anon;
GRANT  EXECUTE ON FUNCTION increment_upvotes(text, uuid, int) TO authenticated;

-- Fix 3: Prevent bad rows where is_public = true but canal IS NULL
-- A NULL canal on a public profile causes a frontend crash; enforce integrity here.
-- PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS, so drop first if it exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_public_requires_canal'
      AND conrelid = 'profiles'::regclass
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_public_requires_canal
      CHECK (NOT is_public OR canal IS NOT NULL);
  END IF;
END;
$$;
