# Lexicon From Word Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While linking the words of a resource verse, a contributor finds a lexicon entry (even under another spelling) or creates one with all its lexical fields; readers see the dictionary part in the word detail; grammatical markers become lexicon entries whose meaning anyone can complete.

**Architecture:** Extend the existing `lexicon` table (`entry_kind`, marker columns, insert guard) and add `lexicon_spellings`. `resource_word_blocks` gets `lexicon_id` / `translation_id`; `resource_word_markers` is dropped. Four SECURITY DEFINER functions write/search the lexicon (`create_lexicon_entry`, `add_lexicon_spelling`, `set_marker_meaning`, `find_lexicon_candidates`) plus a read wrapper `get_lexicon_entry`; `save_resource_verse` / `get_resource_words` carry the links. The editor gets a lexicon panel in `BlockPanel`; the reader's word detail gets a dictionary part.

**Tech Stack:** Next.js 16.2 / React 19, Supabase (Postgres, RLS, plpgsql), Vitest (unit + RLS suites), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-04-lexicon-from-word-links-design.md` (read it first; it is the source of truth for behaviour). Earlier work this extends: `docs/superpowers/specs/2026-10-04-resource-word-links-design.md`, `docs/superpowers/plans/2026-10-04-resource-word-links.md`.

## Global Constraints

- **No branch, no worktree** (project policy since 2026-10-04): work on `master` in `C:\Users\DELL LATITUDE 7480\traduction bété`. Run `git branch --show-current` (must print `master`) and `git status` before every commit; stage explicit paths only (never `git add -A`); never push.
- One migration file: `supabase/migrations/20261008000000_lexicon_from_word_links.sql`, re-runnable (`create or replace`, `if not exists`, `drop policy if exists` before each `create policy`, `drop trigger if exists` before each `create trigger`). Every new function: `security definer`, `set search_path = public` (add `extensions` when it uses `levenshtein`/`unaccent`), `revoke execute … from public, anon` then explicit `grant`.
- Column naming is inverted in `lexicon`: `bete_phonetic` = western Latin spelling (everyday form), `bete_word` = IPA/Bible form (equal to the Latin spelling when no IPA is known).
- SQL string literals that must contain tab / NBSP use `E' \t\u00a0'`, never raw invisible characters. TypeScript regexes use `\u00a0` escapes, never a literal NBSP.
- Words are split on runs of space, tab, U+00A0 (`splitWords`); verse *n* = *n*-th non-empty line. Unchanged.
- Safari 16.1 floor: no `color-mix`, no `:has()`; use existing Tailwind tokens only.
- All user-visible text is French. Database errors are plain codes (`raise exception 'code'`) mapped to French in the data layer.
- Embeddings: entries created here have none (`embedding is null`); the semantic translator must keep ignoring them.
- Never run the migration against production. The production rollout is a hand step by the user (Task 8 ends there).
- Local checks: apply SQL with `docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261008000000_lexicon_from_word_links.sql`, then `docker exec supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -c "notify pgrst, 'reload schema'"` and wait ~10 s. RLS tests: from `web/`, `npm run test:rls -- <filter>` (if it fails with a project-id / container-name error, export `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` from the running local stack — `API_URL` is `http://127.0.0.1:<kong port from docker ps>` — and run `npx vitest run --config vitest.rls.config.ts <filter>`). The local signup limit is 30 per 5 minutes: run RLS files one at a time. Unit tests: `npx vitest run <filter>`; types: `npx tsc --noEmit`.

## Review Focus

1. **Spelling lookups with odd input** — `find_lexicon_candidates` with `'  '`, one letter, 100+ characters, quotes/percent/underscore, NBSP, uppercase accented text: must return rows or nothing, never an error (Task 2 tests).
2. **Two contributors create the same word at once / same word twice** — second call returns the existing entry with `existed: true`, never a unique-violation error (Task 2 test).
3. **A block whose entry or sense was deleted** — reader and editor treat it as unlinked; marker block shows "sens à préciser" (Task 3 test, Task 7 test).
4. **A word whose spelling exists as a marker (or the reverse)** — surfaced in `otherKind`, never silently linked or duplicated (Task 4 test, Task 6 UI).
5. **Stale / forged payloads** — `save_resource_verse` with a sense of another entry, a word block on a marker entry, a marker block with no entry, a malformed uuid (Task 3 tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261008000000_lexicon_from_word_links.sql` (create) | Schema, guards, functions, replaced `save_resource_verse` / `get_resource_words` / `search_lexicon` / `correction_column` |
| `web/lib/word-blocks.ts` (modify) | Add `LexSense`, `LexSummary`; `lex` on `WordBlock` / `ReaderToken`; `BlockInput` carries `lexicon_id` / `translation_id` |
| `web/lib/lexicon-links.ts` (create) | Pure helpers: `stripArticle`, `senseSeed`, `groupCandidates`, entry-form validation, dialect default, categories |
| `web/lib/lexicon-links-data.ts` (create) | RPC wrappers + French error messages; parsing of summaries |
| `web/lib/word-blocks-data.ts` (modify) | Parse `lex`; new save error messages |
| `web/lib/word-link-editor.ts` (modify) | Link lives in `BlockMeta`; remove the resource-level marker map |
| `web/components/word-link/LexiconPanel.tsx` (create) | Candidates, link/create actions, linked state, marker meaning fields |
| `web/components/word-link/EntryForm.tsx` (create) | Full entry form |
| `web/components/word-link/BlockPanel.tsx`, `WordLinkEditor.tsx` (modify) | Wire the panel; entry cache; save gating |
| `web/components/VerseWords.tsx` (modify) | Dictionary part, "sens à préciser" inline form |
| `web/app/resources/[id]/relier/page.tsx` (modify) | Pass the French line and region to the editor |
| `web/lib/corrections.ts` (modify) | Four new `word.*` fields |
| `web/app/lexicon/page.tsx`, `web/app/sitemap.ts`, `web/components/PendingContributions.tsx`, `web/app/lexicon/[id]/page.tsx`, `web/components/LexiconEntry.tsx` (modify) | Reader audits |
| `web/__tests__/rls/lexicon-from-word-links.test.ts` (create), `resource-word-links.test.ts`, `resource-word-links-pilot.test.ts`, `web/__tests__/corrections.test.ts` (modify) | Tests |

Task order matters: 1 → 2 → 3 (SQL, each re-applies the whole migration file), then 4 → 5 → 6 → 7 (web), then 8.

---

### Task 1: Schema, insert guard, spellings table, block link columns

**Files:**
- Create: `supabase/migrations/20261008000000_lexicon_from_word_links.sql`
- Create: `web/__tests__/rls/lexicon-from-word-links.test.ts`

**Interfaces:**
- Produces: columns `lexicon.entry_kind/marker_type/marker_meaning/marker_french`; table `lexicon_spellings`; columns `resource_word_blocks.lexicon_id/translation_id`. Later tasks append to the same SQL file (the file header comment is written here; each later task says "append").

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/rls/lexicon-from-word-links.test.ts`:

```ts
// web/__tests__/rls/lexicon-from-word-links.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, uid, type TestUser } from './helpers'

const rpc = (user: TestUser | null, fn: string, args: Record<string, unknown>) =>
  (user ? user.client : anonClient()).rpc(fn, args)

const entryArgs = (over: Record<string, unknown> = {}) => ({
  p_spelling: `ghèhi-${uid()}`, p_ipa: null, p_dialect: 'western', p_kind: 'word', p_pos: null,
  p_description: null, p_notes: null, p_synonyms: null, p_lemma: null,
  p_senses: [{ french: 'ciel', context: null }], p_example: null, ...over,
})

describe('lexicon insert guard and spellings table', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('lx-alice'), createUser('lx-bob')])
  })

  it('forces author, validation, votes, source and embedding on a client insert', async () => {
    const word = `ipa-${uid()}`
    const res = await alice.client
      .from('lexicon')
      .insert({
        bete_word: word, bete_phonetic: `lat-${uid()}`, french_candidates: [], top_french: 'manger', probability: 1,
        validated: true, upvotes: 50, source: 'seed', created_by: bob.id, entry_kind: 'marker', marker_meaning: 'faux',
      })
      .select('id')
      .single()
    expect(res.error).toBeNull()
    const row = must(await admin.from('lexicon').select('*').eq('id', res.data!.id).single(), 'row')
    expect(row).toMatchObject({
      created_by: alice.id, validated: false, upvotes: 0, source: 'contributed', embedding: null,
      entry_kind: 'word', marker_meaning: null,
    })
  })

  it('lets the service role write anything (seed scripts, security-definer functions)', async () => {
    const row = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${uid()}`, bete_phonetic: `lat-${uid()}`, french_candidates: [], top_french: 'x', probability: 1,
          validated: true, source: 'seed',
        })
        .select('validated, source')
        .single(),
      'seed',
    )
    expect(row).toEqual({ validated: true, source: 'seed' })
  })

  it('does not let a client change the kind or the marker fields by a direct update', async () => {
    const id = must(
      await admin
        .from('lexicon')
        .insert({ bete_word: `m-${uid()}`, bete_phonetic: `m-${uid()}`, french_candidates: [], top_french: '', probability: 0, entry_kind: 'marker' })
        .select('id')
        .single(),
      'marker',
    ).id as string
    await alice.client.from('lexicon').update({ entry_kind: 'word', marker_meaning: 'futur', marker_type: 'temps' }).eq('id', id)
    const row = must(await admin.from('lexicon').select('entry_kind, marker_meaning, marker_type').eq('id', id).single(), 'row')
    expect(row).toEqual({ entry_kind: 'marker', marker_meaning: null, marker_type: null })
  })

  it('stores spellings with a normalised form, once per entry, and lets only the service role insert', async () => {
    const id = must(
      await admin
        .from('lexicon')
        .insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'ciel', probability: 1 })
        .select('id')
        .single(),
      'word',
    ).id as string
    expect((await alice.client.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'x' })).error).not.toBeNull()
    expect((await anonClient().from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'x' })).error).not.toBeNull()
    expect((await admin.from('lexicon_spellings').insert({ lexicon_id: id, spelling: ' Ghéhi-Wu ' })).error).toBeNull()
    const rows = must(await admin.from('lexicon_spellings').select('spelling, spelling_norm').eq('lexicon_id', id), 'rows')
    expect(rows).toEqual([{ spelling: 'Ghéhi-Wu', spelling_norm: 'ghehiwu' }])
    expect((await admin.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'ghéhi-wu' })).error).not.toBeNull()
    expect((await anonClient().from('lexicon_spellings').select('id').eq('lexicon_id', id)).data).toHaveLength(1)
  })

  it('lets only the author or an admin delete a spelling', async () => {
    const id = must(
      await admin
        .from('lexicon')
        .insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'ciel', probability: 1 })
        .select('id')
        .single(),
      'word',
    ).id as string
    const sp = must(
      await admin.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'abc', created_by: alice.id }).select('id').single(),
      'sp',
    ).id as string
    await bob.client.from('lexicon_spellings').delete().eq('id', sp)
    expect(must(await admin.from('lexicon_spellings').select('id').eq('id', sp), 'still')).toHaveLength(1)
    await alice.client.from('lexicon_spellings').delete().eq('id', sp)
    expect(must(await admin.from('lexicon_spellings').select('id').eq('id', sp), 'gone')).toHaveLength(0)
    void makeAdmin
  })

  it('adds the link columns to the blocks and unlinks them when the entry is deleted', async () => {
    const text = must(
      await admin.from('community_texts').insert({ title: 'T', type: 'song', content_bete: 'a b', content_literal: 'x y', created_by: alice.id }).select('id').single(),
      'text',
    ).id as string
    const lex = must(
      await admin.from('lexicon').insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'ciel', probability: 1 }).select('id').single(),
      'lex',
    ).id as string
    const tr = must(await admin.from('lexicon_translations').select('id').eq('lexicon_id', lex).single(), 'tr').id as string
    const hash = must(await admin.rpc('verse_hash', { p_bete: 'a b', p_literal: 'x y', p_n: 1 }), 'hash') as unknown as string
    must(
      await admin.from('resource_word_blocks').insert({ resource_id: text, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash, lexicon_id: lex, translation_id: tr }).select('id').single(),
      'block',
    )
    await admin.from('lexicon').delete().eq('id', lex)
    const b = must(await admin.from('resource_word_blocks').select('lexicon_id, translation_id').eq('resource_id', text).single(), 'after')
    expect(b).toEqual({ lexicon_id: null, translation_id: null })
  })
})

export { rpc, entryArgs }
```

(The `export` at the end lets Task 2 extend the same file; `makeAdmin` is imported for Task 2.)

- [ ] **Step 2: Run to verify it fails**

Run (from `web/`): `npm run test:rls -- lexicon-from-word-links`
Expected: FAIL (`entry_kind` column does not exist / `lexicon_spellings` does not exist).

- [ ] **Step 3: Write the migration (part 1)**

Create `supabase/migrations/20261008000000_lexicon_from_word_links.sql`:

```sql
-- supabase/migrations/20261008000000_lexicon_from_word_links.sql
-- The lexicon grows from the texts people link: entries (words and grammatical markers), extra spellings,
-- and the link from a word block to the entry and sense it uses. Drops the per-resource marker table
-- (0 rows in production): a marker's meaning now lives on its lexicon entry.
-- Spec: docs/superpowers/specs/2026-10-04-lexicon-from-word-links-design.md
-- Re-runnable. Apply by hand in production (it replaces functions and drops resource_word_markers).

create extension if not exists fuzzystrmatch with schema extensions;
create extension if not exists pg_trgm with schema extensions;
set local search_path = public, extensions;

-- ── 1. lexicon: entry kind, marker fields, insert guard ─────────────────────────────────────────
alter table lexicon add column if not exists entry_kind text not null default 'word'
  check (entry_kind in ('word', 'marker'));
alter table lexicon add column if not exists marker_type    text check (marker_type    is null or char_length(marker_type)    <= 100);
alter table lexicon add column if not exists marker_meaning text check (marker_meaning is null or char_length(marker_meaning) <= 300);
alter table lexicon add column if not exists marker_french  text check (marker_french  is null or char_length(marker_french)  <= 300);

-- The policy "lexicon insert own" is `with check (true)`: without this guard a client could insert a
-- validated row under any author. Service-role and security-definer writes (current_user <> 'authenticated') pass.
create or replace function lexicon_guard_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.created_by     := auth.uid();
    new.validated      := false;
    new.upvotes        := 0;
    new.source         := 'contributed';
    new.embedding      := null;
    new.created_at     := now();
    new.entry_kind     := 'word';
    new.marker_type    := null;
    new.marker_meaning := null;
    new.marker_french  := null;
  end if;
  return new;
end;
$$;

drop trigger if exists lexicon_guard_insert on lexicon;
create trigger lexicon_guard_insert
  before insert on lexicon
  for each row execute function lexicon_guard_insert();

