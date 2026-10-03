-- supabase/migrations/20261003000001_find_usages.sql
-- Every usage of a word in the community texts: exact words first, then spelling variants.
set local search_path = public, extensions;
select similarity('a', 'b');   -- loads pg_trgm so the function's pg_trgm.similarity_threshold setting is a known GUC

create or replace function find_usages(
  q           text,
  p_side      text default 'bete',
  p_limit     int  default 5,
  p_offset    int  default 0,
  p_threshold real default 0.4
)
returns table (
  line_id        uuid,
  source_type    text,
  source_id      uuid,
  ref_id         uuid,
  line_no        int,
  title          text,
  dialect        text,
  bete           text,
  literal        text,
  french         text,
  created_at     timestamptz,
  match_kind     text,
  matched_tokens text[],
  similarity     real,
  total_count    bigint
)
language sql stable
set search_path = public, extensions
set pg_trgm.similarity_threshold = '0.3'
as $$
  -- the query's words (at most 6), one row each.
  -- Strip wildcard/escape characters % _ \ so queries of %, _, \ do not behave as single-character wildcard tokens.
  with cleaned as (
    select regexp_replace(coalesce(q, ''), E'[%_\\\\]+', ' ', 'g') as clean_q
  ),
  qt as (
    select (row_number() over ())::int as ord, d.token_norm as n, d.token_stem as s
    from cleaned c,
    lateral (select distinct token_norm, token_stem from usage_tokenize(c.clean_q, p_side) limit 6) d
    where p_side in ('bete', 'fr')
  ),
  nq as (select count(*) as c from qt),
  -- lexicon bridge: for a one-word Bété query, the other written form(s) of the same lexicon entry
  alt as (
    select qt.ord, f.n
    from qt
    join lateral (
      select usage_token_norm(l.bete_phonetic) as a, usage_token_norm(l.bete_word) as b
      from lexicon l
      where p_side = 'bete'
        and (select c from nq) = 1
        and l.bete_phonetic <> ''
        and (usage_token_norm(l.bete_phonetic) = qt.n or usage_token_norm(l.bete_word) = qt.n)
    ) l on true
    cross join lateral (values (l.a), (l.b)) as f(n)
    where f.n <> '' and f.n <> qt.n
  ),
  hits as (
    -- Bété, exact (or the same word in another written form of its lexicon entry)
    select qt.ord, t.line_id, t.token, true as is_exact, 1.0::real as sim
    from qt
    join usage_tokens t on t.side = 'bete' and t.token_norm = qt.n
    where p_side = 'bete'
    union all
    select a.ord, t.line_id, t.token, true, 1.0::real
    from alt a
    join usage_tokens t on t.side = 'bete' and t.token_norm = a.n
    union all
    -- Bété, spelling variant: trigram candidates (index-backed), then the caller's threshold
    select qt.ord, t.line_id, t.token, false, similarity(t.token_norm, qt.n)
    from qt
    join usage_tokens t on t.side = 'bete' and t.token_norm % qt.n
    where p_side = 'bete'
      and char_length(qt.n) > 3
      and t.token_norm <> qt.n
      and similarity(t.token_norm, qt.n) >= p_threshold
    union all
    -- Bété, very short word: one edit away, similar length
    select qt.ord, t.line_id, t.token, false,
           (1 - 0.5 / greatest(char_length(qt.n), 1))::real
    from qt
    join usage_tokens t
      on t.side = 'bete'
     and char_length(t.token_norm) between char_length(qt.n) - 1 and char_length(qt.n) + 1
    where p_side = 'bete'
      and char_length(qt.n) <= 3
      and t.token_norm <> qt.n
      and levenshtein(t.token_norm, qt.n) <= 1
    union all
    -- French: same stem
    select qt.ord, t.line_id, t.token, true, 1.0::real
    from qt
    join usage_tokens t on t.side = 'fr' and t.token_stem = qt.s
    where p_side = 'fr'
  ),
  per_word as (
    select h.ord, h.line_id,
           (array_agg(h.token order by h.sim desc, h.token))[1] as token,
           max(h.sim) as sim,
           bool_or(h.is_exact) as is_exact
    from hits h
    group by h.ord, h.line_id
  ),
  matched as (
    select p.line_id,
           min(p.sim) as similarity,
           bool_and(p.is_exact) as is_exact,
           array_agg(p.token order by p.ord) as tokens
    from per_word p
    group by p.line_id
    having count(*) = (select c from nq) and (select c from nq) > 0
  )
  select u.id, u.source_type, u.source_id, u.ref_id, u.line_no, u.title, u.dialect,
          u.bete, u.literal, u.french, u.created_at,
          case when m.is_exact then 'exact' else 'variant' end,
          m.tokens, m.similarity::real, count(*) over () as total_count
  from matched m
  join usage_lines u on u.id = m.line_id
  order by m.is_exact desc, m.similarity desc, u.created_at desc, u.line_no asc, u.id
  limit least(greatest(coalesce(p_limit, 5), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function find_usages(text, text, int, int, real) to anon, authenticated;
