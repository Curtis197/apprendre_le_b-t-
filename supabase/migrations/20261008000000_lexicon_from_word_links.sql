-- supabase/migrations/20261008000000_lexicon_from_word_links.sql
-- The lexicon grows from the texts people link: entries (words and grammatical markers), extra spellings,
-- and the link from a word block to the entry and sense it uses. Drops the per-resource marker table
-- (0 rows in production): a marker's meaning now lives on its lexicon entry.
-- Spec: docs/superpowers/specs/2026-10-04-lexicon-from-word-links-design.md
-- Re-runnable. Apply by hand in production (it replaces functions and drops resource_word_markers).

create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists pg_trgm with schema extensions;
set search_path = public, extensions;

-- ── 1. lexicon: entry kind, marker fields, insert guard ─────────────────────────────────────────
alter table lexicon add column if not exists entry_kind text not null default 'word'
  check (entry_kind in ('word', 'marker'));
alter table lexicon add column if not exists marker_type    text check (marker_type    is null or char_length(marker_type)    <= 100);
alter table lexicon add column if not exists marker_meaning text check (marker_meaning is null or char_length(marker_meaning) <= 300);
alter table lexicon add column if not exists marker_french  text check (marker_french  is null or char_length(marker_french)  <= 300);

-- The policy "lexicon insert own" is `with check (true)`: without this guard a client could insert a
-- validated row under any author. Service-role and security-definer writes (current_user <> 'authenticated') pass.
create or replace function lexicon_guard_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.created_by     := auth.uid();
    new.validated      := false;
    new.upvotes        := 0;
    new.source         := 'contributed';
    new.embedding      := null;
    new.created_at     := now();
    new.entry_kind     := 'word';
    new.marker_type    := null;
    new.marker_meaning := null;
    new.marker_french  := null;
  end if;
  return new;
end;
$$;

drop trigger if exists lexicon_guard_insert on lexicon;
create trigger lexicon_guard_insert
  before insert on lexicon
  for each row execute function lexicon_guard_insert();

-- ── 2. lexicon_spellings ────────────────────────────────────────────────────────────────────────
create table if not exists lexicon_spellings (
  id            uuid primary key default gen_random_uuid(),
  lexicon_id    uuid not null references lexicon(id) on delete cascade,
  spelling      text not null check (char_length(btrim(spelling)) between 1 and 100),
  spelling_norm text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists lexicon_spellings_unique_idx on lexicon_spellings (lexicon_id, lower(spelling));
create index if not exists lexicon_spellings_norm_idx on lexicon_spellings using gin (spelling_norm gin_trgm_ops);

create or replace function lexicon_spellings_guard()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.spelling      := btrim(new.spelling);
  new.spelling_norm := usage_token_norm(new.spelling);
  if current_user = 'authenticated' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lexicon_spellings_guard on lexicon_spellings;
create trigger lexicon_spellings_guard
  before insert or update on lexicon_spellings
  for each row execute function lexicon_spellings_guard();

alter table lexicon_spellings enable row level security;
drop policy if exists lexicon_spellings_select on lexicon_spellings;
create policy lexicon_spellings_select on lexicon_spellings for select using (true);
drop policy if exists lexicon_spellings_delete on lexicon_spellings;
create policy lexicon_spellings_delete on lexicon_spellings for delete to authenticated
  using (created_by = (select auth.uid()) or (select is_admin()));
-- No insert policy: spellings are added through add_lexicon_spelling.

-- ── 3. resource_word_blocks: the link ───────────────────────────────────────────────────────────
alter table resource_word_blocks add column if not exists lexicon_id uuid references lexicon(id) on delete set null;
alter table resource_word_blocks add column if not exists translation_id uuid references lexicon_translations(id) on delete set null;
create index if not exists resource_word_blocks_lexicon_idx on resource_word_blocks (lexicon_id) where lexicon_id is not null;
