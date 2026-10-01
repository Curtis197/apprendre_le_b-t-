# Lexicon Translations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bété word can carry several French translations (each with an optional context) and a description, has a real detail page, and is searchable from Bété (both forms) and French; lexicon voting is removed.

**Architecture:** A new `lexicon_translations` table (community-owned CRUD, guard trigger, same pattern as `resource_comments`) with a trigger keeping `lexicon.top_french` equal to the primary translation, so the translator and every other reader are untouched. Column-level protection on `lexicon` moves into a `before update` guard trigger. One SQL function `search_lexicon` serves all search UIs. The UI gets two small client components (translations, description) on the existing server-rendered detail page.

**Tech Stack:** Next.js 16 (App Router, `params` is a Promise), React 19, Supabase (Postgres + RLS), vitest (unit: `npm test`; RLS: `npm run test:rls`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-10-01-lexicon-translations-design.md`

## Global Constraints

- Read the relevant guide in `web/node_modules/next/dist/docs/` before changing any route/page file (`web/AGENTS.md`: this is not the Next.js you know).
- Column naming is inverted: `lexicon.bete_word` = IPA/Bible form, `lexicon.bete_phonetic` = western Latin form (everyday). Latin form is the primary display.
- Untranslated placeholders have `bete_phonetic = ''` and `bete_word` starting with `_pending_`; never show `_pending_…` text; keep them noindexed and out of the `/lexicon` list and search.
- UI copy is French. Match surrounding component style (shadcn `Button`/`Input`/`Textarea`/`Badge`/`Card`, `font-heading`, `text-muted-foreground`).
- Browser support floor is Safari 16.1: no new CSS features beyond what existing components already use.
- RLS and guard triggers must test `current_user <> 'authenticated'` (not `auth.uid()`) to let the service role and `security definer` functions through.
- Local DB: container `supabase_db_agdqbzbjcxrzfhkvempe` (default ports 54321/54322). Apply SQL with `docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < <file>` from the repo root. Re-check `docker ps` first; ports vary.
- The working tree has unrelated uncommitted resources work (`web/lib/community*.ts`, `web/lib/types.ts`, `supabase/migrations/20260930000005_*`, `web/__tests__/rls/resources-community.test.ts`). Never `git add -A`; add explicit paths only. `web/lib/types.ts` is one of those already-modified files: stage it only with `git add -p` limited to the Task 3 hunks, or ask the user to commit their resources work first.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Do not drop the `lexicon.upvotes` column or the vote RPC's lexicon branch.

## Review Focus

1. A signed-in user filling an untranslated placeholder (homepage "mot du jour" → `/contribute?id=`) must still work after the `lexicon` guard (Task 1 test "claims a placeholder").
2. Deleting the primary translation moves `top_french` to the next one; deleting the last one leaves `top_french` (the translator reads it) (Task 1).
3. Search input `%`, `_`, `\`, blank, accented and upper-case text must not leak wildcards, error, or miss accent variants (Task 2).
4. Signed-out visitors see the detail page, translations and description, but no add/edit/delete controls (Task 4 manual check).
5. Adding the same translation twice (differing only in case/spacing) gives a French "existe déjà" message, not a raw SQL error (Task 3 test).

## File Structure

- Create `supabase/migrations/20261001000000_lexicon_translations.sql`: table, RLS, triggers, backfill, description column, lexicon guard.
- Create `supabase/migrations/20261001000001_search_lexicon.sql`: `unaccent` + `search_lexicon`.
- Create `web/__tests__/rls/lexicon-translations.test.ts`, `web/__tests__/rls/search-lexicon.test.ts`.
- Modify `web/lib/lexicon.ts`: pure helpers (validation, labels). Create `web/__tests__/lexicon.test.ts`.
- Create `web/lib/lexicon-mutations.ts`, `web/lib/lexicon-search.ts` (+ `web/__tests__/lexicon-search.test.ts`).
- Modify `web/lib/types.ts`: `description`, `LexiconTranslation`.
- Create `web/components/LexiconTranslations.tsx`, `web/components/LexiconDescription.tsx`.
- Modify `web/components/LexiconEntry.tsx`, `web/app/lexicon/[id]/page.tsx`, `web/components/WordCard.tsx`, `web/app/lexicon/page.tsx`, `web/components/HeaderSearch.tsx`, `web/components/PendingContributions.tsx`, `web/components/ContributionForm.tsx`, `web/lib/contribution.ts` (+ `web/__tests__/contribution.test.ts`).
- Delete `web/components/LexiconSearch.tsx` (unused; superseded by `search_lexicon` callers).

Setup (once): `git switch -c feat/lexicon-translations` (confirm with the user how to treat the uncommitted resources changes first).

---

### Task 1: Translations table, description, lexicon guard (database)

**Files:**
- Create: `supabase/migrations/20261001000000_lexicon_translations.sql`
- Test: `web/__tests__/rls/lexicon-translations.test.ts`

**Interfaces:**
- Produces: table `lexicon_translations(id, lexicon_id, french, context, position, author_name, created_by, created_at, updated_at)`; column `lexicon.description`, `lexicon.updated_at`; every inserted `lexicon` row gets a position-0 translation from `top_french`; `lexicon.top_french` follows the primary translation.

- [x] **Step 1: Write the failing RLS test**

```ts
// web/__tests__/rls/lexicon-translations.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, uid, type TestUser } from './helpers'

async function seedWord(extra: Record<string, unknown> = {}) {
  const tag = uid()
  return must(
    await admin
      .from('lexicon')
      .insert({
        bete_word: `ɓa-${tag}`,
        bete_phonetic: `ba-${tag}`,
        french_candidates: [],
        top_french: `manger-${tag}`,
        probability: 1,
        pos: ['verb'],
        ...extra,
      })
      .select('id, top_french')
      .single(),
    'seed word',
  )
}

const tr = (lexiconId: string, userId: string, extra: Record<string, unknown> = {}) => ({
  lexicon_id: lexiconId,
  created_by: userId,
  french: 'se nourrir',
  ...extra,
})

const topFrench = async (id: string) =>
  (await admin.from('lexicon').select('top_french').eq('id', id).single()).data?.top_french

describe('lexicon: translations, description, guard', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser

  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([
      createUser('lex-alice'),
      createUser('lex-bob'),
      createUser('lex-boss'),
    ])
    await makeAdmin(boss.id)
  })

  describe('translations', () => {
    it('gives every new word a first translation copied from top_french', async () => {
      const w = await seedWord()
      const { data } = await admin.from('lexicon_translations').select('french, position').eq('lexicon_id', w.id)
      expect(data).toEqual([{ french: w.top_french, position: 0 }])
    })

    it('lets a signed-in user add a translation with a context, readable by everyone', async () => {
      const w = await seedWord()
      const row = must(
        await alice.client
          .from('lexicon_translations')
          .insert(tr(w.id, alice.id, { context: 'au sens de : se nourrir' }))
          .select('id, position, author_name, context')
          .single(),
        'alice adds',
      )
      expect(row.position).toBe(1)
      expect(row.context).toBe('au sens de : se nourrir')
      const { data: profile } = await admin.from('profiles').select('name').eq('id', alice.id).single()
      expect(row.author_name).toBe(profile!.name)

      const { data } = await anonClient().from('lexicon_translations').select('id').eq('id', row.id)
      expect(data).toHaveLength(1)
    })

    it('ignores a client-supplied position and author name', async () => {
      const w = await seedWord()
      const row = must(
        await alice.client
          .from('lexicon_translations')
          .insert(tr(w.id, alice.id, { position: 99, author_name: 'Faux nom' }))
          .select('position, author_name')
          .single(),
        'alice adds',
      )
      expect(row.position).toBe(1)
      expect(row.author_name).not.toBe('Faux nom')
    })

    it('refuses anonymous inserts and inserts in someone else’s name', async () => {
      const w = await seedWord()
      expect((await anonClient().from('lexicon_translations').insert(tr(w.id, alice.id))).error).not.toBeNull()
      expect((await bob.client.from('lexicon_translations').insert(tr(w.id, alice.id))).error).not.toBeNull()
    })

    it('rejects blank and over-long text', async () => {
      const w = await seedWord()
      const ins = (extra: Record<string, unknown>) =>
        alice.client.from('lexicon_translations').insert(tr(w.id, alice.id, extra))
      expect((await ins({ french: '   ' })).error).not.toBeNull()
      expect((await ins({ french: 'x'.repeat(201) })).error).not.toBeNull()
      expect((await ins({ context: 'x'.repeat(301) })).error).not.toBeNull()
    })

    it('rejects a duplicate that differs only by case or spacing, but allows the same word in another context', async () => {
      const w = await seedWord()
      must(await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id, { french: 'Voyager' })).select('id').single(), 'first')
      const dup = await bob.client.from('lexicon_translations').insert(tr(w.id, bob.id, { french: '  voyager ' }))
      expect(dup.error?.code).toBe('23505')
      const other = await bob.client
        .from('lexicon_translations')
        .insert(tr(w.id, bob.id, { french: 'voyager', context: 'en parlant d’un bateau' }))
      expect(other.error).toBeNull()
    })

    it('lets the author edit text and context but nothing else', async () => {
      const w = await seedWord()
      const other = await seedWord()
      const row = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id)).select('id, author_name, created_at').single(),
        'create',
      )
      await alice.client
        .from('lexicon_translations')
        .update({
          french: 'dévorer',
          context: 'familier',
          lexicon_id: other.id,
          created_by: bob.id,
          position: 7,
          author_name: 'Faux nom',
        })
        .eq('id', row.id)
      const { data } = await admin.from('lexicon_translations').select('*').eq('id', row.id).single()
      expect(data?.french).toBe('dévorer')
      expect(data?.context).toBe('familier')
      expect(data?.lexicon_id).toBe(w.id)
      expect(data?.created_by).toBe(alice.id)
      expect(data?.position).toBe(1)
      expect(data?.author_name).toBe(row.author_name)
      expect(data?.created_at).toBe(row.created_at)
    })

    it('does not let someone else edit or delete it; the author and an admin can delete', async () => {
      const w = await seedWord()
      const mine = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id)).select('id').single(),
        'create',
      )
      await bob.client.from('lexicon_translations').update({ french: 'piraté' }).eq('id', mine.id)
      await bob.client.from('lexicon_translations').delete().eq('id', mine.id)
      await anonClient().from('lexicon_translations').delete().eq('id', mine.id)
      expect((await admin.from('lexicon_translations').select('french').eq('id', mine.id)).data).toEqual([
        { french: 'se nourrir' },
      ])

      await alice.client.from('lexicon_translations').delete().eq('id', mine.id)
      expect((await admin.from('lexicon_translations').select('id').eq('id', mine.id)).data).toEqual([])

      const other = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id, { french: 'autre' })).select('id').single(),
        'create',
      )
      await boss.client.from('lexicon_translations').delete().eq('id', other.id)
      expect((await admin.from('lexicon_translations').select('id').eq('id', other.id)).data).toEqual([])
    })

    it('keeps top_french on the primary translation, and never blanks it', async () => {
      const w = await seedWord()
      const added = must(
        await alice.client.from('lexicon_translations').insert(tr(w.id, alice.id)).select('id').single(),
        'add',
      )
      expect(await topFrench(w.id)).toBe(w.top_french)

      // admin removes the seeded primary → alice's translation becomes primary
      await boss.client.from('lexicon_translations').delete().eq('lexicon_id', w.id).eq('position', 0)
      expect(await topFrench(w.id)).toBe('se nourrir')

      // removing the last translation leaves top_french alone (the translator reads it)
      await alice.client.from('lexicon_translations').delete().eq('id', added.id)
      expect(await topFrench(w.id)).toBe('se nourrir')
    })

    it('removes translations when the word is deleted', async () => {
      const w = await seedWord()
      await admin.from('lexicon').delete().eq('id', w.id)
      expect((await admin.from('lexicon_translations').select('id').eq('lexicon_id', w.id)).data).toEqual([])
    })
  })

  describe('lexicon update guard', () => {
    it('lets a signed-in user write the description and records the edit time', async () => {
      const w = await seedWord()
      const before = (await admin.from('lexicon').select('updated_at').eq('id', w.id).single()).data!.updated_at
      await new Promise(r => setTimeout(r, 20))
      const res = await alice.client.from('lexicon').update({ description: 'Prendre un repas.' }).eq('id', w.id)
      expect(res.error).toBeNull()
      const { data } = await admin.from('lexicon').select('description, updated_at').eq('id', w.id).single()
      expect(data?.description).toBe('Prendre un repas.')
      expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime())
    })

    it('refuses an over-long description and anonymous edits', async () => {
      const w = await seedWord()
      expect((await alice.client.from('lexicon').update({ description: 'x'.repeat(2001) }).eq('id', w.id)).error).not.toBeNull()
      await anonClient().from('lexicon').update({ description: 'piraté' }).eq('id', w.id)
      expect((await admin.from('lexicon').select('description').eq('id', w.id).single()).data?.description).toBeNull()
    })

    it('does not let a client change the Bété forms, the primary French, the score or validation of a translated word', async () => {
      const w = await seedWord()
      await alice.client
        .from('lexicon')
        .update({ bete_phonetic: 'piraté', bete_word: 'piraté', top_french: 'piraté', upvotes: 50, validated: true, description: 'ok' })
        .eq('id', w.id)
      const { data } = await admin.from('lexicon').select('*').eq('id', w.id).single()
      expect(data?.description).toBe('ok')
      expect(data?.bete_phonetic).toMatch(/^ba-/)
      expect(data?.bete_word).toMatch(/^ɓa-/)
      expect(data?.top_french).toBe(w.top_french)
      expect(data?.upvotes).toBe(0)
      expect(data?.validated).toBe(false)
    })

    it('claims a placeholder: a signed-in user can fill in the Bété forms of an untranslated word', async () => {
      const tag = uid()
      const ph = must(
        await admin
          .from('lexicon')
          .insert({
            bete_word: `_pending_${tag}`,
            bete_phonetic: '',
            french_candidates: [],
            top_french: `chien-${tag}`,
            probability: 1,
          })
          .select('id')
          .single(),
        'seed placeholder',
      )
      const res = await alice.client
        .from('lexicon')
        .update({
          bete_phonetic: 'ɓɔ',
          bete_word: `ɓɔ-${tag}`,
          pos: ['noun'],
          description: 'Animal domestique',
          top_french: 'piraté',
          created_by: bob.id,
          upvotes: 9,
          validated: true,
        })
        .eq('id', ph.id)
      expect(res.error).toBeNull()
      const { data } = await admin.from('lexicon').select('*').eq('id', ph.id).single()
      expect(data?.bete_phonetic).toBe('ɓɔ')
      expect(data?.bete_word).toBe(`ɓɔ-${tag}`)
      expect(data?.description).toBe('Animal domestique')
      expect(data?.top_french).toBe(`chien-${tag}`)
      expect(data?.created_by).toBe(alice.id)
      expect(data?.source).toBe('contributed')
      expect(data?.upvotes).toBe(0)
      expect(data?.validated).toBe(false)

      // once translated, the forms are frozen again
      await bob.client.from('lexicon').update({ bete_phonetic: 'piraté' }).eq('id', ph.id)
      expect((await admin.from('lexicon').select('bete_phonetic').eq('id', ph.id).single()).data?.bete_phonetic).toBe('ɓɔ')
    })

    it('keeps voting working: the vote function may write the score the guard protects', async () => {
      const w = await seedWord()
      const { error } = await bob.client.rpc('vote', { p_table_name: 'lexicon', p_row_id: w.id, p_direction: 'up' })
      expect(error).toBeNull()
      expect((await admin.from('lexicon').select('upvotes').eq('id', w.id).single()).data?.upvotes).toBe(1)
    })
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run (from `web/`): `npm run test:rls -- lexicon-translations`
Expected: FAIL (relation `lexicon_translations` does not exist / column `description` does not exist).

- [x] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261001000000_lexicon_translations.sql
-- A word can have several French translations (each with an optional context) and a description.
-- Community model: any signed-in user adds; authors edit/delete their own; admins can delete.
-- lexicon.top_french stays as the primary translation so the translator and other readers are unchanged.

-- ── 1. description + edit time on lexicon ────────────────────────────────────
alter table lexicon add column if not exists description text
  check (description is null or char_length(description) <= 2000);
alter table lexicon add column if not exists updated_at timestamptz not null default now();

-- ── 2. translations ──────────────────────────────────────────────────────────
create table if not exists lexicon_translations (
  id          uuid primary key default gen_random_uuid(),
  lexicon_id  uuid not null references lexicon(id) on delete cascade,
  french      text not null check (char_length(btrim(french)) between 1 and 200),
  context     text check (context is null or char_length(context) <= 300),
  position    int  not null default 0,
  author_name text not null default '',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists lexicon_translations_lexicon_idx on lexicon_translations (lexicon_id, position);
create unique index if not exists lexicon_translations_unique_idx
  on lexicon_translations (lexicon_id, lower(btrim(french)), coalesce(btrim(context), ''));

alter table lexicon_translations enable row level security;

create policy lexicon_translations_select on lexicon_translations
  for select using (true);
create policy lexicon_translations_insert_own on lexicon_translations
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy lexicon_translations_update_own on lexicon_translations
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));
create policy lexicon_translations_delete_own on lexicon_translations
  for delete to authenticated
  using (created_by = (select auth.uid()) or (select is_admin()));

