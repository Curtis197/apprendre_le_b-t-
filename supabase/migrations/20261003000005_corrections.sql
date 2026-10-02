-- supabase/migrations/20261003000005_corrections.sql
-- Reports and proposed corrections ("signalements") on community content: a lexicon word's
-- translations, its Bété spelling and description, expressions, grammar rules and resources.
--
-- Model: anyone signed in can flag a field and propose replacement text. Corrections are public. The
-- content's AUTHOR can accept one (its text replaces the field) or reject it; admins can do both for
-- any content, and are the only ones for content with no known author. Clients never write the
-- target tables through this feature: accepting goes through a security-definer function that
-- touches only the allow-listed fields below.

-- ── 1. What can be corrected: (target type, field) → table and column ───────────────────────────
-- The single allow-list. Mirrored in web/lib/corrections.ts (a test keeps the two in step).
-- Not security definer: it is a pure lookup, and the guard trigger calls it as the caller.
create or replace function correction_column(p_type text, p_field text)
returns text[]
language sql immutable
set search_path = public
as $$
  select case p_type || '.' || p_field
    when 'translation.french'          then array['lexicon_translations', 'french']
    when 'translation.context'         then array['lexicon_translations', 'context']
    when 'word.bete_phonetic'          then array['lexicon', 'bete_phonetic']
    when 'word.bete_word'              then array['lexicon', 'bete_word']
    when 'word.description'            then array['lexicon', 'description']
    when 'expression.bete_phrase'      then array['expressions', 'bete_phrase']
    when 'expression.bete_phonetic'    then array['expressions', 'bete_phonetic']
    when 'expression.french_phrase'    then array['expressions', 'french_phrase']
    when 'expression.french_literal'   then array['expressions', 'french_literal']
    when 'grammar_rule.pattern_french' then array['grammar_rules', 'pattern_french']
    when 'grammar_rule.pattern_bete'   then array['grammar_rules', 'pattern_bete']
    when 'grammar_rule.description'    then array['grammar_rules', 'description']
    when 'grammar_rule.example_bete'   then array['grammar_rules', 'example_bete']
    when 'grammar_rule.example_french' then array['grammar_rules', 'example_french']
    when 'resource.title'              then array['community_texts', 'title']
    when 'resource.content_bete'       then array['community_texts', 'content_bete']
    when 'resource.content_literal'    then array['community_texts', 'content_literal']
    when 'resource.content_french'     then array['community_texts', 'content_french']
  end
$$;

