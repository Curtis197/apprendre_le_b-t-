# Contribute Page: Pronunciation Recording, No Voting, No Funding UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove voting (contributions are usable at once), let a contributor record a word's pronunciation in the word form, and hide the funding UI for the moment.

**Architecture:** One SQL migration removes the vote functions, the auto-validation triggers and the two "vote" update policies, and makes expressions and grammar rules validated by default; the web loses `VoteButtons`, `PendingContributions` and every vote count; the word form gets a small `ContributionPronunciation` block that keeps a recording in memory and uploads it with the existing `uploadPronunciation` once the entry exists; the donate form is no longer mounted.

**Tech Stack:** Next.js 16.2 / React 19, Supabase (Postgres, RLS, Storage), Vitest (unit + RLS), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-05-contribute-page-voting-audio-funding-design.md` (read it first). The audio pieces reused here come from `docs/superpowers/plans/2026-10-04-lexicon-pronunciation-audio.md` (already built).

## Global Constraints

- **No branch, no worktree** (project policy since 2026-10-04): work on `master` in `C:\Users\DELL LATITUDE 7480\traduction bété`. Run `git branch --show-current` (must print `master`) and `git status` before every commit; stage explicit paths only (never `git add -A`; an untracked `node_modules/` at the repo root is not ours — leave it); never push (the user pushes).
- One migration: `supabase/migrations/20261010000000_remove_voting.sql`, re-runnable (`drop … if exists`, idempotent updates).
- Deleting `web/components/VoteButtons.tsx` and `web/components/PendingContributions.tsx` is **intended** (spec, Part A). Use `git rm` for those two files only; no other deletion.
- Kept on purpose: the `upvotes` columns, the `user_votes` table and its policy, the **lexicon** update policy `"lexicon upvote"` (description editing and `lexicon_guard_update` rely on it), `community_texts.validated`, `web/lib/types.ts` (`upvotes` stays on the interfaces), `ContributeRefreshProvider` (the form still calls `bumpRefresh`), and everything donation-related except the two mounts (`DonateForm`, `FundingWidget`, `lib/donation.ts`, `/api/donate/*`, the `contributions` table). `app/api/donate/webhook/route.ts` must not change.
- All user-visible text is French; curly apostrophes (U+2019) written as `’` in text (never flattened to `'`).
- Safari 16.1 floor: no `color-mix`, no `:has()`; existing Tailwind tokens only.
- Never run the migration against production; the user applies it by hand (Task 5 ends there).
- Local checks: apply SQL with `docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261010000000_remove_voting.sql`, then `docker exec supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -c "notify pgrst, 'reload schema'"` and wait ~10 s. RLS tests from `web/`: `npm run test:rls -- <filter>` (one file at a time: local signup limit 30 per 5 minutes). Unit tests: `npx vitest run <filter>`; types: `npx tsc --noEmit`.

## Review Focus

1. **Pending rows when the migration runs**: every existing unvalidated expression and grammar rule becomes validated, none stays stuck (Task 1 step 4 check).
2. **Word saved, audio upload fails** (limit reached, network, entry race): the word stays, the form says so and how to redo it (Task 4 tests on `audioOutcome` and the message).
3. **Claiming an untranslated placeholder with a recording**: the audio is attached to the claimed entry, not skipped (Task 4 wiring + manual check).
4. **Pages that read `upvotes` for ordering or JSON-LD**: forum thread structured data stays valid JSON without the like counter; grammar and resources lists still sort (Task 2 source test + build).
5. **A vote attempted between migration and deploy** fails with a missing function: acceptable for minutes; nothing else calls `vote` (Task 2 source test: no remaining `rpc('vote'` anywhere in `web/` outside tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261010000000_remove_voting.sql` (create) | Backfill, defaults, drop triggers/functions/policies |
| `web/__tests__/rls/remove-voting.test.ts` (create) | SQL tests for Part A |
| `web/__tests__/rls/function-grants.test.ts`, `lexicon-translations.test.ts`, `resources-community.test.ts` (modify) | Drop the tests that call `vote` |
| `web/app/contribute/page.tsx` (modify) | No pending section, new texts, no donate form |
| `web/app/page.tsx` (modify) | No donate form |
| `web/app/forum/page.tsx`, `web/app/forum/[id]/page.tsx`, `web/app/grammar/page.tsx`, `web/app/resources/page.tsx`, `web/lib/community.ts` (modify) | No vote counts, new ordering |
| `web/components/VoteButtons.tsx`, `web/components/PendingContributions.tsx` (delete) | Voting UI |
| `web/lib/contribution.ts` (modify) | `audioOutcome`, `audioFailedMessage` |
| `web/components/ContributionPronunciation.tsx` (create) | Optional recording block for the word form |
| `web/components/ContributionForm.tsx` (modify) | Wires the block and the upload; success message |
| `web/__tests__/no-vote-ui.test.ts`, `web/__tests__/funding-ui-hidden.test.ts`, `web/__tests__/contribution-pronunciation.test.tsx`, `web/__tests__/contribution.test.ts` (create/modify) | Source and markup tests |

Task order: 1 (SQL) → 2 (voting web) → 3 (funding) → 4 (recording) → 5 (verification).

---

### Task 1: Migration and SQL tests (Part A, database)

**Files:**
- Create: `supabase/migrations/20261010000000_remove_voting.sql`
- Create: `web/__tests__/rls/remove-voting.test.ts`
- Modify: `web/__tests__/rls/function-grants.test.ts`, `web/__tests__/rls/lexicon-translations.test.ts`, `web/__tests__/rls/resources-community.test.ts`

**Interfaces:**
- Produces: `expressions.validated` and `grammar_rules.validated` default `true`; the functions `vote(text, uuid, text)`, `increment_upvotes(...)` and `auto_validate_on_upvotes()` no longer exist; the policies `"grammar_rules vote"` and `"expressions vote"` no longer exist; the three `trg_auto_validate_*` triggers no longer exist.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/rls/remove-voting.test.ts`:

```ts
// web/__tests__/rls/remove-voting.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createUser, must, uid, type TestUser } from './helpers'

const ZERO = '00000000-0000-0000-0000-000000000000'

const newExpression = (by: string, over: Record<string, unknown> = {}) => ({
  french_phrase: `bon courage ${uid()}`, bete_phrase: 'abc', bete_phonetic: 'abc', type: 'fixed', created_by: by, ...over,
})
const newRule = (by: string, over: Record<string, unknown> = {}) => ({
  category: 'verb', pattern_french: `je ${uid()}`, pattern_bete: 'mi', description: 'Une règle.', created_by: by, ...over,
})

describe('voting removed', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('rv-alice'), createUser('rv-bob')])
  })

  it('has no vote or increment function left (PostgREST: not found)', async () => {
    const vote = await alice.client.rpc('vote', { p_table_name: 'expressions', p_row_id: ZERO, p_direction: 'up' })
    expect(vote.error?.code).toBe('PGRST202')
    const inc = await alice.client.rpc('increment_upvotes', { table_name: 'expressions', row_id: ZERO, delta: 1 })
    expect(inc.error?.code).toBe('PGRST202')
  })

  it('validates a new expression and a new grammar rule by default', async () => {
    const e = must(await alice.client.from('expressions').insert(newExpression(alice.id)).select('validated').single(), 'expression')
    expect(e.validated).toBe(true)
    const r = must(await alice.client.from('grammar_rules').insert(newRule(alice.id)).select('validated').single(), 'rule')
    expect(r.validated).toBe(true)
  })

  it('no longer flips `validated` when the score reaches 3', async () => {
    const e = must(await admin.from('expressions').insert(newExpression(alice.id, { validated: false })).select('id').single(), 'expression')
    await admin.from('expressions').update({ upvotes: 5 }).eq('id', e.id)
    expect(must(await admin.from('expressions').select('validated').eq('id', e.id).single(), 'row').validated).toBe(false)
    const r = must(await admin.from('grammar_rules').insert(newRule(alice.id, { validated: false })).select('id').single(), 'rule')
    await admin.from('grammar_rules').update({ upvotes: 5 }).eq('id', r.id)
    expect(must(await admin.from('grammar_rules').select('validated').eq('id', r.id).single(), 'row').validated).toBe(false)
  })

  it('lets nobody but the service role update an expression or a grammar rule', async () => {
    const e = must(await alice.client.from('expressions').insert(newExpression(alice.id)).select('id, french_phrase').single(), 'expression')
    await bob.client.from('expressions').update({ french_phrase: 'piraté' }).eq('id', e.id)
    await alice.client.from('expressions').update({ french_phrase: 'piraté' }).eq('id', e.id)
    expect(must(await admin.from('expressions').select('french_phrase').eq('id', e.id).single(), 'row').french_phrase).toBe(e.french_phrase)
    const r = must(await alice.client.from('grammar_rules').insert(newRule(alice.id)).select('id, description').single(), 'rule')
    await bob.client.from('grammar_rules').update({ description: 'piraté' }).eq('id', r.id)
    expect(must(await admin.from('grammar_rules').select('description').eq('id', r.id).single(), 'row').description).toBe(r.description)
  })

  it('keeps inserting under one’s own name only', async () => {
    expect((await bob.client.from('expressions').insert(newExpression(alice.id))).error).not.toBeNull()
    expect((await bob.client.from('grammar_rules').insert(newRule(alice.id))).error).not.toBeNull()
  })

  it('keeps the votes table and the lexicon description editing', async () => {
    expect((await admin.from('user_votes').select('user_id').limit(1)).error).toBeNull()
    const w = must(
      await admin.from('lexicon').insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'x', probability: 1, created_by: alice.id }).select('id').single(),
      'word',
    )
    await bob.client.from('lexicon').update({ description: 'Une définition.' }).eq('id', w.id)
    expect(must(await admin.from('lexicon').select('description').eq('id', w.id).single(), 'row').description).toBe('Une définition.')
  })
})
```

In the three existing RLS test files, make these edits (open each file at the quoted place):
1. `function-grants.test.ts`, test `refuses anonymous callers with a permission error`: delete the `const vote = …` call and its `expect(vote.error?.code).toBe('42501')` line (lines ~42-47); keep the `submit_quiz` part and everything after.
2. `lexicon-translations.test.ts`: delete the whole test `keeps voting working: the vote function may write the score the guard protects` (lines ~270-275).
3. `resources-community.test.ts`: delete the whole test `keeps voting working: the vote function may write the score the guard protects` (lines ~118-131).

- [ ] **Step 2: Run to verify it fails**

`npm run test:rls -- remove-voting` (from `web/`) → FAIL (the `vote` function still exists; defaults are false; the "vote" update policies still let Bob edit).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20261010000000_remove_voting.sql`:

```sql
-- supabase/migrations/20261010000000_remove_voting.sql
-- Voting is removed: contributions are usable at once and the community corrects them afterwards
-- (the model of resources). The upvotes columns and user_votes stay, inert.
-- Spec: docs/superpowers/specs/2026-10-05-contribute-page-voting-audio-funding-design.md
-- Re-runnable. Apply by hand in production (it drops triggers, functions and policies).

-- ── 1. what was waiting for votes is validated ──────────────────────────────────────────────────
update expressions set validated = true where not validated;
update grammar_rules set validated = true where not validated;

-- New contributions are validated from the start.
alter table expressions   alter column validated set default true;
alter table grammar_rules alter column validated set default true;

-- ── 2. no more validation by score ──────────────────────────────────────────────────────────────
drop trigger if exists trg_auto_validate_grammar_rules on grammar_rules;
drop trigger if exists trg_auto_validate_expressions on expressions;
drop trigger if exists trg_auto_validate_community_texts on community_texts;
drop function if exists auto_validate_on_upvotes();

-- ── 3. no more vote functions ───────────────────────────────────────────────────────────────────
drop function if exists vote(text, uuid, text);
drop function if exists increment_upvotes(text, uuid, int);
drop function if exists increment_upvotes(text, uuid);

-- ── 4. the "vote" update policies let any signed-in user edit any column of any row ─────────────
-- Nothing needs them once voting is gone. (The lexicon policy "lexicon upvote" stays: the description
-- editing and lexicon_guard_update rely on it.)
drop policy if exists "grammar_rules vote" on grammar_rules;
drop policy if exists "expressions vote" on expressions;
```

- [ ] **Step 4: Apply and run**

Apply the file twice in a row (the second run must succeed with no error), reload PostgREST, then run `npm run test:rls -- remove-voting` → PASS.
Backfill check (both counts must print `0`): do it with the **first** apply, before the tests insert unvalidated rows of their own. Insert two unvalidated rows first (`insert into expressions (french_phrase, bete_phrase, bete_phonetic, type, validated) values ('tmp-a','a','a','fixed', false);` and the same for `grammar_rules (category, pattern_french, pattern_bete, description, validated) values ('verb','tmp','a','d', false)`), apply the file, then `select count(*) from expressions where french_phrase = 'tmp-a' and not validated` and `select count(*) from grammar_rules where pattern_french = 'tmp' and not validated` must both print `0`; delete the two temporary rows afterwards. If `created_by` is NOT NULL on these tables, add a real user id from `auth.users` to the inserts.
Then run, one at a time: `npm run test:rls -- function-grants`, `npm run test:rls -- lexicon-translations`, `npm run test:rls -- resources-community`, `npm run test:rls -- corrections` → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add supabase/migrations/20261010000000_remove_voting.sql web/__tests__/rls/remove-voting.test.ts web/__tests__/rls/function-grants.test.ts web/__tests__/rls/lexicon-translations.test.ts web/__tests__/rls/resources-community.test.ts
git commit -m "feat: remove voting in the database, contributions are validated at once" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Remove the voting UI (Part A, web)

**Files:**
- Delete: `web/components/VoteButtons.tsx`, `web/components/PendingContributions.tsx` (`git rm`)
- Modify: `web/app/contribute/page.tsx`, `web/app/forum/page.tsx`, `web/app/forum/[id]/page.tsx`, `web/app/grammar/page.tsx`, `web/app/resources/page.tsx`, `web/lib/community.ts`, `web/components/ContributionForm.tsx`
- Create: `web/__tests__/no-vote-ui.test.ts`

**Interfaces:** none new. After this task nothing in `web/` imports `VoteButtons` or `PendingContributions` or calls `rpc('vote'`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/no-vote-ui.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

function sources(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap(name => {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name === '.next') return []
    if (statSync(path.join(root, rel)).isDirectory()) return sources(rel)
    return /\.(ts|tsx)$/.test(name) ? [rel] : []
  })
}

describe('voting UI is gone', () => {
  it('deleted the vote buttons and the pending list', () => {
    expect(existsSync(path.join(root, 'components/VoteButtons.tsx'))).toBe(false)
    expect(existsSync(path.join(root, 'components/PendingContributions.tsx'))).toBe(false)
  })

  it('has no import of them and no vote call outside the tests', () => {
    for (const f of [...sources('app'), ...sources('components'), ...sources('lib')]) {
      const src = read(f)
      expect(src, f).not.toMatch(/VoteButtons|PendingContributions/)
      expect(src, f).not.toMatch(/rpc\(\s*['"]vote['"]|increment_upvotes/)
    }
  })

  it('shows no vote count on the forum, grammar and resources pages', () => {
    for (const f of ['app/forum/page.tsx', 'app/forum/[id]/page.tsx', 'app/grammar/page.tsx', 'app/resources/page.tsx']) {
      expect(read(f), f).not.toContain('▲')
    }
    expect(read('app/forum/[id]/page.tsx')).not.toContain('LikeAction')
  })

  it('no longer orders by votes', () => {
    expect(read('app/grammar/page.tsx')).not.toMatch(/order\(\s*['"]upvotes['"]/)
    expect(read('lib/community.ts')).not.toMatch(/order\(\s*['"]upvotes['"]/)
  })

  it('tells contributors their contribution is available at once', () => {
    const page = read('app/contribute/page.tsx')
    expect(page).not.toMatch(/3 votes|Votez|En attente de validation|Validation communautaire/)
    expect(page).toContain('immédiatement disponibles')
    expect(read('components/ContributionForm.tsx')).not.toContain('après validation par la communauté')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

`npx vitest run no-vote-ui` (from `web/`) → FAIL.

- [ ] **Step 3: Implement**

1. `git rm web/components/VoteButtons.tsx web/components/PendingContributions.tsx`.
2. `web/app/contribute/page.tsx`:
   - Remove the imports `PendingContributions`, `DialectSelector`, and the `Clock` icon from the `lucide-react` import (keep `PenLine, ShieldCheck, CheckCircle2`).
   - Hero paragraph: replace « Les contributions avec 3 votes sont intégrées au traducteur. » by « Vos contributions sont immédiatement disponibles. ».
   - Guidelines list: replace the third `<li>` (« Validation communautaire » / « 3 votes positifs suffisent pour valider une contribution. ») by:
```tsx
              <li className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Correction communautaire</p>
                  <p className="text-xs text-muted-foreground">Chacun peut signaler une erreur ; l&apos;auteur et les administrateurs la corrigent.</p>
                </div>
              </li>
```
   - Delete the whole `{/* Pending Contributions */}` block (the `<div className="mb-10">` containing `<PendingContributions />`), keeping `</ContributeRefreshProvider>` after the two-column grid.
3. `web/components/ContributionForm.tsx`: in the `submitted` branch replace « Elle sera visible après validation par la communauté. » by « Elle est déjà disponible pour la communauté. ».
4. `web/app/forum/page.tsx`: delete the `{thread.upvotes > 0 && (<span …>▲ {thread.upvotes}</span>)}` block.
5. `web/app/forum/[id]/page.tsx`: remove the `LikeAction` entry from `interactionStatistic` (keep the `CommentAction` entry); delete the `{t.upvotes > 0 && (…)}` block in the thread header; delete the `{post.upvotes > 0 && (<>…</>)}` block in the post header.
6. `web/app/grammar/page.tsx`: `.order('upvotes', { ascending: false })` → `.order('created_at', { ascending: false })`; delete the `{rule.upvotes > 0 && (…)}` span (the wrapping `justify-between` div keeps the category badge).
7. `web/app/resources/page.tsx`: delete the `{text.upvotes > 0 && (…)}` span.
8. `web/lib/community.ts` `getCommunityTexts`: delete the line `.order('upvotes', { ascending: false })` (the `.order('created_at', …)` that follows stays).

- [ ] **Step 4: Run tests, types, lint, build**

`npx vitest run no-vote-ui` → PASS; `npx tsc --noEmit` → clean (if `Clock`, `DialectSelector` or other imports are now unused, `npm run lint` names them: remove them); `npm run lint` → no new errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git status
git add web/app/contribute/page.tsx web/app/forum/page.tsx "web/app/forum/[id]/page.tsx" web/app/grammar/page.tsx web/app/resources/page.tsx web/lib/community.ts web/components/ContributionForm.tsx web/__tests__/no-vote-ui.test.ts
git commit -m "feat: remove the voting UI and the pending-contributions list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(The `git rm` of step 3 already staged the two deletions: `git status` must show exactly those two files deleted plus the files added above, nothing else.)

---

### Task 3: Hide the funding UI (Part C)

**Files:**
- Modify: `web/app/page.tsx`, `web/app/contribute/page.tsx`
- Create: `web/__tests__/funding-ui-hidden.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/funding-ui-hidden.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