-- ── 2. lexicon_spellings ────────────────────────────────────────────────────────────────────────
create table if not exists lexicon_spellings (
  id            uuid primary key default gen_random_uuid(),
  lexicon_id    uuid not null references lexicon(id) on delete cascade,
  spelling      text not null check (char_length(btrim(spelling)) between 1 and 100),
  spelling_norm text not null default '',
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index if not exists lexicon_spellings_unique_idx on lexicon_spellings (lexicon_id, lower(spelling));
create index if not exists lexicon_spellings_norm_idx on lexicon_spellings using gin (spelling_norm gin_trgm_ops);

create or replace function lexicon_spellings_guard()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  new.spelling      := btrim(new.spelling);
  new.spelling_norm := usage_token_norm(new.spelling);
  if current_user = 'authenticated' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lexicon_spellings_guard on lexicon_spellings;
create trigger lexicon_spellings_guard
  before insert or update on lexicon_spellings
  for each row execute function lexicon_spellings_guard();

alter table lexicon_spellings enable row level security;
drop policy if exists lexicon_spellings_select on lexicon_spellings;
create policy lexicon_spellings_select on lexicon_spellings for select using (true);
drop policy if exists lexicon_spellings_delete on lexicon_spellings;
create policy lexicon_spellings_delete on lexicon_spellings for delete to authenticated
  using (created_by = (select auth.uid()) or (select is_admin()));
-- No insert policy: spellings are added through add_lexicon_spelling.

-- ── 3. resource_word_blocks: the link ───────────────────────────────────────────────────────────
alter table resource_word_blocks add column if not exists lexicon_id uuid references lexicon(id) on delete set null;
alter table resource_word_blocks add column if not exists translation_id uuid references lexicon_translations(id) on delete set null;
create index if not exists resource_word_blocks_lexicon_idx on resource_word_blocks (lexicon_id) where lexicon_id is not null;
```

- [ ] **Step 4: Apply and run the tests**

Run the apply command from Global Constraints, then `npm run test:rls -- lexicon-from-word-links` (from `web/`).
Expected: PASS (5 tests). If `usage_token_norm('Ghéhi-Wu')` gives something other than `ghehiwu`, fix the expectation to what the function returns for that input only if it is the accent/hyphen-folded form; do not change the SQL.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add supabase/migrations/20261008000000_lexicon_from_word_links.sql web/__tests__/rls/lexicon-from-word-links.test.ts
git commit -m "feat(lexicon): entry kinds, insert guard, spellings table and block link columns" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Entry functions: summary, create, add spelling, set marker meaning, find candidates

**Files:**
- Modify (append): `supabase/migrations/20261008000000_lexicon_from_word_links.sql`
- Modify: `web/__tests__/rls/lexicon-from-word-links.test.ts`

**Interfaces:**
- Produces (SQL, all `rpc` names/params exact):
  - `lexicon_summary(p_id uuid, p_sense uuid default null) returns jsonb` — internal (not client callable). Shape: `{id, kind, spelling, ipa, dialect, pos: string[], description, synonyms: string[], marker: {type, meaning, french}, senses: [{id, french, context}], sense_id, spellings: string[]}`; `null` when the entry does not exist.
  - `get_lexicon_entry(p_id uuid) returns jsonb` — anon + authenticated; = `lexicon_summary(p_id)`.
  - `create_lexicon_entry(p_spelling, p_ipa, p_dialect, p_kind, p_pos text[], p_description, p_notes, p_synonyms text[], p_lemma, p_senses jsonb, p_example jsonb) returns jsonb` = `{id, existed, sense_ids: uuid[], entry}`; authenticated only. Error codes: `not_signed_in`, `bad_spelling`, `bad_dialect`, `bad_kind`, `sense_required`, `too_long`.
  - `add_lexicon_spelling(p_lexicon_id uuid, p_spelling text) returns uuid`; codes `not_signed_in`, `bad_spelling`, `entry_not_found`, `spelling_exists`.
  - `set_marker_meaning(p_lexicon_id uuid, p_type text, p_meaning text, p_french text) returns void`; codes `not_signed_in`, `entry_not_found`, `not_a_marker`, `meaning_already_set`, `too_long`.
  - `find_lexicon_candidates(p_text text, p_dialect text default null, p_kind text default null, p_limit int default 6) returns table (match_kind text, matched text, distance int, entry jsonb)`; anon + authenticated; `match_kind` is `'exact' | 'norm' | 'near'`.

- [ ] **Step 1: Write the failing tests**

Append to `web/__tests__/rls/lexicon-from-word-links.test.ts` (before the final `export` line; add `describe` blocks):

```ts
describe('create_lexicon_entry', () => {
  let alice: TestUser
  beforeAll(async () => {
    alice = await createUser('cle-alice')
  })

  it('creates a word with its senses, spellings fields and example, authored by the caller', async () => {
    const args = entryArgs({
      p_ipa: `ɡɛ̀hi-${uid()}`, p_pos: ['noun'], p_description: 'Le ciel.', p_synonyms: ['firmament'],
      p_senses: [{ french: 'ciel', context: 'en haut' }, { french: 'haut', context: null }],
      p_example: { bete: 'a b', french: 'x y', literal: 'x y' },
    })
    const res = await rpc(alice, 'create_lexicon_entry', args)
    expect(res.error).toBeNull()
    expect(res.data.existed).toBe(false)
    expect(res.data.sense_ids).toHaveLength(2)
    const row = must(await admin.from('lexicon').select('*').eq('id', res.data.id).single(), 'row')
    expect(row).toMatchObject({
      created_by: alice.id, validated: false, source: 'contributed', entry_kind: 'word', top_french: 'ciel',
      bete_phonetic: args.p_spelling, bete_word: args.p_ipa, pos: ['noun'], description: 'Le ciel.', embedding: null,
    })
    const senses = must(await admin.from('lexicon_translations').select('french, context, position').eq('lexicon_id', res.data.id).order('position'), 's')
    expect(senses.map(s => [s.french, s.context])).toEqual([['ciel', 'en haut'], ['haut', null]])
    expect(must(await admin.from('lexicon_examples').select('bete_snippet, created_by').eq('lexicon_id', res.data.id), 'ex')).toEqual([
      { bete_snippet: 'a b', created_by: alice.id },
    ])
    expect(res.data.entry).toMatchObject({ id: res.data.id, kind: 'word', spelling: args.p_spelling, ipa: args.p_ipa, pos: ['noun'] })
    expect(res.data.entry.senses.map((s: { french: string }) => s.french)).toEqual(['ciel', 'haut'])
  })

  it('uses the spelling as the IPA field when none is given, and reports no IPA', async () => {
    const args = entryArgs()
    const res = await rpc(alice, 'create_lexicon_entry', args)
    const row = must(await admin.from('lexicon').select('bete_word, bete_phonetic').eq('id', res.data.id).single(), 'row')
    expect(row.bete_word).toBe(args.p_spelling)
    expect(res.data.entry.ipa).toBeNull()
  })

  it('returns the existing entry instead of a duplicate, also for a concurrent pair', async () => {
    const args = entryArgs()
    const [a, b] = await Promise.all([rpc(alice, 'create_lexicon_entry', args), rpc(alice, 'create_lexicon_entry', args)])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data.id).toBe(b.data.id)
    expect([a.data.existed, b.data.existed].sort()).toEqual([false, true])
    const again = await rpc(alice, 'create_lexicon_entry', args)
    expect(again.data).toMatchObject({ id: a.data.id, existed: true })
  })

  it('creates a marker with no sense, no French and an empty meaning', async () => {
    const res = await rpc(alice, 'create_lexicon_entry', entryArgs({ p_kind: 'marker', p_senses: [] }))
    expect(res.error).toBeNull()
    const row = must(await admin.from('lexicon').select('*').eq('id', res.data.id).single(), 'row')
    expect(row).toMatchObject({ entry_kind: 'marker', top_french: '', marker_meaning: null, pos: null, probability: 0 })
    expect(must(await admin.from('lexicon_translations').select('id').eq('lexicon_id', res.data.id), 't')).toHaveLength(0)
  })

  it.each([
    ['sense_required', { p_senses: [] }],
    ['sense_required', { p_senses: [{ french: '  ', context: null }] }],
    ['bad_spelling', { p_spelling: '   ' }],
    ['bad_spelling', { p_spelling: 'x'.repeat(101) }],
    ['bad_dialect', { p_dialect: 'martian' }],
    ['bad_kind', { p_kind: 'verb' }],
  ])('refuses with %s', async (code, over) => {
    const res = await rpc(alice, 'create_lexicon_entry', entryArgs(over))
    expect(res.error?.message).toContain(code)
  })

  it('is not callable by anonymous clients', async () => {
    expect((await rpc(null, 'create_lexicon_entry', entryArgs())).error?.code).toBe('42501')
  })
})

describe('add_lexicon_spelling and set_marker_meaning', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser
  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([createUser('sp-alice'), createUser('sp-bob'), createUser('sp-boss')])
    await makeAdmin(boss.id)
  })

  const word = async () => (await rpc(alice, 'create_lexicon_entry', entryArgs())).data as { id: string; entry: { spelling: string } }
  const marker = async () => (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_kind: 'marker', p_senses: [] }))).data.id as string

  it('adds a spelling, trimmed, and refuses empty, own-form and repeated spellings', async () => {
    const w = await word()
    const ok = await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: '  ghéhi-wu ' })
    expect(ok.error).toBeNull()
    const row = must(await admin.from('lexicon_spellings').select('spelling, created_by').eq('id', ok.data).single(), 'row')
    expect(row).toEqual({ spelling: 'ghéhi-wu', created_by: bob.id })
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: 'GHÉHI-WU' })).error?.message).toContain('spelling_exists')
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: w.entry.spelling.toUpperCase() })).error?.message).toContain('spelling_exists')
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: ' ' })).error?.message).toContain('bad_spelling')
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: '00000000-0000-0000-0000-000000000000', p_spelling: 'zz' })).error?.message).toContain('entry_not_found')
    expect((await rpc(null, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: 'zz' })).error?.code).toBe('42501')
  })

  it('lets anyone set a marker meaning while it is empty, then only the author or an admin', async () => {
    const id = await marker()
    expect((await rpc(bob, 'set_marker_meaning', { p_lexicon_id: id, p_type: ' temps ', p_meaning: 'futur', p_french: 'aller + verbe' })).error).toBeNull()
    const row = must(await admin.from('lexicon').select('marker_type, marker_meaning, marker_french').eq('id', id).single(), 'row')
    expect(row).toEqual({ marker_type: 'temps', marker_meaning: 'futur', marker_french: 'aller + verbe' })
    expect((await rpc(bob, 'set_marker_meaning', { p_lexicon_id: id, p_type: 'x', p_meaning: 'y', p_french: '' })).error?.message).toContain('meaning_already_set')
    expect((await rpc(alice, 'set_marker_meaning', { p_lexicon_id: id, p_type: 'temps', p_meaning: 'futur proche', p_french: '' })).error).toBeNull()
    expect((await rpc(boss, 'set_marker_meaning', { p_lexicon_id: id, p_type: 'temps', p_meaning: 'futur', p_french: '' })).error).toBeNull()
    expect((await rpc(null, 'set_marker_meaning', { p_lexicon_id: id, p_type: '', p_meaning: 'a', p_french: '' })).error?.code).toBe('42501')
  })

  it('refuses a word entry and too-long text', async () => {
    const w = await word()
    expect((await rpc(alice, 'set_marker_meaning', { p_lexicon_id: w.id, p_type: '', p_meaning: 'a', p_french: '' })).error?.message).toContain('not_a_marker')
    const id = await marker()
    expect((await rpc(alice, 'set_marker_meaning', { p_lexicon_id: id, p_type: '', p_meaning: 'x'.repeat(301), p_french: '' })).error?.message).toContain('too_long')
  })

  it('keeps the entry empty when the first fill is blank', async () => {
    const id = await marker()
    expect((await rpc(bob, 'set_marker_meaning', { p_lexicon_id: id, p_type: '', p_meaning: '  ', p_french: '' })).error).toBeNull()
    expect(must(await admin.from('lexicon').select('marker_meaning').eq('id', id).single(), 'row').marker_meaning).toBeNull()
  })
})

describe('find_lexicon_candidates and get_lexicon_entry', () => {
  let alice: TestUser
  const tag = uid()
  let westId: string
  let eastId: string
  let markerId: string

  beforeAll(async () => {
    alice = await createUser('fc-alice')
    westId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `ghèhiwu${tag}`, p_dialect: 'western' }))).data.id
    eastId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `ghèhiwu${tag}`, p_ipa: `ɡɛ̀hiwu${tag}`, p_dialect: 'eastern' }))).data.id
    markerId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `ye${tag}`, p_kind: 'marker', p_senses: [] }))).data.id
    await rpc(alice, 'add_lexicon_spelling', { p_lexicon_id: westId, p_spelling: `rhéhiwu${tag}` })
  })

  const find = async (text: string, extra: Record<string, unknown> = {}) => {
    const res = await rpc(null, 'find_lexicon_candidates', { p_text: text, ...extra })
    expect(res.error).toBeNull()
    return res.data as { match_kind: string; matched: string; distance: number; entry: { id: string; kind: string; spellings: string[] } }[]
  }

  it('finds an exact spelling, ignoring case, in both dialects with the asked dialect first', async () => {
    const rows = await find(`GHÈHIWU${tag}`, { p_dialect: 'eastern' })
    expect(rows.map(r => [r.entry.id, r.match_kind])).toEqual([[eastId, 'exact'], [westId, 'exact']])
    expect((await find(`ghèhiwu${tag}`, { p_dialect: 'western' })).map(r => r.entry.id)).toEqual([westId, eastId])
  })

  it('finds a spelling without accents or tones as a normalised match', async () => {
    const rows = await find(`ghehiwu${tag}`)
    expect(rows.map(r => r.match_kind)).toEqual(['norm', 'norm'])
  })

  it('finds an extra spelling and a near spelling (distance 1 from 3 characters)', async () => {
    const extra = await find(`rhéhiwu${tag}`)
    expect(extra.find(r => r.entry.id === westId)).toMatchObject({ match_kind: 'exact', matched: `rhéhiwu${tag}` })
    const near = await find(`ghèhiwo${tag}`)
    expect(near.find(r => r.entry.id === westId)).toMatchObject({ match_kind: 'near', distance: 1 })
  })

  it('does not match short words by distance and tolerates odd input', async () => {
    expect(await find('zz')).toEqual([])
    for (const odd of ['', '   ', 'a', "%_'\"\\", 'x'.repeat(100), '\u00a0\u00a0', 'ÀÉÎÕÜ']) {
      const res = await rpc(null, 'find_lexicon_candidates', { p_text: odd })
      expect(res.error).toBeNull()
    }
  })

  it('filters by kind and returns both kinds without a filter', async () => {
    expect((await find(`ye${tag}`)).map(r => r.entry.kind)).toEqual(['marker'])
    expect(await find(`ye${tag}`, { p_kind: 'word' })).toEqual([])
    expect((await find(`ye${tag}`, { p_kind: 'marker' }))[0].entry.id).toBe(markerId)
  })

  it('caps the list', async () => {
    expect((await find(`ghèhiwu${tag}`, { p_limit: 1 })).length).toBe(1)
  })

  it('returns the summary through get_lexicon_entry for anyone, null when missing', async () => {
    const res = await rpc(null, 'get_lexicon_entry', { p_id: westId })
    expect(res.data).toMatchObject({ id: westId, kind: 'word', spellings: [`rhéhiwu${tag}`] })
    expect((await rpc(null, 'get_lexicon_entry', { p_id: '00000000-0000-0000-0000-000000000000' })).data).toBeNull()
    expect((await rpc(null, 'lexicon_summary', { p_id: westId })).error?.code).toBe('42501')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:rls -- lexicon-from-word-links` — Expected: FAIL (`create_lexicon_entry` does not exist).

- [ ] **Step 3: Append the functions to the migration**

Append to `supabase/migrations/20261008000000_lexicon_from_word_links.sql`:

```sql
-- ── 4. entry summary (internal) and its public wrapper ──────────────────────────────────────────
-- One shape for candidates, created entries and the reader: see the spec, section "Functions".
create or replace function lexicon_summary(p_id uuid, p_sense uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id,
    'kind', l.entry_kind,
    'spelling', coalesce(nullif(l.bete_phonetic, ''), l.bete_word),
    'ipa', case when l.bete_word is distinct from l.bete_phonetic and l.bete_word not like '\_pending\_%' then l.bete_word end,
    'dialect', l.dialect,
    'pos', coalesce(to_jsonb(l.pos), '[]'::jsonb),
    'description', l.description,
    'synonyms', coalesce(to_jsonb(l.french_synonyms), '[]'::jsonb),
    'marker', jsonb_build_object('type', l.marker_type, 'meaning', l.marker_meaning, 'french', l.marker_french),
    'senses', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'french', t.french, 'context', t.context)
                                          order by t.position, t.created_at), '[]'::jsonb)
               from lexicon_translations t where t.lexicon_id = l.id),
    'sense_id', (select t.id from lexicon_translations t where t.id = p_sense and t.lexicon_id = l.id),
    'spellings', (select coalesce(jsonb_agg(s.spelling order by s.created_at), '[]'::jsonb)
                  from lexicon_spellings s where s.lexicon_id = l.id)
  )
  from lexicon l
  where l.id = p_id
$$;
revoke execute on function lexicon_summary(uuid, uuid) from public, anon, authenticated;