-- ── 2. The table ────────────────────────────────────────────────────────────────────────────────
create table if not exists corrections (
  id            uuid primary key default gen_random_uuid(),
  target_type   text not null
                check (target_type in ('translation', 'word', 'expression', 'grammar_rule', 'resource')),
  target_id     uuid not null,
  field         text not null,
  kind          text not null default 'other' check (kind in ('mistranslation', 'spelling', 'other')),
  message       text check (message is null or char_length(message) <= 1000),
  suggestion    text check (suggestion is null or char_length(suggestion) <= 10000),
  -- set by the guard trigger, never by the client:
  original      text,                                              -- the field's text when it was reported
  label         text,                                              -- what the target is called, for lists
  ref_id        uuid,                                              -- the page that shows it (word or resource)
  owner_id      uuid references auth.users(id) on delete set null, -- the author, if known
  reporter_id   uuid not null references auth.users(id) on delete cascade,
  reporter_name text not null default '',
  status        text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  resolved_by   uuid references auth.users(id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint corrections_has_content check (
    nullif(btrim(coalesce(message, '')), '') is not null
    or nullif(btrim(coalesce(suggestion, '')), '') is not null
  )
);

create index if not exists corrections_target_idx   on corrections (target_type, target_id) where status = 'open';
create index if not exists corrections_owner_idx    on corrections (owner_id) where status = 'open';
create index if not exists corrections_reporter_idx on corrections (reporter_id);
-- one open report per person, per target and field: no flooding the same word
create unique index if not exists corrections_one_open_per_reporter
  on corrections (reporter_id, target_type, target_id, field) where status = 'open';

-- ── 3. Row-level security ───────────────────────────────────────────────────────────────────────
alter table corrections enable row level security;

drop policy if exists corrections_select on corrections;
create policy corrections_select on corrections for select using (true);

drop policy if exists corrections_insert on corrections;
create policy corrections_insert on corrections
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- Withdraw your own open report; admins can remove any.
drop policy if exists corrections_delete on corrections;
create policy corrections_delete on corrections
  for delete to authenticated
  using ((reporter_id = (select auth.uid()) and status = 'open') or (select is_admin()));

-- No UPDATE policy on purpose: a correction is resolved only through accept_correction() and
-- reject_correction() below.

-- ── 4. Guard: validate, and fill in everything the client must not choose ───────────────────────
create or replace function corrections_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col   text[];
  v_owner uuid;
  v_value text;
begin
  v_col := correction_column(new.target_type, new.field);
  if v_col is null then
    raise exception 'Ce champ ne peut pas être signalé.' using errcode = '22023';
  end if;

  begin
    execute format('select created_by, %I::text from %I where id = $1', v_col[2], v_col[1])
      into strict v_owner, v_value using new.target_id;
  exception when no_data_found then
    raise exception 'Contenu introuvable.' using errcode = 'P0002';
  end;

  new.message    := nullif(btrim(coalesce(new.message, '')), '');
  new.suggestion := nullif(btrim(coalesce(new.suggestion, '')), '');
  if new.suggestion is not null and new.suggestion is not distinct from btrim(coalesce(v_value, '')) then
    raise exception 'La correction proposée est identique au texte actuel.' using errcode = '22023';
  end if;

  if current_user = 'authenticated' then
    new.reporter_id := auth.uid();
    new.status      := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_at  := now();
    if v_owner is not null and v_owner = auth.uid() then
      raise exception 'Vous pouvez modifier directement votre propre contenu.' using errcode = '22023';
    end if;
    if (select count(*) from corrections where reporter_id = auth.uid() and status = 'open') >= 50 then
      raise exception 'Vous avez trop de signalements en attente.' using errcode = '53400';
    end if;
  end if;

  new.original      := v_value;
  new.owner_id      := v_owner;
  new.reporter_name := coalesce(nullif((select name from profiles where id = new.reporter_id), ''), 'Contributeur');

  -- what the target is called, and the page that shows it
  case new.target_type
    when 'translation' then
      select t.lexicon_id, coalesce(nullif(l.bete_phonetic, ''), nullif(l.bete_word, ''), t.french)
        into new.ref_id, new.label
        from lexicon_translations t join lexicon l on l.id = t.lexicon_id
       where t.id = new.target_id;
    when 'word' then
      select l.id, coalesce(nullif(l.bete_phonetic, ''), nullif(l.bete_word, ''), l.top_french)
        into new.ref_id, new.label
        from lexicon l where l.id = new.target_id;
    when 'expression' then
      new.ref_id := null;
      select e.french_phrase into new.label from expressions e where e.id = new.target_id;
    when 'grammar_rule' then
      new.ref_id := null;
      select left(g.description, 80) into new.label from grammar_rules g where g.id = new.target_id;
    when 'resource' then
      select c.id, c.title into new.ref_id, new.label from community_texts c where c.id = new.target_id;
  end case;

  return new;
end;
$$;

drop trigger if exists corrections_guard on corrections;
create trigger corrections_guard
  before insert on corrections
  for each row execute function corrections_guard();

-- ── 5. Accepting and rejecting ──────────────────────────────────────────────────────────────────
create or replace function accept_correction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c         corrections;
  v_col     text[];
  v_current text;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour traiter cette correction.' using errcode = '42501';
  end if;

  select * into c from corrections where id = p_id for update;
  if not found then
    raise exception 'Correction introuvable.' using errcode = 'P0002';
  end if;
  if c.status <> 'open' then
    raise exception 'Cette correction a déjà été traitée.' using errcode = '55000';
  end if;
  if not ((c.owner_id is not null and c.owner_id = auth.uid()) or is_admin()) then
    raise exception 'Seul l’auteur du contenu ou un administrateur peut accepter cette correction.'
      using errcode = '42501';
  end if;
  if c.suggestion is null then
    raise exception 'Ce signalement ne propose pas de correction.' using errcode = '22023';
  end if;

  v_col := correction_column(c.target_type, c.field);
  begin
    execute format('select %I::text from %I where id = $1', v_col[2], v_col[1])
      into strict v_current using c.target_id;
  exception when no_data_found then
    raise exception 'Le contenu a été supprimé.' using errcode = 'P0002';
  end;
  if v_current is distinct from c.original then
    raise exception 'Le texte a changé depuis ce signalement : il faut le signaler à nouveau.'
      using errcode = '55000';
  end if;

  execute format('update %I set %I = $1 where id = $2', v_col[1], v_col[2]) using c.suggestion, c.target_id;

  update corrections
     set status = 'accepted', resolved_by = auth.uid(), resolved_at = now()
   where id = p_id;
end;
$$;

create or replace function reject_correction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c corrections;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour traiter cette correction.' using errcode = '42501';
  end if;

  select * into c from corrections where id = p_id for update;
  if not found then
    raise exception 'Correction introuvable.' using errcode = 'P0002';
  end if;
  if c.status <> 'open' then
    raise exception 'Cette correction a déjà été traitée.' using errcode = '55000';
  end if;
  if not ((c.owner_id is not null and c.owner_id = auth.uid()) or is_admin()) then
    raise exception 'Seul l’auteur du contenu ou un administrateur peut refuser cette correction.'
      using errcode = '42501';
  end if;

  update corrections
     set status = 'rejected', resolved_by = auth.uid(), resolved_at = now()
   where id = p_id;
end;
$$;

-- ── 6. Reports about content that is deleted go with it ─────────────────────────────────────────
create or replace function corrections_target_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from corrections where target_type = tg_argv[0] and target_id = old.id;
  return old;
end;
$$;

drop trigger if exists corrections_cleanup on lexicon_translations;
create trigger corrections_cleanup after delete on lexicon_translations
  for each row execute function corrections_target_deleted('translation');
drop trigger if exists corrections_cleanup on lexicon;
create trigger corrections_cleanup after delete on lexicon
  for each row execute function corrections_target_deleted('word');
drop trigger if exists corrections_cleanup on expressions;
create trigger corrections_cleanup after delete on expressions
  for each row execute function corrections_target_deleted('expression');
drop trigger if exists corrections_cleanup on grammar_rules;
create trigger corrections_cleanup after delete on grammar_rules
  for each row execute function corrections_target_deleted('grammar_rule');
drop trigger if exists corrections_cleanup on community_texts;
create trigger corrections_cleanup after delete on community_texts
  for each row execute function corrections_target_deleted('resource');

-- ── 7. Who may call what ────────────────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to anon and authenticated by default. Only the two
-- actions below are meant to be called; the trigger functions are internal.
revoke execute on function corrections_guard()          from public, anon, authenticated;
revoke execute on function corrections_target_deleted() from public, anon, authenticated;
revoke execute on function accept_correction(uuid)      from public, anon;
revoke execute on function reject_correction(uuid)      from public, anon;
grant  execute on function accept_correction(uuid)      to authenticated;
grant  execute on function reject_correction(uuid)      to authenticated;
