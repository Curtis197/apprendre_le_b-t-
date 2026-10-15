-- supabase/migrations/20261015000000_word_block_ipa_links.sql
-- A word block can carry the IPA words of its verse (positions in the verse's IPA line). The links are only valid
-- while the IPA line is the one they were made on, so every block stores the md5 of that line (ipa_hash): editing
-- the IPA text never invalidates the Latin / mot à mot links (verse_hash is unchanged).
-- get_resource_words returns ipa_idx per block and ipa_line / ipa_stale per verse; save_resource_verse takes an
-- optional p_base_ipa (default null: the function then behaves exactly as before).
-- Both functions change signature, so the old ones are dropped first.
-- Apply BEFORE deploying the app version that saves IPA links.
alter table resource_word_blocks add column if not exists ipa_idx int[] not null default '{}';
alter table resource_word_blocks add column if not exists ipa_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resource_word_blocks_ipa_hash_ck') then
    alter table resource_word_blocks
      add constraint resource_word_blocks_ipa_hash_ck check (cardinality(ipa_idx) = 0 or ipa_hash is not null);
  end if;
end $$;

drop function if exists get_resource_words(uuid);
create function get_resource_words(p_resource uuid)
returns table (verse_no int, stale boolean, bete_line text, literal_line text, blocks jsonb, ipa_line text, ipa_stale boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  t record;
begin
  select ct.content_bete, ct.content_literal, ct.content_ipa into t from community_texts ct where ct.id = p_resource;
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
                      'ipa_idx', to_jsonb(b.ipa_idx),
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
         end,
         verse_line(t.content_ipa, s.verse_no),
         exists (
           select 1 from resource_word_blocks bb
           where bb.resource_id = p_resource and bb.verse_no = s.verse_no
             and cardinality(bb.ipa_idx) > 0
               and bb.ipa_hash is not null
             and bb.ipa_hash is distinct from md5(coalesce(verse_line(t.content_ipa, s.verse_no), ''))
         )
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

drop function if exists save_resource_verse(uuid, int, text, text, text, text, jsonb);
create function save_resource_verse(
  p_resource uuid,
  p_verse int,
  p_base_bete text,
  p_base_literal text,
  p_bete_line text,
  p_literal_line text,
  p_blocks jsonb,
  p_base_ipa text default null   -- the verse's IPA line the editor was built on; null: the resource has none
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
  v_ipa     text;
  v_il      text;
  v_nipa    int := 0;
  v_seen_i  boolean[];
  v_pidx    int[];
  v_ihash   text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select ct.created_by, ct.content_bete, ct.content_literal, ct.content_ipa
    into v_owner, v_bete, v_lit, v_ipa
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
  v_il := verse_line(v_ipa, p_verse);
  if p_base_ipa is not null then
    if v_il is null or btrim(p_base_ipa, E' \t') is distinct from v_il then
      raise exception 'ipa_moved';
    end if;
    v_nipa := word_count(v_il);
    v_ihash := md5(v_il);
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
  v_seen_i := array_fill(false, array[greatest(v_nipa, 1)]);

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

    v_pidx := array(select jsonb_array_elements_text(
      case when jsonb_typeof(r.b -> 'ipa_idx') = 'array' then r.b -> 'ipa_idx' else '[]'::jsonb end))::int[];
    if cardinality(v_pidx) > 0 then
      if p_base_ipa is null then
        raise exception 'ipa_not_based';
      end if;
      for v_i in 1 .. cardinality(v_pidx) loop
        if v_pidx[v_i] is null or v_pidx[v_i] < 0 or v_pidx[v_i] >= v_nipa then
          raise exception 'ipa_index_out_of_range';
        end if;
        if v_i > 1 and v_pidx[v_i] <= v_pidx[v_i - 1] then
          raise exception 'ipa_index_not_increasing';
        end if;
        if v_seen_i[v_pidx[v_i] + 1] then
          raise exception 'ipa_word_in_two_blocks';
        end if;
        v_seen_i[v_pidx[v_i] + 1] := true;
      end loop;
    end if;

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
     lexicon_id, translation_id, ipa_idx, ipa_hash)
  select p_resource, p_verse, row_number() over (order by x.bi[1]), x.bi, x.gi,
         coalesce((x.e ->> 'is_marker')::boolean, false),
         coalesce((x.e ->> 'solo')::boolean, false),
         nullif(btrim(x.e ->> 'note'), ''),
         nullif(btrim(x.e ->> 'composition'), ''),
         v_hash,
         nullif(x.e ->> 'lexicon_id', '')::uuid,
         nullif(x.e ->> 'translation_id', '')::uuid,
         x.pi,
         case when p_base_ipa is not null then v_ihash end
  from (
    select e,
           array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[]  as bi,
           array(select jsonb_array_elements_text(e -> 'gloss_idx'))::int[] as gi
           , array(select jsonb_array_elements_text(
               case when jsonb_typeof(e -> 'ipa_idx') = 'array' then e -> 'ipa_idx' else '[]'::jsonb end))::int[] as pi
    from jsonb_array_elements(p_blocks) e
  ) x;
  get diagnostics v_saved = row_count;

  return jsonb_build_object('saved', v_saved, 'verse_hash', v_hash);
end;
$$;

revoke execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb, text) from public, anon;
grant execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb, text) to authenticated;
