# French Meaning Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a contributor types a French sense in the lexicon entry form, propose existing entries that already have that French meaning, with "open" and "add my spelling as a variant" actions.

**Architecture:** A new immutable SQL normaliser (`french_match_norm`) plus an RPC (`find_lexicon_by_french`) that matches `lexicon_translations` exactly on the normalised form, same dialect only. A thin client function (`findByFrench`) and a new `FrenchMatches` component (stateful) wrapping a pure `FrenchMatchesList` (presentational), rendered under each sense input of the shared `EntryForm`. The Bété-side `SimilarWords` / `SimilarWordsList` pair is the model for every UI decision.

**Tech Stack:** Postgres (Supabase migrations, plpgsql), Next.js (App Router, client components), TypeScript, Vitest (unit + RLS suite against the local Supabase stack).

**Spec:** `docs/superpowers/specs/2026-10-06-french-meaning-suggestions-design.md`

## Global Constraints

- Work on `master` in the main folder. Do NOT create a branch or worktree. Before every commit run `git branch --show-current` (must print `master`) and stage explicit paths only (the folder is shared with other Claude sessions).
- Safari 16.1 compatibility: no browser features beyond what `SimilarWords.tsx` / `SimilarWordsList.tsx` already use.
- No new dependencies.
- Matching is normalised **exact** only: case, accents, surrounding whitespace and one leading article (le, la, les, l', un, une, des, du, de la) are ignored. No near or contains matching.
- Same dialect only. Default kind is `'word'`.
- Search starts 400 ms after typing, from 2 characters (up to 200); at most 3 matches shown.
- Migrations are re-runnable (`create or replace`, `if not exists`); the next free version is `20261012000000`.
- `web/AGENTS.md`: this is not the Next.js you know. This plan adds no new Next APIs (only a `next/link` use copied from `SimilarWordsList.tsx`), so no docs lookup is needed unless you deviate.
- User-facing text is French, copy matching the surrounding components.
- Prod migration is applied only after the user approves (Task 4). Never apply DDL to prod on your own.

## Review Focus

- Article-only input ("le", "l'", "de la ") must return no rows, never every entry ("l'" normalises to empty; a bare "le" is kept as is and matches only an entry literally translated "le").
- A match whose Bété spelling equals the spelling being typed: the variant button would fail with `spelling_exists`, so only "open" is offered.
- Homonyms ("banque" for two different words): the hint shows each match's context so the contributor can tell them apart; it never blocks creation.
- Placeholder rows (`bete_phonetic = ''`) and other-dialect rows must never be suggested.
- Stale results: typing "chien" then "chat" must never show the "chien" results under "chat".
- Signed-out contributor: no variant button, a "Connectez-vous" line instead.
- A failing RPC or `addSpelling`: search failure shows nothing; add failure shows the existing French error message.

---

## File Structure

- Create `supabase/migrations/20261012000000_find_lexicon_by_french.sql`: `french_match_norm`, expression index, `find_lexicon_by_french`.
- Create `web/__tests__/rls/find-lexicon-by-french.test.ts`: RPC behaviour against the local DB.
- Modify `web/lib/lexicon-links-data.ts`: add `FrenchMatch` type and `findByFrench`.
- Modify `web/lib/contribution.ts`: add `shouldSearchFrench`.
- Modify `web/__tests__/lexicon-links-data.test.ts`: tests for `findByFrench`.
- Modify `web/__tests__/contribution.test.ts`: test for `shouldSearchFrench`.
- Create `web/components/FrenchMatchesList.tsx`: presentational hint.
- Create `web/components/FrenchMatches.tsx`: stateful search + add-variant wrapper.
- Create `web/__tests__/french-matches.test.tsx`: tests for the list.
- Modify `web/components/word-link/EntryForm.tsx`: render `FrenchMatches` under each sense.

Run all `npm` commands from `web/`; all `git` and `supabase` commands from the repo root `C:\Users\DELL LATITUDE 7480\traduction bété`.

---

### Task 1: Database function and RPC

**Files:**
- Create: `supabase/migrations/20261012000000_find_lexicon_by_french.sql`
- Test: `web/__tests__/rls/find-lexicon-by-french.test.ts`

**Interfaces:**
- Consumes: `search_norm(text)` (immutable, in `public`), `lexicon_summary(uuid, uuid)`, tables `lexicon` and `lexicon_translations`.
- Produces: SQL `french_match_norm(t text) returns text`; RPC `find_lexicon_by_french(p_french text, p_dialect text, p_kind text default 'word', p_limit int default 6)` returning rows `(matched text, context text, entry jsonb)` where `entry` has the `lexicon_summary` shape. Callable by `anon` and `authenticated`.

- [ ] **Step 1: Check the local stack**

Run: `docker ps` and `supabase status`.
Expected: the local Supabase stack is up (ports can vary; memory says check `docker ps` first). If not, start it per the project notes (`supabase stop` then `supabase start -x …` if a plain `supabase start` fails). Never stop the Bartender-Google processes.

- [ ] **Step 2: Write the failing RLS test**

Create `web/__tests__/rls/find-lexicon-by-french.test.ts`:

```ts
// web/__tests__/rls/find-lexicon-by-french.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, must, uid } from './helpers'

type Row = { matched: string; context: string | null; entry: { id: string; spelling: string; dialect: string } }

describe('find_lexicon_by_french', () => {
  const tag = `zq${uid()}`
  const ids: Record<string, string> = {}

  async function seed(key: string, french: string, extra: Record<string, unknown> = {}) {
    ids[key] = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${key}-${tag}`,
          bete_phonetic: `${tag}-${key}`,
          french_candidates: [],
          top_french: french,
          probability: 1,
          pos: ['noun'],
          ...extra,
        })
        .select('id')
        .single(),
      `seed ${key}`,
    ).id
  }

  const find = async (args: Record<string, unknown>) =>
    must(await anonClient().rpc('find_lexicon_by_french', args), 'find') as Row[]
  const idsOf = (rows: Row[]) => rows.map(r => r.entry.id)

  beforeAll(async () => {
    await seed('plain', `${tag}été`)
    await seed('north', `${tag}été`, { dialect: 'northern' })
    await seed('pending', `${tag}été`, { bete_phonetic: '', bete_word: `_pending_${tag}` })
    await seed('other', `${tag}hiver`)
    must(
      await admin
        .from('lexicon_translations')
        .insert({ lexicon_id: ids.other, french: `${tag}saison froide`, context: 'climat' })
        .select('id')
        .single(),
      'second sense',
    )
  })

  it('matches ignoring case, accents and surrounding spaces', async () => {
    for (const q of [`${tag}été`, `${tag}ETE`, `  ${tag}Eté  `]) {
      expect(idsOf(await find({ p_french: q, p_dialect: 'western' }))).toContain(ids.plain)
    }
  })

  it('ignores one leading article', async () => {
    for (const q of [`le ${tag}été`, `L'${tag}été`, `l’${tag}été`, `un ${tag}ete`, `des ${tag}été`, `de la ${tag}été`]) {
      expect(idsOf(await find({ p_french: q, p_dialect: 'western' }))).toContain(ids.plain)
    }
  })

  it('also matches a stored translation that starts with an article', async () => {
    must(
      await admin.from('lexicon_translations').insert({ lexicon_id: ids.plain, french: `la ${tag}chaleur` }).select('id').single(),
      'article translation',
    )
    expect(idsOf(await find({ p_french: `${tag}chaleur`, p_dialect: 'western' }))).toContain(ids.plain)
  })

  it('reports which translation matched and its context', async () => {
    const hit = (await find({ p_french: `${tag}saison froide`, p_dialect: 'western' })).find(r => r.entry.id === ids.other)
    expect(hit?.matched).toBe(`${tag}saison froide`)
    expect(hit?.context).toBe('climat')
  })

  it('is exact: no near or partial matches', async () => {
    expect(idsOf(await find({ p_french: `${tag}ét`, p_dialect: 'western' }))).not.toContain(ids.plain)
    expect(idsOf(await find({ p_french: `${tag}étés`, p_dialect: 'western' }))).not.toContain(ids.plain)
    expect(idsOf(await find({ p_french: `${tag}saison`, p_dialect: 'western' }))).not.toContain(ids.other)
  })

  it('stays in the requested dialect', async () => {
    const western = idsOf(await find({ p_french: `${tag}été`, p_dialect: 'western' }))
    expect(western).toContain(ids.plain)
    expect(western).not.toContain(ids.north)
    expect(idsOf(await find({ p_french: `${tag}été`, p_dialect: 'northern' }))).toEqual([ids.north])
  })

  it('never suggests placeholders', async () => {
    expect(idsOf(await find({ p_french: `${tag}été`, p_dialect: 'western' }))).not.toContain(ids.pending)
  })

  it('returns one row per entry even when several translations match', async () => {
    must(
      await admin.from('lexicon_translations').insert({ lexicon_id: ids.plain, french: `${tag}été`, context: 'saison' }).select('id').single(),
      'duplicate meaning with a context',
    )
    const rows = await find({ p_french: `${tag}été`, p_dialect: 'western' })
    expect(rows.filter(r => r.entry.id === ids.plain)).toHaveLength(1)
  })

  it('returns nothing for blank, article-only or over-long input', async () => {
    for (const q of ['', '   ', 'le', 'le ', "l'", 'de la ', 'x'.repeat(201)]) {
      expect(await find({ p_french: q, p_dialect: 'western' })).toEqual([])
    }
  })

  it('returns nothing, not an error, for a null argument', async () => {
    expect(await find({ p_french: null, p_dialect: 'western' })).toEqual([])
  })

  it('caps the number of rows', async () => {
    expect((await find({ p_french: `${tag}été`, p_dialect: null, p_limit: 1 })).length).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `web/`): `npm run test:rls -- find-lexicon-by-french`
Expected: FAIL, `must` throws "find: Could not find the function public.find_lexicon_by_french …".

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261012000000_find_lexicon_by_french.sql`:

```sql
-- supabase/migrations/20261012000000_find_lexicon_by_french.sql
-- Suggest existing entries from a typed French meaning (the French counterpart of find_lexicon_candidates).
-- Exact match on a normal form: case, accents, extra spaces and one leading article are ignored.
-- Re-runnable.

set local search_path = public, extensions;

-- ── 1. normal form of a French meaning ──────────────────────────────────────────────────────────
-- 'La  Chaleur' -> 'chaleur', "l'été" -> 'ete', 'de la pluie' -> 'pluie'. Only one article is dropped,
-- and only before something else: "l'" alone becomes '' (the RPC then returns nothing); a bare "le" has no trailing text, so it is kept.
create or replace function french_match_norm(t text)
returns text language sql immutable parallel safe as $$
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
```

- [ ] **Step 5: Apply the migration to the local stack**

Run (repo root): `supabase migration up`
Expected: applies `20261012000000_find_lexicon_by_french.sql` with no error. If the index creation complains the function is not immutable, `search_norm` is the cause: check `\df+ search_norm` is `immutable` locally and stop to report rather than loosening the function.

- [ ] **Step 6: Run the test to verify it passes**

Run (from `web/`): `npm run test:rls -- find-lexicon-by-french`
Expected: all tests PASS. If the full RLS suite later hits the local signup limit (30 per 5 minutes), run test files in groups, not all at once.

- [ ] **Step 7: Run the migrations test**

Run (from `web/`): `npx vitest run __tests__/migrations.test.ts`
Expected: PASS (unique version, no policy created here).

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add supabase/migrations/20261012000000_find_lexicon_by_french.sql web/__tests__/rls/find-lexicon-by-french.test.ts
git commit -m "feat(lexicon): find existing entries from a French meaning

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Client function and search guard

**Files:**
- Modify: `web/lib/lexicon-links-data.ts` (add after `findCandidates`, which ends near line 59)
- Modify: `web/lib/contribution.ts` (add after `shouldSearchSimilar`, line 42-45)
- Test: `web/__tests__/lexicon-links-data.test.ts`, `web/__tests__/contribution.test.ts`

**Interfaces:**
- Consumes: RPC `find_lexicon_by_french` from Task 1 (rows `{ matched, context, entry }`), existing `parseLex` imported in `lexicon-links-data.ts`.
- Produces:
  - `export interface FrenchMatch { matched: string; context: string | null; entry: LexSummary }`
  - `export async function findByFrench(client: SupabaseClient, a: { text: string; dialect: string; kind?: 'word' | 'marker' | null; limit?: number }): Promise<FrenchMatch[]>` (never throws, `[]` on error or blank text; sends `p_french` trimmed, `p_dialect`, `p_kind` defaulting to `'word'`, `p_limit` defaulting to 6)
  - `export function shouldSearchFrench(text: string): boolean` (true for 2 to 200 trimmed characters)

- [ ] **Step 1: Write the failing tests**

In `web/__tests__/lexicon-links-data.test.ts`, change the import line to add `findByFrench`:

```ts
import { addSense, addSpelling, createEntry, findByFrench, findCandidates, getEntry, lexErrorMessage, setMarkerMeaning } from '@/lib/lexicon-links-data'
```

Append at the end of the file:

```ts
describe('findByFrench', () => {
  it('maps rows and passes the parameters', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ matched: 'ciel', context: 'en haut', entry: rawEntry }], error: null })
    const out = await findByFrench(fake(rpc), { text: ' le ciel ', dialect: 'western' })
    expect(rpc).toHaveBeenCalledWith('find_lexicon_by_french', { p_french: 'le ciel', p_dialect: 'western', p_kind: 'word', p_limit: 6 })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ matched: 'ciel', context: 'en haut' })
    expect(out[0].entry).toMatchObject({ id: 'L1', spelling: 'ghèhi-wu' })
  })
  it('keeps a missing context as null and a missing matched text as the first sense', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ entry: rawEntry }], error: null })
    const out = await findByFrench(fake(rpc), { text: 'ciel', dialect: 'western', limit: 3 })
    expect(out[0].context).toBeNull()
    expect(out[0].matched).toBe('ciel')
    expect(rpc).toHaveBeenCalledWith('find_lexicon_by_french', expect.objectContaining({ p_limit: 3 }))
  })
  it('returns nothing on error, on blank text and on garbage rows', async () => {
    expect(await findByFrench(fake(vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } })), { text: 'a', dialect: 'western' })).toEqual([])
    const rpc = vi.fn()
    expect(await findByFrench(fake(rpc), { text: '   ', dialect: 'western' })).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    expect(await findByFrench(fake(vi.fn().mockResolvedValue({ data: [{ entry: null }, 5], error: null })), { text: 'a', dialect: 'western' })).toEqual([])
  })
})
```

In `web/__tests__/contribution.test.ts`, find the existing import from `@/lib/contribution` and add `shouldSearchFrench` to it, then append:

```ts
describe('shouldSearchFrench', () => {
  it('searches from 2 characters up to 200, ignoring surrounding spaces', () => {
    expect(shouldSearchFrench('')).toBe(false)
    expect(shouldSearchFrench(' a ')).toBe(false)
    expect(shouldSearchFrench('ab')).toBe(true)
    expect(shouldSearchFrench('x'.repeat(200))).toBe(true)
    expect(shouldSearchFrench('x'.repeat(201))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npx vitest run __tests__/lexicon-links-data.test.ts __tests__/contribution.test.ts`
Expected: FAIL, `findByFrench` / `shouldSearchFrench` is not exported (undefined is not a function).

- [ ] **Step 3: Implement `findByFrench`**

In `web/lib/lexicon-links-data.ts`, add directly after the `findCandidates` function:

```ts
/** An existing entry that already has the French meaning being typed. */
export interface FrenchMatch {
  /** The stored French that matched (may differ from what was typed by case, accents or an article). */
  matched: string
  context: string | null
  entry: LexSummary
}

function parseFrenchMatch(raw: unknown): FrenchMatch | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const entry = parseLex(r.entry)
  if (!entry) return null
  return {
    matched: typeof r.matched === 'string' ? r.matched : (entry.senses[0]?.french ?? ''),
    context: typeof r.context === 'string' && r.context.trim() ? r.context : null,
    entry,
  }
}

/** Entries of `dialect` that already have the French meaning `text` (exact after normalisation). */
export async function findByFrench(
  client: SupabaseClient,
  a: { text: string; dialect: string; kind?: 'word' | 'marker' | null; limit?: number },
): Promise<FrenchMatch[]> {
  const text = a.text.trim()
  if (!text) return []
  const { data, error } = await client.rpc('find_lexicon_by_french', {
    p_french: text,
    p_dialect: a.dialect,
    p_kind: a.kind === undefined ? 'word' : a.kind,
    p_limit: a.limit ?? 6,
  })
  if (error || !Array.isArray(data)) return []
  return data.map(parseFrenchMatch).filter((m): m is FrenchMatch => m !== null)
}
```

- [ ] **Step 4: Implement `shouldSearchFrench`**

In `web/lib/contribution.ts`, add directly after `shouldSearchSimilar`:

```ts
/** A French sense is worth looking up from 2 characters; the form field itself stops at 200. */
export function shouldSearchFrench(text: string): boolean {
  const t = text.trim()
  return t.length >= 2 && t.length <= 200
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `web/`): `npx vitest run __tests__/lexicon-links-data.test.ts __tests__/contribution.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add web/lib/lexicon-links-data.ts web/lib/contribution.ts web/__tests__/lexicon-links-data.test.ts web/__tests__/contribution.test.ts
git commit -m "feat(lexicon): client lookup of entries by French meaning

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hint component and form wiring

**Files:**
- Create: `web/components/FrenchMatchesList.tsx`
- Create: `web/components/FrenchMatches.tsx`
- Modify: `web/components/word-link/EntryForm.tsx` (imports at top; sense rows at lines 85-95)
- Test: `web/__tests__/french-matches.test.tsx`

**Interfaces:**
- Consumes: `FrenchMatch`, `findByFrench`, `addSpelling` from `@/lib/lexicon-links-data`; `shouldSearchFrench` from `@/lib/contribution`; `LexSummary` from `@/lib/word-blocks`; `createClient` from `@/lib/supabase-browser`.
- Produces:
  - `FrenchMatchesList` props: `{ matches: FrenchMatch[]; typed: string; userId: string | null; busy: boolean; added: { spelling: string; entry: LexSummary } | null; error: string; onAdd: (m: FrenchMatch) => void; onDismiss: () => void }`. Renders `null` when `added` is null and `matches` is empty.
  - `FrenchMatches` props: `{ text: string; dialect: string; spelling: string }` (`text` is the French sense being typed, `spelling` the Bété spelling field of the form).

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/french-matches.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrenchMatchesList } from '@/components/FrenchMatchesList'
import type { FrenchMatch } from '@/lib/lexicon-links-data'

const match = (id: string, spelling = `mot-${id}`, over: Partial<FrenchMatch> = {}): FrenchMatch => ({
  matched: 'ciel',
  context: null,
  entry: {
    id, kind: 'word', spelling, ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
    marker: { type: null, meaning: null, french: null }, senses: [{ id: 's', french: 'ciel', context: null }],
    senseId: null, spellings: [],
  },
  ...over,
})
const render = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <FrenchMatchesList matches={[]} typed="ghehi-wu" userId="u1" busy={false} added={null} error="" onAdd={() => {}} onDismiss={() => {}} {...over} />,
  )

describe('FrenchMatchesList', () => {
  it('shows nothing when there is no match and nothing was added', () => {
    expect(render()).toBe('')
  })
  it('names the existing entry, its meaning and a link to it', () => {
    const html = render({ matches: [match('e1', 'ghèhi-wu')] })
    expect(html).toContain('Ce sens existe déjà')
    expect(html).toContain('ghèhi-wu')
    expect(html).toContain('ciel')
    expect(html).toContain('/lexicon/e1')
  })
  it('shows the context of the matched meaning so homonyms can be told apart', () => {
    const html = render({ matches: [match('e1', 'ghèhi-wu', { context: 'en haut' })] })
    expect(html).toContain('en haut')
  })
  it('offers to add the typed spelling as a variant', () => {
    const html = render({ matches: [match('e1', 'ghèhi-wu')] })
    expect(html).toContain('C’est le même mot : ajouter ma graphie « ghehi-wu »')
    expect(html).toContain('Mot différent : continuer')
  })
  it('disables the variant button while no spelling is typed', () => {
    const html = render({ typed: '  ', matches: [match('e1')] })
    expect(html).toMatch(/<button[^>]*disabled[^>]*>C’est le même mot/)
  })
  it('only offers to open the entry when it already has the typed spelling', () => {
    const html = render({ typed: 'Ghèhi-Wu', matches: [match('e1', 'ghèhi-wu')] })
    expect(html).toContain('/lexicon/e1')
    expect(html).not.toContain('ajouter ma graphie')
  })
  it('asks a signed-out visitor to sign in instead of offering the button', () => {
    const html = render({ userId: null, matches: [match('e1')] })
    expect(html).toContain('Connectez-vous')
    expect(html).not.toContain('ajouter ma graphie')
  })
  it('confirms an added spelling with a link to the entry', () => {
    const e = match('e1', 'ghèhi-wu')
    const html = render({ added: { spelling: 'ghehi-wu', entry: e.entry }, matches: [e] })
    expect(html).toContain('Graphie « ghehi-wu » ajoutée')
    expect(html).toContain('/lexicon/e1')
    expect(html).not.toContain('Mot différent : continuer')
  })
  it('shows an error', () => {
    expect(render({ matches: [match('e1')], error: 'Cette graphie existe déjà pour cette entrée.' })).toContain('existe déjà pour cette entrée')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `web/`): `npx vitest run __tests__/french-matches.test.tsx`
Expected: FAIL, cannot resolve `@/components/FrenchMatchesList`.

- [ ] **Step 3: Implement `FrenchMatchesList`**

Create `web/components/FrenchMatchesList.tsx`:

```tsx
'use client'
import Link from 'next/link'
import type { FrenchMatch } from '@/lib/lexicon-links-data'
import type { LexSummary } from '@/lib/word-blocks'

interface Props {
  matches: FrenchMatch[]
  /** What the contributor typed in the spelling field: the spelling that would be added to an existing entry. */
  typed: string
  /** null: signed out. */
  userId: string | null
  busy: boolean
  /** Set once a spelling was added: replaces the list with a confirmation. */
  added: { spelling: string; entry: LexSummary } | null
  error: string
  onAdd: (m: FrenchMatch) => void
  onDismiss: () => void
}

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50'

const sameSpelling = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** « Ce sens existe déjà » under a French sense field of the word form. */
export function FrenchMatchesList({ matches, typed, userId, busy, added, error, onAdd, onDismiss }: Props) {
  if (added) {
    return (
      <p className="text-sm text-primary" role="status">
        Graphie « {added.spelling} » ajoutée à la fiche de{' '}
        <Link href={`/lexicon/${added.entry.id}`} className="font-semibold underline underline-offset-2">
          {added.entry.spelling}
        </Link>
        .
      </p>
    )
  }
  if (matches.length === 0) return null

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-50/50 p-3 text-sm dark:bg-amber-950/20">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ce sens existe déjà</p>
      <ul className="space-y-2">
        {matches.map(m => (
          <li key={m.entry.id} className="space-y-1">
            <p>
              <span className="font-semibold">{m.entry.spelling}</span>
              <span className="text-muted-foreground">
                {' '}: {m.matched}
                {m.context ? ` (${m.context})` : ''}
              </span>
            </p>
            {sameSpelling(m.entry.spelling, typed) ? (
              <p className="text-xs">
                <Link href={`/lexicon/${m.entry.id}`} className="text-primary underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              </p>
            ) : userId ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${btn} bg-primary text-primary-foreground`}
                  disabled={busy || typed.trim() === ''}
                  onClick={() => onAdd(m)}
                >
                  C’est le même mot : ajouter ma graphie « {typed.trim()} »
                </button>
                <Link href={`/lexicon/${m.entry.id}`} className="text-xs text-primary underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Connectez-vous pour ajouter votre graphie à cette fiche.{' '}
                <Link href={`/lexicon/${m.entry.id}`} className="text-primary underline underline-offset-2">
                  Ouvrir la fiche
                </Link>
              </p>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      <button type="button" className={btn} onClick={onDismiss}>
        Mot différent : continuer
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `web/`): `npx vitest run __tests__/french-matches.test.tsx`
Expected: PASS (9 tests). If the "disabled" regex test fails because React renders attributes in a different order, adjust the regex to `/<button[^>]*disabled=""[^>]*>C’est le même mot/`, not the component.

- [ ] **Step 5: Implement `FrenchMatches`**

Create `web/components/FrenchMatches.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { FrenchMatchesList } from '@/components/FrenchMatchesList'
import { shouldSearchFrench } from '@/lib/contribution'
import { addSpelling, findByFrench, type FrenchMatch } from '@/lib/lexicon-links-data'
import { createClient } from '@/lib/supabase-browser'
import type { LexSummary } from '@/lib/word-blocks'

const DEBOUNCE_MS = 400
const SHOWN = 3

/**
 * Under a French sense field of the word form: looks for entries of the same dialect that already have
 * this meaning, so the contributor can add their spelling to one of them instead of duplicating it.
 */
export function FrenchMatches({ text, dialect, spelling }: { text: string; dialect: string; spelling: string }) {
  const client = useMemo(() => createClient(), [])
  const [userId, setUserId] = useState<string | null>(null)
  // Results belong to the text they were searched for: while the next search is pending nothing stale is shown.
  const [found, setFound] = useState<{ forText: string; rows: FrenchMatch[] }>({ forText: '', rows: [] })
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  // Confirmation and error belong to the spelling they were produced for: typing again clears them.
  const [addedFor, setAddedFor] = useState<{ spelling: string; entry: LexSummary } | null>(null)
  const [errorFor, setErrorFor] = useState<{ spelling: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const typedFrench = text.trim()
  const typedSpelling = spelling.trim()

  useEffect(() => {
    client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [client])

  useEffect(() => {
    if (!shouldSearchFrench(text)) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const rows = await findByFrench(client, { text, dialect, kind: 'word', limit: SHOWN + 1 })
      if (!cancelled) setFound({ forText: text, rows: rows.slice(0, SHOWN) })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [client, text, dialect])

  async function onAdd(m: FrenchMatch) {
    setBusy(true)
    setErrorFor(null)
    const res = await addSpelling(client, m.entry.id, spelling)
    setBusy(false)
    if (res.error) {
      setErrorFor({ spelling: typedSpelling, message: res.error })
      return
    }
    setAddedFor({ spelling: typedSpelling, entry: m.entry })
  }

  if (dismissedFor === typedFrench) return null
  return (
    <FrenchMatchesList
      matches={shouldSearchFrench(text) && found.forText === text ? found.rows : []}
      typed={spelling}
      userId={userId}
      busy={busy}
      added={addedFor?.spelling === typedSpelling ? addedFor : null}
      error={errorFor?.spelling === typedSpelling ? errorFor.message : ''}
      onAdd={onAdd}
      onDismiss={() => setDismissedFor(typedFrench)}
    />
  )
}
```

- [ ] **Step 6: Wire it into `EntryForm`**

In `web/components/word-link/EntryForm.tsx`, add this import after the existing `@/lib/lexicon-links` import (line 3):

```tsx
import { FrenchMatches } from '@/components/FrenchMatches'
```

Then replace the sense row (the `f.senses.map` block, currently):

```tsx
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
```

with:

```tsx
          {f.senses.map((s, i) => (
            <div key={i} className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label={i === 0 ? 'Mot en français' : `Sens ${i + 1}`}>
                  <input className={inputClass} value={s.french} maxLength={200} onChange={e => setSense(i, { french: e.target.value })} />
                </Field>
                <Field label="Contexte (optionnel)">
                  <input className={inputClass} value={s.context} maxLength={300} onChange={e => setSense(i, { context: e.target.value })} />
                </Field>
              </div>
              <FrenchMatches text={s.french} dialect={f.dialect} spelling={f.spelling} />
            </div>
          ))}
```

The hint is rendered only for `kind === 'word'` already, since this block sits inside the existing `kind === 'word'` fieldset.

- [ ] **Step 7: Type-check, lint and run the affected test files**

Run (from `web/`):
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run __tests__/french-matches.test.tsx __tests__/lexicon-picker.test.tsx __tests__/resource-steps.test.tsx __tests__/contribution-form.test.tsx __tests__/contribution-pronunciation.test.tsx`

Expected: no type or lint errors; all PASS. Existing tests that render `EntryForm` with `renderToStaticMarkup` do not run effects, but `createClient()` from `@/lib/supabase-browser` runs during render of `FrenchMatches`. If any of them fails with a missing-env error from `createClient`, look at how `similar-words`-using tests (`contribution-form.test.tsx`) cope (a `vi.mock('@/lib/supabase-browser', …)`), and apply the same mock in the failing test file. Do not change `FrenchMatches` to avoid the call.

- [ ] **Step 8: Manual check in the browser**

Run (from `web/`): `npm run dev` (if it crashes on the deep Windows path, use a short worktree as the project notes say; this one-off is the only allowed exception to the no-worktree rule, ask the user first). Open `/contribute`, tab "Mot du lexique", dialect western. With a word whose sense is, e.g., "ciel" already in the lexicon: typing "le Ciel" in "Mot en français" shows "Ce sens existe déjà" with the Bété spelling; the variant button is disabled until a spelling is typed; clicking it shows "Graphie « … » ajoutée"; "Mot différent : continuer" hides the hint. Check the same in the resource panel's "create" form. If you cannot run the browser, say so plainly in the hand-off instead of claiming it works.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add web/components/FrenchMatchesList.tsx web/components/FrenchMatches.tsx web/components/word-link/EntryForm.tsx web/__tests__/french-matches.test.tsx
git commit -m "feat(lexicon): suggest existing entries while typing a French sense

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

If Step 7 required a mock in another test file, add that file's path to the `git add`.

---

### Task 4: Wrap-up and prod rollout

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-french-meaning-suggestions-design.md` (status line)

**Interfaces:**
- Consumes: Tasks 1-3 merged on `master`.
- Produces: spec marked implemented; migration applied to prod only with explicit user approval.

- [ ] **Step 1: Run the whole unit suite**

Run (from `web/`): `npx vitest run`
Expected: all PASS. Report any failure that is not caused by this change as pre-existing, with its output.

- [ ] **Step 2: Run the RLS files most likely to be affected, in groups**

Run (from `web/`): `npm run test:rls -- find-lexicon-by-french search-lexicon lexicon-translations lexicon-from-word-links`
Expected: PASS. (The full suite can exceed the local signup limit; do not run it in one go.)

- [ ] **Step 3: Mark the spec implemented**

In the spec, replace the status line `Status: spec, not implemented.` with `Status: implemented on master (see the commits for \`find_lexicon_by_french\`), not pushed. Prod migration not applied yet.`

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add docs/superpowers/specs/2026-10-06-french-meaning-suggestions-design.md
git commit -m "docs: mark the French meaning suggestions spec as implemented

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ask before touching prod**

Do not push and do not apply anything to prod yet. Tell the user the migration `20261012000000_find_lexicon_by_french.sql` is the only DB change (new function, one index, one RPC; nothing dropped), and ask whether to apply it to prod (Supabase ref `agdqbzbjcxrzfhkvempe`, via `apply_migration`, or by the SQL editor if the tool declines) and whether to push `master`. Apply only after a yes. After applying, verify with a read-only `select * from find_lexicon_by_french('ciel', 'western')` call and report the result.