-- Clients cannot hand a translation to someone else, move it to another word, reorder it or
-- fake the author name. The check is on current_user so service-role and security-definer
-- writes (backfill, the after-insert trigger on lexicon) pass untouched.
create or replace function lexicon_translations_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.french  := btrim(new.french);
  new.context := nullif(btrim(coalesce(new.context, '')), '');
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at  := now();
    new.updated_at  := now();
    new.author_name := coalesce(nullif((select name from profiles where id = auth.uid()), ''), 'Contributeur');
    new.position    := coalesce((select max(position) + 1 from lexicon_translations where lexicon_id = new.lexicon_id), 0);
  else
    new.lexicon_id  := old.lexicon_id;
    new.created_by  := old.created_by;
    new.created_at  := old.created_at;
    new.author_name := old.author_name;
    new.position    := old.position;
    new.updated_at  := now();
  end if;
  return new;
end;
$$;

drop trigger if exists lexicon_translations_guard on lexicon_translations;
create trigger lexicon_translations_guard
  before insert or update on lexicon_translations
  for each row execute function lexicon_translations_guard();

-- ── 3. backfill: one translation per existing word ───────────────────────────
-- Placeholders included: their French is the meaning waiting for a Bété word.
insert into lexicon_translations (lexicon_id, french, position, created_by)
select l.id, btrim(l.top_french), 0, l.created_by
from lexicon l
where nullif(btrim(l.top_french), '') is not null
  and not exists (select 1 from lexicon_translations t where t.lexicon_id = l.id)
