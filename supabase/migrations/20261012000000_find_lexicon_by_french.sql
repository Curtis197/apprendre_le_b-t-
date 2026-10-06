-- supabase/migrations/20261012000000_find_lexicon_by_french.sql
-- Suggest existing entries from a typed French meaning (the French counterpart of find_lexicon_candidates).
-- Exact match on a normal form: case, accents, extra spaces and one leading article are ignored.
-- Re-runnable.

set search_path = public, extensions;

-- ── 1. normal form of a French meaning ──────────────────────────────────────────────────────────
-- 'La  Chaleur' -> 'chaleur', "l'été" -> 'ete', 'de la pluie' -> 'pluie'. Only one article is dropped,
-- and only before something else: "l'" alone becomes '' (the RPC then returns nothing); a bare "le" has no trailing text, so it is kept.
create or replace function french_match_norm(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select btrim(
    regexp_replace(
      regexp_replace(search_norm(coalesce(t, '')), E'[\\s\u00a0]+', ' ', 'g'),
      E'^\\s*(de la |les |le |la |une |un |des |du |l''|l’)',
      ''
    )
  )
$$;

-- ── 2. lookup index ─────────────────────────────────────────────────────────────────────────────
create index if not exists lexicon_translations_french_match_idx
  on lexicon_translations (french_match_norm(french));

-- ── 3. find_lexicon_by_french ───────────────────────────────────────────────────────────────────
create or replace function find_lexicon_by_french(
  p_french  text,
  p_dialect text,
  p_kind    text default 'word',
  p_limit   int  default 6
) returns table (matched text, context text, entry jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_raw  text := btrim(coalesce(p_french, ''), E' \t\u00a0');
  v_norm text;
begin
  if v_raw = '' or char_length(v_raw) > 200 then
    return;
  end if;
  v_norm := french_match_norm(v_raw);
  if v_norm = '' then
    return;
  end if;

  return query
  select m.french, m.context, lexicon_summary(m.id)
  from (
    select distinct on (l.id) l.id, l.created_at, t.french, t.context
    from lexicon_translations t
    join lexicon l on l.id = t.lexicon_id
    where french_match_norm(t.french) = v_norm
      and l.bete_phonetic <> ''
      and (p_dialect is null or l.dialect = p_dialect)
      and (p_kind is null or l.entry_kind = p_kind)
    order by l.id, t.position, t.created_at
  ) m
  order by m.created_at
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
end;
$$;
revoke execute on function find_lexicon_by_french(text, text, text, int) from public;
grant execute on function find_lexicon_by_french(text, text, text, int) to anon, authenticated;
