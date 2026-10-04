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

-- (save_resource_verse is added in the next task)