on conflict do nothing;

-- ── 4. every new word (form, import script, pipeline) gets its first translation ─
create or replace function lexicon_seed_translation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(new.top_french), '') is not null then
    insert into lexicon_translations (lexicon_id, french, position, created_by, author_name)
    values (
      new.id, btrim(new.top_french), 0, new.created_by,
      coalesce((select name from profiles where id = new.created_by), '')
    )
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists lexicon_seed_translation on lexicon;
create trigger lexicon_seed_translation
  after insert on lexicon
  for each row execute function lexicon_seed_translation();

-- ── 5. top_french follows the primary translation ────────────────────────────
-- Deleting the last translation leaves top_french alone: the translator depends on it.
create or replace function lexicon_translations_sync_primary()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.lexicon_id, old.lexicon_id);
  v_french text;
begin
  select french into v_french
  from lexicon_translations
  where lexicon_id = v_id
  order by position, created_at
  limit 1;
  if v_french is not null then
    update lexicon set top_french = v_french where id = v_id and top_french is distinct from v_french;
  end if;
  return null;
end;
$$;

drop trigger if exists lexicon_translations_sync_primary on lexicon_translations;
create trigger lexicon_translations_sync_primary
  after insert or update of french, position or delete on lexicon_translations
  for each row execute function lexicon_translations_sync_primary();

-- ── 6. lexicon update guard ──────────────────────────────────────────────────
-- The "lexicon upvote" policy lets any signed-in user UPDATE; this trigger decides which columns.
--  • translated word: only `description`
--  • untranslated placeholder (bete_phonetic = ''): also the Bété forms, pos, notes, dialect
--    (the homepage word-of-the-day / contribution form fills placeholders in), stamped with the author
-- top_french, upvotes and validated are never client-writable. The vote RPC and the service role
-- run as other roles and pass through.
create or replace function lexicon_guard_update()
returns trigger language plpgsql set search_path = public as $$
declare
  v lexicon;
begin
  if current_user <> 'authenticated' then
    if new.description is distinct from old.description then
      new.updated_at := now();
    end if;
    return new;
  end if;

  v := old;
  v.description := new.description;
  if old.bete_phonetic = '' then
    v.bete_word     := new.bete_word;
    v.bete_phonetic := new.bete_phonetic;
    v.pos           := new.pos;
    v.notes         := new.notes;
    v.dialect       := new.dialect;
    v.created_by    := auth.uid();
    v.source        := 'contributed';
  end if;
  if v.description is distinct from old.description then
    v.updated_at := now();
  end if;
  return v;
end;
$$;

drop trigger if exists lexicon_guard_update on lexicon;
create trigger lexicon_guard_update
  before update on lexicon
  for each row execute function lexicon_guard_update();
```

- [x] **Step 4: Apply locally and run the test**

```bash
docker ps --format "{{.Names}}" | grep supabase_db
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261001000000_lexicon_translations.sql
cd web && npm run test:rls -- lexicon-translations
```
Expected: migration prints no ERROR; all tests PASS. If the `vote` test fails because the RPC's lexicon branch is rejected, inspect `supabase/migrations/20260518000002_vote_aggregate_score.sql` (it is `security definer`; `current_user` there is the function owner).

- [x] **Step 5: Verify the backfill and the rest of the RLS suite**

```bash
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -c "select count(*) as missing from lexicon l where nullif(btrim(top_french),'') is not null and not exists (select 1 from lexicon_translations t where t.lexicon_id = l.id);"
cd web && npm run test:rls
```
Expected: `missing = 0`; full RLS suite PASS (nothing else broke).

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/20261001000000_lexicon_translations.sql web/__tests__/rls/lexicon-translations.test.ts
git commit -m "feat(lexicon): translations table, description and update guard"
```

---

### Task 2: `search_lexicon` function (database)

**Files:**
- Create: `supabase/migrations/20261001000001_search_lexicon.sql`
- Test: `web/__tests__/rls/search-lexicon.test.ts`

**Interfaces:**
- Consumes: `lexicon_translations` from Task 1.
- Produces: `rpc('search_lexicon', { q, p_dialect, p_pos, p_limit, p_offset })` returning rows `{ id, bete_word, bete_phonetic, top_french, pos, dialect, validated, matched_french, rank, total_count }`.

- [x] **Step 1: Write the failing test**

