# Lexicon add form unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The contribution form's "Mot du lexique" tab and the resource word-link editor add lexicon words through one shared picker (search existing entries, then create through `create_lexicon_entry`), and a collision is reported to the user instead of dropped silently.

**Architecture:** A presentational `LexiconPicker` is extracted from `LexiconPanel`. It owns the candidate search, the candidate cards, the "create a new entry" switch and `EntryForm`; the parent owns what choosing or creating does. A pure helper `createOutcome` turns the RPC answer into `error | created | existing(+notice)` and is used by both parents. The contribution word tab drops the direct `lexicon` insert and the placeholder claim and uses the picker; choosing an existing entry opens `/lexicon/[id]`.

**Tech Stack:** Next.js (App Router), React client components, Supabase JS (RPC `create_lexicon_entry`, `find_lexicon_candidates`), Vitest with `renderToStaticMarkup` (no DOM).

**Spec:** `docs/superpowers/specs/2026-10-06-lexicon-add-form-unification-design.md`

All commands run from `web/` (`cd "C:/Users/DELL LATITUDE 7480/traduction bété/web"`).

## Global Constraints

- Work in the main folder on `master`. Do NOT create a branch or worktree. Before every commit run `git branch --show-current` (must print `master`) and stage explicit paths only (the folder is shared with other sessions).
- No change to `create_lexicon_entry` or any migration. The `existed` path is already covered by `__tests__/rls/lexicon-from-word-links.test.ts` (lines 172-174); no RLS test is added.
- Must keep working on Safari 16.1: no new syntax or CSS beyond what the touched components already use.
- Column naming: `bete_word` = IPA/Bible form, `bete_phonetic` = Latin everyday form. This plan never writes these columns directly (the RPC does).
- French user-facing copy, exact strings: collision notice `Cette entrée existe déjà, vos informations n’ont pas été ajoutées. Ouvrez sa fiche pour ajouter un sens ou une graphie.` (curly apostrophes as written).
- The expression and grammar-rule tabs of `ContributionForm` keep their behaviour.

## Review Focus

1. A blank or whitespace-only spelling: no search is sent and nothing is rendered as results (Task 2 test).
2. The spelling already exists as the other kind (word vs marker): an error, the verse or form is not linked to it (Task 1 test).
3. Same-kind collision (`existed: true`): the existing entry is used with the notice, and `/contribute` does not claim "Contribution envoyée" (Task 1 test for the outcome; Task 3 renders the notice).
4. Submitting while a recording is in progress, or with half an example sentence: nothing is created and the contributor is told why (Task 1 test).
5. The RPC answers with an error or with no data: a French error message, no crash (Task 1 test).

---

### Task 1: Pure helpers `createOutcome` and `wordBlockingProblem`

**Files:**
- Modify: `lib/lexicon-links.ts` (append)
- Modify: `lib/contribution.ts` (append)
- Create: `__tests__/lexicon-create-outcome.test.ts`
- Create: `__tests__/contribution-word-blocking.test.ts`

**Interfaces:**
- Produces: `EXISTING_ENTRY_NOTICE: string`; `type CreateOutcome`; `createOutcome(res, kind): CreateOutcome` in `lib/lexicon-links.ts`; `wordBlockingProblem(a: { exampleBete: string; exampleFrench: string; recording: boolean }): string | null` in `lib/contribution.ts`.
- Consumes: `LexSummary` from `lib/word-blocks`; `exampleState` already in `lib/contribution.ts`.

- [ ] **Step 1: Write the failing tests**

`__tests__/lexicon-create-outcome.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createOutcome, EXISTING_ENTRY_NOTICE } from '../lib/lexicon-links'
import type { LexSummary } from '../lib/word-blocks'

const entry = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: null, spellings: [], ...over,
})
const ok = (existed: boolean, e: LexSummary, senseIds: string[]) => ({ data: { existed, senseIds, entry: e }, error: null })

describe('createOutcome', () => {
  it('reports a new word with its first sense', () => {
    expect(createOutcome(ok(false, entry(), ['S1', 'S2']), 'word')).toEqual({ type: 'created', entry: entry(), senseId: 'S1' })
  })
  it('gives a marker no sense', () => {
    const m = entry({ kind: 'marker', senses: [] })
    expect(createOutcome(ok(false, m, []), 'marker')).toEqual({ type: 'created', entry: m, senseId: null })
  })
  it('reports an existing entry of the same kind with the notice, never as created', () => {
    const out = createOutcome(ok(true, entry(), ['S1']), 'word')
    expect(out).toEqual({ type: 'existing', entry: entry(), senseId: 'S1', notice: EXISTING_ENTRY_NOTICE })
  })
  it('refuses an existing entry of the other kind', () => {
    const out = createOutcome(ok(true, entry({ kind: 'marker', spelling: 'yi' }), []), 'word')
    expect(out).toEqual({ type: 'error', message: 'Cette graphie existe déjà comme marqueur grammatical : yi.' })
    const out2 = createOutcome(ok(true, entry(), ['S1']), 'marker')
    expect(out2).toEqual({ type: 'error', message: 'Cette graphie existe déjà comme mot : ghèhi-wu.' })
  })
  it('passes an RPC error message through', () => {
    expect(createOutcome({ data: null, error: 'Dialecte invalide.' }, 'word')).toEqual({ type: 'error', message: 'Dialecte invalide.' })
  })
  it('falls back to a generic message when there is neither data nor error', () => {
    expect(createOutcome({ data: null, error: null }, 'word')).toEqual({ type: 'error', message: 'Une erreur est survenue. Veuillez réessayer.' })
  })
})
```

