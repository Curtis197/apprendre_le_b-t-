-- supabase/migrations/20261006000000_resource_word_links.sql
-- Word-by-word reading of resources: a contributor pairs the words of each verse (Bété <-> mot à mot,
-- many-to-many, words may be apart) and flags grammatical markers. Readers get the pairs through
-- get_resource_words; only save_resource_verse writes. Nothing in `lexicon` changes.
-- Spec: docs/superpowers/specs/2026-10-04-resource-word-links-design.md

-- ── 1. helper functions (internal: no client may call them) ──────────────────────────────────────
-- Words are split on runs of space, tab and U+00A0, exactly like splitWords in web/lib/word-blocks.ts.

-- The n-th non-empty (trimmed) line of a text: same numbering as numberLines in the UI and usage_split.
create or replace function verse_line(p_text text, p_n int)
returns text language sql immutable as $$
  select t.txt
  from (
    select s.txt, row_number() over (order by s.stanza, s.line) as n
    from usage_split(p_text) s
  ) t
  where t.n = p_n
$$;

-- md5 of a verse's Bété and mot à mot lines: changes when either line changes.
create or replace function verse_hash(p_bete text, p_literal text, p_n int)
returns text language sql immutable as $$
  select md5(coalesce(verse_line(p_bete, p_n), '') || E'\n' || coalesce(verse_line(p_literal, p_n), ''))
$$;

create or replace function word_count(p_line text)
returns int language sql immutable as $$
  select case
    when btrim(coalesce(p_line, ''), E' \t ') = '' then 0
    else array_length(regexp_split_to_array(btrim(p_line, E' \t '), E'[ \t ]+'), 1)
  end
$$;

-- The words at 0-based positions p_idx of a line, joined by one space.
create or replace function block_words(p_line text, p_idx int[])
returns text language sql immutable as $$
  select string_agg(w.word, ' ' order by w.ord)
  from regexp_split_to_table(btrim(coalesce(p_line, ''), E' \t '), E'[ \t ]+') with ordinality as w(word, ord)
  where (w.ord - 1) = any(p_idx)
$$;

create or replace function block_word_norm(p_line text, p_idx int[])
returns text language sql immutable as $$
  select usage_token_norm(block_words(p_line, p_idx))
$$;