create or replace function get_lexicon_entry(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select lexicon_summary(p_id)
$$;
revoke execute on function get_lexicon_entry(uuid) from public;
grant execute on function get_lexicon_entry(uuid) to anon, authenticated;

-- ── 5. create_lexicon_entry ─────────────────────────────────────────────────────────────────────
create or replace function create_lexicon_entry(
  p_spelling    text,
  p_ipa         text,
  p_dialect     text,
  p_kind        text,
  p_pos         text[],
  p_description text,
  p_notes       text,
  p_synonyms    text[],
  p_lemma       text,
  p_senses      jsonb,
  p_example     jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_sp      text := btrim(coalesce(p_spelling, ''));
  v_ipa     text := nullif(btrim(coalesce(p_ipa, '')), '');
  v_word    text;
  v_dialect text := coalesce(nullif(btrim(coalesce(p_dialect, '')), ''), 'western');
  v_kind    text := coalesce(p_kind, 'word');
  v_senses  jsonb;
  v_first   text;
  v_id      uuid;
  v_existed boolean := false;
  s         jsonb;
  v_i       int := 0;
  v_ids     uuid[];
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_sp = '' or char_length(v_sp) > 100 or (v_ipa is not null and char_length(v_ipa) > 100) then
    raise exception 'bad_spelling';
  end if;
  if v_dialect not in ('western', 'northern', 'eastern') then
    raise exception 'bad_dialect';
  end if;
  if v_kind not in ('word', 'marker') then
    raise exception 'bad_kind';
  end if;
  if char_length(coalesce(p_description, '')) > 2000 or char_length(coalesce(p_notes, '')) > 2000
     or char_length(coalesce(p_lemma, '')) > 200 then
    raise exception 'too_long';
  end if;

  -- Senses with a blank French word are ignored; a marker carries none.
  v_senses := coalesce((
    select jsonb_agg(e) from jsonb_array_elements(
      case when jsonb_typeof(p_senses) = 'array' then p_senses else '[]'::jsonb end) e
    where nullif(btrim(e ->> 'french'), '') is not null
  ), '[]'::jsonb);
  if v_kind = 'word' and jsonb_array_length(v_senses) = 0 then
    raise exception 'sense_required';
  end if;
  v_first := case when v_kind = 'word' then btrim(v_senses -> 0 ->> 'french') else '' end;
  v_word := coalesce(v_ipa, v_sp);

  insert into lexicon (bete_word, bete_phonetic, french_candidates, top_french, probability, pos, notes,
                       dialect, description, french_synonyms, lemma, entry_kind, created_by, source)
  values (v_word, v_sp, '[]'::jsonb, v_first, case when v_kind = 'word' then 1 else 0 end,
          case when v_kind = 'word' then p_pos end, nullif(btrim(coalesce(p_notes, '')), ''),
          v_dialect, nullif(btrim(coalesce(p_description, '')), ''), p_synonyms, nullif(btrim(coalesce(p_lemma, '')), ''),
          v_kind, v_uid, 'contributed')
  on conflict (bete_word, dialect) do nothing
  returning id into v_id;

  if v_id is null then
    -- Someone (maybe a concurrent call) created it first: hand the existing entry back.
    select l.id into v_id from lexicon l where l.bete_word = v_word and l.dialect = v_dialect;
    v_existed := true;
  elsif v_kind = 'word' then
    -- The after-insert trigger seeded the first sense from top_french: give it its context, add the others.
    update lexicon_translations
       set context = nullif(btrim(coalesce(v_senses -> 0 ->> 'context', '')), '')
     where lexicon_id = v_id and position = 0;
    for s in select e from jsonb_array_elements(v_senses) e offset 1 loop
      v_i := v_i + 1;
      insert into lexicon_translations (lexicon_id, french, context, position, created_by, author_name)
      values (v_id, btrim(s ->> 'french'), nullif(btrim(coalesce(s ->> 'context', '')), ''), v_i, v_uid,
              coalesce((select name from profiles where id = v_uid), ''))
      on conflict do nothing;
    end loop;
  end if;

  if not v_existed and p_example is not null and jsonb_typeof(p_example) = 'object'
     and nullif(btrim(p_example ->> 'bete'), '') is not null and nullif(btrim(p_example ->> 'french'), '') is not null then
    insert into lexicon_examples (lexicon_id, bete_snippet, french_snippet, french_literal, dialect, created_by)
    values (v_id, btrim(p_example ->> 'bete'), btrim(p_example ->> 'french'),
            nullif(btrim(coalesce(p_example ->> 'literal', '')), ''), v_dialect, v_uid);
  end if;

  select coalesce(array_agg(t.id order by t.position, t.created_at), '{}') into v_ids
  from lexicon_translations t where t.lexicon_id = v_id;

  return jsonb_build_object('id', v_id, 'existed', v_existed, 'sense_ids', to_jsonb(v_ids), 'entry', lexicon_summary(v_id));
end;
$$;
revoke execute on function create_lexicon_entry(text, text, text, text, text[], text, text, text[], text, jsonb, jsonb) from public, anon;
grant execute on function create_lexicon_entry(text, text, text, text, text[], text, text, text[], text, jsonb, jsonb) to authenticated;

-- ── 6. add_lexicon_spelling ─────────────────────────────────────────────────────────────────────
create or replace function add_lexicon_spelling(p_lexicon_id uuid, p_spelling text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sp  text := btrim(coalesce(p_spelling, ''));
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if v_sp = '' or char_length(v_sp) > 100 then
    raise exception 'bad_spelling';
  end if;
  if not exists (select 1 from lexicon where id = p_lexicon_id) then
    raise exception 'entry_not_found';
  end if;
  if exists (select 1 from lexicon l where l.id = p_lexicon_id and (lower(l.bete_phonetic) = lower(v_sp) or lower(l.bete_word) = lower(v_sp)))
     or exists (select 1 from lexicon_spellings s where s.lexicon_id = p_lexicon_id and lower(s.spelling) = lower(v_sp)) then
    raise exception 'spelling_exists';
  end if;
  insert into lexicon_spellings (lexicon_id, spelling, created_by) values (p_lexicon_id, v_sp, v_uid) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function add_lexicon_spelling(uuid, text) from public, anon;
grant execute on function add_lexicon_spelling(uuid, text) to authenticated;

-- ── 7. set_marker_meaning ───────────────────────────────────────────────────────────────────────
create or replace function set_marker_meaning(p_lexicon_id uuid, p_type text, p_meaning text, p_french text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_kind    text;
  v_current text;
  v_author  uuid;
  v_type    text := nullif(btrim(coalesce(p_type, '')), '');
  v_meaning text := nullif(btrim(coalesce(p_meaning, '')), '');
  v_french  text := nullif(btrim(coalesce(p_french, '')), '');
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if char_length(coalesce(v_type, '')) > 100 or char_length(coalesce(v_meaning, '')) > 300
     or char_length(coalesce(v_french, '')) > 300 then
    raise exception 'too_long';
  end if;
  select l.entry_kind, l.marker_meaning, l.created_by into v_kind, v_current, v_author
  from lexicon l where l.id = p_lexicon_id for update;
  if not found then
    raise exception 'entry_not_found';
  end if;
  if v_kind <> 'marker' then
    raise exception 'not_a_marker';
  end if;
  if v_current is not null and v_author is distinct from v_uid and not is_admin() then
    raise exception 'meaning_already_set';
  end if;
  update lexicon
     set marker_type = v_type, marker_meaning = v_meaning, marker_french = v_french, updated_at = now()
   where id = p_lexicon_id;
end;
$$;
revoke execute on function set_marker_meaning(uuid, text, text, text) from public, anon;
grant execute on function set_marker_meaning(uuid, text, text, text) to authenticated;

-- ── 8. find_lexicon_candidates ──────────────────────────────────────────────────────────────────
-- exact: equal ignoring case · norm: equal after usage_token_norm (accents, tones, apostrophes, hyphens)
-- · near: edit distance on the normalised forms (1 for 3 to 7 characters, 2 from 8, none up to 2).
create or replace function find_lexicon_candidates(
  p_text    text,
  p_dialect text default null,
  p_kind    text default null,
  p_limit   int  default 6
) returns table (match_kind text, matched text, distance int, entry jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_raw  text := btrim(coalesce(p_text, ''), E' \t\u00a0');
  v_norm text;
  v_len  int;
  v_max  int;
begin
  if v_raw = '' or char_length(v_raw) > 100 then
    return;
  end if;
  v_norm := usage_token_norm(v_raw);
  v_len  := char_length(v_norm);
  if v_len = 0 then
    return;
  end if;
  v_max := case when v_len <= 2 then 0 when v_len <= 7 then 1 else 2 end;

  return query
  with forms as (
    select l.id, l.bete_phonetic as f from lexicon l where l.bete_phonetic <> ''
    union all
    select l.id, l.bete_word from lexicon l where l.bete_word <> '' and l.bete_word not like '\_pending\_%'
    union all
    select s.lexicon_id, s.spelling from lexicon_spellings s
  ), normed as (
    select f.id, f.f, usage_token_norm(f.f) as n from forms f
  ), scored as (
    select nf.id, nf.f,
           case when lower(nf.f) = lower(v_raw) then 'exact'
                when nf.n = v_norm then 'norm'
                when v_max > 0 and abs(char_length(nf.n) - v_len) <= v_max and levenshtein(nf.n, v_norm) <= v_max then 'near'
           end as mk,
           case when abs(char_length(nf.n) - v_len) <= v_max then levenshtein(nf.n, v_norm) else 99 end as d
    from normed nf
  ), best as (
    select distinct on (sc.id) sc.id, sc.mk, sc.f, sc.d
    from scored sc
    where sc.mk is not null
    order by sc.id, case sc.mk when 'exact' then 0 when 'norm' then 1 else 2 end, sc.d
  )
  select b.mk, b.f, b.d, lexicon_summary(b.id)
  from best b
  join lexicon l on l.id = b.id
  where p_kind is null or l.entry_kind = p_kind
  order by (l.dialect is not distinct from p_dialect) desc,
           case b.mk when 'exact' then 0 when 'norm' then 1 else 2 end,
           b.d,
           l.created_at
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
end;
$$;
revoke execute on function find_lexicon_candidates(text, text, text, int) from public;
grant execute on function find_lexicon_candidates(text, text, text, int) to anon, authenticated;
```

- [ ] **Step 4: Apply and run**

Apply the file (Global Constraints), then `npm run test:rls -- lexicon-from-word-links`.
Expected: PASS. If the "concurrent pair" test returns an error on one call, the cause is `on conflict (bete_word, dialect)` needing a unique index/constraint on exactly those columns: check `\d lexicon` in psql; if the unique object is named differently it still works as long as the columns match.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add supabase/migrations/20261008000000_lexicon_from_word_links.sql web/__tests__/rls/lexicon-from-word-links.test.ts
git commit -m "feat(lexicon): create entry, add spelling, set marker meaning and candidate search functions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Verse functions, marker table drop, corrections allow-list, lexicon readers in SQL

**Files:**
- Modify (append): `supabase/migrations/20261008000000_lexicon_from_word_links.sql`
- Modify: `web/__tests__/rls/resource-word-links.test.ts`, `web/__tests__/rls/lexicon-from-word-links.test.ts`, `web/__tests__/corrections.test.ts`
- Modify: `web/lib/corrections.ts`

**Interfaces:**
- Consumes: `lexicon_summary(uuid, uuid)` from Task 2.
- Produces: `save_resource_verse(...)` same signature; blocks may carry `lexicon_id`, `translation_id` (uuid strings or null). New error codes: `marker_needs_entry`, `entry_not_found`, `marker_needs_marker_entry`, `word_needs_word_entry`, `sense_not_of_entry`, `sense_without_entry`, `bad_link`. `get_resource_words` blocks gain `lex` (summary with `sense_id` set to the block's sense, or `null`); `marker` stays (read from the linked entry; `null` for non-markers).
- `correction_column` gains `word.marker_type`, `word.marker_meaning`, `word.marker_french`, `word.entry_kind`.

- [ ] **Step 1: Update the existing RLS tests that use `resource_word_markers`**

In `web/__tests__/rls/resource-word-links.test.ts`:

1. Test `does not let clients write blocks or markers directly` (line ~37): replace the `resource_word_markers` insert line with a check on the new spellings table:
   `expect((await alice.client.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'a' })).error).not.toBeNull()` — this is only a stand-in line; the test title becomes `does not let clients write blocks directly`.
2. Delete the whole test `attaches the shared marker meaning to every block of that word` (line ~81) — replaced by the new tests below.
3. Delete these save tests, which describe the removed model: `stores a marker with no mot à mot counterpart and its shared meaning`, `keeps the spelling first written for a marker and takes the latest meaning`, `shares one meaning per word across verses and removes markers nothing uses any more`, `keeps the shared meaning when a marker block carries no marker object`.
4. In `deletes the blocks and markers with the resource`: rename to `deletes the blocks with the resource`, change the block list to `THREE`, and remove the final `resource_word_markers` expectation line.

Do the same for the still-present `block_word_norm` test: keep it (the helper function stays).

- [ ] **Step 2: Add the failing tests**

Append to `web/__tests__/rls/lexicon-from-word-links.test.ts` (the file already has `rpc`, `entryArgs`, `createUser` imports; add `anonClient` use as is):

```ts
const BLOCK = (bete: number[], gloss: number[], over: Record<string, unknown> = {}) => ({
  bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, ...over,
})

describe('links in save_resource_verse and get_resource_words', () => {
  let alice: TestUser
  let bob: TestUser
  let wordId: string
  let senseIds: string[]
  let otherWordId: string
  let otherSense: string
  let markerId: string

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('lk-alice'), createUser('lk-bob')])
    const w = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_senses: [{ french: 'ciel', context: null }, { french: 'haut', context: null }] }))).data
    wordId = w.id
    senseIds = w.sense_ids
    const o = (await rpc(alice, 'create_lexicon_entry', entryArgs())).data
    otherWordId = o.id
    otherSense = o.sense_ids[0]
    markerId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_kind: 'marker', p_senses: [] }))).data.id
  })

  const resource = async (bete: string, literal: string) =>
    must(
      await admin.from('community_texts').insert({ title: 'T', type: 'song', content_bete: bete, content_literal: literal, created_by: alice.id }).select('id').single(),
      'res',
    ).id as string

  const save = (id: string, blocks: unknown[], over: Record<string, unknown> = {}) =>
    alice.client.rpc('save_resource_verse', {
      p_resource: id, p_verse: 1, p_base_bete: 'a b', p_base_literal: 'x y',
      p_bete_line: null, p_literal_line: null, p_blocks: blocks, ...over,
    })

  const get = async (id: string) => (await anonClient().rpc('get_resource_words', { p_resource: id })).data

  it('saves and returns the entry and the sense of each block', async () => {
    const id = await resource('a b', 'x y')
    const res = await save(id, [BLOCK([0], [0], { lexicon_id: wordId, translation_id: senseIds[1] }), BLOCK([1], [1])])
    expect(res.error).toBeNull()
    const data = await get(id)
    expect(data[0].blocks[0].lex).toMatchObject({ id: wordId, kind: 'word', sense_id: senseIds[1] })
    expect(data[0].blocks[0].lex.senses.map((s: { french: string }) => s.french)).toEqual(['ciel', 'haut'])
    expect(data[0].blocks[1].lex).toBeNull()
    expect(data[0].blocks[0].marker).toBeNull()
  })

  it('links a marker block to a marker entry and exposes its meaning as `marker`', async () => {
    const id = await resource('a b', 'x y')
    await rpc(alice, 'set_marker_meaning', { p_lexicon_id: markerId, p_type: 'temps', p_meaning: 'futur', p_french: 'aller + verbe' })
    expect((await save(id, [BLOCK([0], [0]), BLOCK([1], [], { is_marker: true, solo: true, lexicon_id: markerId })])).error).toBeNull()
    const data = await get(id)
    expect(data[0].blocks[1]).toMatchObject({ solo: true, is_marker: true, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe' } })
    expect(data[0].blocks[1].lex.kind).toBe('marker')
  })

  it.each([
    ['marker_needs_entry', () => [BLOCK([0], [0], { is_marker: true }), BLOCK([1], [1])]],
    ['marker_needs_entry', () => [BLOCK([0], [0]), BLOCK([1], [], { is_marker: true, solo: true })]],
    ['marker_needs_marker_entry', () => [BLOCK([0], [0], { is_marker: true, lexicon_id: wordId }), BLOCK([1], [1])]],
    ['word_needs_word_entry', () => [BLOCK([0], [0], { lexicon_id: markerId }), BLOCK([1], [1])]],
    ['sense_not_of_entry', () => [BLOCK([0], [0], { lexicon_id: wordId, translation_id: otherSense }), BLOCK([1], [1])]],
    ['sense_without_entry', () => [BLOCK([0], [0], { translation_id: senseIds[0] }), BLOCK([1], [1])]],
    ['entry_not_found', () => [BLOCK([0], [0], { lexicon_id: '00000000-0000-0000-0000-000000000000' }), BLOCK([1], [1])]],
    ['bad_link', () => [BLOCK([0], [0], { lexicon_id: 'not-a-uuid' }), BLOCK([1], [1])]],
  ])('refuses %s and writes nothing', async (code, blocks) => {
    const id = await resource('a b', 'x y')
    const res = await save(id, blocks())
    expect(res.error?.message).toContain(code)
    expect(must(await admin.from('resource_word_blocks').select('id').eq('resource_id', id), 'rows')).toHaveLength(0)
  })

  it('unlinks a block when its entry or its sense is deleted, and a marker block then has no meaning', async () => {
    const id = await resource('a b', 'x y')
    const w = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_senses: [{ french: 'a', context: null }, { french: 'b', context: null }] }))).data
    const m = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_kind: 'marker', p_senses: [] }))).data.id
    await rpc(alice, 'set_marker_meaning', { p_lexicon_id: m, p_type: '', p_meaning: 'futur', p_french: '' })
    expect(
      (await save(id, [BLOCK([0], [0], { lexicon_id: w.id, translation_id: w.sense_ids[1] }), BLOCK([1], [1], { is_marker: true, lexicon_id: m })])).error,
    ).toBeNull()
    await admin.from('lexicon_translations').delete().eq('id', w.sense_ids[1])
    await admin.from('lexicon').delete().eq('id', m)
    const data = await get(id)
    expect(data[0].blocks[0].lex).toMatchObject({ id: w.id, sense_id: null })
    expect(data[0].blocks[1]).toMatchObject({ lex: null, is_marker: true, marker: null })
  })

  it('keeps refusing another contributor', async () => {
    const id = await resource('a b', 'x y')
    const res = await bob.client.rpc('save_resource_verse', {
      p_resource: id, p_verse: 1, p_base_bete: 'a b', p_base_literal: 'x y', p_bete_line: null, p_literal_line: null,
      p_blocks: [BLOCK([0], [0], { lexicon_id: wordId }), BLOCK([1], [1])],
    })
    expect(res.error?.message).toContain('not_owner')
  })
})

describe('readers of the lexicon in SQL', () => {
  let alice: TestUser
  const tag = uid()
  beforeAll(async () => {
    alice = await createUser('rd-alice')
  })

  it('hides a marker without meaning from search_lexicon and shows it once it has one', async () => {
    const m = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `zzmark${tag}`, p_kind: 'marker', p_senses: [] }))).data.id
    const found = async () => (await anonClient().rpc('search_lexicon', { q: `zzmark${tag}` })).data as { id: string }[]
    expect((await found()).map(r => r.id)).not.toContain(m)
    await rpc(alice, 'set_marker_meaning', { p_lexicon_id: m, p_type: 'temps', p_meaning: 'futur', p_french: '' })
    expect((await found()).map(r => r.id)).toContain(m)
  })
})

