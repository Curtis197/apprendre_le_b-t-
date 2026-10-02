-- supabase/migrations/20261003000000_word_usages.sql
-- "Where is this word used?" Community texts are split into aligned lines and tokenised so one
-- query can list every usage of a word, tolerate spelling variants, and later carry embeddings.
-- Sources: resources (community_texts), lexicon examples, expressions, grammar-rule examples.

create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists pg_trgm with schema extensions;   -- no-op where it already exists

-- pg_trgm is in `extensions` on a fresh Supabase database and in `public` on production: resolve the
-- operator class through the search path (same approach as 20261002000000_search_lexicon_index.sql).
set local search_path = public, extensions;

-- ── 1. tables ────────────────────────────────────────────────────────────────
create table if not exists usage_lines (
  id          uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('resource','example','expression','grammar')),
  source_id   uuid not null,
  ref_id      uuid,                       -- page to link to: resource id, or the lexicon entry of an example
  line_no     int  not null,
  bete        text not null,
  literal     text,                       -- mot à mot
  french      text,
  dialect     text,
  title       text,
  created_at  timestamptz not null default now(),
  unique (source_type, source_id, line_no)
);

create table if not exists usage_tokens (
  id         bigint generated always as identity primary key,
  line_id    uuid not null references usage_lines(id) on delete cascade,
  side       text not null check (side in ('bete','fr')),
  token      text not null,
  token_norm text not null,
  token_stem text                         -- French side only
);

create index if not exists usage_tokens_line_idx  on usage_tokens (line_id);
create index if not exists usage_tokens_exact_idx on usage_tokens (side, token_norm);
create index if not exists usage_tokens_stem_idx  on usage_tokens (side, token_stem) where side = 'fr';
create index if not exists usage_tokens_len_idx   on usage_tokens (side, char_length(token_norm));
create index if not exists usage_tokens_trgm_idx  on usage_tokens using gin (token_norm gin_trgm_ops) where side = 'bete';

alter table usage_lines  enable row level security;
alter table usage_tokens enable row level security;
drop policy if exists usage_lines_select on usage_lines;
create policy usage_lines_select  on usage_lines  for select using (true);
drop policy if exists usage_tokens_select on usage_tokens;
create policy usage_tokens_select on usage_tokens for select using (true);
-- No insert/update/delete policies: only the security-definer sync functions below write.

-- ── 2. tokenizer ─────────────────────────────────────────────────────────────
-- Normal form of one word: case, accents and tone marks folded; apostrophes and hyphens dropped,
-- so `mɔ̀ʼwa`, `ʼmɔwa` and `MOWA`-style spellings share a form.
create or replace function usage_token_norm(t text)
returns text language sql immutable parallel safe as $$
  select regexp_replace(search_norm(t), E'[̀-ͯ\'’ʼ‑\\-]', '', 'g')
$$;

