-- handle_new_user() runs as SECURITY DEFINER but without a pinned search_path, and
-- GoTrue executes the auth.users trigger as supabase_auth_admin, whose search_path is
-- just "auth". On a fresh database (local stack, CI) the unqualified `profiles` then
-- fails to resolve ("relation "profiles" does not exist") and every signup returns
-- "Database error saving new user". Same body as 20260516000001, with the schema
-- qualified and the search_path pinned.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
