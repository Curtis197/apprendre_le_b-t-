-- supabase/migrations/20261001000000_lexicon_translations.sql
-- A word can have several French translations (each with an optional context) and a description.
-- Community model: any signed-in user adds; authors edit/delete their own; admins can delete.
-- lexicon.top_french stays as the primary translation so the translator and other readers are unchanged.

-- ── 1. description + edit time on lexicon ────────────────────────────────────
alter table lexicon add column if not exists description text
  check (description is null or char_length(description) <= 2000);
alter table lexicon add column if not exists updated_at timestamptz not null default now();
alter table lexicon add column if not exists created_by uuid references auth.users(id) on delete set null;

-- ── 2. translations ──────────────────────────────────────────────────────────
create table if not exists lexicon_translations (
  id          uuid primary key default gen_random_uuid(),
  lexicon_id  uuid not null references lexicon(id) on delete cascade,
  french      text not null check (char_length(btrim(french)) between 1 and 200),
  context     text check (context is null or char_length(context) <= 300),
  position    int  not null default 0,
  author_name text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lexicon_translations_lexicon_idx on lexicon_translations (lexicon_id, position);
create unique index if not exists lexicon_translations_unique_idx
  on lexicon_translations (lexicon_id, lower(btrim(french)), coalesce(btrim(context), ''));

alter table lexicon_translations enable row level security;

drop policy if exists lexicon_translations_select on lexicon_translations;
create policy lexicon_translations_select on lexicon_translations
  for select using (true);
drop policy if exists lexicon_translations_insert_own on lexicon_translations;
create policy lexicon_translations_insert_own on lexicon_translations
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists lexicon_translations_update_own on lexicon_translations;
create policy lexicon_translations_update_own on lexicon_translations
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
drop policy if exists lexicon_translations_delete_own on lexicon_translations;
create policy lexicon_translations_delete_own on lexicon_translations
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select is_admin()));

-- Clients cannot hand a translation to someone else, move it to another word, reorder it or
-- fake the author name. The check is on current_user so service-role and security-definer
-- writes (backfill, the after-insert trigger on lexicon) pass untouched.
create or replace function lexicon_translations_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.french  := btrim(new.french);
  new.context := nullif(btrim(coalesce(new.context, '')), '');
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at  := now();
    new.updated_at  := now();
    new.author_name := coalesce(nullif((select name from profiles where id = auth.uid()), ''), 'Contributeur');
    new.position    := coalesce((select max(position) + 1 from lexicon_translations where lexicon_id = new.lexicon_id), 0);
  else
    new.lexicon_id  := old.lexicon_id;
    new.created_by  := old.created_by;
    new.created_at  := old.created_at;
    new.author_name := old.author_name;
    new.position    := old.position;
    new.updated_at  := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lexicon_translations_guard on lexicon_translations;
create trigger lexicon_translations_guard
  before insert or update on lexicon_translations
  for each row execute function lexicon_translations_guard();

-- ── 3. backfill: one translation per existing word ───────────────────────────
-- Placeholders included: their French is the meaning waiting for a Bété word.
insert into lexicon_translations (lexicon_id, french, position, created_by)
select l.id, btrim(l.top_french), 0, l.created_by
from lexicon l
where nullif(btrim(l.top_french), '') is not null
  and not exists (select 1 from lexicon_translations t where t.lexicon_id = l.id)
on conflict do nothing;

-- ── 4. every new word (form, import script, pipeline) gets its first translation ─
create or replace function lexicon_seed_translation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(new.top_french), '') is not null then
    insert into lexicon_translations (lexicon_id, french, position, created_by, author_name)
    values (
      new.id, btrim(new.top_french), 0, new.created_by,
      coalesce((select name from profiles where id = new.created_by), '')
    )
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists lexicon_seed_translation on lexicon;
create trigger lexicon_seed_translation
  after insert on lexicon
  for each row execute function lexicon_seed_translation();

-- ── 5. top_french follows the primary translation ────────────────────────────
-- Deleting the last translation leaves top_french alone: the translator depends on it.
create or replace function lexicon_translations_sync_primary()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.lexicon_id, old.lexicon_id);
  v_french text;
begin
  select french into v_french
  from lexicon_translations
  where lexicon_id = v_id
  order by position, created_at
  limit 1;
  if v_french is not null then
    update lexicon set top_french = v_french where id = v_id and top_french is distinct from v_french;
  end if;
  return null;
end;
$$;

drop trigger if exists lexicon_translations_sync_primary on lexicon_translations;
create trigger lexicon_translations_sync_primary
  after insert or update of french, position or delete on lexicon_translations
  for each row execute function lexicon_translations_sync_primary();

-- ── 6. lexicon update guard ──────────────────────────────────────────────────
-- The "lexicon upvote" policy lets any signed-in user UPDATE; this trigger decides which columns.
--  • translated word: only `description`
--  • untranslated placeholder (bete_phonetic = ''): also the Bété forms, pos, notes, dialect
--    (the homepage word-of-the-day / contribution form fills placeholders in), stamped with the author
-- top_french, upvotes and validated are never client-writable. The vote RPC and the service role
-- run as other roles and pass through.
create or replace function lexicon_guard_update()
returns trigger language plpgsql set search_path = public as $$
declare
  v lexicon;
begin
  if current_user <> 'authenticated' then
    if new.description is distinct from old.description then
      new.updated_at := now();
    end if;
    return new;
  end if;

  v := old;
  v.description := new.description;
  if old.bete_phonetic = '' then
    v.bete_word     := new.bete_word;
    v.bete_phonetic := new.bete_phonetic;
    v.pos           := new.pos;
    v.notes         := new.notes;
    v.dialect       := new.dialect;
    v.created_by    := auth.uid();
    v.source        := 'contributed';
  end if;
  if v.description is distinct from old.description then
    v.updated_at := now();
  end if;
  return v;
end;
$$;

drop trigger if exists lexicon_guard_update on lexicon;
create trigger lexicon_guard_update
  before update on lexicon
  for each row execute function lexicon_guard_update();