```ts
// web/__tests__/rls/search-lexicon.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, must, uid } from './helpers'

type Row = { id: string; matched_french: string | null; total_count: number; rank: number }

describe('search_lexicon', () => {
  const tag = `zq${uid()}`
  const ids: Record<string, string> = {}

  async function seed(key: string, extra: Record<string, unknown>) {
    ids[key] = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${key}-${tag}`,
          bete_phonetic: `x-${key}`,
          french_candidates: [],
          top_french: 'manger',
          probability: 1,
          pos: ['noun'],
          ...extra,
        })
        .select('id')
        .single(),
      `seed ${key}`,
    ).id
  }

  const search = async (args: Record<string, unknown>) =>
    must(await anonClient().rpc('search_lexicon', args), 'search') as Row[]
  const idsOf = (rows: Row[]) => rows.map(r => r.id)

  beforeAll(async () => {
    await seed('exact', { bete_phonetic: tag })
    await seed('prefix', { bete_phonetic: `${tag}xa` })
    await seed('contains', { bete_phonetic: `ya${tag}` })
    await seed('accent', { bete_phonetic: `${tag}éba` })
    await seed('ipa', { bete_phonetic: 'zzz', bete_word: `${tag}ɛba` })
    await seed('french', { bete_phonetic: `${tag}fr` })
    await seed('verb', { bete_phonetic: `${tag}vb`, pos: ['verb'] })
    await seed('north', { bete_phonetic: `${tag}nd`, dialect: 'northern' })
    await seed('frag', { bete_phonetic: `${tag}fg`, pos: ['fragment'] })
    await seed('pending', { bete_phonetic: '', bete_word: `_pending_${tag}` })
    must(
      await admin.from('lexicon_translations').insert({ lexicon_id: ids.french, french: `${tag}été` }).select('id').single(),
      'extra translation',
    )
  })

  it('ranks exact, then prefix, then contains', async () => {
    const rows = await search({ q: tag, p_dialect: 'western' })
    const order = idsOf(rows).filter(id => [ids.exact, ids.prefix, ids.contains].includes(id))
    expect(order).toEqual([ids.exact, ids.prefix, ids.contains])
  })

  it('ignores case and accents, in the Latin form', async () => {
    expect(idsOf(await search({ q: `${tag}EBA` }))).toContain(ids.accent)
    expect(idsOf(await search({ q: `${tag}éba` }))).toContain(ids.accent)
  })

  it('matches the IPA form', async () => {
    expect(idsOf(await search({ q: `${tag}ɛba` }))).toContain(ids.ipa)
  })

  it('finds a word from any of its French translations and reports which one matched', async () => {
    const rows = await search({ q: `${tag}ete` })
    const hit = rows.find(r => r.id === ids.french)
    expect(hit?.matched_french).toBe(`${tag}été`)
  })

  it('does not treat % or _ as wildcards', async () => {
    expect(await search({ q: `${tag}%` })).toEqual([])
    expect(await search({ q: `${tag}_` })).toEqual([])
    expect(await search({ q: `${tag}\\` })).toEqual([])
  })

  it('returns nothing for a blank query', async () => {
    expect(await search({ q: '   ' })).toEqual([])
    expect(await search({ q: '' })).toEqual([])
  })

  it('hides placeholders and fragments', async () => {
    const found = idsOf(await search({ q: tag }))
    expect(found).not.toContain(ids.pending)
    expect(found).not.toContain(ids.frag)
  })

  it('filters by dialect (null = all) and by part of speech', async () => {
    expect(idsOf(await search({ q: tag, p_dialect: 'western' }))).not.toContain(ids.north)
    expect(idsOf(await search({ q: tag, p_dialect: 'northern' }))).toContain(ids.north)
    expect(idsOf(await search({ q: tag }))).toContain(ids.north)
    expect(idsOf(await search({ q: tag, p_pos: 'verb' }))).toEqual([ids.verb])
  })

  it('paginates and reports the full count on every row', async () => {
    const all = await search({ q: tag, p_dialect: 'western', p_limit: 50 })
    const first = await search({ q: tag, p_dialect: 'western', p_limit: 2, p_offset: 0 })
    const rest = await search({ q: tag, p_dialect: 'western', p_limit: 50, p_offset: 2 })
    expect(first).toHaveLength(2)
    expect(first[0].total_count).toBe(all.length)
    expect([...idsOf(first), ...idsOf(rest)]).toEqual(idsOf(all))
  })
})
```

- [x] **Step 2: Run to verify it fails**

Run: `cd web && npm run test:rls -- search-lexicon`
Expected: FAIL (`Could not find the function public.search_lexicon`).

- [x] **Step 3: Write the migration**

```sql
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
```

- [x] **Step 4: Apply and run**

```bash
docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261001000001_search_lexicon.sql
cd web && npm run test:rls -- search-lexicon
```
Expected: PASS. If `unaccent` is not found, check `select * from pg_available_extensions where name='unaccent'`; the function's `search_path` includes `extensions` for the Supabase layout.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/20261001000001_search_lexicon.sql web/__tests__/rls/search-lexicon.test.ts
git commit -m "feat(lexicon): accent-insensitive search over Bété forms and French translations"
```

---

### Task 3: Types, pure helpers, mutations, search client (TypeScript lib)

**Files:**
- Modify: `web/lib/lexicon.ts`, `web/lib/types.ts`
- Create: `web/lib/lexicon-mutations.ts`, `web/lib/lexicon-search.ts`
- Test: `web/__tests__/lexicon.test.ts`, `web/__tests__/lexicon-search.test.ts`

**Interfaces:**
- Produces (`lib/types.ts`): `LexiconEntry.description: string | null`; `LexiconTranslation { id; lexicon_id; french; context: string | null; position: number; author_name: string; created_by: string | null; created_at: string; updated_at: string }`.
- Produces (`lib/lexicon.ts`): `checkTranslationInput(input: {french: string; context?: string | null}): { french: string; context: string | null; error: string | null }`; `checkDescription(text: string): { description: string | null; error: string | null }`; `sortTranslations<T extends {position:number; created_at:string}>(ts: T[]): T[]`; `translationsSummary(ts: {french:string}[]): string`; `otherMeaningsLabel(total: number): string | null`; `translationCount(rel?: {count:number}[] | null): number`; `pickDescription(e: {description?: string|null; notes?: string|null}): string`; constants `TRANSLATION_FRENCH_MAX=200`, `TRANSLATION_CONTEXT_MAX=300`, `DESCRIPTION_MAX=2000`.
- Produces (`lib/lexicon-mutations.ts`): `addTranslation(client, lexiconId, input)`, `updateTranslation(client, id, input)`, `deleteTranslation(client, id)`, `updateDescription(client, lexiconId, text)`, all `Promise<{data; error: string | null}>`; `isDuplicateTranslation(error)`, `DUPLICATE_TRANSLATION_MESSAGE`.
- Produces (`lib/lexicon-search.ts`): `searchLexicon(client, { q, dialect?, pos?, limit?, offset? }): Promise<{ rows: LexiconSearchRow[]; total: number; error: string | null }>`; type `LexiconSearchRow`.

- [ ] **Step 1: Write the failing unit tests**