describe('funding UI hidden for the moment', () => {
  it('no longer mounts the donate form on the home and contribute pages', () => {
    for (const f of ['app/page.tsx', 'app/contribute/page.tsx']) {
      expect(read(f), f).not.toMatch(/DonateForm/)
    }
  })

  it('keeps the code and the Stripe routes so it can come back', () => {
    for (const f of [
      'components/DonateForm.tsx',
      'components/FundingWidget.tsx',
      'lib/donation.ts',
      'app/api/donate/checkout/route.ts',
      'app/api/donate/webhook/route.ts',
    ]) {
      expect(existsSync(path.join(root, f)), f).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

`npx vitest run funding-ui-hidden` → FAIL (both pages still mount the form).

- [ ] **Step 3: Implement**

1. `web/app/page.tsx`: remove `import { DonateForm } from '@/components/DonateForm'` and the block
```tsx
      {/* Financial contribution */}
      <Suspense fallback={null}>
        <DonateForm />
      </Suspense>
```
   Then look at the lines above it: the `<PatternDivider />` that preceded the block would now end the page. If nothing follows it, remove that `<PatternDivider />` too (and its import if unused). Remove the `Suspense` import only if nothing else in the file uses it.
2. `web/app/contribute/page.tsx`: remove `import { DonateForm } from '@/components/DonateForm'` and the same `{/* Financial contribution */}` Suspense block; remove the `Suspense` import if now unused.

- [ ] **Step 4: Run tests, types, lint**

`npx vitest run funding-ui-hidden no-vote-ui` → PASS; `npx tsc --noEmit` → clean; `npm run lint` → no new errors (unused imports are reported here).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/app/page.tsx web/app/contribute/page.tsx web/__tests__/funding-ui-hidden.test.ts
git commit -m "feat: hide the donate form on the home and contribute pages" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Record the pronunciation in the word form (Part B)

**Files:**
- Modify: `web/lib/contribution.ts`, `web/__tests__/contribution.test.ts`, `web/components/ContributionForm.tsx`
- Create: `web/components/ContributionPronunciation.tsx`, `web/__tests__/contribution-pronunciation.test.tsx`

**Interfaces:**
- Consumes: `PronunciationRecorder` props `maxSeconds`, `startLabel`, `sendLabel`, `sendingLabel`, `onSend(blob)`, `disabled`; `uploadPronunciation(client, { userId, lexiconId, blob }): Promise<Result<{ id: string }>>` from `@/lib/lexicon-audio-data`; `MAX_LEXICON_AUDIO_SECONDS` from `@/lib/lexicon-audio`.
- Produces in `lib/contribution.ts`:
```ts
export type AudioOutcome = 'none' | 'saved' | 'failed'
export function audioOutcome(a: { attempted: boolean; error: string | null }): AudioOutcome
export function audioFailedMessage(reason: string | null): string
```
- Produces in `ContributionPronunciation.tsx`:
```tsx
export function ContributionPronunciation(props: {
  blob: Blob | null
  onChange: (blob: Blob | null) => void
  disabled?: boolean
}): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/contribution.test.ts` (import `audioOutcome`, `audioFailedMessage` from `../lib/contribution`, matching that file's import style):

```ts
describe('audioOutcome', () => {
  it('says nothing when no recording was attempted', () => {
    expect(audioOutcome({ attempted: false, error: null })).toBe('none')
    expect(audioOutcome({ attempted: false, error: 'x' })).toBe('none')
  })
  it('distinguishes a sent recording from a failed one', () => {
    expect(audioOutcome({ attempted: true, error: null })).toBe('saved')
    expect(audioOutcome({ attempted: true, error: 'Vous avez déjà 3 enregistrements pour ce mot.' })).toBe('failed')
  })
})

describe('audioFailedMessage', () => {
  it('tells the word is saved and how to redo the recording', () => {
    const m = audioFailedMessage(null)
    expect(m).toMatch(/Mot enregistré/)
    expect(m).toMatch(/fiche du mot/)
  })
  it('appends the reason when there is one', () => {
    expect(audioFailedMessage('Enregistrement trop volumineux (1 Mo maximum).')).toContain('(Enregistrement trop volumineux (1 Mo maximum).)')
  })
})
```

Create `web/__tests__/contribution-pronunciation.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContributionPronunciation } from '@/components/ContributionPronunciation'

describe('ContributionPronunciation', () => {
  it('is optional and offers the recorder', () => {
    const html = renderToStaticMarkup(<ContributionPronunciation blob={null} onChange={() => {}} />)
    expect(html).toContain('Prononciation (optionnel)')
    expect(html).toContain('Enregistrer la prononciation')
    expect(html).not.toContain('Retirer')
  })
  it('says a recording is ready and lets the contributor remove it', () => {
    const html = renderToStaticMarkup(
      <ContributionPronunciation blob={new Blob([new Uint8Array(10)], { type: 'audio/webm' })} onChange={() => {}} />,
    )
    expect(html).toContain('sera publié avec le mot')
    expect(html).toContain('Retirer')
  })
})
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run contribution` → FAIL (exports and component missing).

- [ ] **Step 3: Implement the helpers**

Append to `web/lib/contribution.ts`:

```ts
/** What happened to the optional recording that goes with a new word. */
export type AudioOutcome = 'none' | 'saved' | 'failed'

export function audioOutcome(a: { attempted: boolean; error: string | null }): AudioOutcome {
  if (!a.attempted) return 'none'
  return a.error ? 'failed' : 'saved'
}

/** The word is saved even when its recording is not: say so, and how to redo it. */
export function audioFailedMessage(reason: string | null): string {
  const base = 'Mot enregistré, mais l’enregistrement audio n’a pas pu être envoyé : vous pourrez le refaire depuis la fiche du mot.'
  return reason ? `${base} (${reason})` : base
}
```

- [ ] **Step 4: Implement the component**

Create `web/components/ContributionPronunciation.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'
import { MAX_LEXICON_AUDIO_SECONDS } from '@/lib/lexicon-audio'

interface Props {
  /** The recording the contributor decided to keep, or null. */
  blob: Blob | null
  onChange: (blob: Blob | null) => void
  disabled?: boolean
}

/**
 * Optional recording of the word being contributed. Nothing is sent from here: the form keeps the
 * recording and uploads it once the entry exists (see ContributionForm).
 */
export function ContributionPronunciation({ blob, onChange, disabled = false }: Props) {
  // A new key resets the recorder (its own preview) after the contributor removes the recording.
  const [round, setRound] = useState(0)
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Prononciation (optionnel)
      </p>
      <PronunciationRecorder
        key={round}
        maxSeconds={MAX_LEXICON_AUDIO_SECONDS}
        startLabel="Enregistrer la prononciation"
        sendLabel="Garder cet enregistrement"
        disabled={disabled}
        onSend={onChange}
      />
      {blob && (
        <p className="flex flex-wrap items-center gap-3 text-xs text-primary" role="status">
          Enregistrement prêt : il sera publié avec le mot.
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              onChange(null)
              setRound(r => r + 1)
            }}
          >
            Retirer
          </button>
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire the form**

In `web/components/ContributionForm.tsx`:

1. Imports: add
```tsx
import { ContributionPronunciation } from '@/components/ContributionPronunciation'
import { uploadPronunciation } from '@/lib/lexicon-audio-data'
```
and add `audioOutcome, audioFailedMessage` to the existing import from `@/lib/contribution` (open the file to see its current import line).
2. State, next to `exampleSaveFailed`:
```tsx
  // Optional recording kept in the browser until the entry exists, and what happened to it.
  const [pronunciation, setPronunciation] = useState<Blob | null>(null)
  const [audioFailedReason, setAudioFailedReason] = useState<string | null | undefined>(undefined) // undefined: no failure
  const [recorderKey, setRecorderKey] = useState(0)
```
3. In `handleSubmit`, reset next to `setExampleSaveFailed(false)`: `setAudioFailedReason(undefined)`. In the word branch, right after the example-sentence block (the `if (!error && lexiconId && exampleState(...) === 'complete') { … }`), add:
```tsx
        if (!error && lexiconId) {
          const sent = pronunciation
            ? await uploadPronunciation(supabaseRef.current, { userId: user.id, lexiconId, blob: pronunciation })
            : null
          const outcome = audioOutcome({ attempted: pronunciation !== null, error: sent?.error ?? null })
          if (outcome === 'failed') setAudioFailedReason(sent?.error ?? null)
        }
```
   This covers both the insert path and the placeholder-claim path (`lexiconId = initialId`).
4. In the `submitted` branch, after the `exampleSaveFailed` message add:
```tsx
      {audioFailedReason !== undefined && (
        <p className="text-sm text-red-600">{audioFailedMessage(audioFailedReason)}</p>
      )}
```
   and in the « Ajouter une autre » `onClick`, next to the example resets add: `setPronunciation(null); setAudioFailedReason(undefined); setRecorderKey(k => k + 1)`.
5. Render the block in the word branch, right after the example-sentence `<div className="space-y-2">…</div>` (still inside the word `<div className="space-y-3">`):
```tsx
          <ContributionPronunciation key={recorderKey} blob={pronunciation} onChange={setPronunciation} disabled={loading} />
```
6. Clear it when the contribution type changes: find the buttons that call `setType(t)` (the three-button row) and make the handler `() => { setType(t); setPronunciation(null); setRecorderKey(k => k + 1) }`.

- [ ] **Step 6: Run tests, types, lint**

`npx vitest run contribution` → PASS (helpers, component); `npx tsc --noEmit` → clean; `npm run lint` → no new errors.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print: master
git add web/lib/contribution.ts web/__tests__/contribution.test.ts web/components/ContributionPronunciation.tsx web/__tests__/contribution-pronunciation.test.tsx web/components/ContributionForm.tsx
git commit -m "feat: optional pronunciation recording in the word contribution form" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Verification and rollout stop

**Files:** none new (fix whatever the checks reveal).

- [ ] **Step 1: Re-run everything**

From `web/`:
1. Apply the migration once more locally (a second run must succeed with no error).
2. `npx tsc --noEmit` → clean.
3. `npx vitest run --exclude "**/rls/**"` → all pass.
4. RLS files one at a time: `remove-voting`, `function-grants`, `lexicon-translations`, `resources-community`, `corrections`, `corrections-helpers`, `lexicon-pronunciations`, `lexicon-from-word-links`, `resource-word-links`, `search-lexicon`. All pass.
5. `npm run lint` → no new errors; `npm run build` → succeeds (this type-checks the pages that lost their vote counts and the forum JSON-LD).
6. `git diff --stat a164810..HEAD -- web/app/api/donate` must print nothing (the Stripe routes are unchanged).
7. Read-only production check with the Supabase MCP `execute_sql` on project `agdqbzbjcxrzfhkvempe`: `select proname from pg_proc where proname in ('vote','increment_upvotes','auto_validate_on_upvotes');` and `select count(*) filter (where not validated) as pending_expressions from expressions;` and the same for `grammar_rules`; and `select policyname from pg_policies where policyname in ('grammar_rules vote','expressions vote');`. Report the counts: they tell the user how many rows the migration will validate. Do not write anything.

- [ ] **Step 2: Browser check (do it, or say it was not done)**

Start the dev server the way the project does (`npm run dev` in `web/`; if Turbopack fails on the deep path use `npx next dev --webpack`). Check: `/contribute` has no « En attente de validation » list, no donate form, the new hero and guideline texts; the home page has no donate form; the forum, grammar and resources pages show no ▲; in the word form, « Prononciation (optionnel) » records with a real microphone, « Garder cet enregistrement » shows « Enregistrement prêt », submitting creates the word and the recording appears in « Prononciation » on its entry page; an untranslated placeholder claimed from `/contribute?type=word&word=…&id=…` also gets the recording. If any of this cannot be run here, say exactly which part was not verified; do not claim it.

- [ ] **Step 3: Commit any fix**

```bash
git branch --show-current   # must print: master
git status
git add <only the files you changed>
git commit -m "fix: <what the checks revealed>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Stop for the production rollout**

Do **not** apply anything to production and do **not** push. Report: what was built, the commands run and their results, the production counts from step 1.7, what was not verified. Rollout steps for the user:
1. In the Supabase SQL editor of project `agdqbzbjcxrzfhkvempe` (check the ref in the URL), run `supabase/migrations/20261010000000_remove_voting.sql`, then `notify pgrst, 'reload schema';`.
2. Push `master` so Vercel deploys the web changes. (A vote attempted between the two steps fails with a missing function; nothing else is affected.)

---

## Self-Review (done while writing)

**Spec coverage.** Part A database: backfill, default true, triggers/function dropped, `vote` and `increment_upvotes` dropped (both signatures, `if exists`), both "vote" policies dropped, lexicon policy and `user_votes` kept (Task 1; test asserts all). Part A web: both components deleted, pending section removed, ▲ counts and JSON-LD like counter removed, ordering changed, hero and guideline texts, form success message (Task 2; source test). Part B: block under the example sentence, recorder with 10 s, blob kept in memory, upload after the entry exists on both insert and claim paths, failure message with reason, cleared after submit and on type change, word branch only (Task 4). Part C: both mounts removed, files and routes kept, webhook untouched (Task 3 test + Task 5 step 6). Rollout and open decisions: Task 5; ordering newest first: Task 2.

**Placeholder scan.** No TBD/TODO. Steps that depend on file contents not visible while planning name the exact edit and the tool that confirms it (lint reports unused imports; the form's current `@/lib/contribution` import line is read in Task 4 step 5).

**Type consistency.** `audioOutcome({attempted, error})` and `audioFailedMessage(reason)` are used identically in the tests and the form; `ContributionPronunciation` props (`blob`, `onChange`, `disabled`) match the form's usage; `uploadPronunciation` signature matches `web/lib/lexicon-audio-data.ts` (`{ userId, lexiconId, blob }`, returns `Result` with `.error`).