describe('corrections allow-list', () => {
  it('accepts the marker fields and the kind', async () => {
    for (const f of ['marker_type', 'marker_meaning', 'marker_french', 'entry_kind']) {
      const { data } = await admin.rpc('correction_column', { p_type: 'word', p_field: f })
      expect(data).toEqual(['lexicon', f])
    }
  })
})
```

- [ ] **Step 3: Update the corrections unit test and the TS mirror**

In `web/__tests__/corrections.test.ts`, replace the file lookup in the first test so it reads the **latest** migration that defines `correction_column` (the original file plus this migration both match; the latest wins):

```ts
    const dir = path.resolve(__dirname, '../../supabase/migrations')
    const file = readdirSync(dir)
      .filter(f => f.endsWith('.sql') && readFileSync(path.join(dir, f), 'utf8').includes('function correction_column'))
      .sort()
      .pop()
    expect(file, 'the migration defining correction_column is missing').toBeTruthy()
```

In `web/lib/corrections.ts`, in `CORRECTION_FIELDS.word` add after the existing entries:

```ts
    { field: 'marker_type', label: 'Type du marqueur' },
    { field: 'marker_meaning', label: 'Ce que le marqueur indique' },
    { field: 'marker_french', label: 'Comment le français le rend' },
    { field: 'entry_kind', label: 'Nature de l’entrée (mot ou marqueur)' },
```

(Open the file first and put them inside the existing `word:` array; keep its style.)

- [ ] **Step 4: Run to verify the failures**

`npm run test:rls -- lexicon-from-word-links` → FAIL (`save_resource_verse` ignores links, `lex` missing, `correction_column` lacks fields). `npx vitest run corrections` (from `web/`) → FAIL until the SQL below exists.

- [ ] **Step 5: Append the SQL**

Append to the migration. It re-states `correction_column` completely, `search_lexicon` with the marker condition, `get_resource_words`, and `save_resource_verse` (full bodies; they replace the 20261007 definitions), then drops the old table.

```sql
-- ── 9. corrections: marker fields and kind are correctable ──────────────────────────────────────
create or replace function correction_column(p_type text, p_field text)
returns text[]
language sql immutable
set search_path = public
as $$
  select case p_type || '.' || p_field
    when 'translation.french'          then array['lexicon_translations', 'french']
    when 'translation.context'         then array['lexicon_translations', 'context']
    when 'word.bete_phonetic'          then array['lexicon', 'bete_phonetic']
    when 'word.bete_word'              then array['lexicon', 'bete_word']
    when 'word.description'            then array['lexicon', 'description']
    when 'word.marker_type'            then array['lexicon', 'marker_type']
    when 'word.marker_meaning'         then array['lexicon', 'marker_meaning']
    when 'word.marker_french'          then array['lexicon', 'marker_french']
    when 'word.entry_kind'             then array['lexicon', 'entry_kind']
    when 'expression.bete_phrase'      then array['expressions', 'bete_phrase']
    when 'expression.bete_phonetic'    then array['expressions', 'bete_phonetic']
    when 'expression.french_phrase'    then array['expressions', 'french_phrase']
    when 'expression.french_literal'   then array['expressions', 'french_literal']
    when 'grammar_rule.pattern_french' then array['grammar_rules', 'pattern_french']
    when 'grammar_rule.pattern_bete'   then array['grammar_rules', 'pattern_bete']
    when 'grammar_rule.description'    then array['grammar_rules', 'description']
    when 'grammar_rule.example_bete'   then array['grammar_rules', 'example_bete']
    when 'grammar_rule.example_french' then array['grammar_rules', 'example_french']
    when 'resource.title'              then array['community_texts', 'title']
    when 'resource.content_bete'       then array['community_texts', 'content_bete']
    when 'resource.content_literal'    then array['community_texts', 'content_literal']
    when 'resource.content_french'     then array['community_texts', 'content_french']
  end
$$;

-- ── 10. search_lexicon ignores markers that have no meaning yet ─────────────────────────────────
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
    and (l.entry_kind = 'word' or l.marker_meaning is not null)
    and (p_dialect is null or l.dialect = p_dialect)
    and (p_pos is null or coalesce(l.pos, '{}'::text[]) @> array[p_pos])
  order by b.rank desc, l.bete_phonetic
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function search_lexicon(text, text, text, int, int) to anon, authenticated;

-- ── 11. reading: blocks carry the linked entry ──────────────────────────────────────────────────
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
                          select jsonb_build_object('type', l.marker_type, 'meaning', l.marker_meaning, 'french', l.marker_french)
                          from lexicon l
                          where l.id = b.lexicon_id
                        ) end,
                      'lex', case when b.lexicon_id is not null then lexicon_summary(b.lexicon_id, b.translation_id) end
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

-- ── 12. writing: blocks carry lexicon_id / translation_id ───────────────────────────────────────
create or replace function save_resource_verse(
  p_resource uuid,
  p_verse int,
  p_base_bete text,
  p_base_literal text,
  p_bete_line text,
  p_literal_line text,
  p_blocks jsonb
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
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select ct.created_by, ct.content_bete, ct.content_literal
    into v_owner, v_bete, v_lit
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
     lexicon_id, translation_id)
  select p_resource, p_verse, row_number() over (order by x.bi[1]), x.bi, x.gi,
         coalesce((x.e ->> 'is_marker')::boolean, false),
         coalesce((x.e ->> 'solo')::boolean, false),
         nullif(btrim(x.e ->> 'note'), ''),
         nullif(btrim(x.e ->> 'composition'), ''),
         v_hash,
         nullif(x.e ->> 'lexicon_id', '')::uuid,
         nullif(x.e ->> 'translation_id', '')::uuid
  from (
    select e,
           array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[]  as bi,
           array(select jsonb_array_elements_text(e -> 'gloss_idx'))::int[] as gi
    from jsonb_array_elements(p_blocks) e
  ) x;
  get diagnostics v_saved = row_count;

  return jsonb_build_object('saved', v_saved, 'verse_hash', v_hash);
end;
$$;

revoke execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) from public, anon;
grant execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) to authenticated;

-- ── 13. the per-resource marker table is replaced by marker entries ─────────────────────────────
drop table if exists resource_word_markers;
```

- [ ] **Step 6: Apply and run**

Apply the migration, reload PostgREST, then run `npm run test:rls -- lexicon-from-word-links`, `npm run test:rls -- resource-word-links` (both the `resource-word-links` and `-pilot` files match; the pilot is fixed in Task 8, so if only the pilot fails, continue), `npm run test:rls -- search-lexicon`, `npm run test:rls -- corrections`, and `npx vitest run corrections` (from `web/`).
Expected: all PASS except possibly `resource-word-links-pilot` (Task 8). Fix real failures before committing.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print: master
git add supabase/migrations/20261008000000_lexicon_from_word_links.sql web/__tests__/rls/lexicon-from-word-links.test.ts web/__tests__/rls/resource-word-links.test.ts web/__tests__/corrections.test.ts web/lib/corrections.ts
git commit -m "feat(lexicon): block links in save/get_resource_words, marker entries replace the marker table" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Types and pure helpers (reader types, `lexicon-links.ts`, editor state)

**Files:**
- Modify: `web/lib/word-blocks.ts`
- Create: `web/lib/lexicon-links.ts`, `web/__tests__/lexicon-links.test.ts`
- Modify: `web/lib/word-link-editor.ts`, `web/__tests__/word-link-editor.test.ts`

**Interfaces:**
- Produces in `word-blocks.ts`:
```ts
export interface LexSense { id: string; french: string; context: string | null }
export interface LexSummary {
  id: string; kind: 'word' | 'marker'; spelling: string; ipa: string | null; dialect: string
  pos: string[]; description: string | null; synonyms: string[]; marker: MarkerInfo
  senses: LexSense[]; senseId: string | null; spellings: string[]
}
// WordBlock: add `lex?: LexSummary | null`; ReaderToken: add `lex: LexSummary | null`
// BlockInput: remove `marker?`, add `lexicon_id?: string | null; translation_id?: string | null`
```
- Produces in `lexicon-links.ts`:
```ts
export function stripArticle(gloss: string): string
export function senseSeed(gloss: string): string                  // = stripArticle(gloss)
export type Dialect = 'western' | 'northern' | 'eastern'
export const DIALECTS: { value: Dialect; label: string }[]
export function dialectForRegion(region: string | null | undefined): Dialect
export const ENTRY_CATEGORIES: { value: string; label: string }[] // value = pos tag ('noun', 'verb', … 'part')
export interface Candidate { matchKind: 'exact' | 'norm' | 'near'; matched: string; distance: number; entry: LexSummary }
export interface GroupedCandidates { exact: Candidate[]; variants: Candidate[]; otherKind: Candidate[] }
export function groupCandidates(rows: Candidate[], kind: 'word' | 'marker'): GroupedCandidates
export interface EntryForm {
  spelling: string; ipa: string; dialect: Dialect; category: string; description: string; notes: string
  synonyms: string; lemma: string; senses: { french: string; context: string }[]; useExample: boolean
}
export function emptyEntryForm(spelling: string, gloss: string, dialect: Dialect): EntryForm
export function splitList(s: string): string[]
export function checkEntryForm(f: EntryForm, kind: 'word' | 'marker'): string | null
```
- Produces in `word-link-editor.ts`: `BlockMeta` gains `lexiconId: string | null; translationId: string | null`; `EMPTY_META` includes them; `setLink(d, key, lexiconId, translationId)`; `setKind` clears the link when the kind changes; `unlinkedMarkers(d): string[]` (labels of marker blocks with no entry); `toSave(d)` (no second argument) puts `lexicon_id` / `translation_id` on each block. **Removed:** `MarkerDef`, `EMPTY_MARKER`, `collectMarkers`, `effectiveMarkers`, `setMarkerEdit`, `pruneMarkerEdits`.

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/lexicon-links.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  checkEntryForm, dialectForRegion, emptyEntryForm, groupCandidates, senseSeed, splitList, stripArticle,
  type Candidate,
} from '@/lib/lexicon-links'
import type { LexSummary } from '@/lib/word-blocks'

const summary = (id: string, kind: 'word' | 'marker' = 'word'): LexSummary => ({
  id, kind, spelling: id, ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [], senseId: null, spellings: [],
})
const cand = (id: string, matchKind: Candidate['matchKind'], kind: 'word' | 'marker' = 'word'): Candidate => ({
  matchKind, matched: id, distance: matchKind === 'near' ? 1 : 0, entry: summary(id, kind),
})

describe('stripArticle', () => {
  it.each([
    ['au ciel', 'ciel'], ['les gens', 'gens'], ['la maison', 'maison'], ['un homme', 'homme'], ['des enfants', 'enfants'],
    ['du pain', 'pain'], ['aux hommes', 'hommes'], ['Le Père', 'Père'], ["l'eau", 'eau'], ['l’eau', 'eau'],
    ['au\u00a0ciel', 'ciel'], ['  les gens  ', 'gens'],
  ])('%s -> %s', (input, expected) => expect(stripArticle(input)).toBe(expected))

  it('keeps a lone article and words that merely start like one', () => {
    expect(stripArticle('au')).toBe('au')
    expect(stripArticle('du')).toBe('du')
    expect(stripArticle('lent')).toBe('lent')
    expect(stripArticle('desert')).toBe('desert')
    expect(stripArticle('')).toBe('')
  })

  it('seeds the first sense from the gloss', () => {
    expect(senseSeed('au ciel')).toBe('ciel')
    expect(senseSeed('est')).toBe('est')
  })
})

describe('dialectForRegion', () => {
  it.each([['Guiberoua', 'western'], ['Gagnoa', 'northern'], ['Daloa', 'eastern'], ['Autre', 'western'], [null, 'western'], [undefined, 'western']])(
    '%s -> %s', (region, dialect) => expect(dialectForRegion(region)).toBe(dialect),
  )
})

describe('groupCandidates', () => {
  it('splits exact, variants and the other kind', () => {
    const rows = [cand('a', 'exact'), cand('b', 'norm'), cand('c', 'near'), cand('m', 'exact', 'marker'), cand('n', 'near', 'marker')]
    const g = groupCandidates(rows, 'word')
    expect(g.exact.map(c => c.entry.id)).toEqual(['a'])
    expect(g.variants.map(c => c.entry.id)).toEqual(['b', 'c'])
    expect(g.otherKind.map(c => c.entry.id)).toEqual(['m', 'n'])
    expect(groupCandidates(rows, 'marker').exact.map(c => c.entry.id)).toEqual(['m'])
  })
  it('handles an empty list', () => {
    expect(groupCandidates([], 'word')).toEqual({ exact: [], variants: [], otherKind: [] })
  })
})

describe('entry form', () => {
  it('starts with the spelling, the dialect and a sense seeded from the gloss', () => {
    const f = emptyEntryForm('ghèhi-wu', 'au ciel', 'northern')
    expect(f).toMatchObject({ spelling: 'ghèhi-wu', dialect: 'northern', useExample: false })
    expect(f.senses).toEqual([{ french: 'ciel', context: '' }])
  })
  it('splits comma and semicolon lists', () => {
    expect(splitList(' a, b ;c,, ')).toEqual(['a', 'b', 'c'])
    expect(splitList('')).toEqual([])
  })
  it('needs a spelling and, for a word, one sense', () => {
    const f = emptyEntryForm('x', 'y', 'western')
    expect(checkEntryForm(f, 'word')).toBeNull()
    expect(checkEntryForm({ ...f, spelling: ' ' }, 'word')).toMatch(/graphie/i)
    expect(checkEntryForm({ ...f, senses: [{ french: ' ', context: '' }] }, 'word')).toMatch(/sens/i)
    expect(checkEntryForm({ ...f, senses: [] }, 'marker')).toBeNull()
  })
  it('reuses the lexicon length rules', () => {
    const f = emptyEntryForm('x', 'y', 'western')
    expect(checkEntryForm({ ...f, description: 'd'.repeat(2001) }, 'word')).toMatch(/2000/)
    expect(checkEntryForm({ ...f, senses: [{ french: 'f'.repeat(201), context: '' }] }, 'word')).toMatch(/200/)
    expect(checkEntryForm({ ...f, spelling: 's'.repeat(101) }, 'word')).toMatch(/100/)
  })
})
```

In `web/__tests__/word-link-editor.test.ts`: delete every test of `collectMarkers`, `effectiveMarkers`, `setMarkerEdit`, `pruneMarkerEdits` and any `toSave(d, markers)` usage of the second argument (`toSave(d)` now); fix `meta` expectations of `initDraft` to include `lexiconId`/`translationId`. Add:

```ts
import { initDraft, setKind, setLink, toSave, unlinkedMarkers, derive } from '@/lib/word-link-editor'
import type { VerseWords } from '@/lib/word-blocks'

describe('links in the draft', () => {
  const draft = () => initDraft(1, 'en ye', 'je va', undefined)
  const saved: VerseWords = {
    verse_no: 1, stale: false, bete_line: 'en ye', literal_line: 'je va',
    blocks: [
      { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null,
        lex: { id: 'L1', kind: 'word', spelling: 'en', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
               marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'je', context: null }], senseId: 'S1', spellings: [] } },
      { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: true, solo: false, note: null, composition: null, marker: null, lex: null },
    ],
  }

  it('restores the entry and sense of saved blocks', () => {
    const d = initDraft(1, 'en ye', 'je va', saved)
    expect(d.meta['0']).toMatchObject({ lexiconId: 'L1', translationId: 'S1' })
    expect(d.meta['1']).toMatchObject({ lexiconId: null, translationId: null, isMarker: true })
  })

  it('sends the link with each block', () => {
    let d = setLink(draft(), '0', 'L1', 'S1')
    const out = toSave(d).blocks
    expect(out[0]).toMatchObject({ lexicon_id: 'L1', translation_id: 'S1' })
    expect(out[1]).toMatchObject({ lexicon_id: null, translation_id: null })
    expect('marker' in out[0]).toBe(false)
    d = setLink(d, '0', null, null)
    expect(toSave(d).blocks[0]).toMatchObject({ lexicon_id: null, translation_id: null })
  })

  it('drops the link when the block changes kind', () => {
    let d = setLink(draft(), '1', 'L9', null)
    d = setKind(d, '1', 'marker', false)
    expect(d.meta['1']).toMatchObject({ isMarker: true, lexiconId: null, translationId: null })
    d = setLink(d, '1', 'M1', null)
    d = setKind(d, '1', 'word', false)
    expect(d.meta['1']).toMatchObject({ isMarker: false, lexiconId: null })
  })

  it('keeps the link when the marker box is re-selected as marker (no kind change)', () => {
    let d = setKind(draft(), '1', 'marker', false)
    d = setLink(d, '1', 'M1', null)
    d = setKind(d, '1', 'marker', true)
    expect(d.meta['1']).toMatchObject({ lexiconId: 'M1', solo: true })
  })

  it('lists the marker blocks that have no entry yet', () => {
    let d = setKind(draft(), '1', 'marker', false)
    expect(unlinkedMarkers(d)).toEqual(['ye'])
    d = setLink(d, '1', 'M1', null)
    expect(unlinkedMarkers(d)).toEqual([])
    void derive
  })
})
```

- [ ] **Step 2: Run to verify they fail**

`npx vitest run lexicon-links word-link-editor` (from `web/`) → FAIL (module / exports missing).

- [ ] **Step 3: Implement `word-blocks.ts` changes**