`__tests__/contribution-word-blocking.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { wordBlockingProblem } from '@/lib/contribution'

describe('wordBlockingProblem', () => {
  it('lets a word without an example through', () => {
    expect(wordBlockingProblem({ exampleBete: '', exampleFrench: '  ', recording: false })).toBeNull()
  })
  it('lets a complete example through', () => {
    expect(wordBlockingProblem({ exampleBete: 'Ɓa li', exampleFrench: 'Il mange', recording: false })).toBeNull()
  })
  it('stops half an example sentence', () => {
    expect(wordBlockingProblem({ exampleBete: 'Ɓa li', exampleFrench: '', recording: false })).toContain('laissez les deux champs vides')
  })
  it('stops while a recording is in progress, before anything else', () => {
    expect(wordBlockingProblem({ exampleBete: 'Ɓa li', exampleFrench: '', recording: true })).toContain('enregistrement')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run __tests__/lexicon-create-outcome.test.ts __tests__/contribution-word-blocking.test.ts`
Expected: FAIL (`createOutcome` / `wordBlockingProblem` is not a function / not exported).

- [ ] **Step 3: Implement**

Append to `lib/lexicon-links.ts`:

```ts
export const EXISTING_ENTRY_NOTICE =
  'Cette entrée existe déjà, vos informations n’ont pas été ajoutées. Ouvrez sa fiche pour ajouter un sens ou une graphie.'

export type CreateOutcome =
  | { type: 'error'; message: string }
  | { type: 'created'; entry: LexSummary; senseId: string | null }
  | { type: 'existing'; entry: LexSummary; senseId: string | null; notice: string }

/**
 * What an answer of create_lexicon_entry means for the screen. The RPC hands back the existing entry when the
 * spelling is taken and ignores everything else that was typed: say so, and never treat it as a creation.
 */
export function createOutcome(
  res: { data: { existed: boolean; senseIds: string[]; entry: LexSummary } | null; error: string | null },
  kind: 'word' | 'marker',
): CreateOutcome {
  if (res.error) return { type: 'error', message: res.error }
  if (!res.data) return { type: 'error', message: 'Une erreur est survenue. Veuillez réessayer.' }
  const { existed, senseIds, entry } = res.data
  if (existed && entry.kind !== kind) {
    const other = entry.kind === 'marker' ? 'marqueur grammatical' : 'mot'
    return { type: 'error', message: `Cette graphie existe déjà comme ${other} : ${entry.spelling}.` }
  }
  const senseId = kind === 'word' ? (senseIds[0] ?? null) : null
  return existed
    ? { type: 'existing', entry, senseId, notice: EXISTING_ENTRY_NOTICE }
    : { type: 'created', entry, senseId }
}
```

Append to `lib/contribution.ts`:

```ts
/** Why a new word cannot be sent yet, or null. A recording in progress is checked first. */
export function wordBlockingProblem(a: { exampleBete: string; exampleFrench: string; recording: boolean }): string | null {
  if (a.recording) return 'Terminez l’enregistrement avant de créer l’entrée.'
  if (exampleState(a.exampleBete, a.exampleFrench) === 'incomplete') {
    return 'Renseignez la phrase et sa traduction, ou laissez les deux champs vides.'
  }
  return null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run __tests__/lexicon-create-outcome.test.ts __tests__/contribution-word-blocking.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must be master
git add lib/lexicon-links.ts lib/contribution.ts __tests__/lexicon-create-outcome.test.ts __tests__/contribution-word-blocking.test.ts
git commit -m "feat(lexicon): pure helpers for a create answer and for a word that cannot be sent yet

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared `LexiconPicker`, `EntryForm` slots, and `LexiconPanel` on top of it

**Files:**
- Modify: `components/word-link/EntryForm.tsx`
- Create: `components/lexicon/LexiconPicker.tsx`
- Modify: `components/word-link/LexiconPanel.tsx`
- Create: `__tests__/lexicon-picker.test.tsx`
- Test (must keep passing): `__tests__/word-link-panels.test.tsx`

**Interfaces:**
- Consumes: `createOutcome`, `Candidate`, `groupCandidates`, `emptyEntryForm`, `senseSeed`, `Dialect`, `EntryForm as EntryFormValues` from `lib/lexicon-links`; `findCandidates`, `createEntry`, `addSpelling`, `addSense`, `getEntry` from `lib/lexicon-links-data`.
- Produces: `LexiconPicker` (props below) and `CandidateCard` exported from `components/lexicon/LexiconPicker.tsx`; `EntryForm` gains optional `submitLabel`, `busyLabel`, `children`.

```ts
interface LexiconPickerProps {
  client: SupabaseClient
  kind: 'word' | 'marker'
  spelling: string                 // the typed Bété spelling; blank → no search
  gloss: string                    // seeds the first sense of a new entry ('' when unknown)
  dialect: Dialect
  signedIn: boolean
  debounceMs?: number              // default 0
  canUseExample: boolean           // forwarded to EntryForm
  chooseSense: boolean             // sense radios on candidates (linking) vs read-only senses (opening a page)
  exactLabel: string               // button of an exact match
  variantLabel: string             // button of a variant (different spelling)
  createLabel?: string             // button that opens the creation form (word only); default 'Mot différent : créer l’entrée'
  submitLabel?: string             // EntryForm submit button
  busy: boolean
  error: string
  onChoose: (c: Candidate, sense: string | null) => void
  onChooseVariant: (c: Candidate, sense: string | null) => void
  onCreate: (form: EntryFormValues) => void
  footer?: ReactNode               // extra buttons in the choose view (resource: quick create)
  formExtra?: ReactNode            // extra fields inside the creation form (contribution: example, recording)
}
```

- [ ] **Step 1: Write the failing picker test**

`__tests__/lexicon-picker.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CandidateCard, LexiconPicker } from '../components/lexicon/LexiconPicker'
import type { Candidate } from '../lib/lexicon-links'
import type { LexSummary } from '../lib/word-blocks'

