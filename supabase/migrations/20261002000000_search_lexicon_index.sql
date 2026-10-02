-- Make search_lexicon index-backed. The first version normalised every form of every row on each
-- call (unaccent + lower, three times per row); that is fine for a small lexicon but scales
-- linearly with it, and the header search fires it on every keystroke.
--
-- unaccent() is only STABLE, so it cannot be indexed directly. search_norm() wraps it with the
-- dictionary pinned (the standard immutable-wrapper pattern) so a trigram GIN index can serve the
-- substring match. Behaviour is unchanged: same matches, same ranking.
create extension if not exists pg_trgm with schema extensions;

-- pg_trgm lives in `extensions` on a fresh Supabase database but in `public` on production, so the
-- operator class is resolved through the search path instead of being schema-qualified.
set local search_path = public, extensions;

create or replace function search_norm(t text)
returns text language sql immutable parallel safe strict as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, t))
$$;

-- Normalised and escaped for a LIKE pattern (backslash, % and _ are literal in the search box).
create or replace function search_pattern(q text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(search_norm(btrim(coalesce(q, ''))), '([\\%_])', '\\\1', 'g')
$$;

create index if not exists lexicon_search_phonetic_idx
  on lexicon using gin (search_norm(bete_phonetic) gin_trgm_ops);
create index if not exists lexicon_search_word_idx
  on lexicon using gin (search_norm(bete_word) gin_trgm_ops);
create index if not exists lexicon_translations_search_french_idx
  on lexicon_translations using gin (search_norm(french) gin_trgm_ops);

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
    and (p_dialect is null or l.dialect = p_dialect)
    and (p_pos is null or coalesce(l.pos, '{}'::text[]) @> array[p_pos])
  order by b.rank desc, l.bete_phonetic
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function search_lexicon(text, text, text, int, int) to anon, authenticated;