In `web/lib/word-blocks.ts`:

Add after `MarkerInfo`:

```ts
export interface LexSense {
  id: string
  french: string
  context: string | null
}

/** The lexicon entry a block links to, as returned by get_resource_words / find_lexicon_candidates. */
export interface LexSummary {
  id: string
  kind: 'word' | 'marker'
  spelling: string
  ipa: string | null
  dialect: string
  pos: string[]
  description: string | null
  synonyms: string[]
  marker: MarkerInfo
  senses: LexSense[]
  /** The sense used by the block (null for a candidate or when the sense was deleted). */
  senseId: string | null
  spellings: string[]
}
```

In `WordBlock` add `lex?: LexSummary | null` after `marker`. In `BlockInput` replace `marker?: {…}` by:
```ts
  lexicon_id?: string | null
  translation_id?: string | null
```
In `ReaderToken` add `lex: LexSummary | null` after `marker`, and in `readerTokens` add `lex: b.lex ?? null,` after `marker: b.marker,`.

Fix any existing test fixture that builds a `ReaderToken` literal by adding `lex: null` (run `npx tsc --noEmit` and fix what it reports).

- [ ] **Step 4: Implement `lexicon-links.ts`**

Create `web/lib/lexicon-links.ts`:

```ts
// lib/lexicon-links.ts — pure helpers for linking word blocks to lexicon entries.
// No React, no Supabase. Unit tested.
import { checkDescription, checkTranslationInput } from './lexicon'
import type { LexSummary } from './word-blocks'

const WS = '[ \\t\\u00a0]'
// French articles stick to the word after them ("au ciel"); "l'" too. "de" is deliberately absent.
const ARTICLE = new RegExp(`^(?:l['\\u2019]|(?:le|la|les|un|une|des|au|aux|du)${WS}+)`, 'i')
const EDGE = new RegExp(`^${WS}+|${WS}+$`, 'g')

/** "au ciel" -> "ciel". A lone article is kept. */
export function stripArticle(gloss: string): string {
  const t = gloss.replace(EDGE, '')
  const rest = t.replace(ARTICLE, '').replace(new RegExp(`^${WS}+`), '')
  return rest === '' ? t : rest
}

/** The French word proposed for a new entry's first sense. */
export const senseSeed = (gloss: string): string => stripArticle(gloss)

export type Dialect = 'western' | 'northern' | 'eastern'

export const DIALECTS: { value: Dialect; label: string }[] = [
  { value: 'western', label: 'Ouest (Guiberoua)' },
  { value: 'northern', label: 'Nord (Gagnoa)' },
  { value: 'eastern', label: 'Est (Daloa)' },
]

/** Default dialect of a new entry, from the region of the resource. Always editable. */
export function dialectForRegion(region: string | null | undefined): Dialect {
  if (region === 'Gagnoa') return 'northern'
  if (region === 'Daloa') return 'eastern'
  return 'western'
}

/** Part-of-speech tags are the ones already stored in lexicon.pos (see LexiconEntry POS_LABELS) plus 'part'. */
export const ENTRY_CATEGORIES: { value: string; label: string }[] = [
  { value: 'noun', label: 'Nom' },
  { value: 'verb', label: 'Verbe' },
  { value: 'adj', label: 'Adjectif' },
  { value: 'adv', label: 'Adverbe' },
  { value: 'name', label: 'Nom propre' },
  { value: 'num', label: 'Numéral' },
  { value: 'pron', label: 'Pronom' },
  { value: 'prep', label: 'Préposition' },
  { value: 'conj', label: 'Conjonction' },
  { value: 'interj', label: 'Interjection' },
  { value: 'part', label: 'Particule' },
]

export interface Candidate {
  matchKind: 'exact' | 'norm' | 'near'
  /** The form that matched (a spelling, the IPA, or an extra spelling). */
  matched: string
  distance: number
  entry: LexSummary
}

export interface GroupedCandidates {
  /** Same spelling, wanted kind. */
  exact: Candidate[]
  /** Spelled differently (accents, tones, small typos), wanted kind. */
  variants: Candidate[]
  /** Entries of the other kind: the panel says so and never links them silently. */
  otherKind: Candidate[]
}

export function groupCandidates(rows: Candidate[], kind: 'word' | 'marker'): GroupedCandidates {
  const g: GroupedCandidates = { exact: [], variants: [], otherKind: [] }
  for (const c of rows) {
    if (c.entry.kind !== kind) g.otherKind.push(c)
    else if (c.matchKind === 'exact') g.exact.push(c)
    else g.variants.push(c)
  }
  return g
}

export interface EntryForm {
  spelling: string
  ipa: string
  dialect: Dialect
  /** A pos tag from ENTRY_CATEGORIES, or ''. */
  category: string
  description: string
  notes: string
  /** Comma or semicolon separated. */
  synonyms: string
  lemma: string
  senses: { french: string; context: string }[]
  /** Use the verse as an example sentence (needs the French line). */
  useExample: boolean
}

export function emptyEntryForm(spelling: string, gloss: string, dialect: Dialect): EntryForm {
  return {
    spelling, ipa: '', dialect, category: '', description: '', notes: '', synonyms: '', lemma: '',
    senses: [{ french: senseSeed(gloss), context: '' }], useExample: false,
  }
}

export const splitList = (s: string): string[] =>
  s.split(/[,;]/).map(x => x.trim()).filter(Boolean)

/** A French error message, or null when the form can be sent. */
export function checkEntryForm(f: EntryForm, kind: 'word' | 'marker'): string | null {
  const spelling = f.spelling.trim()
  if (!spelling) return 'Écrivez la graphie du mot.'
  if (spelling.length > 100) return 'La graphie ne peut pas dépasser 100 caractères.'
  if (f.ipa.trim().length > 100) return 'La transcription ne peut pas dépasser 100 caractères.'
  if (kind === 'word') {
    const filled = f.senses.filter(s => s.french.trim() !== '')
    if (filled.length === 0) return 'Ajoutez au moins un sens (le mot en français).'
    for (const s of filled) {
      const c = checkTranslationInput({ french: s.french, context: s.context })
      if (c.error) return c.error
    }
  }
  return checkDescription(f.description).error
}
```

- [ ] **Step 5: Implement the `word-link-editor.ts` changes**

In `web/lib/word-link-editor.ts`:

1. Imports: remove `normWord` and `type BlockInput`'s unused parts only if tsc reports them unused; keep `blockWords`.
2. Delete `MarkerDef`, `EMPTY_MARKER`, `collectMarkers`, the whole "Marker meanings: ONE map…" section (`effectiveMarkers`, `setMarkerEdit`, `pruneMarkerEdits`).
3. `BlockMeta` / `EMPTY_META`:
```ts
export interface BlockMeta {
  isMarker: boolean
  solo: boolean
  note: string
  composition: string
  /** The lexicon entry and the sense (translation) this block uses. */
  lexiconId: string | null
  translationId: string | null
}

export const EMPTY_META: BlockMeta = { isMarker: false, solo: false, note: '', composition: '', lexiconId: null, translationId: null }
```
4. In `initDraft`, the meta entry becomes:
```ts
    meta[b.bete_idx.join('-')] = {
      isMarker: b.is_marker,
      solo: b.solo,
      note: b.note ?? '',
      composition: b.composition ?? '',
      lexiconId: b.lex?.id ?? null,
      translationId: b.lex?.senseId ?? null,
    }
```
5. Replace `setKind` and add `setLink` / `unlinkedMarkers`:
```ts
/**
 * Word or grammatical marker. A marker may be flagged `solo` (no mot à mot counterpart).
 * Changing the kind drops the link: a word entry does not fit a marker block and the reverse.
 */
export function setKind(d: VerseDraft, key: string, kind: 'word' | 'marker', solo: boolean): VerseDraft {
  const cur = d.meta[key] ?? EMPTY_META
  if (kind === 'marker') {
    return setMeta(d, key, cur.isMarker ? { solo } : { isMarker: true, solo, lexiconId: null, translationId: null })
  }
  return setMeta(d, key, cur.isMarker ? { isMarker: false, solo: false, lexiconId: null, translationId: null } : { isMarker: false, solo: false })
}

/** Link (or unlink with nulls) the block `key` to a lexicon entry and one of its senses. */
export function setLink(d: VerseDraft, key: string, lexiconId: string | null, translationId: string | null): VerseDraft {
  return setMeta(d, key, { lexiconId, translationId: lexiconId ? translationId : null })
}

/** The words of the marker blocks that still have no lexicon entry (the database refuses them). */
export function unlinkedMarkers(d: VerseDraft): string[] {
  const { bw, bu } = derive(d)
  return bu
    .filter(u => d.meta[blockKey(u)]?.isMarker && !d.meta[blockKey(u)]?.lexiconId)
    .map(u => blockWords(bw, u.idx))
}
```
6. `toSave(d)` loses its second parameter and the marker object:
```ts
export function toSave(d: VerseDraft): SavePayload {
  const { pairs } = derive(d)
  const blocks: BlockInput[] = pairs
    .filter((p): p is Pair & { b: Unit } => p.b != null && (p.g != null || p.solo === true))
    .map(p => {
      const m = d.meta[blockKey(p.b)] ?? EMPTY_META
      return {
        bete_idx: p.b.idx,
        gloss_idx: p.g ? p.g.idx : [],
        is_marker: m.isMarker,
        solo: m.solo,
        note: m.note.trim() || null,
        composition: m.composition.trim() || null,
        lexicon_id: m.lexiconId ?? null,
        translation_id: m.translationId ?? null,
      }
    })
  return {
    beteLine: d.bete !== d.baseBete ? d.bete : null,
    literalLine: d.literal !== d.baseLiteral ? d.literal : null,
    blocks,
  }
}
```
Also remove the now-unused comment lines above the deleted section. A draft stored in the browser before this change has `meta` entries without the two link fields: `m.lexiconId ?? null` covers it.

- [ ] **Step 6: Run tests and types**

`npx vitest run lexicon-links word-link-editor word-blocks` then `npx tsc --noEmit`.
Expected: the new tests PASS. `tsc` will still report errors in `WordLinkEditor.tsx` / `BlockPanel.tsx` (they use the removed marker map) — those are fixed in Task 6; only those two files may remain in the error list. Fix any other file.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print: master
git add web/lib/word-blocks.ts web/lib/lexicon-links.ts web/lib/word-link-editor.ts web/__tests__/lexicon-links.test.ts web/__tests__/word-link-editor.test.ts
git commit -m "feat(lexicon): link fields in the editor draft and pure lexicon-link helpers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Data layer

**Files:**
- Create: `web/lib/lexicon-links-data.ts`, `web/__tests__/lexicon-links-data.test.ts`
- Modify: `web/lib/word-blocks-data.ts`, `web/__tests__/word-blocks-data.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `EntryForm`, `splitList`, `senseSeed` from `lexicon-links.ts`; `LexSummary`, `MarkerInfo` from `word-blocks.ts`; `Result<T>` from `word-blocks-data.ts`.
- Produces in `word-blocks-data.ts`: `export function parseLex(v: unknown): LexSummary | null`; `parseBlock` sets `lex: parseLex(raw.lex)` and `marker` stays; `SAVE_ERROR_MESSAGES` gains the new codes.
- Produces in `lexicon-links-data.ts`:
```ts
export function lexErrorMessage(message: string): string
export async function findCandidates(client, a: { text: string; dialect?: string | null; kind?: 'word' | 'marker' | null; limit?: number }): Promise<Candidate[]>
export async function createEntry(client, a: { form: EntryForm; kind: 'word' | 'marker'; example?: { bete: string; french: string; literal: string } | null }): Promise<Result<{ id: string; existed: boolean; senseIds: string[]; entry: LexSummary }>>
export async function addSpelling(client, lexiconId: string, spelling: string): Promise<Result<true>>
export async function setMarkerMeaning(client, lexiconId: string, v: { type: string; meaning: string; french: string }): Promise<Result<true>>
export async function addSense(client, lexiconId: string, v: { french: string; context: string }): Promise<Result<true>>
export async function getEntry(client, lexiconId: string): Promise<LexSummary | null>
```

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/lexicon-links-data.test.ts` using a fake client (`{ rpc: vi.fn(), from: … }`):

```ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addSense, addSpelling, createEntry, findCandidates, getEntry, lexErrorMessage, setMarkerMeaning } from '@/lib/lexicon-links-data'
import { emptyEntryForm } from '@/lib/lexicon-links'

const rawEntry = {
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: ['noun'], description: 'Le ciel.',
  synonyms: ['firmament'], marker: { type: null, meaning: null, french: null },
  senses: [{ id: 'S1', french: 'ciel', context: null }], sense_id: 'S1', spellings: ['ghéhi-wu'],
}
const fake = (rpc: ReturnType<typeof vi.fn>, from?: unknown) => ({ rpc, from }) as unknown as SupabaseClient

describe('findCandidates', () => {
  it('maps rows and passes the parameters', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ match_kind: 'near', matched: 'ghéhi-wu', distance: 1, entry: rawEntry }], error: null })
    const out = await findCandidates(fake(rpc), { text: ' ghehi-wu ', dialect: 'western' })
    expect(rpc).toHaveBeenCalledWith('find_lexicon_candidates', { p_text: 'ghehi-wu', p_dialect: 'western', p_kind: null, p_limit: 7 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ matchKind: 'near', matched: 'ghéhi-wu', distance: 1 })
    expect(out[0].entry).toMatchObject({ id: 'L1', kind: 'word', senseId: 'S1', spellings: ['ghéhi-wu'], pos: ['noun'] })
  })
  it('returns nothing on error, on blank text and on garbage rows', async () => {
    expect(await findCandidates(fake(vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } })), { text: 'a' })).toEqual([])
    const rpc = vi.fn()
    expect(await findCandidates(fake(rpc), { text: '   ' })).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(await findCandidates(fake(vi.fn().mockResolvedValue({ data: [{ entry: null }, 5], error: null })), { text: 'a' })).toEqual([])
  })
})

describe('createEntry', () => {
  it('sends the form as the function arguments', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'L1', existed: false, sense_ids: ['S1'], entry: rawEntry }, error: null })
    const form = { ...emptyEntryForm('ghèhi-wu', 'au ciel', 'western'), ipa: 'ɡɛ̀hi', category: 'noun', synonyms: 'firmament, voûte', description: ' Le ciel. ',
      senses: [{ french: 'ciel', context: 'en haut' }, { french: '  ', context: '' }] }
    const res = await createEntry(fake(rpc), { form, kind: 'word', example: { bete: 'a', french: 'b', literal: 'c' } })
    expect(rpc).toHaveBeenCalledWith('create_lexicon_entry', {
      p_spelling: 'ghèhi-wu', p_ipa: 'ɡɛ̀hi', p_dialect: 'western', p_kind: 'word', p_pos: ['noun'], p_description: 'Le ciel.',
      p_notes: null, p_synonyms: ['firmament', 'voûte'], p_lemma: null,
      p_senses: [{ french: 'ciel', context: 'en haut' }], p_example: { bete: 'a', french: 'b', literal: 'c' },
    })
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ id: 'L1', existed: false, senseIds: ['S1'] })
    expect(res.data!.entry.senseId).toBe('S1')
  })
  it('sends nulls for empty optional fields and no senses for a marker', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 'M1', existed: true, sense_ids: [], entry: { ...rawEntry, kind: 'marker' } }, error: null })
    await createEntry(fake(rpc), { form: emptyEntryForm('ye', '', 'western'), kind: 'marker' })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_kind: 'marker', p_senses: [], p_pos: null, p_synonyms: null, p_example: null, p_ipa: null })
  })
  it('maps the error codes to French', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'sense_required' } })
    const res = await createEntry(fake(rpc), { form: emptyEntryForm('x', 'y', 'western'), kind: 'word' })
    expect(res.error).toMatch(/sens/i)
  })
})

