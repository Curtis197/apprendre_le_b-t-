-- supabase/migrations/20261003000002_usage_translations_aligned_independently.sql
-- A resource's mot à mot and French translation are now attached to its usage lines independently.
--
-- Before, one flag covered both: if EITHER translation did not have the same stanza and line shape
-- as the Bété text, NEITHER was attached. A contributor who wrote a correct French translation but a
-- mot à mot with a missing line lost the French too, and French search could not find the resource.
-- Now each translation is attached when it has the Bété text's shape, whatever the other one does.
--
-- Only the resource branch changes; the other sources are copied unchanged. create or replace keeps
-- the existing grants (execute stays revoked from clients).

create or replace function rebuild_usage_lines(p_type text, p_id uuid)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  r_text   community_texts%rowtype;
  r_ex     lexicon_examples%rowtype;
  r_expr   expressions%rowtype;
  r_rule   grammar_rules%rowtype;
  v_dialect text;
  v_n       int;
  v_has_lit boolean;
  v_has_fr  boolean;
  v_lit_ok  boolean;
  v_fr_ok   boolean;
  rec      record;
begin
  delete from usage_lines where source_type = p_type and source_id = p_id;

  if p_type = 'resource' then
    select * into r_text from community_texts where id = p_id;
    if not found then return; end if;

    v_dialect := case r_text.region
                   when 'Guiberoua' then 'western'
                   when 'Gagnoa'    then 'northern'
                   when 'Daloa'     then 'eastern'
                 end;
    select count(*) into v_n from usage_split(r_text.content_bete);
    v_has_lit := nullif(btrim(coalesce(r_text.content_literal, '')), '') is not null;
    v_has_fr  := nullif(btrim(coalesce(r_text.content_french, '')), '') is not null;

    if v_n = 0 then
      return;
    elsif v_n = 1 then
      perform usage_add_line(
        'resource', p_id, p_id, 0,
        (select txt from usage_split(r_text.content_bete)),
        case when v_has_lit then (select string_agg(txt, ' ' order by stanza, line) from usage_split(r_text.content_literal)) end,
        case when v_has_fr  then (select string_agg(txt, ' ' order by stanza, line) from usage_split(r_text.content_french)) end,
        v_dialect, r_text.title, r_text.created_at
      );
    else
      -- each translation is judged on its own
      v_lit_ok := v_has_lit and usage_same_shape(r_text.content_bete, r_text.content_literal);
      v_fr_ok  := v_has_fr  and usage_same_shape(r_text.content_bete, r_text.content_french);
      for rec in
        select (row_number() over (order by o.stanza, o.line) - 1)::int as k,
               o.txt as bete_txt,
               case when v_lit_ok then l.txt end as lit_txt,
               case when v_fr_ok  then f.txt end as fr_txt
        from usage_split(r_text.content_bete) o
        left join usage_split(r_text.content_literal) l on l.stanza = o.stanza and l.line = o.line
        left join usage_split(r_text.content_french)  f on f.stanza = o.stanza and f.line = o.line
        order by o.stanza, o.line
      loop
        perform usage_add_line(
          'resource', p_id, p_id, rec.k,
          rec.bete_txt, rec.lit_txt, rec.fr_txt,
          v_dialect, r_text.title, r_text.created_at
        );
      end loop;
    end if;

  elsif p_type = 'example' then
    select * into r_ex from lexicon_examples where id = p_id;
    if not found then return; end if;
    perform usage_add_line('example', p_id, r_ex.lexicon_id, 0, r_ex.bete_snippet, r_ex.french_literal,
                           r_ex.french_snippet, r_ex.dialect, null, now());

  elsif p_type = 'expression' then
    select * into r_expr from expressions where id = p_id;
    if not found then return; end if;
    perform usage_add_line('expression', p_id, null, 0, r_expr.bete_phrase, r_expr.french_literal,
                           r_expr.french_phrase, null, r_expr.type, r_expr.created_at, r_expr.bete_phonetic);

  elsif p_type = 'grammar' then
    select * into r_rule from grammar_rules where id = p_id;
    if not found then return; end if;
    perform usage_add_line('grammar', p_id, null, 0, r_rule.example_bete, null,
                           r_rule.example_french, null, null, r_rule.created_at, r_rule.example_bete_phonetic);
  end if;
end;
$$;

-- Re-index the existing resources with the new rule (idempotent).
select rebuild_usage_lines('resource', id) from community_texts;