const lex = (over: Partial<LexSummary> = {}): LexSummary => ({
  id: 'L1', kind: 'word', spelling: 'ghèhi-wu', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'ciel', context: null }],
  senseId: null, spellings: [], ...over,
})
const cand = (over: Partial<Candidate> = {}): Candidate => ({ matchKind: 'norm', matched: 'ghehi-wu', distance: 1, entry: lex(), ...over })
const client = { rpc: async () => ({ data: [], error: null }) } as never
const noop = () => {}

const picker = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <LexiconPicker client={client} kind="word" spelling="ghèhi-wu" gloss="au ciel" dialect="western" signedIn
      canUseExample={false} chooseSense exactLabel="Lier" variantLabel="Variante" busy={false} error=""
      onChoose={noop} onChooseVariant={noop} onCreate={noop} {...over} />,
  )

describe('LexiconPicker', () => {
  it('searches and offers to create a word', () => {
    const html = picker()
    expect(html).toContain('Recherche dans le lexique…')
    expect(html).toContain('Mot différent : créer l’entrée')
  })
  it('does not search a blank spelling', () => {
    const html = picker({ spelling: '   ' })
    expect(html).not.toContain('Recherche dans le lexique…')
  })
  it('offers no creation form for a marker, only the parent footer', () => {
    const html = picker({ kind: 'marker', footer: <button>Créer ce marqueur</button> })
    expect(html).not.toContain('créer l’entrée')
    expect(html).toContain('Créer ce marqueur')
  })
  it('uses a custom creation label and shows the error', () => {
    const html = picker({ createLabel: 'Créer l’entrée ici', error: 'Boum' })
    expect(html).toContain('Créer l’entrée ici')
  })
})

