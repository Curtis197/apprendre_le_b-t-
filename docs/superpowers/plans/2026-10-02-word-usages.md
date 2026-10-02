# Word Usages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** For any word, list where it is used in community texts (5 by default, all on request), matching spelling variants in Bété and inflections in French.

**Architecture:** Community sources (resources, lexicon examples, expressions, grammar examples) are split into aligned lines and tokenised into two tables kept in sync by triggers (`usage_lines`, `usage_tokens`). One SQL function `find_usages` does exact, trigram-variant and short-word edit-distance matching on Bété tokens (widened by the lexicon's Latin/IPA pairing) and stem matching on French tokens. A small TypeScript client, two components and two pages sit on top.

**Tech Stack:** Next.js 16 (App Router; `params` and `searchParams` are Promises), React 19, Supabase Postgres (`pg_trgm`, `unaccent`, `fuzzystrmatch`, `french` text search), vitest (unit: `npm test`; RLS/SQL: `npm run test:rls`).

**Spec:** `docs/superpowers/specs/2026-10-02-word-usages-design.md`

## Global Constraints

- Read the relevant guide in `web/node_modules/next/dist/docs/` before writing any page or route file (`web/AGENTS.md`: this is not the Next.js you know). `searchParams` and `params` are Promises.
- Bété column naming is inverted: `lexicon.bete_word` = IPA/Bible form, `lexicon.bete_phonetic` = western Latin form. Never show `_pending_…` text.
- UI copy is French, matching surrounding components (shadcn `Button`/`Input`/`Badge`, `font-heading`, `text-muted-foreground`).
- Safari 16.1 floor: no regex lookbehind in client code, no new CSS features beyond what existing components use.
- `pg_trgm` is in schema `public` on production and `extensions` locally; `unaccent` is in `extensions` on both. SQL objects must resolve operators and operator classes through `set local search_path = public, extensions` (migration) or a function `set search_path = public, extensions`, never a hard-coded schema for `pg_trgm`.
- `search_norm(text)` already exists (immutable unaccent+lower, migration `20261002000000`). Reuse it.
- Triggers/guards test `current_user <> 'authenticated'` where roles matter; sync functions are `security definer`.
- Local DB: container `supabase_db_agdqbzbjcxrzfhkvempe`. Apply SQL with `docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < <file>` from the repo root.
- Production is NOT touched by this plan; applying migrations there is a separate, explicit step the user asks for. The production migration registry uses MCP-generated versions: apply through the Supabase MCP, never `db push`.
- Commit with explicit paths only; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A resource whose Bété, mot-à-mot and French fields do not have the same line shape is searchable from Bété only; its French lines must not be paired wrongly (Task 1 test "misaligned").
2. Editing or deleting a source must replace/remove its lines and tokens, with no orphans and no duplicates (Task 1).
3. Queries of `%`, `_`, `\`, punctuation only, blank, or 7+ words must neither error nor behave as patterns (Task 2).
4. A 1–3 letter query must not return half the corpus: edit distance 1 only, with a length window (Task 2).
5. Tone marks, case, and apostrophe forms (`mɔ̀ʼwa`, `mɔwa`) must match each other (Task 2).
6. A single very long line (one-line story) is one long usage; highlighting must still work on it and the card must not overflow on mobile (Task 4 manual check).

## File Structure

- Create `supabase/migrations/20261003000000_word_usages.sql` (tables, tokenizer, sync, backfill) and `supabase/migrations/20261003000001_find_usages.sql` (search function).
- Create `web/__tests__/rls/usage-lines.test.ts`, `web/__tests__/rls/find-usages.test.ts`.
- Create `web/lib/usages.ts` (types, client wrapper, highlighting, labels) and `web/__tests__/usages.test.ts`.
- Create `web/components/UsageCard.tsx`, `web/components/UsageList.tsx`.
- Create `web/app/usages/page.tsx`, `web/app/lexicon/[id]/usages/page.tsx`.
- Modify `web/app/lexicon/[id]/page.tsx` (Usages section), `web/app/lexicon/page.tsx` (empty-state link).

Setup (once): `git switch -c feat/word-usages` from an up-to-date `master`.

---

### Task 1: Usage tables, tokenizer and sync triggers (database)

**Files:**
- Create: `supabase/migrations/20261003000000_word_usages.sql`
- Test: `web/__tests__/rls/usage-lines.test.ts`

**Interfaces:**
- Produces: tables `usage_lines(id, source_type, source_id, ref_id, line_no, bete, literal, french, dialect, title, created_at)` and `usage_tokens(id, line_id, side, token, token_norm, token_stem)`; functions `usage_token_norm(text) → text`, `usage_tokenize(text, side) → table(token, token_norm, token_stem)`, `usage_split(text) → table(stanza int, line int, txt text)`, `rebuild_usage_lines(type, id)`. Every row of the four source tables is mirrored, and triggers keep it so.

- [x] **Step 1: Write the failing test**

```ts
// web/__tests__/rls/usage-lines.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { alignVerses } from '../../lib/verses'
import { admin, anonClient, createUser, must, uid, type TestUser } from './helpers'

type Line = { line_no: number; bete: string; literal: string | null; french: string | null; title: string | null; dialect: string | null; ref_id: string | null }

const linesOf = async (type: string, id: string): Promise<Line[]> =>
  must(
    await admin
      .from('usage_lines')
      .select('line_no, bete, literal, french, title, dialect, ref_id')
      .eq('source_type', type)
      .eq('source_id', id)
      .order('line_no'),
    'lines',
  ) as Line[]

const tokensOf = async (type: string, id: string, side: string): Promise<string[]> => {
  const { data: lines } = await admin.from('usage_lines').select('id').eq('source_type', type).eq('source_id', id)
  const ids = (lines ?? []).map(l => l.id)
  if (ids.length === 0) return []
  const { data } = await admin.from('usage_tokens').select('token_norm').eq('side', side).in('line_id', ids)
  return (data ?? []).map(t => t.token_norm).sort()
}

async function resource(extra: Record<string, unknown>) {
  return must(
    await admin
      .from('community_texts')
      .insert({ title: 'Chant', type: 'song', content_bete: 'x', ...extra })
      .select('id')
      .single(),
    'seed resource',
  ).id as string
}

describe('usage_lines sync', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createUser('usage-alice')
  })

  describe('resources', () => {
    it('pairs Bété, mot à mot and French line by line, like alignVerses', async () => {
      const bete = 'ba ko\nsa ni\n\nmu'
      const literal = 'l1\nl2\n\nl3'
      const french = 'f1\nf2\n\nf3'
      const id = await resource({ content_bete: bete, content_literal: literal, content_french: french })
      const lines = await linesOf('resource', id)

      const expected = alignVerses(bete, literal, french)
      expect(expected.kind).toBe('verses')
      if (expected.kind !== 'verses') return
      const flat = expected.stanzas.flat()
      expect(lines.map(l => [l.bete, l.literal, l.french])).toEqual(flat.map(v => [v.original, v.literal, v.french]))
      expect(lines.map(l => l.line_no)).toEqual([0, 1, 2])
    })

    it('keeps the Bété lines but pairs nothing when the fields do not line up', async () => {
      const id = await resource({ content_bete: 'a1\na2\na3', content_literal: 'l1\nl2', content_french: 'f1\nf2\nf3' })
      const lines = await linesOf('resource', id)
      expect(lines.map(l => l.bete)).toEqual(['a1', 'a2', 'a3'])
      expect(lines.every(l => l.literal === null && l.french === null)).toBe(true)
    })

    it('stores a single line as one usage, with its translations', async () => {
      const id = await resource({ content_bete: '  ba ko  ', content_french: 'il mange' })
      expect(await linesOf('resource', id)).toMatchObject([{ line_no: 0, bete: 'ba ko', french: 'il mange', ref_id: id }])
    })

    it('drops blank lines, trims lines and handles Windows line endings', async () => {
      const id = await resource({ content_bete: ' a \r\n\r\n\r\n b \r\n c ' })
      expect((await linesOf('resource', id)).map(l => l.bete)).toEqual(['a', 'b', 'c'])
    })

    it('carries the title and maps the region to a dialect', async () => {
      const id = await resource({ title: 'Le chant', content_bete: 'ba', region: 'Gagnoa' })
      expect(await linesOf('resource', id)).toMatchObject([{ title: 'Le chant', dialect: 'northern' }])
    })

    it('replaces the lines when the text is edited and removes them when it is deleted', async () => {
      const id = await resource({ content_bete: 'one\ntwo' })
      expect(await linesOf('resource', id)).toHaveLength(2)

      await admin.from('community_texts').update({ content_bete: 'only' }).eq('id', id)
      expect((await linesOf('resource', id)).map(l => l.bete)).toEqual(['only'])
      expect(await tokensOf('resource', id, 'bete')).toEqual(['only'])

      await admin.from('community_texts').delete().eq('id', id)
      expect(await linesOf('resource', id)).toEqual([])
    })

    it('does not rebuild when only the score changes (no duplicate or lost rows)', async () => {
      const id = await resource({ content_bete: 'one\ntwo' })
      const before = await admin.from('usage_lines').select('id').eq('source_id', id).order('line_no')
      await admin.from('community_texts').update({ upvotes: 3 }).eq('id', id)
      const after = await admin.from('usage_lines').select('id').eq('source_id', id).order('line_no')
      expect(after.data).toEqual(before.data)
    })
  })

  describe('tokens', () => {
    it('folds case, tone marks and apostrophes so spellings of one word share a normal form', async () => {
      const id = await resource({ content_bete: 'Mɔ̀ʼwa mɔwa ʼMƆWA, bá.' })
      expect(await tokensOf('resource', id, 'bete')).toEqual(['ba', 'mɔwa', 'mɔwa', 'mɔwa'])
    })

    it('splits on punctuation and keeps inner apostrophes inside the raw token', async () => {
      const id = await resource({ content_bete: 'ba, ko! (sa)' })
      const { data } = await admin
        .from('usage_tokens')
        .select('token, usage_lines!inner(source_id)')
        .eq('usage_lines.source_id', id)
        .eq('side', 'bete')
      expect((data ?? []).map(t => t.token).sort()).toEqual(['ba', 'ko', 'sa'])
    })

    it('indexes French words by their stem, accent-insensitively', async () => {
      const id = await resource({ content_bete: 'ba', content_french: "Il mangeait l'été" })
      const { data } = await admin
        .from('usage_tokens')
        .select('token_norm, token_stem, usage_lines!inner(source_id)')
        .eq('usage_lines.source_id', id)
        .eq('side', 'fr')
      const stems = Object.fromEntries((data ?? []).map(t => [t.token_norm, t.token_stem]))
      expect(stems['mangeait']).toBe(stems['mange'] ?? stems['mangeait'])
      expect(stems['ete']).toBeDefined()
      expect(Object.keys(stems)).toContain('l')
    })
  })

  describe('other sources', () => {
    it('mirrors a lexicon example, linking to its word', async () => {
      const tag = uid()
      const word = must(
        await admin
          .from('lexicon')
          .insert({ bete_word: `ipa-${tag}`, bete_phonetic: `lat-${tag}`, french_candidates: [], top_french: 'x', probability: 1 })
          .select('id')
          .single(),
        'word',
      ).id
      const ex = must(
        await admin
          .from('lexicon_examples')
          .insert({ lexicon_id: word, bete_snippet: 'ba ko', french_snippet: 'il mange', french_literal: 'lui manger', dialect: 'eastern' })
          .select('id')
          .single(),
        'example',
      ).id
      expect(await linesOf('example', ex)).toMatchObject([
        { bete: 'ba ko', literal: 'lui manger', french: 'il mange', dialect: 'eastern', ref_id: word },
      ])
      await admin.from('lexicon_examples').delete().eq('id', ex)
      expect(await linesOf('example', ex)).toEqual([])
    })

    it('mirrors an expression and indexes its written form as extra Bété words', async () => {
      const ex = must(
        await admin
          .from('expressions')
          .insert({ french_phrase: 'il pleut', french_literal: 'la pluie me bat', bete_phrase: 'ɓa lɛ', bete_phonetic: 'ba le', type: 'idiomatic' })
          .select('id')
          .single(),
        'expression',
      ).id
      expect(await linesOf('expression', ex)).toMatchObject([
        { bete: 'ɓa lɛ', literal: 'la pluie me bat', french: 'il pleut', title: 'idiomatic' },
      ])
      expect(await tokensOf('expression', ex, 'bete')).toEqual(expect.arrayContaining(['ba', 'le', 'ɓa', 'lɛ']))
    })

    it('mirrors a grammar example only when it has a Bété example', async () => {
      const base = { category: 'verb', pattern_french: 'p', pattern_bete: 'q', description: 'd' }
      const without = must(await admin.from('grammar_rules').insert(base).select('id').single(), 'rule').id
      expect(await linesOf('grammar', without)).toEqual([])

      const withEx = must(
        await admin
          .from('grammar_rules')
          .insert({ ...base, example_bete: 'ba ko', example_french: 'il mange', example_bete_phonetic: 'ba ko' })
          .select('id')
          .single(),
        'rule',
      ).id
      expect(await linesOf('grammar', withEx)).toMatchObject([{ bete: 'ba ko', french: 'il mange' }])
    })
  })

  describe('access', () => {
    it('is readable by everyone and writable by no client', async () => {
      const id = await resource({ content_bete: 'ba ko' })
      const { data } = await anonClient().from('usage_lines').select('id').eq('source_id', id)
      expect(data).toHaveLength(1)

      const lineId = data![0].id
      expect((await alice.client.from('usage_lines').insert({ source_type: 'resource', source_id: id, line_no: 9, bete: 'x' })).error).not.toBeNull()
      await alice.client.from('usage_lines').update({ bete: 'piraté' }).eq('id', lineId)
      await alice.client.from('usage_lines').delete().eq('id', lineId)
      await anonClient().from('usage_lines').delete().eq('id', lineId)
      expect((await admin.from('usage_lines').select('bete').eq('id', lineId)).data).toEqual([{ bete: 'ba ko' }])
      expect((await alice.client.from('usage_tokens').insert({ line_id: lineId, side: 'bete', token: 'x', token_norm: 'x' })).error).not.toBeNull()
    })

    it('mirrors a resource a signed-in user publishes through the app', async () => {
      const row = must(
        await alice.client
          .from('community_texts')
          .insert({ title: 'Chant', type: 'song', content_bete: 'ba ko', created_by: alice.id })
          .select('id')
          .single(),
        'alice publishes',
      )
      expect(await linesOf('resource', row.id)).toHaveLength(1)
    })
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd web && npm run test:rls -- usage-lines`
Expected: FAIL (`relation "usage_lines" does not exist`).

- [x] **Step 3: Write the migration**

```sql
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
create policy usage_lines_select  on usage_lines  for select using (true);
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
      perform usage_add_line(
        'resource', p_id, p_id, (row_number() over (order by o.stanza, o.line) - 1)::int,
        o.txt,
        case when v_aligned and v_has_lit then l.txt end,
        case when v_aligned and v_has_fr  then f.txt end,
        v_dialect, r_text.title, r_text.created_at
      )
      from usage_split(r_text.content_bete) o
      left join usage_split(r_text.content_literal) l on l.stanza = o.stanza and l.line = o.line
      left join usage_split(r_text.content_french)  f on f.stanza = o.stanza and f.line = o.line
      order by o.stanza, o.line;
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
```

- [x] **Step 4: Apply locally and run the test**

```bash
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/20261003000000_word_usages.sql
cd web && npm run test:rls -- usage-lines
```
Expected: migration prints no `ERROR`; all tests PASS. Likely adjustments if something fails:
- `perform … from usage_split(...) o … order by` with a window function in the select list of a `perform`: if Postgres rejects it, rewrite the paired branch as `for rec in select … loop perform usage_add_line(…); end loop;` (declare `rec record`), keeping the same arguments and `line_no = rec.k - 1`.
- If `usage_tokens` rows for `ʼwa`-style tokens are not folded, check that `unaccent` in this database maps U+0301-style combining marks (the explicit `[̀-ͯ]` range in `usage_token_norm` already strips them).
- The French stem test asserts only that `mangeait` and `mange` share a stem; if the `french_stem` dictionary stems differently, change the assertion to compare the two stems to each other, not to a literal.

- [x] **Step 5: Verify backfill and the full RLS suite**

```bash
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -c "select source_type, count(*) from usage_lines group by 1;"
cd web && npm run test:rls
```
Expected: counts appear for any existing rows; whole RLS suite PASS.

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20261003000000_word_usages.sql web/__tests__/rls/usage-lines.test.ts
git commit -m "feat(usages): mirror community texts as tokenised, aligned usage lines"
```

---

### Task 2: `find_usages` (database)

**Files:**
- Create: `supabase/migrations/20261003000001_find_usages.sql`
- Test: `web/__tests__/rls/find-usages.test.ts`

**Interfaces:**
- Consumes: `usage_lines`, `usage_tokens`, `usage_tokenize`, `usage_token_norm` from Task 1; `lexicon`.
- Produces: `rpc('find_usages', { q, p_side, p_limit, p_offset, p_threshold })` returning rows `{ line_id, source_type, source_id, ref_id, line_no, title, dialect, bete, literal, french, created_at, match_kind, matched_tokens, similarity, total_count }`.

- [x] **Step 1: Write the failing test**

```ts
// web/__tests__/rls/find-usages.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, must, uid } from './helpers'

type Usage = {
  source_id: string
  line_no: number
  bete: string
  match_kind: 'exact' | 'variant'
  matched_tokens: string[]
  similarity: number
  total_count: number
}

describe('find_usages', () => {
  const ids = new Set<string>()
  let A: string // resource with several lines
  let B: string // resource with apostrophe/tone spellings
  let C: string // resource with 5 identical lines (paging)

  async function resource(content_bete: string, extra: Record<string, unknown> = {}) {
    const id = must(
      await admin.from('community_texts').insert({ title: 'T', type: 'song', content_bete, ...extra }).select('id').single(),
      'seed',
    ).id as string
    ids.add(id)
    return id
  }

  // Only our own fixtures count: the database may hold other texts.
  const find = async (args: Record<string, unknown>) => {
    const rows = must(await anonClient().rpc('find_usages', { p_limit: 50, ...args }), 'find') as Usage[]
    return rows.filter(r => ids.has(r.source_id))
  }

  beforeAll(async () => {
    A = await resource('kaba nunu sakuli\nkaaba mimi\nbá lolo\nzizu mimi', {
      content_french: 'Il mange le riz\nElle mangeait\nIl boit de l’eau\nL’été arrive',
    })
    B = await resource('mɔ̀ʼwa ko\nsa ni')
    C = await resource('zoro a\nzoro b\nzoro c\nzoro d\nzoro e')
  })

  afterAll(async () => {
    await admin.from('community_texts').delete().in('id', [...ids])
  })

  it('finds a word exactly and reports the matched token', async () => {
    const rows = await find({ q: 'nunu' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source_id: A, line_no: 0, match_kind: 'exact', matched_tokens: ['nunu'], similarity: 1 })
  })

  it('lists exact matches before spelling variants', async () => {
    const rows = await find({ q: 'kaba' })
    expect(rows.map(r => [r.line_no, r.match_kind])).toEqual([[0, 'exact'], [1, 'variant']])
    expect(rows[1].matched_tokens).toEqual(['kaaba'])
    expect(rows[1].similarity).toBeGreaterThanOrEqual(0.4)
    expect(rows[1].similarity).toBeLessThan(1)
  })

  it('treats case, tone marks and apostrophes as the same word', async () => {
    expect((await find({ q: 'BA' })).map(r => [r.line_no, r.match_kind])).toContainEqual([2, 'exact'])
    const viaApostrophe = await find({ q: 'mɔwa' })
    expect(viaApostrophe).toMatchObject([{ source_id: B, line_no: 0, match_kind: 'exact', matched_tokens: ['mɔ̀ʼwa'] }])
    expect(await find({ q: "ʼMɔ̀wa" })).toHaveLength(1)
  })

  it('does not return half the corpus for a very short query', async () => {
    const rows = await find({ q: 'ba' })
    // 'ba' is exact in line 2 ("bá"); at most one-letter-edit neighbours of the same length window follow.
    expect(rows.every(r => r.match_kind === 'exact' || r.similarity > 0)).toBe(true)
    expect(rows.length).toBeLessThanOrEqual(6)
  })

  it('requires every word of a multi-word query on the same line', async () => {
    expect((await find({ q: 'kaba nunu' })).map(r => r.line_no)).toEqual([0])
    expect(await find({ q: 'kaba zizu' })).toEqual([])
  })

  it('bridges the Latin and IPA forms of a lexicon entry', async () => {
    const id = await resource('xyzza ɲazzu ko')
    expect(await find({ q: 'gnazzu' })).toEqual([])

    const word = must(
      await admin
        .from('lexicon')
        .insert({ bete_phonetic: 'gnazzu', bete_word: 'ɲazzu', french_candidates: [], top_french: 'x', probability: 1 })
        .select('id')
        .single(),
      'word',
    ).id
    try {
      const rows = await find({ q: 'gnazzu' })
      expect(rows).toMatchObject([{ source_id: id, match_kind: 'exact', matched_tokens: ['ɲazzu'] }])
      expect((await find({ q: 'ɲazzu' })).map(r => r.source_id)).toEqual([id])
    } finally {
      await admin.from('lexicon').delete().eq('id', word)
    }
  })

  describe('French side', () => {
    it('matches inflections by stem, ignoring accents', async () => {
      const rows = await find({ q: 'manger', p_side: 'fr' })
      expect(rows.map(r => r.line_no)).toEqual([0, 1])
      expect(rows.every(r => r.match_kind === 'exact')).toBe(true)
      expect((await find({ q: 'ete', p_side: 'fr' })).map(r => r.line_no)).toEqual([3])
      expect((await find({ q: "l'eau", p_side: 'fr' })).map(r => r.line_no)).toEqual([2])
    })

    it('does not search the Bété text', async () => {
      expect(await find({ q: 'nunu', p_side: 'fr' })).toEqual([])
    })
  })

  describe('hostile and degenerate queries', () => {
    it.each(['%', '_', '\\', '...', '   ', '', '%%%%', "'"])('returns nothing for %j and does not error', async q => {
      expect(await find({ q })).toEqual([])
    })

    it('ignores an unknown side', async () => {
      expect(await find({ q: 'nunu', p_side: 'xx' })).toEqual([])
    })

    it('caps the number of query words', async () => {
      const q = Array.from({ length: 12 }, (_, i) => `w${i}x`).join(' ')
      expect(await find({ q })).toEqual([])
    })
  })

  describe('paging', () => {
    it('pages through all usages with a stable order and a total on every row', async () => {
      const all = await find({ q: 'zoro', p_limit: 50 })
      expect(all).toHaveLength(5)
      const p1 = await find({ q: 'zoro', p_limit: 2, p_offset: 0 })
      const p2 = await find({ q: 'zoro', p_limit: 2, p_offset: 2 })
      const p3 = await find({ q: 'zoro', p_limit: 2, p_offset: 4 })
      expect([...p1, ...p2, ...p3].map(r => r.line_no)).toEqual(all.map(r => r.line_no))
      expect(p1[0].total_count).toBeGreaterThanOrEqual(5)
      expect(C).toBeTruthy()
    })

    it('defaults to 5 and never returns more than 50', async () => {
      const raw = must(await anonClient().rpc('find_usages', { q: 'zoro' }), 'default') as Usage[]
      expect(raw.length).toBeLessThanOrEqual(5)
      const big = must(await anonClient().rpc('find_usages', { q: 'zoro', p_limit: 5000 }), 'big') as Usage[]
      expect(big.length).toBeLessThanOrEqual(50)
    })
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd web && npm run test:rls -- find-usages`
Expected: FAIL (`Could not find the function public.find_usages`).

- [x] **Step 3: Write the migration**

```sql
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
  -- the query's words (at most 6), one row each
  with qt as (
    select (row_number() over ())::int as ord, d.token_norm as n, d.token_stem as s
    from (select distinct token_norm, token_stem from usage_tokenize(q, p_side) limit 6) d
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
  order by m.is_exact desc, m.similarity desc, u.created_at desc, u.id
  limit least(greatest(coalesce(p_limit, 5), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function find_usages(text, text, int, int, real) to anon, authenticated;
```

- [x] **Step 4: Apply locally and run the test**

```bash
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < supabase/migrations/20261003000001_find_usages.sql
cd web && npm run test:rls -- find-usages
```
Expected: PASS. If the function fails to create because of ambiguous names between the `RETURNS TABLE` output columns and CTE columns, qualify the offending reference with its table alias (every reference in the body is meant to be qualified already). If the similarity of `kaba` vs `kaaba` falls under 0.4 on this PostgreSQL version, change the fixture (`kaaba` to `kabba`) rather than the default threshold, and tell the user what you observed.

- [x] **Step 5: Check the index is usable for the variant branch**

```bash
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -c "set enable_seqscan=off; explain select line_id from usage_tokens where side='bete' and token_norm % 'kaba';"
```
Expected: a `Bitmap Index Scan on usage_tokens_trgm_idx`. (The local table is tiny, so the planner only picks it with sequential scans disabled.)

- [x] **Step 6: Run the whole RLS suite, then commit**

```bash
cd web && npm run test:rls
git add supabase/migrations/20261003000001_find_usages.sql web/__tests__/rls/find-usages.test.ts
git commit -m "feat(usages): find_usages with exact, variant and French stem matching"
```
Expected: whole suite PASS.

---

### Task 3: TypeScript client, highlighting and labels

**Files:**
- Create: `web/lib/usages.ts`
- Test: `web/__tests__/usages.test.ts`

**Interfaces:**
- Consumes: `rpc('find_usages')` from Task 2.
- Produces:
  - `UsageRow` (`line_id`, `source_type: 'resource'|'example'|'expression'|'grammar'`, `source_id`, `ref_id: string|null`, `line_no`, `title: string|null`, `dialect`, `bete`, `literal: string|null`, `french: string|null`, `match_kind: 'exact'|'variant'`, `matched_tokens: string[]`, `similarity: number`, `total_count: number`).
  - `UsageSide = 'bete' | 'fr'`.
  - `findUsages(client, { q, side?, limit?, offset? }): Promise<{ rows: UsageRow[]; total: number; error: string | null }>`.
  - `splitHighlight(text: string, tokens: string[]): { text: string; match: boolean }[]`.
  - `usageSourceLabel(row: Pick<UsageRow,'source_type'|'title'>): string`, `usageHref(row: Pick<UsageRow,'source_type'|'ref_id'>): string | null`, `normalizeSide(value?: string | null): UsageSide`.

- [x] **Step 1: Write the failing tests**

```ts
// web/__tests__/usages.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findUsages, normalizeSide, splitHighlight, usageHref, usageSourceLabel } from '../lib/usages'

const fake = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('findUsages', () => {
  it('does not call the database for a blank query', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    expect(await findUsages(client, { q: '  ' })).toEqual({ rows: [], total: 0, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps its options onto the SQL function arguments, defaulting to the Bété side and 5 rows', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    await findUsages(client, { q: ' kaba ' })
    expect(rpc).toHaveBeenCalledWith('find_usages', { q: 'kaba', p_side: 'bete', p_limit: 5, p_offset: 0 })
    await findUsages(client, { q: 'manger', side: 'fr', limit: 20, offset: 40 })
    expect(rpc).toHaveBeenLastCalledWith('find_usages', { q: 'manger', p_side: 'fr', p_limit: 20, p_offset: 40 })
  })

  it('returns the rows and the total from the first row', async () => {
    const { client } = fake({ data: [{ line_id: 'a', total_count: 9 }, { line_id: 'b', total_count: 9 }], error: null })
    const res = await findUsages(client, { q: 'kaba' })
    expect(res.rows).toHaveLength(2)
    expect(res.total).toBe(9)
  })

  it('reports a French error when the call fails', async () => {
    const { client } = fake({ data: null, error: { message: 'boom' } })
    expect(await findUsages(client, { q: 'kaba' })).toEqual({
      rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.',
    })
  })
})

describe('splitHighlight', () => {
  const joined = (parts: { text: string }[]) => parts.map(p => p.text).join('')

  it('marks the matched words and keeps every other character, including punctuation', () => {
    const parts = splitHighlight('Kaba nunu, sakuli!', ['nunu'])
    expect(joined(parts)).toBe('Kaba nunu, sakuli!')
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['nunu'])
  })

  it('matches the whole word only, not a substring of another word', () => {
    const parts = splitHighlight('kaba kabana', ['kaba'])
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['kaba'])
  })

  it('matches the word as stored: case, tone marks and apostrophes included', () => {
    const parts = splitHighlight('Mɔ̀ʼwa ko mɔwa', ['Mɔ̀ʼwa'])
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['Mɔ̀ʼwa'])
  })

  it('returns one plain part when there is nothing to highlight', () => {
    expect(splitHighlight('kaba nunu', [])).toEqual([{ text: 'kaba nunu', match: false }])
    expect(splitHighlight('', ['x'])).toEqual([])
  })

  it('does not treat tokens as patterns', () => {
    expect(joined(splitHighlight('a.b a+b', ['a+b', '.*']))).toBe('a.b a+b')
  })
})

describe('labels and links', () => {
  it('names each source in French', () => {
    expect(usageSourceLabel({ source_type: 'resource', title: 'Le chant' })).toBe('Le chant')
    expect(usageSourceLabel({ source_type: 'resource', title: null })).toBe('Ressource')
    expect(usageSourceLabel({ source_type: 'example', title: null })).toBe('Exemple')
    expect(usageSourceLabel({ source_type: 'expression', title: 'proverb' })).toBe('Proverbe')
    expect(usageSourceLabel({ source_type: 'expression', title: 'idiomatic' })).toBe('Expression idiomatique')
    expect(usageSourceLabel({ source_type: 'expression', title: null })).toBe('Expression')
    expect(usageSourceLabel({ source_type: 'grammar', title: null })).toBe('Règle de grammaire')
  })

  it('links resources and lexicon examples to their page, nothing else', () => {
    expect(usageHref({ source_type: 'resource', ref_id: 'r1' })).toBe('/resources/r1')
    expect(usageHref({ source_type: 'example', ref_id: 'w1' })).toBe('/lexicon/w1')
    expect(usageHref({ source_type: 'expression', ref_id: null })).toBeNull()
    expect(usageHref({ source_type: 'resource', ref_id: null })).toBeNull()
  })

  it('normalises the side from a URL parameter', () => {
    expect(normalizeSide('fr')).toBe('fr')
    expect(normalizeSide('bete')).toBe('bete')
    expect(normalizeSide('nope')).toBe('bete')
    expect(normalizeSide(undefined)).toBe('bete')
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run __tests__/usages.test.ts`
Expected: FAIL (module not found).

- [x] **Step 3: Implement `web/lib/usages.ts`**

```ts
// lib/usages.ts — client for the find_usages SQL function, and display helpers for usage cards.
import type { SupabaseClient } from '@supabase/supabase-js'

export type UsageSide = 'bete' | 'fr'
export type UsageSourceType = 'resource' | 'example' | 'expression' | 'grammar'

export interface UsageRow {
  line_id: string
  source_type: UsageSourceType
  source_id: string
  ref_id: string | null          // resource id, or the lexicon entry of an example
  line_no: number
  title: string | null
  dialect: string | null
  bete: string
  literal: string | null         // mot à mot
  french: string | null
  match_kind: 'exact' | 'variant'
  matched_tokens: string[]       // the words as written in the line, for highlighting
  similarity: number
  total_count: number
}

export function normalizeSide(value?: string | null): UsageSide {
  return value === 'fr' ? 'fr' : 'bete'
}

export interface FindUsagesOptions {
  q: string
  side?: UsageSide
  limit?: number
  offset?: number
}

export async function findUsages(
  client: SupabaseClient,
  { q, side = 'bete', limit = 5, offset = 0 }: FindUsagesOptions,
): Promise<{ rows: UsageRow[]; total: number; error: string | null }> {
  const text = q.trim()
  if (!text) return { rows: [], total: 0, error: null }

  const { data, error } = await client.rpc('find_usages', {
    q: text, p_side: side, p_limit: limit, p_offset: offset,
  })
  if (error) return { rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.' }
  const rows = (data ?? []) as UsageRow[]
  return { rows, total: rows[0]?.total_count ?? 0, error: null }
}

// Word separators, mirroring usage_tokenize (SQL) for the Bété side. Apostrophes stay inside a word.
// No regex lookbehind: unsupported before Safari 16.4.
const SEPARATORS = '[\\s.,;:!?«»"“”()\\[\\]…–—/]+'
const EDGE_JUNK = /^['’ʼ‑-]+|['’ʼ‑-]+$/g

/** Splits a line into parts, flagging the words that are in `tokens` (compared as stored, whole words only). */
export function splitHighlight(text: string, tokens: string[]): { text: string; match: boolean }[] {
  if (!text) return []
  const wanted = new Set(tokens.filter(Boolean))
  if (wanted.size === 0) return [{ text, match: false }]

  const parts: { text: string; match: boolean }[] = []
  const push = (value: string, match: boolean) => {
    if (!value) return
    const last = parts[parts.length - 1]
    if (last && last.match === match) last.text += value
    else parts.push({ text: value, match })
  }

  // A capturing split alternates words and separators and keeps every character.
  const separators = new RegExp(`(${SEPARATORS})`)
  text.split(separators).forEach((piece, i) => {
    if (!piece) return
    if (i % 2 === 1) {                       // a separator run
      push(piece, false)
      return
    }
    const core = piece.replace(EDGE_JUNK, '')
    if (core && wanted.has(core)) {
      const start = piece.indexOf(core)
      push(piece.slice(0, start), false)
      push(core, true)
      push(piece.slice(start + core.length), false)
    } else {
      push(piece, false)
    }
  })
  return parts
}

const EXPRESSION_LABELS: Record<string, string> = {
  idiomatic: 'Expression idiomatique',
  fixed: 'Expression figée',
  proverb: 'Proverbe',
}

/** The badge text for a usage: the resource title, or the kind of source. */
export function usageSourceLabel(row: Pick<UsageRow, 'source_type' | 'title'>): string {
  switch (row.source_type) {
    case 'resource':
      return row.title?.trim() || 'Ressource'
    case 'example':
      return 'Exemple'
    case 'expression':
      return (row.title && EXPRESSION_LABELS[row.title]) || 'Expression'
    case 'grammar':
      return 'Règle de grammaire'
  }
}

/** Where the badge links to (null: the source has no page of its own). */
export function usageHref(row: Pick<UsageRow, 'source_type' | 'ref_id'>): string | null {
  if (!row.ref_id) return null
  if (row.source_type === 'resource') return `/resources/${row.ref_id}`
  if (row.source_type === 'example') return `/lexicon/${row.ref_id}`
  return null
}
```

- [x] **Step 4: Run tests and typecheck**

Run: `cd web && npx vitest run __tests__/usages.test.ts && npx tsc --noEmit`
Expected: PASS. If a `splitHighlight` case fails on word edges, fix the function, not the test: the tests encode the required behaviour (whole word only, every character preserved, tokens never used as patterns).

- [x] **Step 5: Commit**

```bash
git add web/lib/usages.ts web/__tests__/usages.test.ts
git commit -m "feat(usages): client, highlighting and source labels"
```

---

### Task 4: Components and pages

**Files:**
- Create: `web/components/UsageCard.tsx`, `web/components/UsageList.tsx`, `web/app/usages/page.tsx`, `web/app/lexicon/[id]/usages/page.tsx`
- Modify: `web/app/lexicon/[id]/page.tsx`, `web/app/lexicon/page.tsx`

**Interfaces:**
- Consumes: `findUsages`, `UsageRow`, `UsageSide`, `splitHighlight`, `usageSourceLabel`, `usageHref`, `normalizeSide` from Task 3; `createClient` from `@/lib/supabase-server` (server) and `@/lib/supabase-browser` (client); `cleanBeteForm` from `@/lib/lexicon`.
- Produces: `<UsageCard row side />`, `<UsageList initialRows total q side pageSize? />`.

Before writing pages, read `web/node_modules/next/dist/docs/` for page props (`searchParams` is a Promise) and `metadata`.

- [x] **Step 1: `UsageCard.tsx`** (server-compatible; no hooks)

```tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { splitHighlight, usageHref, usageSourceLabel, type UsageRow, type UsageSide } from '@/lib/usages'

function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {splitHighlight(text, tokens).map((part, i) =>
        part.match ? (
          <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">{part.text}</mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function UsageCard({ row, side }: { row: UsageRow; side: UsageSide }) {
  const href = usageHref(row)
  const label = usageSourceLabel(row)
  const tokens = row.matched_tokens ?? []

  return (
    <article className="rounded-lg border border-border px-4 py-3 space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {href ? (
          <Link href={href} className="text-xs font-medium text-primary hover:underline truncate max-w-full">
            {label} →
          </Link>
        ) : (
          <span className="text-xs font-medium text-muted-foreground truncate max-w-full">{label}</span>
        )}
        {row.match_kind === 'variant' && (
          <Badge variant="outline" className="text-xs">variante : {tokens.join(', ')}</Badge>
        )}
      </div>

      <p className="font-heading text-lg leading-snug break-words">
        {side === 'bete' ? <Highlighted text={row.bete} tokens={tokens} /> : row.bete}
      </p>
      {row.literal && <p className="text-sm text-muted-foreground italic break-words">{row.literal}</p>}
      {row.french && (
        <p className="text-sm break-words">
          {side === 'fr' ? <Highlighted text={row.french} tokens={tokens} /> : row.french}
        </p>
      )}
    </article>
  )
}
```

- [x] **Step 2: `UsageList.tsx`** (client: load more)

```tsx
'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import { findUsages, type UsageRow, type UsageSide } from '@/lib/usages'
import { UsageCard } from '@/components/UsageCard'

interface Props {
  initialRows: UsageRow[]
  total: number
  q: string
  side: UsageSide
  pageSize?: number
}

export function UsageList({ initialRows, total, q, side, pageSize = 20 }: Props) {
  const supabaseRef = useRef(createClient())
  const [rows, setRows] = useState(initialRows)
  const [count, setCount] = useState(total)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadMore() {
    setLoading(true)
    setError(null)
    const res = await findUsages(supabaseRef.current, { q, side, limit: pageSize, offset: rows.length })
    setLoading(false)
    if (res.error) { setError(res.error); return }
    setRows(prev => [...prev, ...res.rows])
    setCount(res.total || count)
  }

  if (rows.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {rows.length} sur {count} usage{count !== 1 ? 's' : ''}
      </p>
      <div className="space-y-3">
        {rows.map(row => <UsageCard key={row.line_id} row={row} side={side} />)}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.length < count && (
        <Button variant="outline" onClick={loadMore} disabled={loading}>
          {loading ? 'Chargement…' : 'Charger plus'}
        </Button>
      )}
    </div>
  )
}
```

- [x] **Step 3: `app/usages/page.tsx`** (free-text search; a plain GET form so it works without client JS)

```tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { findUsages, normalizeSide } from '@/lib/usages'
import { UsageList } from '@/components/UsageList'
import { PageHeader } from '@/components/PageHeader'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Usages d’un mot',
  description: 'Où un mot bhété ou français est utilisé dans les chansons, contes, proverbes et exemples de la communauté.',
  robots: { index: false, follow: true },   // result pages depend on the query: keep them out of the index
}

const PAGE_SIZE = 20

export default async function UsagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; side?: string }>
}) {
  const { q = '', side: rawSide } = await searchParams
  const side = normalizeSide(rawSide)
  const query = q.trim().slice(0, 100)
  const result = query ? await findUsages(await createClient(), { q: query, side, limit: PAGE_SIZE }) : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <PageHeader
        badge="Contexte"
        title="Usages d’un mot"
        subtitle="Retrouvez les phrases de la communauté où un mot est utilisé, avec ses variantes d’orthographe."
      />

      <form action="/usages" method="get" className="flex flex-col sm:flex-row gap-2">
        <Input name="q" defaultValue={query} placeholder="Un mot…" className="text-base" aria-label="Mot recherché" />
        <select name="side" defaultValue={side} className="border rounded px-3 py-2 text-sm" aria-label="Langue du mot">
          <option value="bete">Bhété</option>
          <option value="fr">Français</option>
        </select>
        <Button type="submit">Chercher</Button>
      </form>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}

      {result && !result.error && result.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun usage trouvé pour « {query} ». L’orthographe du bhété varie : essayez une autre écriture du mot.
        </p>
      )}

      {result && result.rows.length > 0 && (
        <UsageList key={`${side}:${query}`} initialRows={result.rows} total={result.total} q={query} side={side} pageSize={PAGE_SIZE} />
      )}

      {side === 'fr' && query && (
        <p className="text-xs text-muted-foreground">
          Depuis le français, seules les ressources dont le texte et la traduction ont le même nombre de lignes sont retrouvées.
        </p>
      )}
    </div>
  )
}
```
Check that `PageHeader` accepts `badge`, `title`, `subtitle` (it does on `/lexicon`); adjust only if its signature differs.

- [x] **Step 4: `app/lexicon/[id]/usages/page.tsx`**

```tsx
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { cleanBeteForm } from '@/lib/lexicon'
import { findUsages } from '@/lib/usages'
import { UsageList } from '@/components/UsageList'

export const metadata: Metadata = { title: 'Usages du mot', robots: { index: false, follow: true } }

const PAGE_SIZE = 20

export default async function WordUsagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: entry } = await supabase.from('lexicon').select('bete_phonetic, bete_word').eq('id', id).maybeSingle()
  if (!entry) notFound()

  const word = cleanBeteForm(entry.bete_phonetic) || cleanBeteForm(entry.bete_word)
  if (!word) notFound()
  const { rows, total, error } = await findUsages(supabase, { q: word, limit: PAGE_SIZE })

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      <Link href={`/lexicon/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4" /> Retour au mot
      </Link>
      <h1 className="font-heading text-2xl font-bold">Usages de « {word} »</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun usage trouvé pour ce mot.</p>}
      <UsageList initialRows={rows} total={total} q={word} side="bete" pageSize={PAGE_SIZE} />
    </main>
  )
}
```

- [x] **Step 5: "Usages" section on `app/lexicon/[id]/page.tsx`**

Add imports `findUsages` from `@/lib/usages`, `UsageCard` from `@/components/UsageCard`, and `Link` from `next/link`. After the `const descText = pickDescription(entry)` line in the page component add:

```tsx
  const usages = bete ? await findUsages(await createClient(), { q: bete, limit: 5 }) : null
