-- supabase/migrations/20261011000000_search_lexicon_spellings.sql
-- search_lexicon also matches the extra spellings of an entry (lexicon_spellings), so a variant
-- spelling proposed by a contributor finds the entry. Same function as 20261008000000 (section 10)
-- with one more source of forms. Re-runnable.

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
    select s.lexicon_id, search_norm(s.spelling), null
    from lexicon_spellings s
    where search_pattern(q) <> '' and search_norm(s.spelling) like '%' || search_pattern(q) || '%'
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
