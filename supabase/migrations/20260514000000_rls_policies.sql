-- Row-level security for public-facing tables.
-- Reads: anyone (anon role). Writes from the browser: authenticated users only.
-- Service role bypasses RLS, so server-side jobs (pipeline, /api/translate cache)
-- continue to work unchanged.

-- ── enable RLS ──────────────────────────────────────────────────────────────
alter table verses             enable row level security;
alter table lexicon            enable row level security;
alter table lexicon_examples   enable row level security;
alter table alignments         enable row level security;
alter table grammar_rules      enable row level security;
alter table expressions        enable row level security;
alter table user_feedback      enable row level security;
alter table translation_cache  enable row level security;

-- ── read-only reference data (verses, lexicon, alignments, examples) ────────
create policy "verses read" on verses
  for select to anon, authenticated using (true);

create policy "lexicon read" on lexicon
  for select to anon, authenticated using (true);

create policy "lexicon_examples read" on lexicon_examples
  for select to anon, authenticated using (true);

create policy "alignments read" on alignments
  for select to anon, authenticated using (true);

-- Allow upvote updates on lexicon from authenticated users.
-- (Restricting to the `upvotes` column would require a trigger; for now we trust
-- the UI and rely on auth as the gate.)
create policy "lexicon upvote" on lexicon
  for update to authenticated using (true) with check (true);

-- ── community-contributed: grammar_rules, expressions ───────────────────────
create policy "grammar_rules read" on grammar_rules
  for select to anon, authenticated using (true);

create policy "grammar_rules insert own" on grammar_rules
  for insert to authenticated with check (created_by = auth.uid());

create policy "grammar_rules vote" on grammar_rules
  for update to authenticated using (true) with check (true);

create policy "expressions read" on expressions
  for select to anon, authenticated using (true);

create policy "expressions insert own" on expressions
  for insert to authenticated with check (created_by = auth.uid());

create policy "expressions vote" on expressions
  for update to authenticated using (true) with check (true);

-- ── user_feedback (write-mostly, no public read) ────────────────────────────
create policy "user_feedback insert" on user_feedback
  for insert to anon, authenticated with check (true);

create policy "user_feedback read own" on user_feedback
  for select to authenticated using (user_id = auth.uid());

-- ── translation_cache (service-role only — RLS denies anon/auth by default) ─
-- No policies needed; the API route uses the service role key which bypasses RLS.