describe('other writes and reads', () => {
  it('addSpelling and setMarkerMeaning call their functions and map errors', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'id', error: null })
    expect((await addSpelling(fake(rpc), 'L1', ' ghéhi ')).error).toBeNull()
    expect(rpc).toHaveBeenCalledWith('add_lexicon_spelling', { p_lexicon_id: 'L1', p_spelling: 'ghéhi' })
    expect((await setMarkerMeaning(fake(rpc), 'M1', { type: 'temps', meaning: 'futur', french: '' })).error).toBeNull()
    expect(rpc).toHaveBeenCalledWith('set_marker_meaning', { p_lexicon_id: 'M1', p_type: 'temps', p_meaning: 'futur', p_french: '' })
    const bad = vi.fn().mockResolvedValue({ data: null, error: { message: 'spelling_exists' } })
    expect((await addSpelling(fake(bad), 'L1', 'x')).error).toMatch(/déjà/i)
    const bad2 = vi.fn().mockResolvedValue({ data: null, error: { message: 'meaning_already_set' } })
    expect((await setMarkerMeaning(fake(bad2), 'M1', { type: '', meaning: 'a', french: '' })).error).toMatch(/correction/i)
  })
  it('addSense inserts a translation row', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn().mockReturnValue({ insert })
    const client = fake(vi.fn(), from)
    expect((await addSense(client, 'L1', { french: ' haut ', context: ' ' })).error).toBeNull()
    expect(from).toHaveBeenCalledWith('lexicon_translations')
    expect(insert).toHaveBeenCalledWith({ lexicon_id: 'L1', french: 'haut', context: null })
    expect((await addSense(client, 'L1', { french: ' ', context: '' })).error).toMatch(/obligatoire/i)
  })
  it('getEntry returns a summary or null', async () => {
    expect((await getEntry(fake(vi.fn().mockResolvedValue({ data: rawEntry, error: null })), 'L1'))?.id).toBe('L1')
    expect(await getEntry(fake(vi.fn().mockResolvedValue({ data: null, error: null })), 'L1')).toBeNull()
  })
  it('lexErrorMessage falls back to a generic message', () => {
    expect(lexErrorMessage('boom')).toMatch(/réessayer/i)
    expect(lexErrorMessage('not_signed_in')).toMatch(/connectez/i)
  })
})
```

Add to `web/__tests__/word-blocks-data.test.ts` a test that `parseVerse` reads `lex` (including `sense_id` → `senseId`, missing arrays → `[]`, bad `lex` → `null`) and that `saveErrorMessage('… marker_needs_entry …')` is not the generic message:

```ts
it('parses the linked entry of a block', () => {
  const v = parseVerse({
    verse_no: 1, stale: false, bete_line: 'a', literal_line: 'x',
    blocks: [
      { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null,
        lex: { id: 'L1', kind: 'word', spelling: 'a', dialect: 'western', senses: [{ id: 'S1', french: 'x', context: null }], sense_id: 'S1' } },
      { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: false, solo: false, lex: 'garbage' },
    ],
  })
  expect(v.blocks[0].lex).toMatchObject({ id: 'L1', kind: 'word', senseId: 'S1', pos: [], synonyms: [], spellings: [], ipa: null })
  expect(v.blocks[0].lex!.senses).toEqual([{ id: 'S1', french: 'x', context: null }])
  expect(v.blocks[1].lex).toBeNull()
})

it('has French messages for the link errors', () => {
  for (const code of ['marker_needs_entry', 'marker_needs_marker_entry', 'word_needs_word_entry', 'sense_not_of_entry', 'sense_without_entry', 'entry_not_found', 'bad_link']) {
    expect(saveErrorMessage(`x ${code} y`)).not.toMatch(/réessayer/i)
  }
})
```

(import `parseVerse`, `saveErrorMessage` from `@/lib/word-blocks-data` if not already.)

- [ ] **Step 2: Run to verify failure**

`npx vitest run lexicon-links-data word-blocks-data` → FAIL.

- [ ] **Step 3: Implement `parseLex` and messages in `word-blocks-data.ts`**

Add near `parseMarker`:

```ts
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** A lexicon entry summary as the database returns it (see lexicon_summary), or null if it is not one. */
export function parseLex(v: unknown): LexSummary | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.id !== 'string' || (r.kind !== 'word' && r.kind !== 'marker')) return null
  const senses = Array.isArray(r.senses) ? (r.senses as Record<string, unknown>[]) : []
  return {
    id: r.id,
    kind: r.kind,
    spelling: typeof r.spelling === 'string' ? r.spelling : '',
    ipa: text(r.ipa),
    dialect: typeof r.dialect === 'string' ? r.dialect : 'western',
    pos: strs(r.pos),
    description: text(r.description),
    synonyms: strs(r.synonyms),
    marker: parseMarker(r.marker) ?? { type: null, meaning: null, french: null },
    senses: senses
      .filter(s => s && typeof s.id === 'string' && typeof s.french === 'string')
      .map(s => ({ id: s.id as string, french: s.french as string, context: text(s.context) })),
    senseId: typeof r.sense_id === 'string' ? r.sense_id : null,
    spellings: strs(r.spellings),
  }
}
```

Import `LexSummary` in the type import line. In `parseBlock` add `lex: parseLex(raw.lex),` after `marker`. Add to `SAVE_ERROR_MESSAGES`:

```ts
  marker_needs_entry: 'Un marqueur grammatical doit être relié à une entrée du lexique : créez-la ou choisissez-la dans le panneau.',
  marker_needs_marker_entry: 'Un marqueur doit être relié à une entrée de type marqueur.',
  word_needs_word_entry: 'Un mot ne peut pas être relié à une entrée de type marqueur.',
  sense_not_of_entry: 'Le sens choisi n’appartient pas à cette entrée du lexique.',
  sense_without_entry: 'Un sens est choisi sans entrée du lexique.',
  entry_not_found: 'Cette entrée du lexique n’existe plus : déliez le mot et choisissez-en une autre.',
  bad_link: 'Le lien vers le lexique est invalide.',
```

- [ ] **Step 4: Implement `lexicon-links-data.ts`**

Create `web/lib/lexicon-links-data.ts`:

```ts
// lib/lexicon-links-data.ts — Supabase calls for the lexicon side of the word-link editor.
// Runs in the browser (editor) and on the server; no 'server-only'.
import type { SupabaseClient } from '@supabase/supabase-js'
import { splitList, type Candidate, type EntryForm } from './lexicon-links'
import { checkTranslationInput } from './lexicon'
import { parseLex, type Result } from './word-blocks-data'
import type { LexSummary } from './word-blocks'

export const LEX_ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'Connectez-vous pour modifier le lexique.',
  bad_spelling: 'La graphie est vide ou trop longue (100 caractères au plus).',
  bad_dialect: 'Dialecte invalide.',
  bad_kind: 'Type d’entrée invalide.',
  sense_required: 'Ajoutez au moins un sens (le mot en français).',
  too_long: 'Un des textes est trop long.',
  entry_not_found: 'Cette entrée du lexique n’existe plus.',
  spelling_exists: 'Cette graphie existe déjà pour cette entrée.',
  not_a_marker: 'Cette entrée n’est pas un marqueur grammatical.',
  meaning_already_set:
    'Le sens de ce marqueur est déjà renseigné. Pour le changer, proposez une correction depuis la fiche du lexique.',
}

const GENERIC = 'Une erreur est survenue. Veuillez réessayer.'

export function lexErrorMessage(message: string): string {
  const code = Object.keys(LEX_ERROR_MESSAGES).find(c => message.includes(c))
  return code ? LEX_ERROR_MESSAGES[code] : GENERIC
}

function parseCandidate(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const entry = parseLex(r.entry)
  if (!entry) return null
  const matchKind = r.match_kind === 'exact' || r.match_kind === 'norm' || r.match_kind === 'near' ? r.match_kind : 'near'
  return {
    matchKind,
    matched: typeof r.matched === 'string' ? r.matched : entry.spelling,
    distance: typeof r.distance === 'number' ? r.distance : 0,
    entry,
  }
}

/** Entries whose spelling looks like `text`. Asks for one more than the panel shows, so it can say "more exist". */
export async function findCandidates(
  client: SupabaseClient,
  a: { text: string; dialect?: string | null; kind?: 'word' | 'marker' | null; limit?: number },
): Promise<Candidate[]> {
  const text = a.text.trim()
  if (!text) return []
  const { data, error } = await client.rpc('find_lexicon_candidates', {
    p_text: text,
    p_dialect: a.dialect ?? null,
    p_kind: a.kind ?? null,
    p_limit: a.limit ?? 7,
  })
  if (error || !Array.isArray(data)) return []
  return data.map(parseCandidate).filter((c): c is Candidate => c !== null)
}

export interface CreatedEntry {
  id: string
  existed: boolean
  senseIds: string[]
  entry: LexSummary
}

export async function createEntry(
  client: SupabaseClient,
  a: { form: EntryForm; kind: 'word' | 'marker'; example?: { bete: string; french: string; literal: string } | null },
): Promise<Result<CreatedEntry>> {
  const f = a.form
  const senses =
    a.kind === 'word'
      ? f.senses.filter(s => s.french.trim() !== '').map(s => ({ french: s.french.trim(), context: s.context.trim() || null }))
      : []
  const synonyms = splitList(f.synonyms)
  const { data, error } = await client.rpc('create_lexicon_entry', {
    p_spelling: f.spelling.trim(),
    p_ipa: f.ipa.trim() || null,
    p_dialect: f.dialect,
    p_kind: a.kind,
    p_pos: f.category && a.kind === 'word' ? [f.category] : null,
    p_description: f.description.trim() || null,
    p_notes: f.notes.trim() || null,
    p_synonyms: synonyms.length ? synonyms : null,
    p_lemma: f.lemma.trim() || null,
    p_senses: senses,
    p_example: a.example ?? null,
  })
  if (error) return { data: null, error: lexErrorMessage(error.message) }
  const d = data as { id: string; existed: boolean; sense_ids: string[]; entry: unknown }
  const entry = parseLex(d.entry)
  if (!entry) return { data: null, error: GENERIC }
  return { data: { id: d.id, existed: d.existed === true, senseIds: d.sense_ids ?? [], entry }, error: null }
}

export async function addSpelling(client: SupabaseClient, lexiconId: string, spelling: string): Promise<Result<true>> {
  const { error } = await client.rpc('add_lexicon_spelling', { p_lexicon_id: lexiconId, p_spelling: spelling.trim() })
  return error ? { data: null, error: lexErrorMessage(error.message) } : { data: true, error: null }
}

export async function setMarkerMeaning(
  client: SupabaseClient,
  lexiconId: string,
  v: { type: string; meaning: string; french: string },
): Promise<Result<true>> {
  const { error } = await client.rpc('set_marker_meaning', {
    p_lexicon_id: lexiconId,
    p_type: v.type,
    p_meaning: v.meaning,
    p_french: v.french,
  })
  return error ? { data: null, error: lexErrorMessage(error.message) } : { data: true, error: null }
}

/** A new sense on an existing entry (the existing "translations" policies and guard apply). */
export async function addSense(
  client: SupabaseClient,
  lexiconId: string,
  v: { french: string; context: string },
): Promise<Result<true>> {
  const c = checkTranslationInput(v)
  if (c.error) return { data: null, error: c.error }
  const { error } = await client.from('lexicon_translations').insert({ lexicon_id: lexiconId, french: c.french, context: c.context })
  if (error) {
    return { data: null, error: error.message.includes('duplicate') ? 'Ce sens existe déjà.' : lexErrorMessage(error.message) }
  }
  return { data: true, error: null }
}

export async function getEntry(client: SupabaseClient, lexiconId: string): Promise<LexSummary | null> {
  const { data, error } = await client.rpc('get_lexicon_entry', { p_id: lexiconId })
  return error ? null : parseLex(data)
}
```

Note: `addSense` relies on the policy `lexicon_translations_insert_own` (`created_by = auth.uid()`): the insert must carry `created_by`. The existing client code for adding a sense (`LexiconTranslations.tsx`) shows the exact payload; match it: open that file, and if it adds `created_by: user.id`, change the insert above to take a `userId` parameter (`addSense(client, lexiconId, userId, v)`) and update the test accordingly (`expect(insert).toHaveBeenCalledWith({ lexicon_id: 'L1', french: 'haut', context: null, created_by: 'U1' })`). The guard trigger forces `created_by` only through RLS check, so the field is required.

- [ ] **Step 5: Run tests and types**

`npx vitest run lexicon-links-data word-blocks-data` → PASS. `npx tsc --noEmit` → only `WordLinkEditor.tsx` / `BlockPanel.tsx` errors remain.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print: master
git add web/lib/lexicon-links-data.ts web/lib/word-blocks-data.ts web/__tests__/lexicon-links-data.test.ts web/__tests__/word-blocks-data.test.ts
git commit -m "feat(lexicon): data layer for candidates, entry creation, spellings and marker meanings" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Editor UI: lexicon panel, entry form, wiring

**Files:**
- Create: `web/components/word-link/EntryForm.tsx`, `web/components/word-link/LexiconPanel.tsx`
- Modify: `web/components/word-link/BlockPanel.tsx`, `web/components/word-link/WordLinkEditor.tsx`, `web/app/resources/[id]/relier/page.tsx`
- Test: `web/__tests__/word-link-panels.test.tsx` (extend; it already renders BlockPanel statically — read it first and keep its style: `renderToStaticMarkup`)

**Interfaces:**
- Consumes: Task 4 helpers, Task 5 data layer, `setLink`, `setKind`, `unlinkedMarkers`.
- Produces:
```tsx
// EntryForm.tsx
export function EntryForm(props: {
  kind: 'word' | 'marker'
  initial: EntryForm            // from emptyEntryForm
  canUseExample: boolean        // the verse has a French line
  busy: boolean
  error: string
  onSubmit: (form: EntryForm) => void
  onCancel: () => void
}): JSX.Element

// LexiconPanel.tsx
export function LexiconPanel(props: {
  client: SupabaseClient
  kind: 'word' | 'marker'
  words: string            // the block's Bété words ("ghèhi-wu")
  gloss: string            // the block's mot à mot ("au ciel"), '' for a solo marker
  dialect: Dialect         // default dialect of the resource
  meta: BlockMeta
  entry: LexSummary | null // the linked entry (from the editor cache)
  example: { bete: string; french: string; literal: string } | null
  signedIn: boolean
  onLink: (entry: LexSummary, senseId: string | null) => void   // also caches the entry
  onUnlink: () => void
}): JSX.Element
// BlockPanel props gain: client, dialect, entries: Record<string, LexSummary>, example, onEntry(entry), (and lose markers/onMarkerChange)
```

- [ ] **Step 1: Write the failing static-markup tests**

Extend `web/__tests__/word-link-panels.test.tsx` (use the file's existing imports/helpers; add a `LexiconPanel` render helper with a fake client `{ rpc: async () => ({ data: [], error: null }) } as never`). Static markup renders the initial state, before effects, so the tests pin the initial UI:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { LexiconPanel } from '@/components/word-link/LexiconPanel'
import { EntryForm } from '@/components/word-link/EntryForm'
import { emptyEntryForm } from '@/lib/lexicon-links'
import { EMPTY_META } from '@/lib/word-link-editor'
import type { LexSummary } from '@/lib/word-blocks'

const lex = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: 'S1', spellings: ['ghéhi-wu'], ...over,
})
const panel = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <LexiconPanel client={{ rpc: async () => ({ data: [], error: null }) } as never} kind="word" words="ghèhi-wu" gloss="au ciel"
      dialect="western" meta={EMPTY_META} entry={null} example={null} signedIn onLink={() => {}} onUnlink={() => {}} {...over} />,
  )

describe('LexiconPanel', () => {
  it('offers to search and create for an unlinked word', () => {
    const html = panel()
    expect(html).toContain('Lexique')
    expect(html).toContain('créer l’entrée')
  })
  it('shows the linked entry with its actions', () => {
    const html = panel({ entry: lex(), meta: { ...EMPTY_META, lexiconId: 'L1', translationId: 'S1' } })
    expect(html).toContain('ghèhi-wu')
    expect(html).toContain('ciel')
    expect(html).toContain('Délier')
    expect(html).toContain('Ajouter une graphie')
    expect(html).toContain('Ajouter un sens')
    expect(html).toContain('/lexicon/L1')
  })
  it('asks a signed-out visitor to sign in instead of offering writes', () => {
    expect(panel({ signedIn: false })).toContain('Connectez-vous')
  })
  it('shows the three free marker fields for a linked marker, with no dropdown', () => {
    const html = panel({
      kind: 'marker', gloss: '',
      entry: lex({ kind: 'marker', senses: [], senseId: null, marker: { type: null, meaning: null, french: null } }),
      meta: { ...EMPTY_META, isMarker: true, lexiconId: 'L1' },
    })
    expect(html).toContain('Type')
    expect(html).toContain('Ce qu’il indique')
    expect(html).toContain('Comment le français le rend')
    expect(html).not.toContain('<select')
    expect(html).toContain('sens à préciser')
  })
})

describe('EntryForm', () => {
  it('shows every lexical field of a word, seeded from the gloss', () => {
    const html = renderToStaticMarkup(
      <EntryForm kind="word" initial={emptyEntryForm('ghèhi-wu', 'au ciel', 'western')} canUseExample busy={false} error="" onSubmit={() => {}} onCancel={() => {}} />,
    )
    for (const label of ['Graphie', 'Transcription', 'Dialecte', 'Catégorie', 'Sens', 'Synonymes', 'Définition', 'Forme de base', 'Notes d’usage', 'phrase d’exemple']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('value="ciel"')
    expect(html).toContain('Particule')
  })
  it('hides the senses and the example for a marker, and the example when the verse has no French', () => {
    const marker = renderToStaticMarkup(
      <EntryForm kind="marker" initial={emptyEntryForm('ye', '', 'western')} canUseExample busy={false} error="" onSubmit={() => {}} onCancel={() => {}} />,
    )
    expect(marker).not.toContain('Synonymes')
    const noFrench = renderToStaticMarkup(
      <EntryForm kind="word" initial={emptyEntryForm('x', 'y', 'western')} canUseExample={false} busy={false} error="" onSubmit={() => {}} onCancel={() => {}} />,
    )
    expect(noFrench).not.toContain('phrase d’exemple')
  })
  it('shows an error message', () => {
    const html = renderToStaticMarkup(
      <EntryForm kind="word" initial={emptyEntryForm('x', 'y', 'western')} canUseExample busy={false} error="Écrivez la graphie du mot." onSubmit={() => {}} onCancel={() => {}} />,
    )
    expect(html).toContain('Écrivez la graphie du mot.')
  })
})
```

Also update the existing `BlockPanel` tests in that file: the props `markers` / `onMarkerChange` no longer exist; pass `client`, `dialect="western"`, `entries={{}}`, `example={null}`, `onEntry={() => {}}`; the old assertions about marker input fields move to the `LexiconPanel` tests above (delete the obsolete ones).

