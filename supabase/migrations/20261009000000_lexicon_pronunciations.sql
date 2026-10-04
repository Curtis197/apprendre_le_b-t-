-- supabase/migrations/20261009000000_lexicon_pronunciations.sql
-- Pronunciation recordings of lexicon entries: several per entry, open to any signed-in user, credited to
-- their author; reported through the corrections system. Only adds (table, bucket, functions, one check
-- constraint change, one trigger). Re-runnable.
-- Spec: docs/superpowers/specs/2026-10-04-lexicon-pronunciation-audio-design.md

-- ── 1. storage bucket (public: anyone can play a recording) ─────────────────────────────────────
-- Path convention: "{author_id}/{lexicon_id}/{timestamp}.{ext}"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lexicon-pronunciations',
  'lexicon-pronunciations',
  true,
  1048576, -- 1 MB cap: a recording is one word
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

drop policy if exists "lexicon_pron_insert_own" on storage.objects;
create policy "lexicon_pron_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lexicon-pronunciations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "lexicon_pron_delete" on storage.objects;
create policy "lexicon_pron_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lexicon-pronunciations'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select is_admin()))
  );

-- Storage API requires a select policy matching delete permissions so that remove() can locate objects.
drop policy if exists "lexicon_pron_select" on storage.objects;
create policy "lexicon_pron_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lexicon-pronunciations'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select is_admin()))
  );
-- Public reads bypass RLS via the public bucket URL.

-- ── 2. table ────────────────────────────────────────────────────────────────────────────────────
create table if not exists lexicon_pronunciations (
  id         uuid primary key default gen_random_uuid(),
  lexicon_id uuid not null references lexicon(id) on delete cascade,
  audio_path text not null unique check (char_length(audio_path) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lexicon_pronunciations_entry_idx on lexicon_pronunciations (lexicon_id, created_at desc);

alter table lexicon_pronunciations enable row level security;
drop policy if exists lexicon_pronunciations_select on lexicon_pronunciations;
create policy lexicon_pronunciations_select on lexicon_pronunciations for select using (true);
-- No insert/update/delete policy: only the functions below write.

-- ── 3. functions ────────────────────────────────────────────────────────────────────────────────
create or replace function add_lexicon_pronunciation(p_lexicon_id uuid, p_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from lexicon where id = p_lexicon_id) then
    raise exception 'entry_not_found';
  end if;
  if p_path is null
     or p_path !~ ('^' || v_uid::text || '/' || p_lexicon_id::text || '/[0-9]+\.(webm|ogg|mp4)$') then
    raise exception 'bad_path';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'lexicon-pronunciations' and o.name = p_path) then
    raise exception 'file_not_found';
  end if;
  if (select count(*) from lexicon_pronunciations p where p.lexicon_id = p_lexicon_id and p.created_by = v_uid) >= 3 then
    raise exception 'too_many';
  end if;
  insert into lexicon_pronunciations (lexicon_id, audio_path, created_by)
  values (p_lexicon_id, p_path, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function add_lexicon_pronunciation(uuid, text) from public, anon;
grant execute on function add_lexicon_pronunciation(uuid, text) to authenticated;

-- Deletes the row (its reports go with it) and hands the storage path back so the app removes the file.
create or replace function delete_lexicon_pronunciation(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_path   text;
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select p.audio_path, p.created_by into v_path, v_author
  from lexicon_pronunciations p where p.id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_author <> v_uid and not is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from lexicon_pronunciations where id = p_id;
  return v_path;
end;
$$;
revoke execute on function delete_lexicon_pronunciation(uuid) from public, anon;
grant execute on function delete_lexicon_pronunciation(uuid) to authenticated;

-- All recordings of an entry, newest first, with the author's name (the profile table is not public).
create or replace function get_lexicon_pronunciations(p_lexicon_id uuid)
returns table (id uuid, path text, author text, created_by uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.audio_path, coalesce(nullif(pr.name, ''), 'Contributeur'), p.created_by, p.created_at
  from lexicon_pronunciations p
  left join profiles pr on pr.id = p.created_by
  where p.lexicon_id = p_lexicon_id
  order by p.created_at desc
$$;
revoke execute on function get_lexicon_pronunciations(uuid) from public;
grant execute on function get_lexicon_pronunciations(uuid) to anon, authenticated;

-- ── 4. reports on a recording ───────────────────────────────────────────────────────────────────
alter table corrections drop constraint if exists corrections_target_type_check;
alter table corrections add constraint corrections_target_type_check
  check (target_type in ('translation', 'word', 'expression', 'grammar_rule', 'resource', 'pronunciation'));

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
    when 'word.marker_type'            then array['lexicon', 'marker_type']
    when 'word.marker_meaning'         then array['lexicon', 'marker_meaning']
    when 'word.marker_french'          then array['lexicon', 'marker_french']
    when 'word.entry_kind'             then array['lexicon', 'entry_kind']
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
    when 'pronunciation.audio'         then array['lexicon_pronunciations', 'audio_path']
  end
$$;

-- The guard is the one of 20261003000005_corrections.sql with a branch for the new target type
-- (a CASE without a matching branch raises case_not_found).
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
    when 'pronunciation' then
      select p.lexicon_id, coalesce(nullif(l.bete_phonetic, ''), nullif(l.bete_word, ''), 'Mot')
        into new.ref_id, new.label
        from lexicon_pronunciations p join lexicon l on l.id = p.lexicon_id
       where p.id = new.target_id;
  end case;

  return new;
end;
$$;

drop trigger if exists corrections_cleanup on lexicon_pronunciations;
create trigger corrections_cleanup after delete on lexicon_pronunciations
  for each row execute function corrections_target_deleted('pronunciation');

-- ── 5. the entry summary carries the 3 latest recordings ────────────────────────────────────────
-- lexicon_summary of 20261008000000_lexicon_from_word_links.sql with one more key: 'audio'.
create or replace function lexicon_summary(p_id uuid, p_sense uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id,
    'kind', l.entry_kind,
    'spelling', coalesce(nullif(l.bete_phonetic, ''), l.bete_word),
    'ipa', case when l.bete_word is distinct from l.bete_phonetic and l.bete_word not like '\_pending\_%' then l.bete_word end,
    'dialect', l.dialect,
    'pos', coalesce(to_jsonb(l.pos), '[]'::jsonb),
    'description', l.description,
    'synonyms', coalesce(to_jsonb(l.french_synonyms), '[]'::jsonb),
    'marker', jsonb_build_object('type', l.marker_type, 'meaning', l.marker_meaning, 'french', l.marker_french),
    'senses', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'french', t.french, 'context', t.context)
                                          order by t.position, t.created_at), '[]'::jsonb)
               from lexicon_translations t where t.lexicon_id = l.id),
    'sense_id', (select t.id from lexicon_translations t where t.id = p_sense and t.lexicon_id = l.id),
    'spellings', (select coalesce(jsonb_agg(s.spelling order by s.created_at), '[]'::jsonb)
                  from lexicon_spellings s where s.lexicon_id = l.id),
    'audio', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'path', a.audio_path,
                       'author', coalesce(nullif(pr.name, ''), 'Contributeur'), 'created_at', a.created_at)
                     order by a.created_at desc), '[]'::jsonb)
              from (select p.* from lexicon_pronunciations p where p.lexicon_id = l.id
                    order by p.created_at desc limit 3) a
              left join profiles pr on pr.id = a.created_by)
  )
  from lexicon l
  where l.id = p_id
$$;
revoke execute on function lexicon_summary(uuid, uuid) from public, anon, authenticated;

