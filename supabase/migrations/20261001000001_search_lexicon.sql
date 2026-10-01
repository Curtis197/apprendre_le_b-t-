-- supabase/migrations/20261001000001_search_lexicon.sql
-- One accent- and case-insensitive search over the Bété forms and every French translation.
create extension if not exists unaccent with schema extensions;

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
  with needle as (
    select
      unaccent(lower(btrim(coalesce(q, '')))) as n,
      regexp_replace(unaccent(lower(btrim(coalesce(q, '')))), '([\\%_])', '\\\1', 'g') as esc
  ),
  forms as (
    select l.id, unaccent(lower(l.bete_phonetic)) as f, null::text as raw from lexicon l
    union all
    select l.id, unaccent(lower(l.bete_word)), null from lexicon l
    union all
    select t.lexicon_id, unaccent(lower(t.french)), t.french from lexicon_translations t
  ),
  scored as (
    select f.id, f.raw,
           case when f.f = n.n then 3
                when f.f like n.esc || '%' then 2
                else 1 end as r
    from forms f, needle n
    where n.n <> '' and f.f like '%' || n.esc || '%'
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
    and (p_dialect is null or l.dialect = p_dialect)
    and (p_pos is null or coalesce(l.pos, '{}'::text[]) @> array[p_pos])
  order by b.rank desc, l.bete_phonetic
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function search_lexicon(text, text, text, int, int) to anon, authenticated;