describe('CandidateCard', () => {
  const base = { kind: 'word' as const, seed: 'ciel', sel: 'S1', namePrefix: 'cand-sense-', busy: false, onSelect: noop, onAction: noop }
  it('shows a variant with the form that matched, and its own button', () => {
    const html = renderToStaticMarkup(<CandidateCard {...base} c={cand()} variant chooseSense actionLabel="Même mot" />)
    expect(html).toContain('variante de « ghehi-wu »')
    expect(html).toContain('Même mot')
    expect(html).toContain('type="radio"')
  })
  it('offers a new sense only when the gloss is not already a sense', () => {
    const withNew = renderToStaticMarkup(<CandidateCard {...base} seed="ciel bleu" c={cand()} variant={false} chooseSense actionLabel="Lier" />)
    expect(withNew).toContain('Nouveau sens : « ciel bleu »')
    const without = renderToStaticMarkup(<CandidateCard {...base} c={cand()} variant={false} chooseSense actionLabel="Lier" />)
    expect(without).not.toContain('Nouveau sens')
  })
  it('lists the senses read-only when the card only opens a page', () => {
    const html = renderToStaticMarkup(<CandidateCard {...base} c={cand()} variant={false} chooseSense={false} actionLabel="Ouvrir cette fiche" />)
    expect(html).not.toContain('type="radio"')
    expect(html).toContain('ciel')
    expect(html).toContain('Ouvrir cette fiche')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/lexicon-picker.test.tsx`
Expected: FAIL (cannot resolve `../components/lexicon/LexiconPicker`).

- [ ] **Step 3: Add the three optional slots to `EntryForm`**

In `components/word-link/EntryForm.tsx`:

Props interface: after `onCancel: () => void` add

```ts
  submitLabel?: string
  busyLabel?: string
  /** Extra fields shown before the buttons (the contribution form's example sentence and recording). */
  children?: ReactNode
```

Signature: `export function EntryForm({ kind, initial, canUseExample, busy, error, onSubmit, onCancel, submitLabel = 'Créer et lier', busyLabel = 'Création…', children }: Props) {`

Before the line `{(local || error) && <p className="text-xs text-destructive" role="alert">{local || error}</p>}` insert `{children}`.

Replace `{busy ? 'Création…' : 'Créer et lier'}` with `{busy ? busyLabel : submitLabel}`.

- [ ] **Step 4: Create `components/lexicon/LexiconPicker.tsx`**

```tsx
'use client'
import { useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  emptyEntryForm, groupCandidates, senseSeed,
  type Candidate, type Dialect, type EntryForm as EntryFormValues,
} from '@/lib/lexicon-links'
import { findCandidates } from '@/lib/lexicon-links-data'
import type { LexSummary } from '@/lib/word-blocks'
import { EntryForm } from '@/components/word-link/EntryForm'

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'
const MAX_SHOWN = 6

/** The sense preselected on a candidate: the one equal to the gloss, else the first, else a new one. */
function defaultSense(e: LexSummary, gloss: string): string {
  const seed = senseSeed(gloss).toLowerCase()
  const match = e.senses.find(s => s.french.toLowerCase() === seed)
  return match ? match.id : (e.senses[0]?.id ?? 'new')
}

interface CardProps {
  c: Candidate
  variant: boolean
  kind: 'word' | 'marker'
  seed: string
  sel: string
  chooseSense: boolean
  namePrefix: string
  actionLabel: string
  busy: boolean
  onSelect: (sense: string) => void
  onAction: () => void
}

export function CandidateCard({ c, variant, kind, seed, sel, chooseSense, namePrefix, actionLabel, busy, onSelect, onAction }: CardProps) {
  const hasExactFrench = c.entry.senses.some(s => s.french.toLowerCase() === seed.toLowerCase())
  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <div className="flex items-baseline justify-between">
        {variant ? (
          <div>
            <span className="text-sm font-bold">{c.entry.spelling}</span>
            <span className="ml-2 text-xs text-muted-foreground">(variante de « {c.matched} »)</span>
          </div>
        ) : (
          <span className="text-sm font-bold">{c.entry.spelling}</span>
        )}
        <span className="text-xs text-muted-foreground">({c.entry.dialect})</span>
      </div>
      {kind === 'word' && chooseSense && (
        <div className="space-y-1">
          {c.entry.senses.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-xs">
              <input
                type="radio"
                name={`${namePrefix}${c.entry.id}`}
                checked={sel === s.id}
                onChange={() => onSelect(s.id)}
              />
              <span>{s.french}</span>
            </label>
          ))}
          {seed && !hasExactFrench && (
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="radio"
                name={`${namePrefix}${c.entry.id}`}
                checked={sel === 'new'}
                onChange={() => onSelect('new')}
              />
              <span>Nouveau sens : « {seed} »</span>
            </label>
          )}
        </div>
      )}
      {kind === 'word' && !chooseSense && c.entry.senses.length > 0 && (
        <p className="text-xs text-muted-foreground">{c.entry.senses.map(s => s.french).join(', ')}</p>
      )}
      <button type="button" className={`${btn} bg-primary text-primary-foreground`} disabled={busy} onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}

interface Props {
  client: SupabaseClient
  kind: 'word' | 'marker'
  spelling: string
  gloss: string
  dialect: Dialect
  signedIn: boolean
  debounceMs?: number
  canUseExample: boolean
  chooseSense: boolean
  exactLabel: string
  variantLabel: string
  createLabel?: string
  submitLabel?: string
  busy: boolean
  error: string
  onChoose: (c: Candidate, sense: string | null) => void
  onChooseVariant: (c: Candidate, sense: string | null) => void
  onCreate: (form: EntryFormValues) => void
  footer?: ReactNode
  formExtra?: ReactNode
}

/**
 * Search the lexicon for the typed spelling, then either pick an existing entry or open the creation form.
 * It decides nothing about what picking or creating does: the parent (resource editor, contribution form) does.
 */
export function LexiconPicker({
  client, kind, spelling, gloss, dialect, signedIn, debounceMs = 0, canUseExample, chooseSense,
  exactLabel, variantLabel, createLabel = 'Mot différent : créer l’entrée', submitLabel,
  busy, error, onChoose, onChooseVariant, onCreate, footer, formExtra,
}: Props) {
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [found, setFound] = useState<{ key: string; list: Candidate[] } | null>(null)

  // Results belong to the text they were searched for: when the text changes nothing stale is shown.
  const text = spelling.trim()
  const key = `${text}|${dialect}`
  const candidates = !text ? [] : found?.key === key ? found.list : null

  useEffect(() => {
    if (!signedIn || !text) return
    let cancelled = false
    const timer = setTimeout(() => {
      findCandidates(client, { text, dialect, limit: 7 }).then(list => {
        if (!cancelled) setFound({ key, list })
      })
    }, debounceMs)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [client, text, dialect, key, signedIn, debounceMs])

  if (creating) {
    return (
      <EntryForm
        kind={kind}
        initial={emptyEntryForm(spelling, gloss, dialect)}
        canUseExample={canUseExample}
        busy={busy}
        error={error}
        submitLabel={submitLabel}
        onSubmit={onCreate}
        onCancel={() => setCreating(false)}
      >
        {formExtra}
      </EntryForm>
    )
  }

  const grouped = groupCandidates(candidates ?? [], kind)
  const seed = senseSeed(gloss)
  const hasMore = (candidates?.length ?? 0) > MAX_SHOWN
  const shownExact = grouped.exact.slice(0, MAX_SHOWN)
  const shownVariants = grouped.variants.slice(0, Math.max(0, MAX_SHOWN - shownExact.length))
  const sel = (e: LexSummary) => picked[e.id] ?? defaultSense(e, gloss)
  const senseFor = (e: LexSummary) => (kind === 'word' ? sel(e) : null)

  return (
    <div className="space-y-3">
      {candidates === null && <p className="text-xs text-muted-foreground">Recherche dans le lexique…</p>}

      <div className="space-y-3">
        {shownExact.map(c => (
          <CandidateCard
            key={c.entry.id} c={c} variant={false} kind={kind} seed={seed} sel={sel(c.entry)} chooseSense={chooseSense}
            namePrefix="cand-sense-" actionLabel={exactLabel} busy={busy}
            onSelect={s => setPicked(prev => ({ ...prev, [c.entry.id]: s }))}
            onAction={() => onChoose(c, senseFor(c.entry))}
          />
        ))}

        {shownVariants.map(c => (
          <CandidateCard
            key={c.entry.id} c={c} variant kind={kind} seed={seed} sel={sel(c.entry)} chooseSense={chooseSense}
            namePrefix="var-sense-" actionLabel={variantLabel} busy={busy}
            onSelect={s => setPicked(prev => ({ ...prev, [c.entry.id]: s }))}
            onAction={() => onChooseVariant(c, senseFor(c.entry))}
          />
        ))}

        {grouped.otherKind.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50/50 p-2 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
            {grouped.otherKind.map(c => (
              <p key={c.entry.id}>
                Cette graphie existe déjà comme {c.entry.kind === 'marker' ? 'marqueur grammatical' : 'mot'} :{' '}
                <a href={`/lexicon/${c.entry.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  {c.entry.spelling}
                </a>
                . Vérifiez la nature du mot (« Mot » / « Marqueur grammatical ») ou proposez une correction depuis sa fiche.
              </p>
            ))}
          </div>
        )}

        {hasMore && (
          <p className="text-xs text-muted-foreground">
            D’autres entrées proches existent ; précisez la graphie pour les voir.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
        {kind === 'word' && (
          <button type="button" className={btn} onClick={() => setCreating(true)}>
            {createLabel}
          </button>
        )}
        {footer}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the picker test**

Run: `npx vitest run __tests__/lexicon-picker.test.tsx`
Expected: PASS.

- [ ] **Step 6: Rebuild `LexiconPanel` on the picker**

In `components/word-link/LexiconPanel.tsx`:

1. Imports. Replace the two import blocks from `@/lib/lexicon-links` and `@/lib/lexicon-links-data`, and the `EntryForm` import, with:

```ts
import {
  createOutcome, emptyEntryForm, senseSeed,
  type Candidate, type Dialect, type EntryForm as EntryFormValues,
} from '@/lib/lexicon-links'
import {
  addSense, addSpelling, createEntry, getEntry, setMarkerMeaning,
} from '@/lib/lexicon-links-data'
import { cn } from '@/lib/utils'
import type { LexSummary } from '@/lib/word-blocks'
import type { BlockMeta } from '@/lib/word-link-editor'
import { LexiconPicker } from '@/components/lexicon/LexiconPicker'
```
(`groupCandidates`, `findCandidates` and `./EntryForm` are no longer used here.)

2. State: delete `candidates`, `mode`, `candidateSenses`. Add `const [notice, setNotice] = useState('')`.

3. Delete the whole `useEffect` that calls `findCandidates` (the one guarded by `meta.lexiconId || !signedIn`), the `// Selected sense for candidates` state, and the `defaultSense` function. Keep the `useEffect` that loads `userId`.

4. Replace `linkVariant`, `handleCreateFast`, `handleCreateMarkerImmediate` and `handleCustomFormSubmit` with:

```ts
  async function linkVariant(c: Candidate, sense: string | null) {
    setBusy(true)
    setError('')
    const spellRes = await addSpelling(client, c.entry.id, words)
    // ignore spelling_exists
    if (spellRes.error && !spellRes.error.includes('déjà')) {
      setError(spellRes.error)
      setBusy(false)
      return
    }
    const refreshed = await getEntry(client, c.entry.id)
    setBusy(false)
    await linkCandidate(refreshed ?? c.entry, sense)
  }

  /** One place for what a create answer does here: an error stays on the form, an existing entry is linked with a notice. */
  function finishCreate(res: Awaited<ReturnType<typeof createEntry>>, createdKind: 'word' | 'marker') {
    const out = createOutcome(res, createdKind)
    if (out.type === 'error') {
      setError(out.message)
      return
    }
    setNotice(out.type === 'existing' ? out.notice : '')
    onLink(out.entry, out.senseId)
  }

  async function handleCreateFast() {
    setBusy(true)
    setError('')
    const res = await createEntry(client, { form: emptyEntryForm(words, gloss, dialect), kind: 'word' })
    setBusy(false)
    finishCreate(res, 'word')
  }

  async function handleCreateMarkerImmediate() {
    setBusy(true)
    setError('')
    const res = await createEntry(client, { form: emptyEntryForm(words, '', dialect), kind: 'marker' })
    setBusy(false)
    finishCreate(res, 'marker')
  }

  async function handleCustomFormSubmit(form: EntryFormValues) {
    setBusy(true)
    setError('')
    const res = await createEntry(client, { form, kind, example: form.useExample ? example : null })
    setBusy(false)
    finishCreate(res, kind)
  }
```

5. Linked view: after the `entry.spellings.length > 0 && (...)` paragraph add

```tsx
          {notice && <p className="text-xs text-amber-700 dark:text-amber-300" role="status">{notice}</p>}
```
and change the first "Délier" button in the action row (the one next to "Ajouter une graphie") to `onClick={() => { setNotice(''); onUnlink() }}`.

6. Replace everything from `) : mode === 'create' ? (` down to (and including) the closing of the "Not linked, mode choose" `<div className="space-y-3">…</div>` with:

```tsx
      ) : (
        <LexiconPicker
          client={client}
          kind={kind}
          spelling={words}
          gloss={gloss}
          dialect={dialect}
          signedIn={signedIn}
          canUseExample={example !== null}
          chooseSense
          exactLabel={kind === 'marker' ? 'Lier à ce marqueur' : 'Lier à cette entrée'}
          variantLabel={`C’est le même mot : ajouter la graphie « ${words} » et lier`}
          busy={busy}
          error={error}
          onChoose={(c, sense) => linkCandidate(c.entry, sense)}
          onChooseVariant={linkVariant}
          onCreate={handleCustomFormSubmit}
          footer={
            kind === 'word' ? (
              <button type="button" className={btn} disabled={busy} onClick={handleCreateFast}>
                Créer vite, avec le mot à mot seul
              </button>
            ) : (
              <button type="button" className={btn} disabled={busy} onClick={handleCreateMarkerImmediate}>
                Créer ce marqueur (sens à préciser plus tard)
              </button>
            )
          }
        />
      )}
```
Keep the final `</div>` that closes the panel wrapper.

- [ ] **Step 7: Type-check and run the panel tests**

Run: `npx tsc --noEmit` — Expected: no errors in the touched files.
Run: `npx vitest run __tests__/word-link-panels.test.tsx __tests__/lexicon-picker.test.tsx __tests__/lexicon-links.test.ts __tests__/lexicon-links-data.test.ts`
Expected: PASS (the existing `LexiconPanel` tests still find "Lexique" and "créer l’entrée").
Run: `npx eslint components/lexicon/LexiconPicker.tsx components/word-link/LexiconPanel.tsx components/word-link/EntryForm.tsx` — Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git branch --show-current   # must be master
git add components/lexicon/LexiconPicker.tsx components/word-link/LexiconPanel.tsx components/word-link/EntryForm.tsx __tests__/lexicon-picker.test.tsx
git commit -m "refactor(lexicon): extract the search-and-create picker from the word-link panel and report collisions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contribution word tab on the picker

**Files:**
- Modify: `components/ContributionForm.tsx`
- Create: `__tests__/contribution-form.test.tsx`

**Interfaces:**
- Consumes: `LexiconPicker` (Task 2), `createOutcome` (Task 1), `wordBlockingProblem` (Task 1), `createEntry` from `lib/lexicon-links-data`, `uploadPronunciation`, `audioOutcome`, `audioFailedMessage`, `contributionErrorMessage`, `exampleState`.
- Produces: `ContributionForm` without the `initialId` prop; the word tab is picker-based.

- [ ] **Step 1: Write the failing test**

`__tests__/contribution-form.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { ContributionForm } from '@/components/ContributionForm'

describe('ContributionForm word tab', () => {
  it('asks for the Bété spelling first and no longer carries the old inline fields', () => {
    const html = renderToStaticMarkup(<ContributionForm initialType="word" />)
    expect(html).toContain('Mot en bhété (forme phonétique latine)')
    expect(html).not.toContain('Traduction française *')
    expect(html).not.toContain('Soumettre la contribution')
  })
  it('keeps the other tabs as they were', () => {
    const html = renderToStaticMarkup(<ContributionForm initialType="expression" />)
    expect(html).toContain('Sens réel en français')
    expect(html).toContain('Soumettre la contribution')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run __tests__/contribution-form.test.tsx`
Expected: FAIL (the old word tab still contains "Traduction française *").

- [ ] **Step 3: Rewrite the word branch of `ContributionForm.tsx`**

Imports: remove `Textarea` (no remaining tab uses it), `SimilarWords`, `buildExampleRow`, `buildWordClaimPayload`, `buildWordPayload`, `WORD_ALREADY_CLAIMED`, and the whole `addTranslation, DUPLICATE_TRANSLATION_MESSAGE` import from `@/lib/lexicon-mutations`. Change the react import to `import { Suspense, useEffect, useRef, useState } from 'react'`. Add:

```ts
import Link from 'next/link'
import { LexiconPicker } from '@/components/lexicon/LexiconPicker'
import { createEntry } from '@/lib/lexicon-links-data'
import { createOutcome, type EntryForm as EntryFormValues } from '@/lib/lexicon-links'
```
and add `wordBlockingProblem` to the `@/lib/contribution` import.

Props: `interface ContributionFormProps { initialWord?: string; initialType?: ContributionType }` and `export function ContributionForm({ initialWord, initialType }: ContributionFormProps = {})`. In `ContributionFormParamsReader` delete the `id` line and pass only `initialWord` and `initialType`.

State: replace the `// Word fields` block with

```ts
  // Word fields: the spelling drives the lexicon search; everything else lives in the shared creation form.
  const [wordSpelling, setWordSpelling] = useState('')
  const [wordExBete, setWordExBete] = useState('')
  const [wordExFrench, setWordExFrench] = useState('')
  // null until we know whether someone is signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  // The spelling already had an entry: nothing was created, say so and point to it.
  const [existing, setExisting] = useState<{ id: string; notice: string } | null>(null)
  // Optional recording kept in the browser until the entry exists, and what happened to it.
  const [pronunciation, setPronunciation] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const [audioFailedReason, setAudioFailedReason] = useState<string | null | undefined>(undefined) // undefined: no failure
  const [recorderKey, setRecorderKey] = useState(0)
```
(delete `wordBetePhonetic`, `wordBeteIPA`, `wordFrench`, `wordPos`, `wordDescription`, `exampleSaveFailed`, and the derived `exampleIncomplete`.)

After the state, add:

```ts
  useEffect(() => {
    supabaseRef.current.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)))
  }, [])
```

Replace `handleSubmit` with two functions (the word one is new; the other keeps only the expression and grammar-rule branches of the old code, with the same `if (!user) { …alert… }` guard, the same `try/catch/finally`, and `if (type === 'grammar_rule') {…} else {…}`):

```ts
  async function handleCreateWord(form: EntryFormValues) {
    const problem = wordBlockingProblem({ exampleBete: wordExBete, exampleFrench: wordExFrench, recording })
    if (problem) {
      setSubmitError(problem)
      return
    }
    setLoading(true)
    setSubmitError(null)
    setAudioFailedReason(undefined)
    setExisting(null)
    try {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      if (!user) {
        alert('Connectez-vous pour contribuer.')
        return
      }
      const res = await createEntry(supabaseRef.current, {
        form,
        kind: 'word',
        example: exampleState(wordExBete, wordExFrench) === 'complete'
          ? { bete: wordExBete.trim(), french: wordExFrench.trim(), literal: '' }
          : null,
      })
      const out = createOutcome(res, 'word')
      if (out.type === 'error') {
        setSubmitError(out.message)
        return
      }
      if (out.type === 'existing') {
        setExisting({ id: out.entry.id, notice: out.notice })
        return
      }
      const sent = pronunciation
        ? await uploadPronunciation(supabaseRef.current, { userId: user.id, lexiconId: out.entry.id, blob: pronunciation })
        : null
      const outcome = audioOutcome({ attempted: pronunciation !== null, error: sent?.error ?? null })
      if (outcome === 'failed') setAudioFailedReason(sent?.error ?? null)
      setSubmitted(true)
      bumpRefresh()
      router.refresh()
    } catch (e) {
      setSubmitError(contributionErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
```

`handleSubmit` (expression / grammar rule only):

```ts
  async function handleSubmit() {
    setLoading(true)
    setSubmitError(null)
    const { data: { user } } = await supabaseRef.current.auth.getUser()
    if (!user) {
      setLoading(false)
      alert('Connectez-vous pour contribuer.')
      return
    }
    try {
      let error
      if (type === 'grammar_rule') {
        ({ error } = await supabaseRef.current.from('grammar_rules').insert({
          category, pattern_french: patternFr, pattern_bete: patternBete,
          description, example_french: exFr || null, example_bete: exBete || null,
          created_by: user.id,
        }))
      } else {
        ({ error } = await supabaseRef.current.from('expressions').insert({
          french_phrase: frPhrase,
          french_literal: frLiteral.trim() || null,
          bete_phrase: betePhrase,
          bete_phonetic: betePhonetic,
          type: exprType,
          created_by: user.id,
        }))
      }
      if (error) throw error
      setSubmitted(true)
      bumpRefresh()
      router.refresh()
    } catch (e) {
      setSubmitError(contributionErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
```

Submitted screen: delete the `exampleSaveFailed` paragraph (the RPC creates the entry and its example together). In the "Ajouter une autre" handler also reset `setWordSpelling('')` and `setExisting(null)` besides the existing resets.

Tab buttons: `onClick={() => { setType(t); setExisting(null); setPronunciation(null); setRecorderKey(k => k + 1) }}`.

Word tab JSX: keep the dialect `<select>` block, then replace everything after it (the inputs, the `SimilarWords`, the part-of-speech select, the description, the example and the recorder) with:

```tsx
          <Input
            placeholder="Mot en bhété (forme phonétique latine) *"
            value={wordSpelling}
            onChange={e => { setWordSpelling(e.target.value); setExisting(null) }}
          />
          {signedIn === false && (
            <p className="text-sm text-muted-foreground">Connectez-vous pour contribuer.</p>
          )}
          {signedIn && (
            <LexiconPicker
              client={supabaseRef.current}
              kind="word"
              spelling={wordSpelling}
              gloss={initialWord ?? ''}
              dialect={dialect}
              signedIn
              debounceMs={300}
              canUseExample={false}
              chooseSense={false}
              exactLabel="Ouvrir cette fiche"
              variantLabel="Ouvrir cette fiche"
              createLabel="Ce mot n’existe pas encore : créer l’entrée"
              submitLabel="Créer l’entrée"
              busy={loading}
              error={submitError ?? ''}
              onChoose={c => router.push(`/lexicon/${c.entry.id}`)}
              onChooseVariant={c => router.push(`/lexicon/${c.entry.id}`)}
              onCreate={handleCreateWord}
              formExtra={
                <>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Phrase d&apos;exemple (optionnel)
                    </p>
                    <Input
                      placeholder="Phrase en bhété utilisant ce mot"
                      value={wordExBete}
                      onChange={e => setWordExBete(e.target.value)}
                    />
                    <Input
                      placeholder="Traduction française de la phrase"
                      value={wordExFrench}
                      onChange={e => setWordExFrench(e.target.value)}
                    />
                  </div>
                  <ContributionPronunciation key={recorderKey} blob={pronunciation} onChange={setPronunciation} onRecordingChange={setRecording} disabled={loading} />
                </>
              }
            />
          )}
          {existing && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50/50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200" role="status">
              <p>{existing.notice}</p>
              <Link href={`/lexicon/${existing.id}`} className="font-semibold underline">Ouvrir la fiche</Link>
            </div>
          )}
```

Bottom of the component: show the generic error only outside the word tab, and the submit button only outside it:

```tsx
      {type !== 'word' && submitError && <p className="text-sm text-red-600">{submitError}</p>}

      {type !== 'word' && (
        <Button
          onClick={handleSubmit}
          disabled={loading || (
            type === 'expression' ? !frPhrase || !betePhrase || !betePhonetic :
            !patternFr || !patternBete || !description
          )}
        >
          {loading ? 'Envoi…' : 'Soumettre la contribution'}
        </Button>
      )}
```

(The `initialWord` that used to fill the French field now seeds the first sense of the creation form through `gloss`.)

- [ ] **Step 4: Run test, type-check, lint**

Run: `npx vitest run __tests__/contribution-form.test.tsx __tests__/contribution-pronunciation.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit` — Expected: errors only in `lib/contribution.ts` / `__tests__/contribution.test.ts` if they reference removed names (none are removed yet); otherwise clean.
Run: `npx eslint components/ContributionForm.tsx` — Expected: no errors (in particular no unused imports).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must be master
git add components/ContributionForm.tsx __tests__/contribution-form.test.tsx
git commit -m "feat(contribution): add a word through the shared lexicon picker, with a notice when the entry already exists

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Remove the placeholder claim and the dead payload builders

**Files:**
- Modify: `lib/contribution.ts`
- Modify: `__tests__/contribution.test.ts`
- Modify: `components/LexiconEntry.tsx:44`

**Interfaces:**
- Consumes: nothing new.
- Produces: `lib/contribution.ts` exports only `exampleState`, `wordBlockingProblem`, `contributionErrorMessage`, `audioOutcome`, `audioFailedMessage` (and their types).

- [ ] **Step 1: Prove what is unused**

Run: `grep -rn "buildWordPayload\|buildWordClaimPayload\|buildExampleRow\|WORD_ALREADY_CLAIMED\|WordFields\|ExampleFields" app components lib __tests__ --include=*.ts --include=*.tsx`
Expected: matches only in `lib/contribution.ts` and `__tests__/contribution.test.ts`. If anything else matches, stop and keep that export.

- [ ] **Step 2: Edit the tests first**

In `__tests__/contribution.test.ts`: delete the `describe('buildWordPayload', …)`, `describe('buildWordClaimPayload', …)` and `describe('buildExampleRow', …)` blocks, the test `explains that a placeholder was translated by someone else in the meantime`, the `base` constants only they used, and remove `buildWordClaimPayload`, `buildWordPayload`, `buildExampleRow`, `WORD_ALREADY_CLAIMED` from the import list. Keep every other test.

Run: `npx vitest run __tests__/contribution.test.ts` — Expected: PASS (the claim-code branch is untested now but not yet removed).

- [ ] **Step 3: Remove the code**

In `lib/contribution.ts` delete `WordFields`, `buildWordPayload`, `buildWordClaimPayload`, `ExampleFields`, `buildExampleRow`, `WORD_ALREADY_CLAIMED`, the `if (code === WORD_ALREADY_CLAIMED) {…}` branch of `contributionErrorMessage` (and the line in its doc comment that mentions it), the `import type { DialectKey }` line if nothing left uses it, and the header comment lines that describe `ContributionForm`'s word branch if they are now wrong (the file still holds pure helpers for the form: say so).

In `components/LexiconEntry.tsx` change the "Traduire →" link to drop the claim id:
`href={`/contribute?word=${encodeURIComponent(entry.top_french)}&type=word`}`

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run __tests__/contribution.test.ts __tests__/contribution-word-blocking.test.ts __tests__/contribution-form.test.tsx`
Expected: no type errors, tests PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must be master
git add lib/contribution.ts __tests__/contribution.test.ts components/LexiconEntry.tsx
git commit -m "chore(contribution): drop the placeholder claim and the direct word insert helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Whole-suite verification and a look at the real screens

**Files:** none modified unless a check fails.

- [ ] **Step 1: Full checks**

Run: `npx tsc --noEmit && npx eslint components lib __tests__ && npx vitest run`
Expected: all green. (RLS tests are excluded from `vitest run` and need a local Supabase; this change touches no SQL.)

- [ ] **Step 2: Try both flows in the browser**

Start the app the way the repo does (see the `run` skill and the "Local Supabase ports" note in memory: check `docker ps` first; `next dev` crashes on deep Windows paths, so use a short path if needed).
1. `/contribute?type=word&word=ciel`: type a spelling that exists: a card with "Ouvrir cette fiche" appears and opens `/lexicon/[id]`. Type a new spelling: "Ce mot n’existe pas encore : créer l’entrée" opens the form with "ciel" as the first sense. Create it with an example and a recording: "Contribution envoyée ✓", the entry shows the example and the pronunciation.
2. Type the spelling of that new entry again, open the creation form and create: the amber notice appears with "Ouvrir la fiche", and no "Contribution envoyée".
3. In a resource's word-link editor, link a word with an existing spelling (card with sense radios), then create a new one with "Mot différent", then collide on purpose: the block links to the existing entry and the notice shows in the linked view.
Report what you saw. If you could not run the app, say so; do not claim these checks passed.

- [ ] **Step 3: Update the spec status**

Edit `docs/superpowers/specs/2026-10-06-lexicon-add-form-unification-design.md` header line to `Status: implemented (<commit range>)`, then:

```bash
git branch --show-current   # must be master
git add docs/superpowers/specs/2026-10-06-lexicon-add-form-unification-design.md docs/superpowers/plans/2026-10-06-lexicon-add-form-unification.md
git commit -m "docs: mark the lexicon add form unification as implemented

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Follow-ups noted (not in this plan)

- `SimilarWords` / `SimilarWordsList` are no longer used by `ContributionForm`; delete them in a separate change after a repo-wide grep.
- The contribution page now has two dialect selectors (the page-level one and the one inside the creation form); fold them later.
- RPC dedupe key (IPA vs Latin spelling), server-side `p_pos` validation, and the dead placeholder clause in `lexicon_guard_update` stay as recorded in the spec.