-- Words of a text. Bété keeps apostrophes inside a word; French also splits on them (l'été -> l, été).
create or replace function usage_tokenize(p_text text, p_side text)
returns table (token text, token_norm text, token_stem text)
language sql stable
set search_path = public, extensions
as $$
  select s.tok, s.n,
         case when p_side = 'fr' then coalesce((ts_lexize('french_stem', s.n))[1], s.n) end
  from (
    select x.tok, usage_token_norm(x.tok) as n
    from (
      select nullif(btrim(r, E'\'’ʼ‑-'), '') as tok
      from regexp_split_to_table(
        coalesce(p_text, ''),
        case when p_side = 'fr'
             then E'[\\s.,;:!?«»"“”()\\[\\]…–—/\'’ʼ]+'
             else E'[\\s.,;:!?«»"“”()\\[\\]…–—/]+'
        end
      ) as r
    ) x
    where x.tok is not null
  ) s
  where s.n <> ''
$$;

-- ── 3. line splitting, same rules as web/lib/verses.ts splitStanzas ──────────
-- Stanzas separated by blank lines; lines trimmed; empty lines and stanzas dropped; both numbered from 1.
create or replace function usage_split(p_text text)
returns table (stanza int, line int, txt text)
language sql immutable as $$
  with blocks as (
    select b.blk, b.i
    from regexp_split_to_table(
      replace(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\r', E'\n'),
      E'\n[ \t]*\n'
    ) with ordinality as b(blk, i)
  ),
  lines as (
    select b.i as si, l.j, btrim(l.raw, E' \t') as t
    from blocks b
    cross join lateral regexp_split_to_table(b.blk, E'\n') with ordinality as l(raw, j)
    where btrim(l.raw, E' \t') <> ''
  )
  select (dense_rank() over (order by si))::int,
         (row_number() over (partition by si order by j))::int,
         t
  from lines
  order by 1, 2
$$;

-- Same stanza count and same line count in every stanza.
create or replace function usage_same_shape(a text, b text)
returns boolean language sql immutable as $$
  select not exists (
    select 1
    from usage_split(a) x
    full join usage_split(b) y on x.stanza = y.stanza and x.line = y.line
    where x.txt is null or y.txt is null
  )
$$;

-- ── 4. writing one line with its tokens ──────────────────────────────────────
create or replace function usage_add_line(
  p_type text, p_source uuid, p_ref uuid, p_no int,
  p_bete text, p_literal text, p_french text,
  p_dialect text, p_title text, p_created timestamptz, p_extra_bete text default null
) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid;
begin
  if nullif(btrim(coalesce(p_bete, '')), '') is null then
    return;
  end if;

  insert into usage_lines (source_type, source_id, ref_id, line_no, bete, literal, french, dialect, title, created_at)
  values (
    p_type, p_source, p_ref, p_no, btrim(p_bete),
    nullif(btrim(coalesce(p_literal, '')), ''), nullif(btrim(coalesce(p_french, '')), ''),
    p_dialect, p_title, coalesce(p_created, now())
  )
  returning id into v_id;

  insert into usage_tokens (line_id, side, token, token_norm, token_stem)
  select v_id, 'bete', token, token_norm, null
  from usage_tokenize(btrim(p_bete) || ' ' || coalesce(p_extra_bete, ''), 'bete')
  union all
  select v_id, 'fr', token, token_norm, token_stem
  from usage_tokenize(p_french, 'fr');
end;
$$;

-- ── 5. rebuilding one source ─────────────────────────────────────────────────
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
  v_aligned boolean;
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
      v_aligned := (not v_has_lit or usage_same_shape(r_text.content_bete, r_text.content_literal))
               and (not v_has_fr  or usage_same_shape(r_text.content_bete, r_text.content_french));
      for rec in
        select (row_number() over (order by o.stanza, o.line) - 1)::int as k,
               o.txt as bete_txt,
               case when v_aligned and v_has_lit then l.txt end as lit_txt,
               case when v_aligned and v_has_fr  then f.txt end as fr_txt
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

-- The functions above are internal: clients must not call them.
revoke execute on function usage_add_line(text, uuid, uuid, int, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function rebuild_usage_lines(text, uuid) from public, anon, authenticated;

-- ── 6. triggers ──────────────────────────────────────────────────────────────
create or replace function usage_sync_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text := tg_argv[0];
begin
  if tg_op = 'DELETE' then
    delete from usage_lines where source_type = v_type and source_id = old.id;
    return old;
  end if;
  perform rebuild_usage_lines(v_type, new.id);
  return new;
end;
$$;

drop trigger if exists usage_sync on community_texts;
create trigger usage_sync
  after insert or update of title, region, content_bete, content_literal, content_french or delete
  on community_texts for each row execute function usage_sync_trigger('resource');

drop trigger if exists usage_sync on lexicon_examples;
create trigger usage_sync
  after insert or update of lexicon_id, bete_snippet, french_snippet, french_literal, dialect or delete
  on lexicon_examples for each row execute function usage_sync_trigger('example');

drop trigger if exists usage_sync on expressions;
create trigger usage_sync
  after insert or update of bete_phrase, bete_phonetic, french_phrase, french_literal, type or delete
  on expressions for each row execute function usage_sync_trigger('expression');

drop trigger if exists usage_sync on grammar_rules;
create trigger usage_sync
  after insert or update of example_bete, example_french, example_bete_phonetic or delete
  on grammar_rules for each row execute function usage_sync_trigger('grammar');

-- ── 7. backfill ──────────────────────────────────────────────────────────────
select rebuild_usage_lines('resource', id)   from community_texts;
select rebuild_usage_lines('example', id)    from lexicon_examples;
select rebuild_usage_lines('expression', id) from expressions;
select rebuild_usage_lines('grammar', id)    from grammar_rules;
