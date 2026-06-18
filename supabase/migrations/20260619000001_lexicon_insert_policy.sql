-- Allow authenticated users to insert new lexicon entries from the browser.
-- The existing "lexicon upvote" policy already permits UPDATE for authenticated users,
-- but no INSERT policy existed — silently blocking word contributions via ContributionForm.

create policy "lexicon insert own" on lexicon
  for insert to authenticated
  with check (true);