-- Replaces the n-th non-empty line and leaves every other line, blank lines (stanza breaks) included.
create or replace function replace_nth_line(p_text text, p_n int, p_line text)
returns text language plpgsql immutable as $$
declare
  v_lines text[] := regexp_split_to_array(replace(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n');
  v_i int;
  v_n int := 0;
begin
  for v_i in 1 .. coalesce(array_length(v_lines, 1), 0) loop
    if btrim(v_lines[v_i], E' \t') <> '' then
      v_n := v_n + 1;
      if v_n = p_n then
        v_lines[v_i] := btrim(p_line, E' \t');
        return array_to_string(v_lines, E'\n');
      end if;
    end if;
  end loop;
  raise exception 'verse_not_found';
end;
$$;

revoke execute on function verse_line(text, int) from public, anon, authenticated;
revoke execute on function verse_hash(text, text, int) from public, anon, authenticated;
revoke execute on function word_count(text) from public, anon, authenticated;
revoke execute on function block_words(text, int[]) from public, anon, authenticated;
revoke execute on function block_word_norm(text, int[]) from public, anon, authenticated;
revoke execute on function replace_nth_line(text, int, text) from public, anon, authenticated;

-- ── 2. tables ────────────────────────────────────────────────────────────────────────────────────
create table if not exists resource_word_blocks (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references community_texts(id) on delete cascade,
  verse_no    int  not null check (verse_no >= 1),            -- the gutter number: n-th non-empty line
  position    int  not null check (position >= 1),            -- order of the block by its first Bété word
  bete_idx    int[] not null check (cardinality(bete_idx) >= 1), -- 0-based word indices in the Bété line
  gloss_idx   int[] not null default '{}',                    -- 0-based word indices in the mot à mot line
  is_marker   boolean not null default false,                 -- grammatical marker
  solo        boolean not null default false,                 -- marker with no mot à mot counterpart
  note        text check (note is null or char_length(note) <= 500),
  composition text check (composition is null or char_length(composition) <= 300),
  verse_hash  text not null,                                  -- verse_hash() of the lines when saved
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (resource_id, verse_no, position),
  check (solo or cardinality(gloss_idx) >= 1),
  check (not solo or is_marker)
);

create index if not exists resource_word_blocks_resource_idx on resource_word_blocks (resource_id, verse_no);

-- The meaning of a marker, once per word in a resource (the follow-up lexicon spec moves it).
create table if not exists resource_word_markers (
  id             uuid primary key default gen_random_uuid(),
  resource_id    uuid not null references community_texts(id) on delete cascade,
  word_norm      text not null,                                -- usage_token_norm of the block's words
  word           text not null,                                -- spelling as first written, for display
  marker_type    text check (marker_type    is null or char_length(marker_type)    <= 100),
  marker_meaning text check (marker_meaning is null or char_length(marker_meaning) <= 300),
  marker_french  text check (marker_french  is null or char_length(marker_french)  <= 300),
  updated_at     timestamptz not null default now(),
  unique (resource_id, word_norm)
);

alter table resource_word_blocks  enable row level security;
alter table resource_word_markers enable row level security;

-- Readable by everyone; no insert/update/delete policy: only save_resource_verse writes.
drop policy if exists resource_word_blocks_select on resource_word_blocks;
create policy resource_word_blocks_select on resource_word_blocks for select using (true);
drop policy if exists resource_word_markers_select on resource_word_markers;
create policy resource_word_markers_select on resource_word_markers for select using (true);

-- ── 3. reading ───────────────────────────────────────────────────────────────────────────────────
-- One row per verse that has blocks. A verse whose text changed since it was saved is `stale` and
-- returns no blocks, so readers fall back to the plain line.
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
                          select jsonb_build_object('type', m.marker_type, 'meaning', m.marker_meaning, 'french', m.marker_french)
                          from resource_word_markers m
                          where m.resource_id = b.resource_id
                            and m.word_norm = block_word_norm(verse_line(t.content_bete, b.verse_no), b.bete_idx)
                        ) end
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

-- ── 4. writing ───────────────────────────────────────────────────────────────────────────────────
-- Atomic: the text correction (if any), the verse's blocks and the marker meanings succeed or fail
-- together. Only the contributor of the resource may call it. Errors are codes the UI translates.
create or replace function save_resource_verse(
  p_resource uuid,
  p_verse int,
  p_base_bete text,      -- the verse's Bété line the editor was built on
  p_base_literal text,   -- ... and its mot à mot line
  p_bete_line text,      -- corrected Bété line, or null when unchanged
  p_literal_line text,   -- corrected mot à mot line, or null when unchanged
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

  -- The editor was built on these lines: if the text moved since, indices could point at other words.
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

  -- Apply the corrected lines (blank lines are kept).
  if p_bete_line is not null then
    v_bete := replace_nth_line(v_bete, p_verse, p_bete_line);
  end if;
  if p_literal_line is not null then
    v_lit := replace_nth_line(v_lit, p_verse, p_literal_line);
  end if;
  v_bl := verse_line(v_bete, p_verse);
  v_ll := verse_line(v_lit, p_verse);
  v_nb := word_count(v_bl);
  v_ng := word_count(v_ll);
  v_seen_b := array_fill(false, array[v_nb]);
  v_seen_g := array_fill(false, array[v_ng]);

  -- Validate the blocks against the resulting lines.
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
  end loop;
  if false = any(v_seen_b) then
    raise exception 'bete_word_uncovered';
  end if;
  if false = any(v_seen_g) then
    raise exception 'gloss_word_uncovered';
  end if;

  -- Text first (the usage_sync trigger rebuilds the usage index), then the blocks.
  update community_texts
     set content_bete = v_bete, content_literal = v_lit
   where id = p_resource
     and (content_bete is distinct from v_bete or content_literal is distinct from v_lit);

  v_hash := verse_hash(v_bete, v_lit, p_verse);

  delete from resource_word_blocks where resource_id = p_resource and verse_no = p_verse;

  insert into resource_word_blocks
    (resource_id, verse_no, position, bete_idx, gloss_idx, is_marker, solo, note, composition, verse_hash)
  select p_resource, p_verse, row_number() over (order by x.bi[1]), x.bi, x.gi,
         coalesce((x.e ->> 'is_marker')::boolean, false),
         coalesce((x.e ->> 'solo')::boolean, false),
         nullif(btrim(x.e ->> 'note'), ''),
         nullif(btrim(x.e ->> 'composition'), ''),
         v_hash
  from (
    select e,
           array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[]  as bi,
           array(select jsonb_array_elements_text(e -> 'gloss_idx'))::int[] as gi
    from jsonb_array_elements(p_blocks) e
  ) x;
  get diagnostics v_saved = row_count;

  -- Marker meanings: keyed by the block's own words (never by the client), last block wins.
  insert into resource_word_markers (resource_id, word_norm, word, marker_type, marker_meaning, marker_french)
  select distinct on (y.wn) p_resource, y.wn, y.w, y.mt, y.mm, y.mf
  from (
    select block_word_norm(v_bl, z.bi) as wn,
           block_words(v_bl, z.bi)     as w,
           nullif(btrim(z.e -> 'marker' ->> 'type'), '')    as mt,
           nullif(btrim(z.e -> 'marker' ->> 'meaning'), '') as mm,
           nullif(btrim(z.e -> 'marker' ->> 'french'), '')  as mf,
           z.bi[1] as first_idx
    from (
      select e, array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[] as bi
      from jsonb_array_elements(p_blocks) e
    ) z
    where coalesce((z.e ->> 'is_marker')::boolean, false)
  ) y
  order by y.wn, y.first_idx desc
  on conflict (resource_id, word_norm) do update
    set word = excluded.word,
        marker_type = excluded.marker_type,
        marker_meaning = excluded.marker_meaning,
        marker_french = excluded.marker_french,
        updated_at = now();

  -- Remove the markers no marker block of the resource uses any more.
  delete from resource_word_markers m
  where m.resource_id = p_resource
    and not exists (
      select 1 from resource_word_blocks b
      where b.resource_id = p_resource
        and b.is_marker
        and block_word_norm(verse_line(v_bete, b.verse_no), b.bete_idx) = m.word_norm
    );

  return jsonb_build_object('saved', v_saved, 'verse_hash', v_hash);
end;
$$;

revoke execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) from public, anon;
grant execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) to authenticated;