- [ ] **Step 2: Run to verify failure**

`npx vitest run word-link-panels` → FAIL (modules missing).

- [ ] **Step 3: Implement `EntryForm.tsx`**

Create `web/components/word-link/EntryForm.tsx`:

```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { DIALECTS, ENTRY_CATEGORIES, checkEntryForm, type Dialect, type EntryForm as EntryFormValues } from '@/lib/lexicon-links'

interface Props {
  kind: 'word' | 'marker'
  initial: EntryFormValues
  /** The verse has a French line, so it can be proposed as an example sentence. */
  canUseExample: boolean
  busy: boolean
  error: string
  onSubmit: (form: EntryFormValues) => void
  onCancel: () => void
}

const inputClass = 'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm'
const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  )
}

/** The whole lexical sheet of a new entry. Everything is optional except one spelling and (for a word) one sense. */
export function EntryForm({ kind, initial, canUseExample, busy, error, onSubmit, onCancel }: Props) {
  const [f, setF] = useState(initial)
  const [local, setLocal] = useState('')
  const set = (patch: Partial<EntryFormValues>) => setF(prev => ({ ...prev, ...patch }))
  const setSense = (i: number, patch: Partial<{ french: string; context: string }>) =>
    set({ senses: f.senses.map((s, k) => (k === i ? { ...s, ...patch } : s)) })

  function submit() {
    const problem = checkEntryForm(f, kind)
    setLocal(problem ?? '')
    if (!problem) onSubmit(f)
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <p className="text-sm font-semibold">{kind === 'word' ? 'Nouvelle entrée du lexique' : 'Nouveau marqueur grammatical'}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Graphie (alphabet latin)">
          <input className={inputClass} value={f.spelling} maxLength={100} onChange={e => set({ spelling: e.target.value })} />
        </Field>
        <Field label="Transcription (API / forme de la Bible, optionnel)">
          <input className={inputClass} value={f.ipa} maxLength={100} onChange={e => set({ ipa: e.target.value })} />
        </Field>
        <Field label="Dialecte">
          <select className={inputClass} value={f.dialect} onChange={e => set({ dialect: e.target.value as Dialect })}>
            {DIALECTS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </Field>
        {kind === 'word' && (
          <Field label="Catégorie">
            <select className={inputClass} value={f.category} onChange={e => set({ category: e.target.value })}>
              <option value="">—</option>
              {ENTRY_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {kind === 'word' && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold">Sens (le premier vient du mot à mot, sans article)</legend>
          {f.senses.map((s, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <Field label={i === 0 ? 'Mot en français' : `Sens ${i + 1}`}>
                <input className={inputClass} value={s.french} maxLength={200} onChange={e => setSense(i, { french: e.target.value })} />
              </Field>
              <Field label="Contexte (optionnel)">
                <input className={inputClass} value={s.context} maxLength={300} onChange={e => setSense(i, { context: e.target.value })} />
              </Field>
            </div>
          ))}
          <button type="button" className={btn} onClick={() => set({ senses: [...f.senses, { french: '', context: '' }] })}>
            Ajouter un sens
          </button>
        </fieldset>
      )}

      {kind === 'word' && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Synonymes (séparés par des virgules)">
            <input className={inputClass} value={f.synonyms} onChange={e => set({ synonyms: e.target.value })} />
          </Field>
          <Field label="Forme de base (infinitif, singulier…)">
            <input className={inputClass} value={f.lemma} maxLength={200} onChange={e => set({ lemma: e.target.value })} />
          </Field>
        </div>
      )}
      <Field label="Définition (optionnel)">
        <textarea className={inputClass} rows={2} value={f.description} maxLength={2000} onChange={e => set({ description: e.target.value })} />
      </Field>
      <Field label="Notes d’usage (optionnel)">
        <textarea className={inputClass} rows={2} value={f.notes} maxLength={2000} onChange={e => set({ notes: e.target.value })} />
      </Field>

      {kind === 'word' && canUseExample && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.useExample} onChange={e => set({ useExample: e.target.checked })} />
          Utiliser ce vers comme phrase d’exemple
        </label>
      )}

      {(local || error) && <p className="text-xs text-destructive" role="alert">{local || error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={submit}>
          {busy ? 'Création…' : 'Créer et lier'}
        </button>
        <button type="button" className={btn} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  )
}
```

The `"phrase d’exemple"` label text contains the curly apostrophe U+2019; the test strings use the same character (write both with `\u2019` if the editor flattens it: in JSX text use `{'\u2019'}`-free literal and verify with `grep -c "’" file`).

- [ ] **Step 4: Implement `LexiconPanel.tsx`**

Create `web/components/word-link/LexiconPanel.tsx`. Behaviour (all texts French, exactly these labels so the tests pass):

State: `candidates: Candidate[] | null` (null = loading/not searched), `sense: string` (selected sense id or `'new'`), `mode: 'choose' | 'create'`, `busy`, `error`, `spellingInput`, `showSpelling`, `senseInput`, `showSense`, marker fields `{type, meaning, french}`.

Effects: when `meta.lexiconId` is null and `signedIn`, run `findCandidates(client, { text: words, dialect, limit: 7 })` in an effect keyed by `words` + `kind` (ignore stale results with a cancelled flag); store rows.

Render, in order:

1. Header line `Lexique` (for a marker: `Lexique : marqueur grammatical`).
2. If `!signedIn`: `Connectez-vous pour relier ce mot au lexique.` and return.
3. **Linked** (`meta.lexiconId && entry`): card showing `entry.spelling` (+ `entry.ipa` in brackets, dialect), badge `Marqueur grammatical` for markers, for a word the sense list as radio buttons (`name="sense-<id>"`, checked = `meta.translationId`; changing calls `onLink(entry, id)`), a `Nouveau sens : « … »` radio is not needed once linked. Buttons: `Délier` (`onUnlink`), `Ajouter une graphie` (inline input + validate → `addSpelling`, then `getEntry` and `onLink(refreshed, meta.translationId)`), `Ajouter un sens` (word only; inline French + context → `addSense`, refresh the same way), link `Compléter la fiche` → `<a href={`/lexicon/${entry.id}`} target="_blank" rel="noopener noreferrer">`. List the entry's other spellings (`Autres graphies : …`). For a marker: the three free fields (below) instead of senses.
   - Marker fields: labels `Type (champ libre, ex : temps, aspect, mouvement)`, `Ce qu’il indique (ex : futur, en cours)`, `Comment le français le rend (ex : « aller + verbe » : je vais venir)`; plain `<input>`s, **no dropdown**, `maxLength` 100/300/300; initial values from `entry.marker`; a `Enregistrer le sens` button calls `setMarkerMeaning` then `getEntry` and `onLink(refreshed, null)`; when `entry.marker.meaning` is already set and the error is `meaning_already_set`, show the returned French message. Title `Marqueur grammatical` plus `, sens à préciser` when `entry.marker.meaning` is empty (class `border-dashed` as today). No explanatory sentence about leaving fields empty.
   - A linked entry whose `meta.lexiconId` is set but `entry` is null (deleted, or not in the cache yet) shows `Entrée du lexique introuvable` with `Délier`.
4. **Not linked, mode choose**: `groupCandidates(candidates ?? [], kind)`.
   - Loading line `Recherche dans le lexique…` while `candidates === null`.
   - For each `exact` candidate: card with spelling, dialect, senses (word: radio group of its senses plus a radio `Nouveau sens : « <senseSeed(gloss)> »` when `gloss` is non-empty and no sense has the same French, default selected = first sense whose French equals `senseSeed(gloss)` case-insensitively else first sense); button `Lier à cette entrée` → `onLink(entry, sense === 'new' ? await addSense-then-refresh : sense)`. For `'new'`: call `addSense(client, entry.id, {french: senseSeed(gloss), context: ''})` (pass the user id parameter if Task 5 required it), then `getEntry`, pick the sense whose French matches, then `onLink`. Marker: button `Lier à ce marqueur`, no sense selector.
   - For each `variants` candidate: card showing the matched form and `entry.spelling`; button `C’est le même mot : ajouter la graphie « <words> » et lier` → `addSpelling(client, entry.id, words)` (ignore the `spelling_exists` error, it means the work is already done), `getEntry`, then link as above (word: sense chosen like for exact; offer the same radio group).
   - `otherKind` non-empty: notice `Cette graphie existe déjà comme <marqueur grammatical | mot> : <spelling>. Vérifiez la nature du mot (« Mot » / « Marqueur grammatical ») ou proposez une correction depuis sa fiche.` with a `/lexicon/<id>` link; no link/create buttons for those.
   - If `candidates.length > 6` (it asked for 7): `D’autres entrées proches existent ; précisez la graphie pour les voir.` and only the first 6 rendered.
   - Buttons: `Mot différent : créer l’entrée` (word) / `Créer ce marqueur (sens à préciser plus tard)` (marker) → mode `create` (word) or immediate `createEntry` with `emptyEntryForm(words, '', dialect)` for a marker (then `onLink`). For a word also `Créer vite, avec le mot à mot seul` → immediate `createEntry({ form: emptyEntryForm(words, gloss, dialect), kind: 'word' })`; if `existed` and the returned entry's kind differs from the wanted kind show the other-kind notice instead of linking; otherwise `onLink(created.entry, created.entry.senseId ?? created.senseIds[0] ?? null)` — for a new word the sense is `senseIds[0]`.
5. **Mode create** (word only): `<EntryForm kind="word" initial={emptyEntryForm(words, gloss, dialect)} canUseExample={example !== null} … onSubmit={form => create(form)} />` where `create` calls `createEntry({ form, kind: 'word', example: form.useExample ? example : null })`, shows the French error on failure, and on success `onLink(created.entry, created.senseIds[0] ?? null)`. If `created.existed` and the entry kind is `marker`, show the other-kind notice.

Keep every `onLink` call passing a full `LexSummary` so the editor can cache it. Use the shared classes from BlockPanel (`inputClass`, `btn`). Export only `LexiconPanel`.

The static test renders the initial state only: the candidates effect runs in `useEffect` (never on the server) and `candidates` starts as `null`. While it is `null`, show the loading line **and already render the buttons** (they do not depend on the results), so the test finds `Mot différent : créer l’entrée` (asserted as `créer l’entrée`).

- [ ] **Step 5: Wire `BlockPanel.tsx`**

Replace the props and the marker section:

```tsx
interface Props {
  client: SupabaseClient
  draft: VerseDraft
  focus: Focus | null
  /** Entries the editor has seen (candidates created or linked here, or loaded with the verse), by id. */
  entries: Record<string, LexSummary>
  dialect: Dialect
  /** The verse as an example sentence, or null when the French line is not available. */
  example: { bete: string; french: string; literal: string } | null
  signedIn: boolean
  onEntry: (e: LexSummary) => void
  onChange: (d: VerseDraft) => void
  onFocus: (f: Focus | null) => void
}
```

Remove `markers`, `onMarkerChange`, `EMPTY_MARKER`, `normWord`, `MarkerDef` imports and `markerDef`. Replace the `{markerDef && (…)}` block with:

```tsx
          <LexiconPanel
            key={`${key}:${meta?.isMarker ? 'm' : 'w'}:${bWords}`}
            client={client}
            kind={meta?.isMarker ? 'marker' : 'word'}
            words={bWords}
            gloss={pair?.g ? blockWords(r.gw, pair.g.idx) : ''}
            dialect={dialect}
            meta={meta ?? EMPTY_META}
            entry={meta?.lexiconId ? (entries[meta.lexiconId] ?? null) : null}
            example={example}
            signedIn={signedIn}
            onLink={(entry, senseId) => {
              onEntry(entry)
              apply(setLink(draft, key, entry.id, senseId))
            }}
            onUnlink={() => apply(setLink(draft, key, null, null))}
          />
          {meta?.isMarker && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={meta.solo} onChange={e => apply(setMeta(draft, key, { solo: e.target.checked }))} />
              Aucun mot du mot à mot ne lui correspond
            </label>
          )}
```

Import `EMPTY_META`, `setLink` from `@/lib/word-link-editor`, `LexiconPanel`, `type LexSummary` from `@/lib/word-blocks`, `type Dialect` from `@/lib/lexicon-links`, `type SupabaseClient`. Keep `WordTools`, composition and note fields unchanged. The `Mot` / `Marqueur grammatical` switch still calls `setKind` (which now drops the link).

- [ ] **Step 6: Wire `WordLinkEditor.tsx` and the page**

In `WordLinkEditor.tsx`:

1. Props gain `region: string | null`, `frenchLines: string[] | null` (the non-empty lines of the French field when it has the same count as the Bété lines, else `null`), `signedIn: boolean`.
2. Remove: `collectMarkers`, `effectiveMarkers`, `pruneMarkerEdits`, `setMarkerEdit`, `MarkerDef` imports, `serverMarkers`, `markerEdits`, `seenServer`, `markers`, and `markerEdits` in the `beforeunload` effect (`anyDirty` uses drafts only; keep the deps `[drafts]`).
3. Add an entry cache:
```tsx
  // Entries known to the editor (loaded with the saved verses, or created/linked here), by id.
  const savedEntries = useMemo(() => {
    const m: Record<string, LexSummary> = {}
    for (const v of saved) for (const b of v.blocks) if (b.lex) m[b.lex.id] = b.lex
    return m
  }, [saved])
  const [localEntries, setLocalEntries] = useState<Record<string, LexSummary>>({})
  const entries = { ...savedEntries, ...localEntries }
```
   (A locally cached entry wins: it is the freshest one after "Ajouter une graphie".)
4. `save()`: `const payload = toSave(draft)` and guard before the call: `const open = unlinkedMarkers(draft); if (open.length) { setStatus(s => ({ ...s, [cur]: `Reliez chaque marqueur grammatical à une entrée du lexique : ${open.join(', ')}.` })); return }`.
5. Disable the save button also when `unlinkedMarkers(draft).length > 0` and show next to it `Un marqueur n’est pas encore relié au lexique.`.
6. `<BlockPanel … client={supabaseRef.current} entries={entries} dialect={dialectForRegion(region)} signedIn={signedIn} example={frenchLines ? { bete: draft.bete, french: frenchLines[cur] ?? '', literal: draft.literal } : null} onEntry={e => setLocalEntries(m => ({ ...m, [e.id]: e }))} … />`. The example's `bete`/`literal` are the **current draft lines**; the database stores them as the example snippets.

In `web/app/resources/[id]/relier/page.tsx` compute and pass:

```tsx
  const frenchLines = text.content_french ? nonEmptyLines(text.content_french) : null
  …
  <WordLinkEditor
    …
    region={text.region ?? null}
    frenchLines={frenchLines && frenchLines.length === nonEmptyLines(text.content_bete).length ? frenchLines : null}
    signedIn
  />
```

(`text.region` exists on the community text; if `getCommunityText` does not select it, add it to that select in `web/lib/community.ts` and the `CommunityText` type — read the file and follow its style.)

- [ ] **Step 7: Run tests and types**

`npx vitest run word-link` → PASS (editor, panels). `npx tsc --noEmit` → no errors at all now. `npx eslint web/components/word-link web/lib` (from the repo root, or `npm run lint` in `web/`) → no new errors.

- [ ] **Step 8: Manual check in the browser**

Start the dev stack the way the project does (`npm run dev` in `web/` against the local Supabase; if the repo path is too deep for Turbopack, see the notes in Global Constraints — a short junctioned copy is NOT allowed under the no-worktree policy, so run `npx next dev --webpack` instead). Sign in as a user, open a resource with a mot à mot at `/resources/<id>/relier`, and check: typing a spelling finds a variant; "Créer vite" creates and links; "Mot différent" opens the form with the first sense `ciel` for the gloss `au ciel`; switching a block to "Marqueur grammatical" offers "Créer ce marqueur"; saving a verse with an unlinked marker is blocked with the message; after saving, reload and the links are still there. Note anything that does not behave; fix before committing. If the dev server cannot run in this environment, say so in the final report instead of claiming it was checked.

- [ ] **Step 9: Commit**

```bash
git branch --show-current   # must print: master
git add web/components/word-link/EntryForm.tsx web/components/word-link/LexiconPanel.tsx web/components/word-link/BlockPanel.tsx web/components/word-link/WordLinkEditor.tsx "web/app/resources/[id]/relier/page.tsx" web/__tests__/word-link-panels.test.tsx
git add web/lib/community.ts 2>/dev/null || true
git commit -m "feat(lexicon): lexicon panel and entry form in the word-link editor" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reader: dictionary part, marker meaning inline

**Files:**
- Modify: `web/components/VerseWords.tsx`
- Modify: `web/__tests__/verse-words.test.tsx`
- Modify (if they build tokens/blocks with markers): `web/__tests__/verse-translation-words.test.tsx`, `web/__tests__/verse-translation-literal-toggle.test.tsx`

**Interfaces:**
- Consumes: `ReaderToken.lex`, `LexSummary`, `setMarkerMeaning`, `createClient` from `@/lib/supabase-browser`.
- Produces: `VerseWords` props gain optional `canEditMarkers?: boolean` (signed-in reader; the page that renders the verse passes it — default `false`, so server rendering and tests need no auth). Internally `WordDetail` shows a dictionary part.

- [ ] **Step 1: Write the failing tests**

In `web/__tests__/verse-words.test.tsx` (use its existing `verse` fixture builders; open `initialOpen={0}` as the existing tests do) add:

```tsx
const entry = (over = {}) => ({
  id: 'L1', kind: 'word' as const, spelling: 'ghèhi-wu', ipa: 'ɡɛ̀hiwu', dialect: 'western', pos: ['noun'],
  description: 'Le lieu en haut.', synonyms: ['firmament'], marker: { type: null, meaning: null, french: null },
  senses: [{ id: 'S1', french: 'ciel', context: 'en haut' }, { id: 'S2', french: 'haut', context: null }],
  senseId: 'S1', spellings: ['ghéhi-wu'], ...over,
})
const oneBlock = (lex: unknown, extra: Record<string, unknown> = {}) => ({
  verse_no: 1, stale: false, bete_line: 'ghèhi-wu', literal_line: 'au ciel',
  blocks: [{ position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null, lex, ...extra }],
})