```ts
// web/__tests__/lexicon.test.ts
import { describe, expect, it } from 'vitest'
import {
  checkDescription,
  checkTranslationInput,
  otherMeaningsLabel,
  pickDescription,
  sortTranslations,
  translationCount,
  translationsSummary,
} from '../lib/lexicon'

describe('checkTranslationInput', () => {
  it('trims and turns a blank context into null', () => {
    expect(checkTranslationInput({ french: '  manger ', context: '   ' })).toEqual({
      french: 'manger', context: null, error: null,
    })
  })
  it('requires a French word', () => {
    expect(checkTranslationInput({ french: '  ' }).error).toBe('Le mot français est obligatoire.')
  })
  it('rejects over-long fields with a French message', () => {
    expect(checkTranslationInput({ french: 'x'.repeat(201) }).error).toContain('200')
    expect(checkTranslationInput({ french: 'a', context: 'x'.repeat(301) }).error).toContain('300')
  })
})

describe('checkDescription', () => {
  it('stores a blank description as null', () => {
    expect(checkDescription('  \n ')).toEqual({ description: null, error: null })
  })
  it('trims and enforces the limit', () => {
    expect(checkDescription('  Un repas. ').description).toBe('Un repas.')
    expect(checkDescription('x'.repeat(2001)).error).toContain('2000')
  })
})

describe('translation display helpers', () => {
  const t = (position: number, created_at: string, french = 'a') => ({ position, created_at, french })
  it('orders by position, then age', () => {
    const sorted = sortTranslations([t(1, '2026-01-02', 'b'), t(0, '2026-01-05', 'a'), t(1, '2026-01-01', 'c')])
    expect(sorted.map(x => x.french)).toEqual(['a', 'c', 'b'])
  })
  it('does not mutate its input', () => {
    const input = [t(1, '2026-01-02'), t(0, '2026-01-01')]
    sortTranslations(input)
    expect(input[0].position).toBe(1)
  })
  it('summarises distinct French words', () => {
    expect(translationsSummary([{ french: 'manger' }, { french: 'se nourrir' }, { french: 'Manger' }])).toBe(
      'manger, se nourrir',
    )
  })
  it('labels extra meanings', () => {
    expect(otherMeaningsLabel(1)).toBeNull()
    expect(otherMeaningsLabel(2)).toBe('+1 autre sens')
    expect(otherMeaningsLabel(4)).toBe('+3 autres sens')
  })
  it('reads the embedded count', () => {
    expect(translationCount([{ count: 3 }])).toBe(3)
    expect(translationCount(undefined)).toBe(0)
    expect(translationCount(null)).toBe(0)
  })
  it('prefers the description over legacy notes', () => {
    expect(pickDescription({ description: 'D', notes: 'N' })).toBe('D')
    expect(pickDescription({ description: ' ', notes: 'N' })).toBe('N')
    expect(pickDescription({})).toBe('')
  })
})
```

```ts
// web/__tests__/lexicon-search.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchLexicon } from '../lib/lexicon-search'

const fake = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('searchLexicon', () => {
  it('does not call the database for a blank query', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    expect(await searchLexicon(client, { q: '   ' })).toEqual({ rows: [], total: 0, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps its options onto the SQL function arguments', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    await searchLexicon(client, { q: ' été ', dialect: 'northern', pos: 'verb', limit: 6, offset: 12 })
    expect(rpc).toHaveBeenCalledWith('search_lexicon', {
      q: 'été', p_dialect: 'northern', p_pos: 'verb', p_limit: 6, p_offset: 12,
    })
  })

  it('defaults to all dialects, no pos filter, 20 rows', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    await searchLexicon(client, { q: 'ba' })
    expect(rpc).toHaveBeenCalledWith('search_lexicon', {
      q: 'ba', p_dialect: null, p_pos: null, p_limit: 20, p_offset: 0,
    })
  })

  it('returns the rows and the total from the first row', async () => {
    const rows = [{ id: 'a', total_count: 7 }, { id: 'b', total_count: 7 }]
    const { client } = fake({ data: rows, error: null })
    const res = await searchLexicon(client, { q: 'ba' })
    expect(res.rows).toHaveLength(2)
    expect(res.total).toBe(7)
  })

  it('reports a French error message when the call fails', async () => {
    const { client } = fake({ data: null, error: { message: 'boom' } })
    expect(await searchLexicon(client, { q: 'ba' })).toEqual({
      rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.',
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run __tests__/lexicon.test.ts __tests__/lexicon-search.test.ts`
Expected: FAIL (imports not found).

- [ ] **Step 3: Implement**

Append to `web/lib/lexicon.ts` (keep `cleanBeteForm`):

```ts
export const TRANSLATION_FRENCH_MAX = 200
export const TRANSLATION_CONTEXT_MAX = 300
export const DESCRIPTION_MAX = 2000

/** Cleans a translation form (error null: valid). A blank context is stored as null. */
export function checkTranslationInput(input: { french: string; context?: string | null }): {
  french: string
  context: string | null
  error: string | null
} {
  const french = input.french.trim()
  const context = input.context?.trim() || null
  let error: string | null = null
  if (!french) error = 'Le mot français est obligatoire.'
  else if (french.length > TRANSLATION_FRENCH_MAX)
    error = `Le mot français ne peut pas dépasser ${TRANSLATION_FRENCH_MAX} caractères.`
  else if (context && context.length > TRANSLATION_CONTEXT_MAX)
    error = `Le contexte ne peut pas dépasser ${TRANSLATION_CONTEXT_MAX} caractères.`
  return { french, context, error }
}

/** A blank description clears it (null). */
export function checkDescription(text: string): { description: string | null; error: string | null } {
  const description = text.trim() || null
  if (description && description.length > DESCRIPTION_MAX) {
    return { description, error: `La description ne peut pas dépasser ${DESCRIPTION_MAX} caractères.` }
  }
  return { description, error: null }
}

/** Primary translation first (lowest position), then oldest. Returns a new array. */
export function sortTranslations<T extends { position: number; created_at: string }>(ts: T[]): T[] {
  return [...ts].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  )
}

/** "manger, se nourrir": distinct French words, case-insensitively, in order. */
export function translationsSummary(ts: { french: string }[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const { french } of ts) {
    const key = french.trim().toLowerCase()
    if (key && !seen.has(key)) {
      seen.add(key)
      out.push(french.trim())
    }
  }
  return out.join(', ')
}

/** "+2 autres sens" for a word with `total` translations, null when there is only one. */
export function otherMeaningsLabel(total: number): string | null {
  const extra = total - 1
  if (extra < 1) return null
  return `+${extra} ${extra === 1 ? 'autre sens' : 'autres sens'}`
}

/** Reads the count of a PostgREST `lexicon_translations(count)` embed. */
export function translationCount(rel?: { count: number }[] | null): number {
  return rel?.[0]?.count ?? 0
}

/** The description, falling back to the legacy free-text `notes`. */
export function pickDescription(e: { description?: string | null; notes?: string | null }): string {
  return e.description?.trim() || e.notes?.trim() || ''
}
```

In `web/lib/types.ts`, in `interface LexiconEntry` add `description: string | null` after `notes`, and add after `LexiconExample`:

```ts
export interface LexiconTranslation {
  id: string
  lexicon_id: string
  french: string
  context: string | null
  position: number
  author_name: string
  created_by: string | null
  created_at: string
  updated_at: string
}
```

