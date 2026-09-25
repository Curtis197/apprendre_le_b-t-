-- Let signed-in contributors attach an example sentence (Bhété + French translation)
-- to a lexicon entry from the contribution form.
--
-- Attribution is mandatory on insert so contributed rows stay traceable and
-- moderatable. Seeded (Bible-derived) examples keep created_by NULL, and are
-- only written with the service role, which bypasses RLS.

alter table lexicon_examples
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create policy "lexicon_examples insert own" on lexicon_examples
  for insert to authenticated
  with check (created_by = auth.uid());

-- lexicon.created_by exists in production but was added outside the migration
-- history, so a database rebuilt from migrations lacks it and the contribution
-- form's word insert fails there. Idempotent: a no-op wherever the column exists.
alter table lexicon
  add column if not exists created_by uuid references auth.users(id) on delete set null;