```
and render, after the examples section and before `</main>`:

```tsx
      {usages && usages.rows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-lg font-heading">Usages</h2>
          <div className="space-y-3">
            {usages.rows.map(row => <UsageCard key={row.line_id} row={row} side="bete" />)}
          </div>
          {usages.total > usages.rows.length && (
            <Link href={`/lexicon/${id}/usages`} className="text-sm text-primary hover:underline font-medium">
              Voir tous les usages ({usages.total}) →
            </Link>
          )}
        </section>
      )}
```
(`createClient` is already imported there. The lexicon bridge makes the Latin-form query find IPA-spelled lines too.)

- [x] **Step 6: Link from `/lexicon` search**: in `app/lexicon/page.tsx`, inside the `debounced.trim()` empty state, add under the existing "Ajouter … au lexique" link:

```tsx
            <Link
              href={`/usages?q=${encodeURIComponent(debounced.trim())}`}
              className="block text-primary hover:underline text-sm"
            >
              Voir des usages de « {debounced.trim()} » dans les textes →
            </Link>
```

- [x] **Step 7: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint -- app/usages app/lexicon components/UsageCard.tsx components/UsageList.tsx && npm test
npm run dev
```
Manual (local stack; add a resource through `/resources/new`, or insert via SQL, so there is data): `/usages?q=<a word of your text>` shows highlighted lines and a source badge linking to the resource; "Charger plus" appears once there are more than 20; a variant spelling shows the "variante :" tag; the French toggle finds an inflected word; `/lexicon/<id>` of a translated word shows "Usages" with at most 5 cards and the "Voir tous" link when there are more; a blank `/usages` shows only the form; a one-line, very long text wraps on a 360px-wide viewport with no horizontal scroll.

- [x] **Step 8: Commit**

```bash
git add web/components/UsageCard.tsx web/components/UsageList.tsx web/app/usages/page.tsx "web/app/lexicon/[id]/usages/page.tsx" "web/app/lexicon/[id]/page.tsx" web/app/lexicon/page.tsx
git commit -m "feat(usages): usage cards, word usages page, free-text search and lexicon links"
```

---

### Task 5: Full verification

- [x] **Step 1:** `cd web && npm test && npm run test:rls && npx tsc --noEmit && npm run lint && npm run build`
Expected: everything green. Fix root causes; do not weaken tests.

- [x] **Step 2:** Confirm no production changes were made (this plan applies migrations locally only). Tell the user that `20261003000000_word_usages.sql` and `20261003000001_find_usages.sql` must still be applied to production through the Supabase MCP, in that order, before the web deploy. Note that production's `pg_trgm` is in `public` (the migrations resolve it through the search path) and that the first migration installs `fuzzystrmatch`.

- [x] **Step 3:** Use superpowers:finishing-a-development-branch.