```ts
// web/lib/lexicon-mutations.ts — client-side writes for lexicon translations and descriptions.
// RLS enforces ownership; these helpers add validation and French error messages.
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkDescription, checkTranslationInput } from './lexicon'

type Result<T> = { data: T; error: null } | { data: null; error: string }

export const DUPLICATE_TRANSLATION_MESSAGE = 'Cette traduction existe déjà pour ce mot.'

/** Postgres unique violation: the same French word + context already exists on this word. */
export function isDuplicateTranslation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

async function authUser(client: SupabaseClient) {
  const { data: { user } } = await client.auth.getUser()
  return user
}

export async function addTranslation(
  client: SupabaseClient,
  lexiconId: string,
  input: { french: string; context?: string | null },
): Promise<Result<{ id: string }>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour ajouter une traduction.' }
  const { french, context, error: invalid } = checkTranslationInput(input)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('lexicon_translations')
    .insert({ lexicon_id: lexiconId, french, context, created_by: user.id })
    .select('id')
    .single()
  if (isDuplicateTranslation(error)) return { data: null, error: DUPLICATE_TRANSLATION_MESSAGE }
  if (error) return { data: null, error: error.message }
  return { data: { id: (data as { id: string }).id }, error: null }
}

/** Edit your own translation. */
export async function updateTranslation(
  client: SupabaseClient,
  id: string,
  input: { french: string; context?: string | null },
): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour modifier cette traduction.' }
  const { french, context, error: invalid } = checkTranslationInput(input)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client
    .from('lexicon_translations')
    .update({ french, context })
    .eq('id', id)
    .eq('created_by', user.id)
    .select('id')
  if (isDuplicateTranslation(error)) return { data: null, error: DUPLICATE_TRANSLATION_MESSAGE }
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Traduction introuvable ou non modifiable.' }
  return { data: null, error: null }
}

/** Delete a translation (its author, or an admin). */
export async function deleteTranslation(client: SupabaseClient, id: string): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour supprimer cette traduction.' }
  const { data, error } = await client.from('lexicon_translations').delete().eq('id', id).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Suppression impossible.' }
  return { data: null, error: null }
}

/** Set (or clear, with a blank text) the shared description of a word. */
export async function updateDescription(
  client: SupabaseClient,
  lexiconId: string,
  text: string,
): Promise<Result<null>> {
  const user = await authUser(client)
  if (!user) return { data: null, error: 'Connectez-vous pour modifier la description.' }
  const { description, error: invalid } = checkDescription(text)
  if (invalid) return { data: null, error: invalid }

  const { data, error } = await client.from('lexicon').update({ description }).eq('id', lexiconId).select('id')
  if (error) return { data: null, error: error.message }
  if (!data || data.length === 0) return { data: null, error: 'Mot introuvable.' }
  return { data: null, error: null }
}
```

```ts
// web/lib/lexicon-search.ts — client for the search_lexicon SQL function.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LexiconSearchRow {
  id: string
  bete_word: string          // IPA / Bible form
  bete_phonetic: string      // western Latin form
  top_french: string
  pos: string[] | null
  dialect: string
  validated: boolean
  matched_french: string | null   // the French translation that matched, when the match came from French
  rank: number
  total_count: number
}

export interface LexiconSearchOptions {
  q: string
  dialect?: string | null
  pos?: string | null
  limit?: number
  offset?: number
}

export async function searchLexicon(
  client: SupabaseClient,
  { q, dialect = null, pos = null, limit = 20, offset = 0 }: LexiconSearchOptions,
): Promise<{ rows: LexiconSearchRow[]; total: number; error: string | null }> {
  const text = q.trim()
  if (!text) return { rows: [], total: 0, error: null }

  const { data, error } = await client.rpc('search_lexicon', {
    q: text, p_dialect: dialect, p_pos: pos, p_limit: limit, p_offset: offset,
  })
  if (error) return { rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.' }
  const rows = (data ?? []) as LexiconSearchRow[]
  return { rows, total: rows[0]?.total_count ?? 0, error: null }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `cd web && npx vitest run __tests__/lexicon.test.ts __tests__/lexicon-search.test.ts && npx tsc --noEmit`
Expected: tests PASS. `tsc` may now report errors where a `LexiconEntry` literal lacks `description`; fix by adding `description: null` (only test fixtures/mocks should be affected; list any you touched).

- [ ] **Step 5: Commit**

```bash
git add web/lib/lexicon.ts web/lib/lexicon-mutations.ts web/lib/lexicon-search.ts web/__tests__/lexicon.test.ts web/__tests__/lexicon-search.test.ts
git add -p web/lib/types.ts   # only the description + LexiconTranslation hunks
git commit -m "feat(lexicon): translation helpers, mutations and search client"
```

---

### Task 4: Word detail page

**Files:**
- Create: `web/components/LexiconTranslations.tsx`, `web/components/LexiconDescription.tsx`
- Modify: `web/components/LexiconEntry.tsx`, `web/app/lexicon/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 3 helpers, mutations, `LexiconTranslation`.
- Produces: `<LexiconTranslations lexiconId translations />`, `<LexiconDescription lexiconId initial />` (client components; refresh the route via `router.refresh()` after a write). `LexiconEntry` loses `compact` and the vote buttons.

Read `web/node_modules/next/dist/docs/` for `generateMetadata`/`params` before editing the page (this repo's Next differs from memory); the existing page already uses `params: Promise<...>` and `cache`, keep that shape.

- [ ] **Step 1: Write `LexiconTranslations.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-browser'
import { addTranslation, deleteTranslation, updateTranslation } from '@/lib/lexicon-mutations'
import { TRANSLATION_CONTEXT_MAX, TRANSLATION_FRENCH_MAX } from '@/lib/lexicon'
import type { LexiconTranslation } from '@/lib/types'

interface Props {
  lexiconId: string
  translations: LexiconTranslation[]   // already sorted, primary first
}

export function LexiconTranslations({ lexiconId, translations }: Props) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [userId, setUserId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [french, setFrench] = useState('')
  const [context, setContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  function startEdit(t: LexiconTranslation) {
    setEditingId(t.id)
    setFrench(t.french)
    setContext(t.context ?? '')
    setError(null)
  }

  function reset() {
    setEditingId(null)
    setFrench('')
    setContext('')
    setError(null)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const input = { french, context }
    const res = editingId
      ? await updateTranslation(supabaseRef.current, editingId, input)
      : await addTranslation(supabaseRef.current, lexiconId, input)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    reset()
    router.refresh()
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer cette traduction ?')) return
    setBusy(true)
    const res = await deleteTranslation(supabaseRef.current, id)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    router.refresh()
  }

  const form = (
    <div className="space-y-2">
      <Input
        placeholder="Traduction française *"
        value={french}
        maxLength={TRANSLATION_FRENCH_MAX}
        onChange={e => setFrench(e.target.value)}
      />
      <Input
        placeholder="Contexte (optionnel) — ex : en parlant d’un bateau"
        value={context}
        maxLength={TRANSLATION_CONTEXT_MAX}
        onChange={e => setContext(e.target.value)}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy || !french.trim()}>
          {busy ? 'Envoi…' : editingId ? 'Enregistrer' : 'Ajouter'}
        </Button>
        {editingId && (
          <Button size="sm" variant="outline" onClick={reset} disabled={busy}>Annuler</Button>
        )}
      </div>
    </div>
  )

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-lg font-heading">
        {translations.length > 1 ? 'Traductions' : 'Traduction'}
      </h2>
      <ul className="space-y-2">
        {translations.map((t, i) => (
          <li key={t.id} className="rounded-lg border border-border px-4 py-3">
            {editingId === t.id ? form : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={i === 0 ? 'font-semibold text-lg' : 'font-medium'}>{t.french}</p>
                  {t.context && <p className="text-sm text-muted-foreground italic">{t.context}</p>}
                  {t.author_name && (
                    <p className="text-xs text-muted-foreground mt-1">ajouté par {t.author_name}</p>
                  )}
                </div>
                {userId && t.created_by === userId && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(t)} aria-label="Modifier cette traduction">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(t.id)} disabled={busy} aria-label="Supprimer cette traduction">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {!editingId && (
        userId ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Ajouter une traduction</p>
            {form}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">Connectez-vous</Link> pour ajouter une traduction.
          </p>
        )
      )}
    </section>
  )
}
```
Before saving, confirm the sign-in route: `grep -rn "href=\"/" web/components/AuthNav.tsx` and use the real login path instead of `/login` if it differs.

- [ ] **Step 2: Write `LexiconDescription.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'
import { updateDescription } from '@/lib/lexicon-mutations'
import { DESCRIPTION_MAX } from '@/lib/lexicon'

export function LexiconDescription({ lexiconId, initial }: { lexiconId: string; initial: string }) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const [signedIn, setSignedIn] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => setSignedIn(!!data.user))
  }, [])
  useEffect(() => { setText(initial) }, [initial])

  async function save() {
    setBusy(true)
    setError(null)
    const res = await updateDescription(supabaseRef.current, lexiconId, text)
    setBusy(false)
    if (res.error) { setError(res.error); return }
    setEditing(false)
    router.refresh()
  }

  if (!editing && !initial && !signedIn) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg font-heading">Description</h2>
        {signedIn && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {initial ? 'Modifier' : 'Ajouter une description'}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={text}
            rows={4}
            maxLength={DESCRIPTION_MAX}
            onChange={e => setText(e.target.value)}
            placeholder="Explication, usage, nuances…"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Envoi…' : 'Enregistrer'}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(false); setText(initial); setError(null) }}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-line">{initial}</p>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Slim down `LexiconEntry.tsx`** (header card only: no votes, no `compact`, no candidate percentages, no translation text since the translations section shows it; placeholder-aware)

```tsx
import Link from 'next/link'
import type { LexiconEntry as TLexiconEntry } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cleanBeteWord } from '@/lib/utils'
import { cleanBeteForm } from '@/lib/lexicon'