it('shows the dictionary part of a linked word, the sense used first', () => {
  const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry()) as never} mode="B" initialOpen={0} />)
  expect(html).toContain('Nom')
  expect(html).toContain('ɡɛ̀hiwu')
  expect(html).toContain('Le lieu en haut.')
  expect(html).toContain('firmament')
  expect(html).toContain('ghéhi-wu')
  expect(html).toContain('/lexicon/L1')
  expect(html.indexOf('ciel')).toBeLessThan(html.indexOf('haut</'))
  expect(html).toContain('data-current-sense')
})

it('says an unlinked word is not in the lexicon yet', () => {
  expect(renderToStaticMarkup(<VerseWords verse={oneBlock(null) as never} mode="B" initialOpen={0} />)).toContain('Pas encore dans le lexique')
})

it('shows a marker from its entry, and "sens à préciser" when empty', () => {
  const m = entry({ kind: 'marker', senses: [], senseId: null, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe' } })
  const withMeaning = renderToStaticMarkup(
    <VerseWords verse={oneBlock(m, { is_marker: true, marker: m.marker }) as never} mode="B" initialOpen={0} />,
  )
  expect(withMeaning).toContain('Marqueur grammatical')
  expect(withMeaning).toContain('temps : futur')
  expect(withMeaning).toContain('aller + verbe')
  const empty = entry({ kind: 'marker', senses: [], senseId: null })
  const html = renderToStaticMarkup(
    <VerseWords verse={oneBlock(empty, { is_marker: true, marker: empty.marker }) as never} mode="B" initialOpen={0} />,
  )
  expect(html).toContain('sens à préciser')
  expect(html).not.toContain('Préciser le sens')
  const editable = renderToStaticMarkup(
    <VerseWords verse={oneBlock(empty, { is_marker: true, marker: empty.marker }) as never} mode="B" initialOpen={0} canEditMarkers />,
  )
  expect(editable).toContain('Préciser le sens')
})

it('treats a marker block whose entry was deleted as meaning-less', () => {
  const html = renderToStaticMarkup(
    <VerseWords verse={oneBlock(null, { is_marker: true, marker: null }) as never} mode="B" initialOpen={0} />,
  )
  expect(html).toContain('sens à préciser')
})
```

Remove or adjust the old assertions that expected the marker section to depend only on `tk.marker` (they still pass because `marker` is kept; run to see).

- [ ] **Step 2: Run to verify failure**

`npx vitest run verse-words` → FAIL on the new tests.

- [ ] **Step 3: Implement the dictionary part**

In `web/components/VerseWords.tsx`:

1. Props: add `canEditMarkers?: boolean`; pass it to `WordDetail` and from there to a new `MarkerForm`.
2. After the existing note/composition lines and before/instead of the marker block, render:

```tsx
function DictionaryPart({ tk }: { tk: ReaderToken }) {
  const lex = tk.lex
  if (!lex) {
    return tk.isMarker ? null : <p className="border-t border-border pt-1.5 text-xs text-muted-foreground">Pas encore dans le lexique.</p>
  }
  if (lex.kind === 'marker') return null // shown by the marker block below
  const senses = [...lex.senses].sort((a, b) => Number(b.id === lex.senseId) - Number(a.id === lex.senseId))
  return (
    <div className="space-y-1 border-t border-border pt-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Dans le lexique</span>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <strong>{lex.spelling}</strong>
        {lex.ipa && <span className="text-muted-foreground">[{lex.ipa}]</span>}
        {lex.pos[0] && <span className="rounded border border-border px-1.5 text-xs">{POS_LABELS[lex.pos[0]] ?? lex.pos[0]}</span>}
      </p>
      <ul className="list-disc pl-5">
        {senses.map(s => (
          <li key={s.id} data-current-sense={s.id === lex.senseId ? 'true' : undefined} className={cn(s.id === lex.senseId && 'font-semibold')}>
            {s.french}
            {s.context && <span className="font-normal text-muted-foreground"> ({s.context})</span>}
          </li>
        ))}
      </ul>
      {lex.description && <p>{lex.description}</p>}
      {lex.synonyms.length > 0 && <p className="text-xs text-muted-foreground">Synonymes : {lex.synonyms.join(', ')}</p>}
      {lex.spellings.length > 0 && <p className="text-xs text-muted-foreground">Autres graphies : {lex.spellings.join(', ')}</p>}
      <a href={`/lexicon/${lex.id}`} className="text-xs text-primary underline underline-offset-2">Voir la fiche du lexique</a>
    </div>
  )
}
```

Define `POS_LABELS` at the top of the file (same labels as `LexiconEntry.tsx` plus `part: 'Particule'`; copy the object, do not import a component file for it). Render `<DictionaryPart tk={tk} />` inside `WordDetail`.

3. Marker block: use `const mk = tk.lex?.kind === 'marker' ? tk.lex.marker : tk.marker` (entry first, legacy `marker` as fallback). Keep the existing text (`Marqueur grammatical`, `type : meaning`, `En français : …`, else `Marqueur grammatical, sens à préciser.`). When the meaning is empty, `canEditMarkers` is true and `tk.lex?.kind === 'marker'`, also render `<MarkerForm lexId={tk.lex.id} />`:

```tsx
function MarkerForm({ lexId }: { lexId: string }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ type: '', meaning: '', french: '' })
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  if (done) return <p className="text-xs text-primary">Merci ! Le sens apparaîtra au prochain chargement.</p>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
        Préciser le sens
      </button>
    )
  }
  const field = (k: 'type' | 'meaning' | 'french', label: string, max: number) => (
    <label className="block space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <input className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground" value={v[k]} maxLength={max} onChange={e => setV({ ...v, [k]: e.target.value })} />
    </label>
  )
  return (
    <div className="space-y-2">
      {field('type', 'Type (ex : temps, aspect, mouvement)', 100)}
      {field('meaning', 'Ce qu’il indique (ex : futur)', 300)}
      {field('french', 'Comment le français le rend', 300)}
      {msg && <p className="text-xs text-destructive" role="alert">{msg}</p>}
      <button
        type="button"
        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
        onClick={async () => {
          const res = await setMarkerMeaning(createClient(), lexId, v)
          if (res.error) setMsg(res.error)
          else setDone(true)
        }}
      >
        Enregistrer
      </button>
    </div>
  )
}
```

Imports: `setMarkerMeaning` from `@/lib/lexicon-links-data`, `createClient` from `@/lib/supabase-browser`. Where the meaning is already set and `canEditMarkers`, the existing correction box is out of scope here: the marker block ends with a link `Proposer une correction` to `/lexicon/<id>` (the corrections UI of the lexicon page covers the four new fields from Task 3).

4. `glossOf` / detail headline: for a marker, use `tk.lex?.kind === 'marker' ? tk.lex.marker.meaning : tk.marker?.meaning`. For a word with a sense the reader may want the sense: no change (the gloss stays the exact *mot à mot*).

5. Find the page(s) that render `VerseTranslation` → `VerseWords` for a resource (`web/app/resources/[id]/page.tsx` and `VerseTranslation.tsx`): thread an optional `canEditMarkers` prop from the page (`Boolean(user)`) down to `VerseWords`. Read both files and add the prop in their existing style; the default stays `false`.

- [ ] **Step 4: Run tests and types**

`npx vitest run verse-words verse-translation` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/components/VerseWords.tsx web/__tests__/verse-words.test.tsx web/__tests__/verse-translation-words.test.tsx web/__tests__/verse-translation-literal-toggle.test.tsx web/components/VerseTranslation.tsx "web/app/resources/[id]/page.tsx"
git commit -m "feat(lexicon): dictionary part in the reader's word detail and inline marker meaning" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Stage only the test/page files you actually changed.)

---

### Task 8: Reader audits, pilot test, full verification, rollout stop

**Files:**
- Modify: `web/app/lexicon/page.tsx`, `web/app/sitemap.ts`, `web/components/PendingContributions.tsx`, `web/app/lexicon/[id]/page.tsx`, `web/components/LexiconEntry.tsx`
- Modify: `web/__tests__/rls/resource-word-links-pilot.test.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Lexicon readers ignore empty markers**

1. `web/app/lexicon/page.tsx` (query at ~line 166): add after `.neq('bete_phonetic', '')`:
```ts
        // A marker appears once someone has said what it indicates.
        .or('entry_kind.eq.word,marker_meaning.not.is.null')
```
   Careful: the same query later chains `q = q.or(\`bete_phonetic.ilike…\`)` for letters — a second `.or` on a PostgREST builder ANDs with the first, which is what we want. Run the letter filter manually once to confirm.
2. `web/app/sitemap.ts` (line ~35): `supabase.from('lexicon').select('id, bete_word, bete_phonetic').or('entry_kind.eq.word,marker_meaning.not.is.null').limit(50000)`.
3. `web/components/PendingContributions.tsx` (line ~56): add `.eq('entry_kind', 'word')` before `.order(`.
4. `web/app/lexicon/[id]/page.tsx`: in `generateMetadata`, make the page `noindex` when `entry.entry_kind === 'marker' && !entry.marker_meaning` (extend the existing "not yet translated" condition at ~line 57, same `robots: { index: false, follow: true }`). In the page body, for `entry.entry_kind === 'marker'` render a `Marqueur grammatical` badge and the three fields (type, what it indicates, how French renders it — the same labels as the editor) when set, or `Sens à préciser` otherwise. The existing translation list and corrections UI stay; check the file's header query: it selects `*`, so the new columns are already there. Add the marker fields to the correctable fields UI only if the page lists them explicitly (it uses `CorrectionBox` from `lib/corrections.ts`, which now knows them).
5. `web/components/LexiconEntry.tsx`: add `part: 'Particule'` to `POS_LABELS`; also add it to the same map in `PendingContributions.tsx`.
6. `match_lexicon` / `match_lexicon_by_french` need no change: they require an embedding (or French text) and the new entries have none. Verify with one query in psql: `select count(*) from match_lexicon_by_french('ciel', null)` style call is not required; instead run `grep -rn "match_lexicon" supabase/migrations | head` and confirm in the final report that neither function reads rows without an embedding / with `entry_kind = 'marker'` (a marker has `top_french = ''`). If `match_lexicon_by_french` matches on `top_french`/`french_candidates` it cannot match a marker's empty values; if it matches on `lexicon_translations`, markers have none.

- [ ] **Step 2: Extend the Notre Père pilot**

Open `web/__tests__/rls/resource-word-links-pilot.test.ts` (it saves the five Notre Père verses and reads them back anonymously; read it first). Make it compile and pass with the new functions:
1. Remove anything touching `resource_word_markers` or sending a `marker` object in a block.
2. After the existing verse-1 save, add the lexicon scenario: create the owner's entries via `create_lexicon_entry` (*ghèhi-wu* with senses `ciel`/`haut`, *wu* with senses `est`/`lieu`), save verse 1 again with those blocks carrying `lexicon_id` and the right `translation_id` (use the sense returned for the French that matches the block's *mot à mot* seed), add the spelling *ghéhi-wu* with `add_lexicon_spelling`, then assert anonymously: `find_lexicon_candidates('ghéhi-wu')` returns the entry as `exact` (extra spelling) and `find_lexicon_candidates('rhéhi-wu')` returns it as `near`; `get_resource_words` returns for the *ghèhi-wu* block `lex.spellings` containing `ghéhi-wu` and `lex.sense_id` equal to the chosen sense.
3. Flag *ye* as a marker in a second resource: create a marker entry (`p_kind: 'marker'`, no senses), save a verse with `is_marker: true, solo: true, lexicon_id`, call `set_marker_meaning` as a different signed-in user (the first fill is open to anyone), read back anonymously and assert `blocks[i].marker` equals the meaning and `lex.kind === 'marker'`.
4. Keep the existing assertions that the five verses come back with 84 blocks.

Use `createEntry`-style helpers local to the test (`rpc` calls through the signed-in client); do not import from the app code except `splitWords`/`normWord` as the file already does.

- [ ] **Step 3: Full verification**

Run, from `web/`:
1. Apply the migration once more on the local DB (proves re-runnability: it must succeed twice in a row with no error).
2. `npx tsc --noEmit` → clean.
3. `npx vitest run` → all unit tests pass.
4. RLS files one at a time (signup limit): `lexicon-from-word-links`, `resource-word-links`, `resource-word-links-pilot`, `search-lexicon`, `corrections`, `corrections-helpers`, `lexicon-translations`, `function-grants`, `resources-community`. All must pass. `function-grants` checks that new functions are not callable by the wrong roles: if it lists functions explicitly and fails because the new ones are missing, add `lexicon_summary` (no client may call it) and the five client functions with their roles to that test, matching its style.
5. `npm run lint` → no new errors; `npm run build` → succeeds (this also type-checks the pages).
6. Production dry check without writing: using the Supabase MCP `execute_sql` on project `agdqbzbjcxrzfhkvempe`, run **read-only** queries only: `select count(*) from resource_word_markers;` (expect 0 — the table is dropped by the migration, so this must still be 0 before the rollout) and `select count(*) from lexicon;` (expect 0). If either is not 0, stop and report: the spec assumed nothing to migrate.

- [ ] **Step 4: Commit**

```bash
git branch --show-current   # must print: master
git status
git add web/app/lexicon/page.tsx web/app/sitemap.ts web/components/PendingContributions.tsx "web/app/lexicon/[id]/page.tsx" web/components/LexiconEntry.tsx web/__tests__/rls/resource-word-links-pilot.test.ts
git add web/__tests__/rls/function-grants.test.ts 2>/dev/null || true
git commit -m "feat(lexicon): readers ignore empty markers, marker page, pilot covers entries and markers" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Stop for the production rollout**

Do **not** apply anything to production and do not push. Report to the user: what was built, what was verified (list the commands and results), anything not verified (the browser check if the dev server could not run), and the rollout steps they run by hand:
1. In the Supabase SQL editor of project `agdqbzbjcxrzfhkvempe` (check the ref in the URL), paste and run `supabase/migrations/20261008000000_lexicon_from_word_links.sql`.
2. Then `notify pgrst, 'reload schema';`.
3. Then push `master` so Vercel deploys the new frontend (the old frontend keeps working against the new functions; the new one needs the migration).
Optional leftover for them: `drop schema archive cascade;` when the archived lexicon is no longer wanted.

---

## Self-Review (done while writing)

**Spec coverage.** Data model 1 (columns, insert guard; update guard unchanged and tested in Task 1), 2 (spellings table, norm trigger, trigram index, RLS, delete rule), 3 (block columns, `set null`, marker table dropped, `marker` object kept), 4 (all functions incl. changed `save_resource_verse` / `get_resource_words`; `get_lexicon_entry` is an addition the editor needs to refresh a summary), 5 (allow-list + TS mirror + corrections test, `search_lexicon`, list/sitemap/Pending/detail page; translator RPCs audited in Task 8 step 1.6). Web: pure helpers (Task 4), data layer (Task 5), editor panel/form/marker flow/state/example/dialect default (Task 6), reader dictionary + marker inline form (Task 7). Edge cases: other-kind notice (Task 4 + 6), concurrent create (Task 2), deleted entry/sense (Task 3, 7), no mot à mot (editor unchanged), many candidates (limit 7, show 6). Testing section: every listed RLS group has a test; pilot extended (Task 8). Rollout: Task 8 step 5.

**Decisions taken where the spec left room.** A marker block must have an entry before the verse can be saved (editor blocks the save and says which marker; the database refuses with `marker_needs_entry`). "Compléter la fiche" opens the entry page in a new tab (the lexicon page already has editing and corrections); only "Ajouter une graphie" and "Ajouter un sens" write from the panel. `create_lexicon_entry` also returns `entry` so the editor needs no second round trip; `get_lexicon_entry` refreshes a summary after a spelling or sense is added.

**Placeholder scan.** No TBD/TODO. Two spots tell the executor to read a file first because its content was not visible while planning, with the exact rule to apply: `LexiconTranslations.tsx` payload for `addSense` (Task 5 step 4 note), `getCommunityText` select for `region` (Task 6 step 6). Both end in a concrete edit.

**Type consistency.** `LexSummary.senseId` (TS) ↔ `sense_id` (SQL, mapped in `parseLex`); `BlockMeta.lexiconId/translationId` ↔ `BlockInput.lexicon_id/translation_id`; `Candidate.entry: LexSummary`; `setLink(d, key, lexiconId, translationId)`; `createEntry` returns `{id, existed, senseIds, entry}` ↔ SQL `sense_ids`; `LexiconPanel.onLink(entry, senseId)` ↔ `setLink`. `toSave(d)` has no second argument everywhere after Task 4.
