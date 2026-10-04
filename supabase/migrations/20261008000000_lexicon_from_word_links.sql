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
alter table lexicon_examples add column if not exists created_by uuid references auth.users(id) on delete set null;

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


-- ── 4. entry summary (internal) and its public wrapper ──────────────────────────────────────────
-- One shape for candidates, created entries and the reader: see the spec, section "Functions".
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
                  from lexicon_spellings s where s.lexicon_id = l.id)
  )
  from lexicon l
  where l.id = p_id
$$;
revoke execute on function lexicon_summary(uuid, uuid) from public, anon, authenticated;

create or replace function get_lexicon_entry(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select lexicon_summary(p_id)
$$;
revoke execute on function get_lexicon_entry(uuid) from public;
grant execute on function get_lexicon_entry(uuid) to anon, authenticated;

-- ── 5. create_lexicon_entry ─────────────────────────────────────────────────────────────────────
create or replace function create_lexicon_entry(
  p_spelling    text,
  p_ipa         text,
  p_dialect     text,
  p_kind        text,
  p_pos         text[],
  p_description text,
  p_notes       text,
  p_synonyms    text[],
  p_lemma       text,
  p_senses      jsonb,
  p_example     jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_sp      text := btrim(coalesce(p_spelling, ''));
  v_ipa     text := nullif(btrim(coalesce(p_ipa, '')), '');
  v_word    text;
  v_dialect text := coalesce(nullif(btrim(coalesce(p_dialect, '')), ''), 'western');
  v_kind    text := coalesce(p_kind, 'word');
  v_senses  jsonb;
  v_first   text;
  v_id      uuid;
  v_existed boolean := false;
  s         jsonb;
  v_i       int := 0;
  v_ids     uuid[];
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_sp = '' or char_length(v_sp) > 100 or (v_ipa is not null and char_length(v_ipa) > 100) then
    raise exception 'bad_spelling';
  end if;
  if v_dialect not in ('western', 'northern', 'eastern') then
    raise exception 'bad_dialect';
  end if;
  if v_kind not in ('word', 'marker') then
    raise exception 'bad_kind';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 or char_length(coalesce(p_notes, '')) > 2000
     or char_length(coalesce(p_lemma, '')) > 200 then
    raise exception 'too_long';
  end if;

  -- Senses with a blank French word are ignored; a marker carries none.
  v_senses := coalesce((
    select jsonb_agg(e) from jsonb_array_elements(
      case when jsonb_typeof(p_senses) = 'array' then p_senses else '[]'::jsonb end) e
    where nullif(btrim(e ->> 'french'), '') is not null
  ), '[]'::jsonb);
  if v_kind = 'word' and jsonb_array_length(v_senses) = 0 then
    raise exception 'sense_required';
  end if;
  v_first := case when v_kind = 'word' then btrim(v_senses -> 0 ->> 'french') else '' end;
  v_word := coalesce(v_ipa, v_sp);

  insert into lexicon (bete_word, bete_phonetic, french_candidates, top_french, probability, pos, notes,
                       dialect, description, french_synonyms, lemma, entry_kind, created_by, source)
  values (v_word, v_sp, '[]'::jsonb, v_first, case when v_kind = 'word' then 1 else 0 end,
          case when v_kind = 'word' then p_pos end, nullif(btrim(coalesce(p_notes, '')), ''),
          v_dialect, nullif(btrim(coalesce(p_description, '')), ''), p_synonyms, nullif(btrim(coalesce(p_lemma, '')), ''),
          v_kind, v_uid, 'contributed')
  on conflict (bete_word, dialect) do nothing
  returning id into v_id;

  if v_id is null then
    -- Someone (maybe a concurrent call) created it first: hand the existing entry back.
    select l.id into v_id from lexicon l where l.bete_word = v_word and l.dialect = v_dialect;
    v_existed := true;
  elsif v_kind = 'word' then
    -- The after-insert trigger seeded the first sense from top_french: give it its context, add the others.
    update lexicon_translations
       set context = nullif(btrim(coalesce(v_senses -> 0 ->> 'context', '')), '')
     where lexicon_id = v_id and position = 0;
    for s in select e from jsonb_array_elements(v_senses) e offset 1 loop
      v_i := v_i + 1;
      insert into lexicon_translations (lexicon_id, french, context, position, created_by, author_name)
      values (v_id, btrim(s ->> 'french'), nullif(btrim(coalesce(s ->> 'context', '')), ''), v_i, v_uid,
              coalesce((select name from profiles where id = v_uid), ''))
      on conflict do nothing;
    end loop;
  end if;

  if not v_existed and p_example is not null and jsonb_typeof(p_example) = 'object'
     and nullif(btrim(p_example ->> 'bete'), '') is not null and nullif(btrim(p_example ->> 'french'), '') is not null then
    insert into lexicon_examples (lexicon_id, bete_snippet, french_snippet, french_literal, dialect, created_by)
    values (v_id, btrim(p_example ->> 'bete'), btrim(p_example ->> 'french'),
            nullif(btrim(coalesce(p_example ->> 'literal', '')), ''), v_dialect, v_uid);
  end if;

  select coalesce(array_agg(t.id order by t.position, t.created_at), '{}') into v_ids
  from lexicon_translations t where t.lexicon_id = v_id;

  return jsonb_build_object('id', v_id, 'existed', v_existed, 'sense_ids', to_jsonb(v_ids), 'entry', lexicon_summary(v_id));
end;
$$;
revoke execute on function create_lexicon_entry(text, text, text, text, text[], text, text, text[], text, jsonb, jsonb) from public, anon;
grant execute on function create_lexicon_entry(text, text, text, text, text[], text, text, text[], text, jsonb, jsonb) to authenticated;

-- ── 6. add_lexicon_spelling ─────────────────────────────────────────────────────────────────────
create or replace function add_lexicon_spelling(p_lexicon_id uuid, p_spelling text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sp  text := btrim(coalesce(p_spelling, ''));
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_sp = '' or char_length(v_sp) > 100 then
    raise exception 'bad_spelling';
  end if;
  if not exists (select 1 from lexicon where id = p_lexicon_id) then
    raise exception 'entry_not_found';
  end if;
  if exists (select 1 from lexicon l where l.id = p_lexicon_id and (lower(l.bete_phonetic) = lower(v_sp) or lower(l.bete_word) = lower(v_sp)))
     or exists (select 1 from lexicon_spellings s where s.lexicon_id = p_lexicon_id and lower(s.spelling) = lower(v_sp)) then
    raise exception 'spelling_exists';
  end if;
  insert into lexicon_spellings (lexicon_id, spelling, created_by) values (p_lexicon_id, v_sp, v_uid) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function add_lexicon_spelling(uuid, text) from public, anon;
grant execute on function add_lexicon_spelling(uuid, text) to authenticated;

-- ── 7. set_marker_meaning ───────────────────────────────────────────────────────────────────────
create or replace function set_marker_meaning(p_lexicon_id uuid, p_type text, p_meaning text, p_french text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_kind    text;
  v_current text;
  v_author  uuid;
  v_type    text := nullif(btrim(coalesce(p_type, '')), '');
  v_meaning text := nullif(btrim(coalesce(p_meaning, '')), '');
  v_french  text := nullif(btrim(coalesce(p_french, '')), '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if char_length(coalesce(v_type, '')) > 100 or char_length(coalesce(v_meaning, '')) > 300
     or char_length(coalesce(v_french, '')) > 300 then
    raise exception 'too_long';
  end if;
  select l.entry_kind, l.marker_meaning, l.created_by into v_kind, v_current, v_author
  from lexicon l where l.id = p_lexicon_id for update;
  if not found then
    raise exception 'entry_not_found';
  end if;
  if v_kind <> 'marker' then
    raise exception 'not_a_marker';
  end if;
  if v_current is not null and v_author is distinct from v_uid and not is_admin() then
    raise exception 'meaning_already_set';
  end if;
  update lexicon
     set marker_type = v_type, marker_meaning = v_meaning, marker_french = v_french, updated_at = now()
   where id = p_lexicon_id;
end;
$$;
revoke execute on function set_marker_meaning(uuid, text, text, text) from public, anon;
grant execute on function set_marker_meaning(uuid, text, text, text) to authenticated;

-- ── 8. find_lexicon_candidates ──────────────────────────────────────────────────────────────────
-- exact: equal ignoring case · norm: equal after usage_token_norm (accents, tones, apostrophes, hyphens)
-- · near: edit distance on the normalised forms (1 for 3 to 7 characters, 2 from 8, none up to 2).
create or replace function find_lexicon_candidates(
  p_text    text,
  p_dialect text default null,
  p_kind    text default null,
  p_limit   int  default 6
) returns table (match_kind text, matched text, distance int, entry jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_raw  text := btrim(coalesce(p_text, ''), E' \t\u00a0');
  v_norm text;
  v_len  int;
  v_max  int;
begin
  if v_raw = '' or char_length(v_raw) > 100 then
    return;
  end if;
  v_norm := usage_token_norm(v_raw);
  v_len  := char_length(v_norm);
  if v_len = 0 then
    return;
  end if;
  v_max := case when v_len <= 2 then 0 when v_len <= 7 then 1 else 2 end;

  return query
  with forms as (
    select l.id, l.bete_phonetic as f from lexicon l where l.bete_phonetic <> ''
    union all
    select l.id, l.bete_word from lexicon l where l.bete_word <> '' and l.bete_word not like '\_pending\_%'
    union all
    select s.lexicon_id, s.spelling from lexicon_spellings s
  ), normed as (
    select f.id, f.f, usage_token_norm(f.f) as n from forms f
  ), scored as (
    select nf.id, nf.f,
           case when lower(nf.f) = lower(v_raw) then 'exact'
                when nf.n = v_norm then 'norm'
                when v_max > 0 and abs(char_length(nf.n) - v_len) <= v_max and levenshtein(nf.n, v_norm) <= v_max then 'near'
           end as mk,
           case when abs(char_length(nf.n) - v_len) <= v_max then levenshtein(nf.n, v_norm) else 99 end as d
    from normed nf
  ), best as (
    select distinct on (sc.id) sc.id, sc.mk, sc.f, sc.d
    from scored sc
    where sc.mk is not null
    order by sc.id, case sc.mk when 'exact' then 0 when 'norm' then 1 else 2 end, sc.d
  )
  select b.mk, b.f, b.d, lexicon_summary(b.id)
  from best b
  join lexicon l on l.id = b.id
  where p_kind is null or l.entry_kind = p_kind
  order by (l.dialect is not distinct from p_dialect) desc,
           case b.mk when 'exact' then 0 when 'norm' then 1 else 2 end,
           b.d,
           l.created_at
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
end;
$$;
revoke execute on function find_lexicon_candidates(text, text, text, int) from public;
grant execute on function find_lexicon_candidates(text, text, text, int) to anon, authenticated;


-- ── 9. corrections: marker fields and kind are correctable ──────────────────────────────────────
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
  end
$$;

-- ── 10. search_lexicon ignores markers that have no meaning yet ─────────────────────────────────
create or replace function search_lexicon(
  q         text,
  p_dialect text default null,
  p_pos     text default null,
  p_limit   int  default 20,
  p_offset  int  default 0
)
returns table (
  id             uuid,
  bete_word      text,
  bete_phonetic  text,
  top_french     text,
  pos            text[],
  dialect        text,
  validated      boolean,
  matched_french text,
  rank           int,
  total_count    bigint
)
language sql stable
set search_path = public, extensions
as $$
  with forms as (
    select l.id, search_norm(l.bete_phonetic) as f, null::text as raw
    from lexicon l
    where search_pattern(q) <> '' and search_norm(l.bete_phonetic) like '%' || search_pattern(q) || '%'
    union all
    select l.id, search_norm(l.bete_word), null
    from lexicon l
    where search_pattern(q) <> '' and search_norm(l.bete_word) like '%' || search_pattern(q) || '%'
    union all
    select t.lexicon_id, search_norm(t.french), t.french
    from lexicon_translations t
    where search_pattern(q) <> '' and search_norm(t.french) like '%' || search_pattern(q) || '%'
  ),
  scored as (
    select f.id, f.raw,
           case when f.f = search_norm(btrim(q)) then 3
                when f.f like search_pattern(q) || '%' then 2
                else 1 end as r
    from forms f
  ),
  best as (
    select s.id,
           max(s.r) as rank,
           (array_agg(s.raw order by s.r desc, s.raw) filter (where s.raw is not null))[1] as matched_french
    from scored s
    group by s.id
  )
  select l.id, l.bete_word, l.bete_phonetic, l.top_french, l.pos, l.dialect, l.validated,
         b.matched_french, b.rank::int, count(*) over () as total_count
  from best b
  join lexicon l on l.id = b.id
  where l.bete_phonetic <> ''
    and not (coalesce(l.pos, '{}'::text[]) @> array['fragment'])
    and (l.entry_kind = 'word' or l.marker_meaning is not null)
    and (p_dialect is null or l.dialect = p_dialect)
    and (p_pos is null or coalesce(l.pos, '{}'::text[]) @> array[p_pos])
  order by b.rank desc, l.bete_phonetic
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function search_lexicon(text, text, text, int, int) to anon, authenticated;

-- ── 11. reading: blocks carry the linked entry ──────────────────────────────────────────────────
create or replace function get_resource_words(p_resource uuid)
returns table (verse_no int, stale boolean, bete_line text, literal_line text, blocks jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
begin
  select ct.content_bete, ct.content_literal into t from community_texts ct where ct.id = p_resource;
  if not found then
    return;
  end if;

  return query
  select s.verse_no,
         s.stored is distinct from verse_hash(t.content_bete, t.content_literal, s.verse_no),
         verse_line(t.content_bete, s.verse_no),
         verse_line(t.content_literal, s.verse_no),
         case
           when s.stored is distinct from verse_hash(t.content_bete, t.content_literal, s.verse_no) then '[]'::jsonb
           else (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'position', b.position,
                      'bete_idx', to_jsonb(b.bete_idx),
                      'gloss_idx', to_jsonb(b.gloss_idx),
                      'is_marker', b.is_marker,
                      'solo', b.solo,
                      'note', b.note,
                      'composition', b.composition,
                      'marker', case when b.is_marker then (
                          select jsonb_build_object('type', l.marker_type, 'meaning', l.marker_meaning, 'french', l.marker_french)
                          from lexicon l
                          where l.id = b.lexicon_id
                        ) end,
                      'lex', case when b.lexicon_id is not null then lexicon_summary(b.lexicon_id, b.translation_id) end
                    ) order by b.position), '[]'::jsonb)
             from resource_word_blocks b
             where b.resource_id = p_resource and b.verse_no = s.verse_no
           )
         end
  from (
    select b2.verse_no, min(b2.verse_hash) as stored
    from resource_word_blocks b2
    where b2.resource_id = p_resource
    group by b2.verse_no
  ) s
  order by s.verse_no;
end;
$$;

revoke execute on function get_resource_words(uuid) from public;
grant execute on function get_resource_words(uuid) to anon, authenticated;

-- ── 12. writing: blocks carry lexicon_id / translation_id ───────────────────────────────────────
create or replace function save_resource_verse(
  p_resource uuid,
  p_verse int,
  p_base_bete text,
  p_base_literal text,
  p_bete_line text,
  p_literal_line text,
  p_blocks jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  v_bete    text;
  v_lit     text;
  v_bl      text;
  v_ll      text;
  v_nb      int;
  v_ng      int;
  v_seen_b  boolean[];
  v_seen_g  boolean[];
  r         record;
  v_idx     int[];
  v_gidx    int[];
  v_i       int;
  v_hash    text;
  v_saved   int;
  v_marker  boolean;
  v_lex     uuid;
  v_tr      uuid;
  v_kind    text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select ct.created_by, ct.content_bete, ct.content_literal
    into v_owner, v_bete, v_lit
  from community_texts ct
  where ct.id = p_resource
  for update;
  if not found then
    raise exception 'resource_not_found';
  end if;
  if v_owner is distinct from v_uid then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_verse is null or p_verse < 1 then
    raise exception 'bad_verse';
  end if;
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'bad_blocks';
  end if;

  v_bl := verse_line(v_bete, p_verse);
  v_ll := verse_line(v_lit, p_verse);
  if v_bl is null then
    raise exception 'verse_not_found';
  end if;
  if v_ll is null then
    raise exception 'literal_missing';
  end if;
  if btrim(coalesce(p_base_bete, ''), E' \t') is distinct from v_bl
     or btrim(coalesce(p_base_literal, ''), E' \t') is distinct from v_ll then
    raise exception 'text_changed';
  end if;

  if p_bete_line is not null
     and (btrim(p_bete_line, E' \t\u00a0') = '' or p_bete_line ~ E'[\r\n]') then
    raise exception 'bad_line';
  end if;
  if p_literal_line is not null
     and (btrim(p_literal_line, E' \t\u00a0') = '' or p_literal_line ~ E'[\r\n]') then
    raise exception 'bad_line';
  end if;

  if p_bete_line is not null then
    v_bete := replace_nth_line(v_bete, p_verse, p_bete_line);
  end if;
  if p_literal_line is not null then
    v_lit := replace_nth_line(v_lit, p_verse, p_literal_line);
  end if;
  v_bl := verse_line(v_bete, p_verse);
  v_ll := verse_line(v_lit, p_verse);
  if word_count(v_bl) < 1 or word_count(v_ll) < 1 then
    raise exception 'bad_line';
  end if;
  v_nb := word_count(v_bl);
  v_ng := word_count(v_ll);
  v_seen_b := array_fill(false, array[v_nb]);
  v_seen_g := array_fill(false, array[v_ng]);

  for r in select e as b from jsonb_array_elements(p_blocks) e loop
    v_idx  := array(select jsonb_array_elements_text(r.b -> 'bete_idx'))::int[];
    v_gidx := array(select jsonb_array_elements_text(r.b -> 'gloss_idx'))::int[];

    if cardinality(v_idx) = 0 then
      raise exception 'empty_block';
    end if;
    for v_i in 1 .. cardinality(v_idx) loop
      if v_idx[v_i] < 0 or v_idx[v_i] >= v_nb then
        raise exception 'bete_index_out_of_range';
      end if;
      if v_i > 1 and v_idx[v_i] <= v_idx[v_i - 1] then
        raise exception 'bete_index_not_increasing';
      end if;
      if v_seen_b[v_idx[v_i] + 1] then
        raise exception 'bete_word_in_two_blocks';
      end if;
      v_seen_b[v_idx[v_i] + 1] := true;
    end loop;

    for v_i in 1 .. coalesce(cardinality(v_gidx), 0) loop
      if v_gidx[v_i] < 0 or v_gidx[v_i] >= v_ng then
        raise exception 'gloss_index_out_of_range';
      end if;
      if v_i > 1 and v_gidx[v_i] <= v_gidx[v_i - 1] then
        raise exception 'gloss_index_not_increasing';
      end if;
      if v_seen_g[v_gidx[v_i] + 1] then
        raise exception 'gloss_word_in_two_blocks';
      end if;
      v_seen_g[v_gidx[v_i] + 1] := true;
    end loop;

    if coalesce((r.b ->> 'solo')::boolean, false) then
      if coalesce(cardinality(v_gidx), 0) > 0 then
        raise exception 'solo_has_gloss';
      end if;
      if not coalesce((r.b ->> 'is_marker')::boolean, false) then
        raise exception 'solo_not_marker';
      end if;
    elsif coalesce(cardinality(v_gidx), 0) = 0 then
      raise exception 'block_without_gloss';
    end if;

    -- The link: ids only, checked against the lexicon.
    v_marker := coalesce((r.b ->> 'is_marker')::boolean, false);
    begin
      v_lex := nullif(r.b ->> 'lexicon_id', '')::uuid;
      v_tr  := nullif(r.b ->> 'translation_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'bad_link';
    end;
    if v_lex is null then
      if v_tr is not null then
        raise exception 'sense_without_entry';
      end if;
      if v_marker then
        raise exception 'marker_needs_entry';
      end if;
    else
      select l.entry_kind into v_kind from lexicon l where l.id = v_lex;
      if not found then
        raise exception 'entry_not_found';
      end if;
      if v_marker and v_kind <> 'marker' then
        raise exception 'marker_needs_marker_entry';
      end if;
      if not v_marker and v_kind <> 'word' then
        raise exception 'word_needs_word_entry';
      end if;
      if v_tr is not null
         and not exists (select 1 from lexicon_translations t where t.id = v_tr and t.lexicon_id = v_lex) then
        raise exception 'sense_not_of_entry';
      end if;
    end if;
  end loop;
  if false = any(v_seen_b) then
    raise exception 'bete_word_uncovered';
  end if;
  if false = any(v_seen_g) then
    raise exception 'gloss_word_uncovered';
  end if;

  update community_texts
     set content_bete = v_bete, content_literal = v_lit
   where id = p_resource
     and (content_bete is distinct from v_bete or content_literal is distinct from v_lit);

  v_hash := verse_hash(v_bete, v_lit, p_verse);

  delete from resource_word_blocks where resource_id = p_resource and verse_no = p_verse;

  insert into resource_word_blocks
    (resource_id, verse_no, position, bete_idx, gloss_idx, is_marker, solo, note, composition, verse_hash,
     lexicon_id, translation_id)
  select p_resource, p_verse, row_number() over (order by x.bi[1]), x.bi, x.gi,
         coalesce((x.e ->> 'is_marker')::boolean, false),
         coalesce((x.e ->> 'solo')::boolean, false),
         nullif(btrim(x.e ->> 'note'), ''),
         nullif(btrim(x.e ->> 'composition'), ''),
         v_hash,
         nullif(x.e ->> 'lexicon_id', '')::uuid,
         nullif(x.e ->> 'translation_id', '')::uuid
  from (
    select e,
           array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[]  as bi,
           array(select jsonb_array_elements_text(e -> 'gloss_idx'))::int[] as gi
    from jsonb_array_elements(p_blocks) e
  ) x;
  get diagnostics v_saved = row_count;

  return jsonb_build_object('saved', v_saved, 'verse_hash', v_hash);
end;
$$;

revoke execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) from public, anon;
grant execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) to authenticated;

-- ── 13. the per-resource marker table is replaced by marker entries ─────────────────────────────
drop table if exists resource_word_markers;