const POS_LABELS: Record<string, string> = {
  noun: 'Nom', verb: 'Verbe', adj: 'Adj.', adv: 'Adv.',
  name: 'Nom propre', num: 'Num.', interj: 'Interj.',
  prep: 'Prép.', conj: 'Conj.', pron: 'Pron.',
}

export function LexiconEntry({ entry }: { entry: TLexiconEntry }) {
  const posTag = entry.pos?.[0]
  const posLabel = posTag ? (POS_LABELS[posTag] ?? posTag) : null
  const western = cleanBeteForm(entry.bete_phonetic)
  const ipa = cleanBeteForm(entry.bete_word)
  const untranslated = !western && !ipa

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            {/* Latin alphabet form as primary display */}
            <CardTitle className="text-2xl font-heading">{western || ipa || entry.top_french}</CardTitle>
            {/* Original Bible phonetic notation in brackets */}
            {western && ipa && ipa !== western && (
              <p className="text-sm text-muted-foreground font-mono">[{cleanBeteWord(ipa)}]</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {entry.validated && <Badge variant="secondary">✓ validé</Badge>}
            {posLabel && <Badge variant="outline">{posLabel}</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {untranslated ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center justify-between gap-2">
            <span>Ce mot attend sa traduction en bhété.</span>
            <Link
              href={`/contribute?word=${encodeURIComponent(entry.top_french)}&type=word&id=${entry.id}`}
              className="shrink-0 font-medium hover:underline"
            >
              Traduire →
            </Link>
          </div>
        ) : entry.source === 'seed' ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center justify-between gap-2">
            <span>Traduction automatique — aidez à l’améliorer en ajoutant des traductions ou une description.</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Rewrite the detail page**: in `web/app/lexicon/[id]/page.tsx`

  - Query: `.select('*, lexicon_examples(*), lexicon_translations(*)')`; `type Entry = TLexiconEntry & { lexicon_examples: LexiconExample[]; lexicon_translations: LexiconTranslation[] }`; derive `const translations = sortTranslations(entry.lexicon_translations ?? [])`.
  - `french` for titles = `translations[0]?.french ?? entry.top_french`; `allFrench = translationsSummary(translations)` (falls back to `french`).
  - `generateMetadata`: title `${french} en bété : ${bete}` unchanged shape; description = `pickDescription(entry)` when non-empty (first 160 chars, cut on a word), else existing sentence using `allFrench` (`Traduction bété (bhété) de « ${allFrench} » : …`). Untranslated branch unchanged (noindex).
  - JSON-LD `DefinedTerm.description`: `« ${allFrench} » en bété (bhété)` + existing forms, plus ` — ${pickDescription(entry)}` when present.
  - Body: `<LexiconEntry entry={entry} />`, then `<LexiconDescription lexiconId={entry.id} initial={pickDescription(entry)} />`, then `<LexiconTranslations lexiconId={entry.id} translations={translations} />`, then the existing examples section. Imports: `sortTranslations, translationsSummary, pickDescription` from `@/lib/lexicon`.
  - Note: a legacy `notes` value shows as the initial description; saving writes `description`, after which it overrides `notes`.

- [ ] **Step 5: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint -- app/lexicon components/LexiconEntry.tsx components/LexiconTranslations.tsx components/LexiconDescription.tsx
npm run dev   # then in the browser, with the local stack: open /lexicon/<id> of a translated word
```
Manual checks (signed out, then signed in): signed out sees translations/description and **no** add/edit controls (Review Focus 4); signed in adds a translation with context → appears after refresh, can edit/delete only own, duplicate shows "Cette traduction existe déjà pour ce mot."; editing the description persists; an untranslated word shows the "Traduire →" notice; view source shows updated `<title>`/meta. No vote buttons anywhere on the page.

- [ ] **Step 6: Commit**

```bash
git add web/components/LexiconTranslations.tsx web/components/LexiconDescription.tsx web/components/LexiconEntry.tsx "web/app/lexicon/[id]/page.tsx"
git commit -m "feat(lexicon): detail page with translations, description and no voting"
```

---

### Task 5: Lexicon list and search UI

**Files:**
- Modify: `web/components/WordCard.tsx`, `web/app/lexicon/page.tsx`, `web/components/HeaderSearch.tsx`
- Delete: `web/components/LexiconSearch.tsx` (verify first: `grep -rn LexiconSearch web --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next` must only match the file itself)

**Interfaces:**
- Consumes: `searchLexicon`, `LexiconSearchRow`, `otherMeaningsLabel`, `translationCount`.
- Produces: `WordCard` props `{ entry: WordCardEntry; extraMeanings?: number; matchedFrench?: string | null; className? }` where `WordCardEntry = Pick<LexiconEntry, 'id'|'bete_phonetic'|'bete_word'|'top_french'|'pos'|'validated'>` (exported from `WordCard.tsx`).

- [ ] **Step 1: `WordCard.tsx`**: export `WordCardEntry`; change props as above; under `top_french` render `otherMeaningsLabel(extraMeanings + 1)` (as a small muted text) when not null, and `matchedFrench && matchedFrench !== entry.top_french` as `<p className="text-xs text-muted-foreground">correspond à « {matchedFrench} »</p>`. Keep the rest of the card unchanged. Remove no existing styling.

- [ ] **Step 2: `app/lexicon/page.tsx`**
  - Add `const [query, setQuery] = useState('')` and a debounced copy `const [debounced, setDebounced] = useState('')` (250 ms `setTimeout` effect on `query`); reset `page` to 0 when `debounced` changes (add to the existing reset effect deps).
  - Add an `<Input placeholder="Rechercher en bhété ou en français…" />` under the dialect selector (import from `@/components/ui/input`); `type="search"`.
  - In the data effect: when `debounced.trim()` is non-empty, call `searchLexicon(supabaseRef.current, { q: debounced, dialect, pos: filter?.tag, limit: PAGE_SIZE, offset: from })` and set `entries` from the rows (map to `WordCardEntry`) with `matchedFrench`, and `total` from the result; the letter pills are ignored while searching (hide them: render the letter `FilterPills` only when `!debounced.trim()`). When the query is empty keep the current query but change `.order('upvotes', { ascending: false })` to `.order('bete_phonetic', { ascending: true })` and `.select('*, lexicon_translations(count)', { count: 'exact' })`.
  - `entries` state becomes `(WordCardEntry & { matchedFrench?: string | null; extraMeanings?: number })[]`; for the plain query map `extraMeanings: Math.max(0, translationCount(row.lexicon_translations) - 1)`.
  - Pass `extraMeanings`/`matchedFrench` into `WordCard` and `ListRow`; `ListRow` shows the same "+N autres sens" muted next to the French, and drops nothing else. Empty state when searching: `Aucun mot trouvé pour « {debounced} ».` plus a link `Ajouter « … » au lexique →` to `/contribute?word=${encodeURIComponent(debounced.trim())}&type=word` (carried over from the deleted `LexiconSearch`).
  - Keep the existing `cancelled` guard pattern in the effect.

- [ ] **Step 3: `HeaderSearch.tsx`**: replace the inline `.from('lexicon')…ilike` query with `searchLexicon(supabaseRef.current, { q: query, limit: 6 })` and `setResults(rows)` (state type `LexiconSearchRow[]`). In each result row show `entry.bete_phonetic` bold, `[{entry.bete_word}]` in the muted mono line only when it differs and is not a `_pending_` form (use `cleanBeteForm`), and on the right `entry.matched_french ?? entry.top_french`.

- [ ] **Step 4: Delete `LexiconSearch.tsx`** (`git rm web/components/LexiconSearch.tsx`) after the grep check.

- [ ] **Step 5: Verify**

```bash
cd web && npx tsc --noEmit && npm run lint -- app/lexicon components/WordCard.tsx components/HeaderSearch.tsx && npm test
```
Manual (dev server): `/lexicon` lists alphabetically; typing a Bété word (Latin and IPA form) and a French word (try one accented, typed without the accent) shows matching cards with "correspond à « … »" for non-primary French matches; category pills still filter while searching; typing `%` shows the empty state, no error; the header search finds both languages; no vote UI in the list.

- [ ] **Step 6: Commit**

```bash
git add web/components/WordCard.tsx web/app/lexicon/page.tsx web/components/HeaderSearch.tsx
git commit -m "feat(lexicon): search in Bété and French, alphabetical list, extra-meaning hints"
```
(`git rm` already staged the `LexiconSearch.tsx` deletion; include it in this commit.)

---

### Task 6: Contribution form and pending list

**Files:**
- Modify: `web/lib/contribution.ts`, `web/__tests__/contribution.test.ts`, `web/components/ContributionForm.tsx`, `web/components/PendingContributions.tsx`

**Interfaces:**
- Consumes: `addTranslation`, `DUPLICATE_TRANSLATION_MESSAGE`.
- Produces: `WordFields.notes` renamed `description`; `buildWordPayload(f)` returns `description` (null when blank) instead of `notes`; new `buildWordClaimPayload(f)` returning `{ bete_phonetic, bete_word, pos, description, dialect }` for filling an existing placeholder.

- [ ] **Step 1: Update the tests first** (`web/__tests__/contribution.test.ts`)

In the `buildWordPayload` `base` object rename `notes: ''` to `description: ''`; replace the "stores empty notes as null…" test with:

```ts
  it('stores an empty description as null and marks the entry as contributed', () => {
    const payload = buildWordPayload(base)
    expect(payload.description).toBeNull()
    expect(payload.source).toBe('contributed')
    expect(payload.created_by).toBe('user-1')
  })

  it('keeps a typed description, trimmed', () => {
    expect(buildWordPayload({ ...base, description: '  Un repas. ' }).description).toBe('Un repas.')
  })
```

Add `buildWordClaimPayload` to the import and append:

```ts
describe('buildWordClaimPayload', () => {
  const base = {
    betePhonetic: 'ɓɔ', beteIPA: '', french: 'chien', pos: 'noun',
    description: '', dialect: 'western' as const, userId: 'user-1',
  }

  it('only carries what the database lets a contributor fill in (no French, score or owner)', () => {
    expect(Object.keys(buildWordClaimPayload(base)).sort()).toEqual(
      ['bete_phonetic', 'bete_word', 'description', 'dialect', 'pos'],
    )
  })

  it('applies the same IPA fallback and description trimming as a new word', () => {
    const p = buildWordClaimPayload({ ...base, description: ' Animal ' })
    expect(p.bete_word).toBe('ɓɔ')
    expect(p.description).toBe('Animal')
    expect(p.pos).toEqual(['noun'])
  })
})
```

- [ ] **Step 2: Run to verify failure**: `cd web && npx vitest run __tests__/contribution.test.ts` → FAIL.

- [ ] **Step 3: Implement in `web/lib/contribution.ts`**: rename `notes` → `description` in `WordFields`; in `buildWordPayload` replace `notes: f.notes || null` with `description: f.description.trim() || null` (the insert still sends `top_french`, `french_candidates`, `probability`; the new-word trigger turns `top_french` into the first translation); add:

```ts
// Filling in an existing untranslated placeholder: the database only accepts the Bété forms,
// part of speech, dialect and description from the client, and stamps the author itself. The French
// word is not part of this payload; it is added as a translation.
export function buildWordClaimPayload(f: WordFields) {
  return {
    bete_phonetic: f.betePhonetic,
    bete_word: f.beteIPA || f.betePhonetic,
    pos: [f.pos],
    description: f.description.trim() || null,
    dialect: f.dialect,
  }
}
```

- [ ] **Step 4: `ContributionForm.tsx`**
  - Rename state `wordNotes` → `wordDescription`; placeholder `Description du mot ou contexte d'usage (optionnel)`.
  - In `handleSubmit`'s word branch build `fields` once; when `initialId` is set use `buildWordClaimPayload(fields)` for the `.update(...).eq('id', initialId)`, then, if no error, `addTranslation(supabaseRef.current, initialId, { french: wordFrench })` and ignore a duplicate error (compare `res.error === DUPLICATE_TRANSLATION_MESSAGE`, exported from `lib/lexicon-mutations.ts`); any other translation error sets `error` so the existing catch shows the generic message. When `initialId` is absent keep the existing `.insert(buildWordPayload(fields))`.
  - Imports: `buildWordClaimPayload` from `@/lib/contribution`, `addTranslation` + `DUPLICATE_TRANSLATION_MESSAGE` from `@/lib/lexicon-mutations`.

- [ ] **Step 5: `PendingContributions.tsx`**: for words only, remove the `<VoteButtons table="lexicon" …/>` element, drop `upvotes` from the `LexiconWord` type and from the `.select(...)`, add `description` to both and render `{(word.description || word.notes) && <p …>{word.description || word.notes}</p>}`. Keep `VoteButtons` for expressions and grammar rules (out of scope), and keep `ContributionComments`.

- [ ] **Step 6: Verify**

```bash
cd web && npx vitest run && npx tsc --noEmit && npm run lint
```
Expected: all unit tests PASS. Manual: submit a brand-new word on `/contribute` (appears with exactly one translation on its detail page); open the homepage "mot du jour" link for a placeholder, fill it, submit → the word is now translated, shows the original French as its translation, and a different French typed in the form shows as a second translation.

- [ ] **Step 7: Commit**

```bash
git add web/lib/contribution.ts web/__tests__/contribution.test.ts web/components/ContributionForm.tsx web/components/PendingContributions.tsx web/lib/lexicon-mutations.ts
git commit -m "feat(lexicon): contribution form writes description and fills placeholders through the guard"
```

---

### Task 7: Full verification

- [ ] **Step 1:** `cd web && npm test && npm run test:rls && npx tsc --noEmit && npm run lint && npm run build`
Expected: everything green. Any failure: fix at the root before moving on; do not weaken tests.

- [ ] **Step 2:** Repo-wide grep that voting is gone from the lexicon UI: `grep -rn "VoteButtons" web --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next` → only `PendingContributions.tsx` (expressions, grammar rules), `VoteButtons.tsx` itself, and community texts/forum users; no `table="lexicon"`.

- [ ] **Step 3:** Remind the user that `20261001000000_*.sql` and `20261001000001_*.sql` still have to be applied to production (project `agdqbzbjcxrzfhkvempe`) before the web deploy; do not apply them yourself without being asked.

- [ ] **Step 4:** Use superpowers:finishing-a-development-branch.
