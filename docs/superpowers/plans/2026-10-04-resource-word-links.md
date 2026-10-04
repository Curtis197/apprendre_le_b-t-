# Resource Word Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a resource's contributor pair the words of each verse (Bété ↔ *mot à mot*, many-to-many, non-adjacent allowed, with grammatical markers), and let every reader tap a word to see its exact gloss, its linked partner words and, for markers, their meaning.

**Architecture:** Two new tables (`resource_word_blocks`, `resource_word_markers`) written only by a `security definer` function (`save_resource_verse`) and read through `get_resource_words`; all pairing logic lives in pure, unit-tested TypeScript (`word-blocks.ts`, `word-link-editor.ts`); two thin React layers sit on top: the reader (`VerseWords`, wired into `VerseTranslation`) and the owner-only editor at `/resources/[id]/relier`. Nothing in `lexicon` changes.

**Tech Stack:** Next.js 16.2 (App Router, React 19, Tailwind), Supabase (Postgres, RLS, RPC), vitest (unit tests with `renderToStaticMarkup` for components; RLS suite against the local stack).

**Spec:** `docs/superpowers/specs/2026-10-04-resource-word-links-design.md`

## Global Constraints

- Node/Next specifics: `web/AGENTS.md` says this Next.js has breaking changes: read the relevant guide in `web/node_modules/next/dist/docs/` before writing page or route code, and follow the patterns of `web/app/resources/[id]/edit/page.tsx` (async `params`, `createClient` from `@/lib/supabase-server`).
- Browser floor: iOS Safari 16.1. No regex look-behind, no `:has()`, no `color-mix()` in new CSS; use the existing Tailwind tokens (`border-border`, `bg-card`, `text-primary`, `text-muted-foreground`).
- UI copy is French. Error messages from the database are codes; the UI maps them to French.
- Words are split everywhere on runs of space, tab and U+00A0 (`/[ \t\u00a0]+/`); hyphens and apostrophes stay inside a word. Lines are numbered like `numberLines`: n-th non-empty line, 1-based, `\r\n` and `\r` treated as `\n`.
- Migrations since `20260930000000` must be re-runnable: every `create policy` is preceded by `drop policy if exists <same name> on <same table>` (`web/__tests__/migrations.test.ts` enforces it). New migration version: `20261007000000` (later than every file in `supabase/migrations/`).
- New SQL functions are exposed to clients by default: explicitly `revoke execute ... from public, anon` (and `authenticated` for internal helpers) and `grant` only what a client needs.
- `lexicon` and its tables are not touched (separate spec).
- Work in a git worktree on a feature branch created from `master`; check `git branch --show-current` before every commit (other sessions share the main folder); never switch branches in the shared folder. Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Test commands (run from `web/`): unit `npx vitest run <file>`; all unit `npm test`; RLS `npm run test:rls -- <filter>` against the local Supabase stack (run in groups: the local signup limit is 30 per 5 minutes). Local stack: check `docker ps` first; apply a new migration with `supabase migration up` from the repo root.

## Review Focus

Failure modes the spec implies but a straight reading would not test; each line has a pinning test in the task named in brackets.

1. **Odd whitespace in a verse** (double spaces, tab, U+00A0, Windows line endings): the browser and the database must agree on word counts, or indices point at the wrong words. [Task 1 unit test, Task 3 RLS test]
2. **Text edited elsewhere between opening the editor and saving** (edit form, accepted correction in another tab): the save must be refused, not applied to shifted words. [Task 3 `text_changed`]
3. **A resource with no *mot à mot*, or a different number of lines in the two fields**: the editor page explains what to fix instead of crashing or offering an impossible pairing. [Task 7 `readiness`]
4. **A marker whose meaning was never filled in, and the same marker word in two verses**: the reader says "sens à préciser", and the meaning typed in one verse applies to the other. [Task 5 reader test, Task 3 and Task 7 tests]
5. **A verse whose text changed after linking**: the reader silently shows the plain line, never a gloss against the wrong word. [Task 2 `stale`, Task 6 wiring test]

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261007000000_resource_word_links.sql` | tables, RLS, helper functions, `get_resource_words`, `save_resource_verse`, grants |
| `web/lib/word-blocks.ts` | pure: word splitting, units, pairing, index remapping, reader tokens, shared types |
| `web/lib/word-blocks-data.ts` | Supabase calls: `getResourceWords`, `saveVerse`, French error messages |
| `web/lib/word-link-editor.ts` | pure: editor state for one verse (init, derive, mutations, payload), `readiness`, `buildCells` |
| `web/components/VerseWords.tsx` | reader: one verse as tappable words, modes B and A, word detail |
| `web/components/VerseTranslation.tsx` | modified: shows `VerseWords` for verses that have blocks, mode toggle |
| `web/components/word-link/PairStrip.tsx` | editor: the strip of pairs in sentence order |
| `web/components/word-link/BlockPanel.tsx` | editor: panel of the selected block (regroup, correct, marker, notes) |
| `web/components/word-link/WordLinkEditor.tsx` | editor: tabs, drafts, save |
| `web/app/resources/[id]/relier/page.tsx` | owner-only page hosting the editor |
| `web/app/resources/[id]/page.tsx`, `web/components/ResourceOwnerActions.tsx` | modified: fetch words, owner link and prompt |
| `web/__tests__/word-blocks.test.ts`, `word-blocks-data.test.ts`, `word-link-editor.test.ts`, `verse-words.test.tsx`, `verse-translation-words.test.tsx`, `word-link-panels.test.tsx` | unit and component tests |
| `web/__tests__/rls/resource-word-links.test.ts` | database tests |

---

### Task 1: Pure helpers (`word-blocks.ts`)

**Files:**
- Create: `web/lib/word-blocks.ts`
- Test: `web/__tests__/word-blocks.test.ts`

**Interfaces:**
- Produces (used by every later task): `Side`, `Unit`, `Pair`, `IndexMap`, `MarkerInfo`, `WordBlock`, `VerseWords`, `BlockInput`, `ReaderToken`; functions `splitWords`, `nonEmptyLines`, `normWord`, `autoGroup`, `buildUnits`, `attachTo`, `blockKey`, `contiguous`, `splitRuns`, `labelOf`, `blockWords`, `pairUnits`, `remapAtt`, `remapBlockKey`, `remapKeys`, `mapReplace`, `mapInsert`, `mapRemove`, `readerTokens`.

- [ ] **Step 0: Create the implementation worktree and bring the spec and plan over**

The spec and this plan live on the branch `docs/resource-word-links-spec`. Implement on a separate branch from `master`, in its own short-path worktree (other sessions share the main folder; `next dev` also crashes on deep Windows paths). From the main repository folder:

```bash
git worktree add "../wl-impl" -b feat/resource-word-links master
cd ../wl-impl
git checkout docs/resource-word-links-spec -- docs/superpowers/specs/2026-10-04-resource-word-links-design.md docs/superpowers/plans/2026-10-04-resource-word-links.md
git commit -m "docs: word links spec and plan

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
cd web && npm install
```

Every path in this plan is relative to `wl-impl`. Confirm with `git branch --show-current` (expected `feat/resource-word-links`).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/word-blocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  attachTo, autoGroup, blockKey, blockWords, buildUnits, contiguous, labelOf, mapInsert, mapRemove,
  mapReplace, nonEmptyLines, normWord, pairUnits, readerTokens, remapAtt, remapKeys, splitRuns, splitWords,
  type VerseWords,
} from '../lib/word-blocks'

// The Notre Père, as paired by hand in the mockups: the real fixtures of the pilot.
const BETE = [
  'A diba Lago ô wu mä ghèhi-wu nikpa wuo ni ghlimani na ngli',
  "Na'a komanon ni ghle glô sê wa zoua mä ghéhi-wu sê en yibhää gba wa kä sibhä mää dudu wu zumen",
  'Nya anyi ziê a lilê',
  "Sê a'a tatini a bhia a'a nyinyo li gbô yii Yaya tatini sibha a'a nyinyo li a gbô yi",
  'Téa anyi yi-tatini a ni ti nyinyo li men bhlini maa sè anyi Sataa a mentenon ngli diba na yizé en men kämaniè enmen tèemen enmen ghliyè kwadrekwadrenon Amen',
]
const LIT = [
  'Notre Père Dieu qui est là-bas au ciel les gens tous que élève ton nom',
  'Ton commandement que arrive terre comme ils font là-bas au ciel comme tu veux ordonne ils vont aussi ici en bas faire',
  "Donne nous aujourd'hui de nourriture",
  'Comme nous laissons nos amis leur mauvaise chose problème pardon laisse aussi nos mauvaise chose nos problème',
  'Ne nous laisse nous ne pas mauvaise chose dedans tomber mais enlève nous Satan son envoyé bouche père toi seul toi commande toi puissant toi grand éternellement Amen',
]

describe('splitWords / nonEmptyLines', () => {
  it('splits on spaces, tabs and non-breaking spaces and keeps hyphens and apostrophes', () => {
    expect(splitWords("  Na'a\u00a0 ghèhi-wu\tô  ")).toEqual(["Na'a", 'ghèhi-wu', 'ô'])
    expect(splitWords('')).toEqual([])
    expect(splitWords(' \u00a0 ')).toEqual([])
  })

  it('numbers lines like numberLines: non-empty lines only, any line ending', () => {
    expect(nonEmptyLines('a b\r\n\r\n c \rd')).toEqual(['a b', 'c', 'd'])
    expect(nonEmptyLines('')).toEqual([])
  })
})

describe('normWord', () => {
  it('folds case, accents, tones, apostrophes and hyphens', () => {
    expect(normWord('Téa')).toBe('tea')
    expect(normWord("Na'a")).toBe('naa')
    expect(normWord('ghèhi-wu')).toBe('ghehiwu')
    expect(normWord('ghéhi-wu')).toBe('ghehiwu')
  })
})

describe('autoGroup (French articles)', () => {
  it('groups an article with the next word, as in "au ciel" and "les gens"', () => {
    const gw = splitWords(LIT[0])
    expect(autoGroup(gw)).toEqual({ 6: 7, 8: 9 })
    expect(buildUnits(gw, autoGroup(gw))).toHaveLength(13)
  })

  it('does not group "de", which is a real Bété word in "Nya anyi ziê a lilê"', () => {
    expect(autoGroup(splitWords(LIT[2]))).toEqual({})
  })

  it('chains articles onto the head of the following group', () => {
    expect(autoGroup(['le', 'la', 'maison'])).toEqual({ 0: 2, 1: 2 })
  })
})

describe('buildUnits / attachTo / pairUnits', () => {
  it('verse 1 pairs 13 Bété words with 13 mot à mot units after article grouping', () => {
    const bu = buildUnits(splitWords(BETE[0]), {})
    const gw = splitWords(LIT[0])
    const gu = buildUnits(gw, autoGroup(gw))
    expect(bu).toHaveLength(13)
    const pairs = pairUnits(bu, gu, new Set())
    expect(pairs.every(p => p.b && p.g)).toBe(true)
    expect(labelOf(gw, pairs[6].g!.idx)).toBe('au ciel') // ghèhi-wu
    expect(labelOf(gw, pairs[7].g!.idx)).toBe('les gens') // nikpa
  })

  it('verse 4 balances at 17/17 when the two particles are linked to their tatini', () => {
    const bw = splitWords(BETE[3])
    const gw = splitWords(LIT[3])
    expect(bw).toHaveLength(19)
    expect(gw).toHaveLength(17)
    let att = attachTo({}, 9, 2) // yii -> first tatini
    att = attachTo(att, 18, 11) // yi -> second tatini
    const bu = buildUnits(bw, att)
    const gu = buildUnits(gw, autoGroup(gw))
    expect(bu).toHaveLength(17)
    const pairs = pairUnits(bu, gu, new Set())
    expect(pairs[2].b!.idx).toEqual([2, 9])
    expect(labelOf(gw, pairs[2].g!.idx)).toBe('laissons')
    expect(labelOf(bw, pairs[2].b!.idx)).toBe('tatini … yii')
    expect(pairs[10].b!.idx).toEqual([11, 18])
    expect(labelOf(gw, pairs[10].g!.idx)).toBe('laisse')
  })

  it('a marker with no mot à mot counterpart is set aside and does not shift the others', () => {
    const bw = splitWords('en ye zigbleh yi')
    const gw = splitWords('je demain venir')
    const bu = buildUnits(bw, {})
    const gu = buildUnits(gw, {})
    const pairs = pairUnits(bu, gu, new Set(['1']))
    expect(pairs.map(p => [p.b && blockWords(bw, p.b.idx), p.g && blockWords(gw, p.g.idx), !!p.solo])).toEqual([
      ['en', 'je', false],
      ['ye', null, true],
      ['zigbleh', 'demain', false],
      ['yi', 'venir', false],
    ])
  })

  it('ignores attachments that point outside the line or to a non-head', () => {
    expect(buildUnits(['a', 'b'], { 0: 5 })).toHaveLength(2)
    expect(buildUnits(['a', 'b', 'c'], { 0: 1, 1: 2 })).toHaveLength(2) // 1 is attached, so 0 -> 1 is ignored
  })
})

describe('runs and labels', () => {
  it('detects separated words and labels them with an ellipsis', () => {
    expect(contiguous([3, 4, 5])).toBe(true)
    expect(contiguous([2, 9])).toBe(false)
    expect(splitRuns([2, 9, 10])).toEqual([[2], [9, 10]])
    expect(blockKey({ head: 2, idx: [2, 9] })).toBe('2-9')
    expect(labelOf(['a', 'b', 'c', 'd'], [0, 2])).toBe('a … c')
    expect(labelOf(['a', 'b', 'c', 'd'], [1, 2])).toBe('b c')
    expect(blockWords(['a', 'b', 'c', 'd'], [0, 2])).toBe('a c')
  })
})

describe('index remapping after a text correction', () => {
  it('merging "en men" into "enmen" in verse 5 shifts every later index by one', () => {
    const f = mapReplace([20, 21], 1)
    expect(f(19)).toBe(19)
    expect(f(20)).toBe(20)
    expect(f(21)).toBeNull()
    expect(f(22)).toBe(21)
    expect(remapAtt({ 21: 20, 25: 24 }, f)).toEqual({ 24: 23 })
    expect(remapKeys({ '20-21': 'x', '22': 'y' }, f)).toEqual({ '20': 'x', '21': 'y' })
  })

  it('inserting and removing a word', () => {
    expect(mapInsert(3, 2)(2)).toBe(2)
    expect(mapInsert(3, 2)(3)).toBe(5)
    expect(mapRemove(3)(3)).toBeNull()
    expect(mapRemove(3)(4)).toBe(3)
    expect(remapAtt({ 4: 2 }, mapRemove(4))).toEqual({})
  })

  it('splitting one word into two grows the line', () => {
    const f = mapReplace([5], 2)
    expect(f(5)).toBe(5)
    expect(f(6)).toBe(7)
  })
})

describe('readerTokens', () => {
  const verse: VerseWords = {
    verse_no: 4,
    stale: false,
    bete_line: "Sê a'a tatini a yii",
    literal_line: 'Comme nous laissons nos',
    blocks: [
      { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null },
      { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: false, solo: false, note: 'sujet', composition: null, marker: null },
      { position: 3, bete_idx: [2, 4], gloss_idx: [2], is_marker: false, solo: false, note: null, composition: null, marker: null },
      { position: 4, bete_idx: [3], gloss_idx: [3], is_marker: false, solo: false, note: null, composition: 'a (x) + a (y)', marker: null },
    ],
  }

  it('gives one token per word place, in the original sentence order', () => {
    const tokens = readerTokens(verse)
    expect(tokens.map(t => t.t)).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
  })

  it('links the pieces of a block with separated words', () => {
    const [, , tatini, , yii] = readerTokens(verse)
    expect(tatini.bid).toBe(yii.bid)
    expect(tatini.k).toBe(0)
    expect(yii.k).toBe(1)
    expect(tatini.runs).toEqual(['tatini', 'yii'])
    expect(tatini.whole).toBe('tatini … yii')
    expect(tatini.gloss).toBe('laissons')
  })

  it('carries notes, compositions and a solo marker with no gloss', () => {
    const solo: VerseWords = {
      verse_no: 2, stale: false, bete_line: 'en ye zigbleh yi', literal_line: 'je demain venir',
      blocks: [
        { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null },
        { position: 2, bete_idx: [1], gloss_idx: [], is_marker: true, solo: true, note: null, composition: null, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe' } },
        { position: 3, bete_idx: [2], gloss_idx: [1], is_marker: false, solo: false, note: null, composition: null, marker: null },
        { position: 4, bete_idx: [3], gloss_idx: [2], is_marker: false, solo: false, note: null, composition: null, marker: null },
      ],
    }
    const ye = readerTokens(solo)[1]
    expect(ye.gloss).toBeNull()
    expect(ye.isMarker).toBe(true)
    expect(ye.marker?.meaning).toBe('futur')
    expect(readerTokens(verse)[1].note).toBe('sujet')
    expect(readerTokens(verse)[3].composition).toBe('a (x) + a (y)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `web/`): `npx vitest run __tests__/word-blocks.test.ts`
Expected: FAIL, `Failed to resolve import "../lib/word-blocks"`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/word-blocks.ts`:

```ts
// lib/word-blocks.ts — pure helpers for the word-by-word layer of resources.
// No React, no Supabase: everything here is unit tested. Words are split exactly like the SQL
// functions word_count / block_words (migration 20261007000000_resource_word_links.sql):
// on runs of space, tab and U+00A0; hyphens and apostrophes stay inside a word.

export type Side = 'b' | 'g'

/** A set of words of one side that read as one: the head word plus the words attached to it. */
export interface Unit {
  head: number
  idx: number[]
}

/** A Bété unit paired with a mot à mot unit. `solo`: a marker with no mot à mot counterpart. */
export interface Pair {
  b: Unit | null
  g: Unit | null
  solo?: boolean
}

/** Maps an old word index to its new index, or null when the word no longer exists. */
export type IndexMap = (i: number) => number | null

export interface MarkerInfo {
  type: string | null
  meaning: string | null
  french: string | null
}

/** One block as returned by get_resource_words. */
export interface WordBlock {
  position: number
  bete_idx: number[]
  gloss_idx: number[]
  is_marker: boolean
  solo: boolean
  note: string | null
  composition: string | null
  marker: MarkerInfo | null
}

/** One verse with its blocks, as returned by get_resource_words. */
export interface VerseWords {
  verse_no: number
  stale: boolean
  bete_line: string
  literal_line: string
  blocks: WordBlock[]
}

/** One block as sent to save_resource_verse. */
export interface BlockInput {
  bete_idx: number[]
  gloss_idx: number[]
  is_marker: boolean
  solo: boolean
  note: string | null
  composition: string | null
  marker?: { type: string; meaning: string; french: string }
}

const EDGE = /^[ \t\u00a0]+|[ \t\u00a0]+$/g
const SEP = /[ \t\u00a0]+/

export function splitWords(line: string): string[] {
  const t = line.replace(EDGE, '')
  return t === '' ? [] : t.split(SEP)
}

/**
 * The non-empty lines of a text, trimmed of spaces and tabs only (like the SQL function
 * verse_line), so "verse n" is the same line here, in the gutter and in the database.
 */
export function nonEmptyLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.replace(/^[ \t]+|[ \t]+$/g, ''))
    .filter(l => l !== '')
}

/** Key under which a marker's meaning is shared. Same result as SQL usage_token_norm for ordinary words. */
export function normWord(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f'\u2019\u02bc\u2011-]/g, '')
}

const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'au', 'aux', 'du'])

/**
 * Bété has no articles: a French article sticks to the word after it ("les gens", "au ciel").
 * Returns the attachment map (member index -> head index). "de" is deliberately absent: it can be
 * a real Bété word.
 */
export function autoGroup(words: string[]): Record<number, number> {
  const att: Record<number, number> = {}
  for (let i = words.length - 2; i >= 0; i--) {
    if (ARTICLES.has(words[i].toLowerCase())) att[i] = att[i + 1] ?? i + 1
  }
  return att
}

/** Units of a line: every word is a unit of its own unless it is attached to a head word. */
export function buildUnits(words: string[], att: Record<number, number>): Unit[] {
  const ok = (i: number) => att[i] != null && att[i] < words.length && att[i] !== i && att[att[i]] == null
  const all = words.map((_, i) => i)
  return all
    .filter(i => !ok(i))
    .map(head => ({ head, idx: all.filter(i => i === head || (ok(i) && att[i] === head)) }))
    .sort((a, b) => a.idx[0] - b.idx[0])
}

/** Attach word `from` (and the words attached to it) to head `to`. */
export function attachTo(att: Record<number, number>, from: number, to: number): Record<number, number> {
  const next = { ...att, [from]: to }
  for (const k of Object.keys(next)) if (next[Number(k)] === from) next[Number(k)] = to
  return next
}

export const blockKey = (u: Unit): string => u.idx.join('-')

export const contiguous = (idx: number[]): boolean => idx.every((v, k) => k === 0 || v === idx[k - 1] + 1)

/** Consecutive runs of word indices: [2, 9, 10] -> [[2], [9, 10]]. */
export function splitRuns(idx: number[]): number[][] {
  const runs: number[][] = []
  for (const i of idx) {
    const last = runs[runs.length - 1]
    if (last && i === last[last.length - 1] + 1) last.push(i)
    else runs.push([i])
  }
  return runs
}

/** The words of a block joined by a space (what the database stores as the marker key source). */
export const blockWords = (words: string[], idx: number[]): string => idx.map(i => words[i] ?? '').join(' ')

/** The words of a block for display: "tatini … yii" when they are not side by side. */
export const labelOf = (words: string[], idx: number[]): string =>
  idx.map(i => words[i] ?? '').join(contiguous(idx) ? ' ' : ' … ')

/**
 * The k-th Bété unit is paired with the k-th mot à mot unit. Units flagged solo (markers with no
 * counterpart) are set aside and kept in sentence order. `soloKeys` holds `blockKey` values.
 */
export function pairUnits(bu: Unit[], gu: Unit[], soloKeys: ReadonlySet<string>): Pair[] {
  const isSolo = (u: Unit) => soloKeys.has(blockKey(u))
  const pu = bu.filter(u => !isSolo(u))
  const n = Math.max(pu.length, gu.length)
  const pairs: Pair[] = [
    ...Array.from({ length: n }, (_, k): Pair => ({ b: pu[k] ?? null, g: gu[k] ?? null })),
    ...bu.filter(isSolo).map((u): Pair => ({ b: u, g: null, solo: true })),
  ]
  return pairs.sort((a, b) => (a.b ? a.b.idx[0] : 1e6) - (b.b ? b.b.idx[0] : 1e6))
}

// ── Index remapping after a text correction ─────────────────────────────────────────────────────

export function remapAtt(att: Record<number, number>, f: IndexMap): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [k, v] of Object.entries(att)) {
    const nk = f(Number(k))
    const nv = f(Number(v))
    if (nk != null && nv != null && nk !== nv) out[nk] = nv
  }
  return out
}

/** Block keys are Bété word indices joined by "-". Returns null when none of its words survives. */
export function remapBlockKey(key: string, f: IndexMap): string | null {
  const ids = key
    .split('-')
    .map(Number)
    .map(f)
    .filter((x): x is number => x != null)
  return ids.length ? ids.join('-') : null
}

export function remapKeys<T>(o: Record<string, T>, f: IndexMap): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [k, v] of Object.entries(o)) {
    const nk = remapBlockKey(k, f)
    if (nk) out[nk] = v
  }
  return out
}

/** The words `idx` (side by side) are replaced by `newLen` words. */
export const mapReplace =
  (idx: number[], newLen: number): IndexMap =>
  i => {
    const start = idx[0]
    const end = idx[idx.length - 1]
    const delta = newLen - idx.length
    if (i < start) return i
    if (i <= end) return i - start < newLen ? i : null
    return i + delta
  }

/** `n` words are inserted before position `pos`. */
export const mapInsert =
  (pos: number, n: number): IndexMap =>
  i =>
    i >= pos ? i + n : i

/** The word at `at` is removed. */
export const mapRemove =
  (at: number): IndexMap =>
  i =>
    i === at ? null : i > at ? i - 1 : i

// ── Reader tokens ───────────────────────────────────────────────────────────────────────────────

export interface ReaderToken {
  /** First word index of this piece in the Bété line. */
  start: number
  /** Piece number inside its block (0 = first piece). */
  k: number
  /** Text of every piece of the block, in order. */
  runs: string[]
  /** Shared by the pieces of one block. */
  bid: string
  /** Text of this piece. */
  t: string
  /** Text of the whole block: "tatini … yii" when its words are apart. */
  whole: string
  gloss: string | null
  note: string | null
  composition: string | null
  isMarker: boolean
  solo: boolean
  marker: MarkerInfo | null
}

/**
 * One token per word place, in the original sentence order. A block whose words are apart gives
 * several tokens sharing the same `bid`, so the reader can link them. The text is never rewritten.
 */
export function readerTokens(verse: VerseWords): ReaderToken[] {
  const bw = splitWords(verse.bete_line)
  const gw = splitWords(verse.literal_line)
  const out: ReaderToken[] = []
  for (const b of verse.blocks) {
    const runs = splitRuns(b.bete_idx)
    const names = runs.map(r => r.map(i => bw[i] ?? '').join(' '))
    runs.forEach((r, k) =>
      out.push({
        start: r[0],
        k,
        runs: names,
        bid: `${verse.verse_no}:${b.position}`,
        t: names[k],
        whole: labelOf(bw, b.bete_idx),
        gloss: b.gloss_idx.length ? labelOf(gw, b.gloss_idx) : null,
        note: b.note,
        composition: b.composition,
        isMarker: b.is_marker,
        solo: b.solo,
        marker: b.marker,
      }),
    )
  }
  return out.sort((a, b) => a.start - b.start)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/word-blocks.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add web/lib/word-blocks.ts web/__tests__/word-blocks.test.ts
git commit -m "feat(word-links): pure helpers for word blocks and pairing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migration part 1, tables, helpers and the read function

**Files:**
- Create: `supabase/migrations/20261007000000_resource_word_links.sql`
- Test: `web/__tests__/rls/resource-word-links.test.ts`

**Interfaces:**
- Consumes: `usage_split(text)` and `usage_token_norm(text)` from `20261003000000_word_usages.sql`; `community_texts`.
- Produces: tables `resource_word_blocks`, `resource_word_markers`; functions `verse_line(text,int)`, `verse_hash(text,text,int)`, `word_count(text)`, `block_words(text,int[])`, `block_word_norm(text,int[])`, `replace_nth_line(text,int,text)` (internal, no client access); `get_resource_words(uuid)` returning `(verse_no int, stale boolean, bete_line text, literal_line text, blocks jsonb)` (anon and authenticated).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/rls/resource-word-links.test.ts`:

```ts
// web/__tests__/rls/resource-word-links.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { normWord, splitWords } from '../../lib/word-blocks'
import { admin, anonClient, createUser, must, type TestUser } from './helpers'

const BLOCK = (bete: number[], gloss: number[], over: Record<string, unknown> = {}) => ({
  bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, ...over,
})

async function resource(ownerId: string, bete: string, literal: string | null) {
  return must(
    await admin
      .from('community_texts')
      .insert({ title: 'Chant', type: 'song', content_bete: bete, content_literal: literal, created_by: ownerId })
      .select('id')
      .single(),
    'seed resource',
  ).id as string
}

/** insert/update/delete return no data by default: only the error matters. */
const ok = (res: { error: { message: string } | null }, what: string) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
}

const hashOf = async (bete: string, literal: string, n: number) =>
  must(await admin.rpc('verse_hash', { p_bete: bete, p_literal: literal, p_n: n }), 'verse_hash') as unknown as string

describe('resource word links: tables and reading', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('wl-alice'), createUser('wl-bob')])
  })

  it('does not let clients write blocks or markers directly', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const hash = await hashOf('a b c', 'x y z', 1)
    const row = { resource_id: id, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash }
    expect((await alice.client.from('resource_word_blocks').insert(row)).error).not.toBeNull()
    expect((await anonClient().from('resource_word_blocks').insert(row)).error).not.toBeNull()
    expect((await alice.client.from('resource_word_markers').insert({ resource_id: id, word_norm: 'a', word: 'a' })).error).not.toBeNull()

    ok(await admin.from('resource_word_blocks').insert(row), 'seed block')
    // with RLS and no policy, update and delete match no row (no error, no effect)
    await alice.client.from('resource_word_blocks').update({ note: 'hack' }).eq('resource_id', id)
    await alice.client.from('resource_word_blocks').delete().eq('resource_id', id)
    const after = must(await admin.from('resource_word_blocks').select('note').eq('resource_id', id), 'read back')
    expect(after).toHaveLength(1)
    expect(after[0].note).toBeNull()
  })

  it('returns each verse with its blocks to anonymous readers', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    const hash = await hashOf('a b c\nd e', 'x y z\nw v', 1)
    ok(
      await admin.from('resource_word_blocks').insert([
        { resource_id: id, verse_no: 1, position: 1, bete_idx: [0, 2], gloss_idx: [0], verse_hash: hash, note: 'n' },
        { resource_id: id, verse_no: 1, position: 2, bete_idx: [1], gloss_idx: [1, 2], verse_hash: hash },
      ]),
      'seed blocks',
    )
    const { data, error } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ verse_no: 1, stale: false, bete_line: 'a b c', literal_line: 'x y z' })
    expect(data[0].blocks.map((b: { position: number }) => b.position)).toEqual([1, 2])
    expect(data[0].blocks[0]).toMatchObject({ bete_idx: [0, 2], gloss_idx: [0], note: 'n', is_marker: false, marker: null })
  })

  it('marks a verse stale and returns no blocks once its text changed', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const hash = await hashOf('a b c', 'x y z', 1)
    ok(await admin.from('resource_word_blocks').insert({ resource_id: id, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash }), 'seed')
    ok(await admin.from('community_texts').update({ content_literal: 'x y q' }).eq('id', id), 'edit text')
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data[0]).toMatchObject({ verse_no: 1, stale: true, blocks: [] })
  })

  it('attaches the shared marker meaning to every block of that word', async () => {
    const id = await resource(alice.id, 'en ye\nen ye', 'je va\nje va')
    const h1 = await hashOf('en ye\nen ye', 'je va\nje va', 1)
    const h2 = await hashOf('en ye\nen ye', 'je va\nje va', 2)
    ok(
      await admin.from('resource_word_blocks').insert([
        { resource_id: id, verse_no: 1, position: 1, bete_idx: [1], gloss_idx: [1], is_marker: true, verse_hash: h1 },
        { resource_id: id, verse_no: 2, position: 1, bete_idx: [1], gloss_idx: [1], is_marker: true, verse_hash: h2 },
      ]),
      'seed',
    )
    ok(await admin.from('resource_word_markers').insert({ resource_id: id, word_norm: 'ye', word: 'ye', marker_type: 'temps', marker_meaning: 'futur', marker_french: 'aller + verbe' }), 'marker')
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data.map((v: { blocks: { marker: unknown }[] }) => v.blocks[0].marker)).toEqual([
      { type: 'temps', meaning: 'futur', french: 'aller + verbe' },
      { type: 'temps', meaning: 'futur', french: 'aller + verbe' },
    ])
  })

  it('returns nothing for a resource without blocks or one that does not exist', async () => {
    const id = await resource(alice.id, 'a b', 'x y')
    expect((await anonClient().rpc('get_resource_words', { p_resource: id })).data).toEqual([])
    expect((await anonClient().rpc('get_resource_words', { p_resource: '00000000-0000-0000-0000-000000000000' })).data).toEqual([])
  })

  it('keeps word counting in step with the browser, including odd whitespace and CRLF', async () => {
    const lines = ['a  b\tc', 'a\u00a0b c', '  a b  ', "Na'a ghèhi-wu ô"]
    for (const line of lines) {
      const { data } = await admin.rpc('block_words', { p_line: line, p_idx: splitWords(line).map((_, i) => i) })
      expect(data).toBe(splitWords(line).join(' '))
    }
  })

  it('computes the same marker key as the browser for ordinary Bété words', async () => {
    for (const w of ['ghèhi-wu', "Na'a", 'ô', 'mä', 'kämaniè', 'Téa', 'Sataa', 'A', 'ghéhi-wu']) {
      const { data } = await admin.rpc('block_word_norm', { p_line: w, p_idx: [0] })
      expect(data).toBe(normWord(w))
    }
  })

  it('keeps the helper functions away from clients', async () => {
    for (const [fn, args] of [
      ['verse_line', { p_text: 'a', p_n: 1 }],
      ['verse_hash', { p_bete: 'a', p_literal: 'b', p_n: 1 }],
      ['replace_nth_line', { p_text: 'a', p_n: 1, p_line: 'b' }],
      ['word_count', { p_line: 'a b' }],
    ] as const) {
      expect((await alice.client.rpc(fn, args)).error?.code).toBe('42501')
      expect((await anonClient().rpc(fn, args)).error?.code).toBe('42501')
    }
    void bob
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run (local stack running): `npm run test:rls -- resource-word-links`
Expected: FAIL, e.g. `relation "public.resource_word_blocks" does not exist` / `Could not find the function public.get_resource_words`.

- [ ] **Step 3: Write the migration (part 1)**

Create `supabase/migrations/20261007000000_resource_word_links.sql`:

```sql
-- supabase/migrations/20261007000000_resource_word_links.sql
-- Word-by-word reading of resources: a contributor pairs the words of each verse (Bété <-> mot à mot,
-- many-to-many, words may be apart) and flags grammatical markers. Readers get the pairs through
-- get_resource_words; only save_resource_verse writes. Nothing in `lexicon` changes.
-- Spec: docs/superpowers/specs/2026-10-04-resource-word-links-design.md

-- ── 1. helper functions (internal: no client may call them) ──────────────────────────────────────
-- Words are split on runs of space, tab and U+00A0, exactly like splitWords in web/lib/word-blocks.ts.

-- The n-th non-empty (trimmed) line of a text: same numbering as numberLines in the UI and usage_split.
create or replace function verse_line(p_text text, p_n int)
returns text language sql immutable as $$
  select t.txt
  from (
    select s.txt, row_number() over (order by s.stanza, s.line) as n
    from usage_split(p_text) s
  ) t
  where t.n = p_n
$$;

-- md5 of a verse's Bété and mot à mot lines: changes when either line changes.
create or replace function verse_hash(p_bete text, p_literal text, p_n int)
returns text language sql immutable as $$
  select md5(coalesce(verse_line(p_bete, p_n), '') || E'\n' || coalesce(verse_line(p_literal, p_n), ''))
$$;

create or replace function word_count(p_line text)
returns int language sql immutable as $$
  select case
    when btrim(coalesce(p_line, ''), E' \t\u00a0') = '' then 0
    else array_length(regexp_split_to_array(btrim(p_line, E' \t\u00a0'), E'[ \t\u00a0]+'), 1)
  end
$$;

-- The words at 0-based positions p_idx of a line, joined by one space.
create or replace function block_words(p_line text, p_idx int[])
returns text language sql immutable as $$
  select string_agg(w.word, ' ' order by w.ord)
  from regexp_split_to_table(btrim(coalesce(p_line, ''), E' \t\u00a0'), E'[ \t\u00a0]+') with ordinality as w(word, ord)
  where (w.ord - 1) = any(p_idx)
$$;

create or replace function block_word_norm(p_line text, p_idx int[])
returns text language sql immutable as $$
  select usage_token_norm(block_words(p_line, p_idx))
$$;

-- Replaces the n-th non-empty line and leaves every other line, blank lines (stanza breaks) included.
create or replace function replace_nth_line(p_text text, p_n int, p_line text)
returns text language plpgsql immutable as $$
declare
  v_lines text[] := regexp_split_to_array(replace(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n');
  v_i int;
  v_n int := 0;
begin
  for v_i in 1 .. coalesce(array_length(v_lines, 1), 0) loop
    if btrim(v_lines[v_i], E' \t') <> '' then
      v_n := v_n + 1;
      if v_n = p_n then
        v_lines[v_i] := btrim(p_line, E' \t');
        return array_to_string(v_lines, E'\n');
      end if;
    end if;
  end loop;
  raise exception 'verse_not_found';
end;
$$;

revoke execute on function verse_line(text, int) from public, anon, authenticated;
revoke execute on function verse_hash(text, text, int) from public, anon, authenticated;
revoke execute on function word_count(text) from public, anon, authenticated;
revoke execute on function block_words(text, int[]) from public, anon, authenticated;
revoke execute on function block_word_norm(text, int[]) from public, anon, authenticated;
revoke execute on function replace_nth_line(text, int, text) from public, anon, authenticated;

-- ── 2. tables ────────────────────────────────────────────────────────────────────────────────────
create table if not exists resource_word_blocks (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references community_texts(id) on delete cascade,
  verse_no    int  not null check (verse_no >= 1),            -- the gutter number: n-th non-empty line
  position    int  not null check (position >= 1),            -- order of the block by its first Bété word
  bete_idx    int[] not null check (cardinality(bete_idx) >= 1), -- 0-based word indices in the Bété line
  gloss_idx   int[] not null default '{}',                    -- 0-based word indices in the mot à mot line
  is_marker   boolean not null default false,                 -- grammatical marker
  solo        boolean not null default false,                 -- marker with no mot à mot counterpart
  note        text check (note is null or char_length(note) <= 500),
  composition text check (composition is null or char_length(composition) <= 300),
  verse_hash  text not null,                                  -- verse_hash() of the lines when saved
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (resource_id, verse_no, position),
  check (solo or cardinality(gloss_idx) >= 1),
  check (not solo or is_marker)
);

create index if not exists resource_word_blocks_resource_idx on resource_word_blocks (resource_id, verse_no);

-- The meaning of a marker, once per word in a resource (the follow-up lexicon spec moves it).
create table if not exists resource_word_markers (
  id             uuid primary key default gen_random_uuid(),
  resource_id    uuid not null references community_texts(id) on delete cascade,
  word_norm      text not null,                                -- usage_token_norm of the block's words
  word           text not null,                                -- spelling as first written, for display
  marker_type    text check (marker_type    is null or char_length(marker_type)    <= 100),
  marker_meaning text check (marker_meaning is null or char_length(marker_meaning) <= 300),
  marker_french  text check (marker_french  is null or char_length(marker_french)  <= 300),
  updated_at     timestamptz not null default now(),
  unique (resource_id, word_norm)
);

alter table resource_word_blocks  enable row level security;
alter table resource_word_markers enable row level security;

-- Readable by everyone; no insert/update/delete policy: only save_resource_verse writes.
drop policy if exists resource_word_blocks_select on resource_word_blocks;
create policy resource_word_blocks_select on resource_word_blocks for select using (true);
drop policy if exists resource_word_markers_select on resource_word_markers;
create policy resource_word_markers_select on resource_word_markers for select using (true);

-- ── 3. reading ───────────────────────────────────────────────────────────────────────────────────
-- One row per verse that has blocks. A verse whose text changed since it was saved is `stale` and
-- returns no blocks, so readers fall back to the plain line.
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
                          select jsonb_build_object('type', m.marker_type, 'meaning', m.marker_meaning, 'french', m.marker_french)
                          from resource_word_markers m
                          where m.resource_id = b.resource_id
                            and m.word_norm = block_word_norm(verse_line(t.content_bete, b.verse_no), b.bete_idx)
                        ) end
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

-- (save_resource_verse is added in the next task)
```

- [ ] **Step 4: Apply the migration locally and run the tests**

Run (from the repo root): `supabase migration up`
Run (from `web/`): `npm run test:rls -- resource-word-links`
Expected: PASS for all tests of this file. If `permission denied` appears on `admin.rpc('verse_hash')`, the service role lost EXECUTE: add `grant execute on function ... to service_role;` for the six helpers (the test calls them with the service role).

- [ ] **Step 5: Run the migration naming test and commit**

Run: `npx vitest run __tests__/migrations.test.ts`
Expected: PASS (policies are dropped before they are created).

```bash
git branch --show-current
git add supabase/migrations/20261007000000_resource_word_links.sql web/__tests__/rls/resource-word-links.test.ts
git commit -m "feat(word-links): tables, helpers and get_resource_words

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration part 2, `save_resource_verse`

**Files:**
- Modify: `supabase/migrations/20261007000000_resource_word_links.sql` (replace the last comment line with the function)
- Modify: `web/__tests__/rls/resource-word-links.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: Task 2's tables and helpers.
- Produces: `save_resource_verse(p_resource uuid, p_verse int, p_base_bete text, p_base_literal text, p_bete_line text, p_literal_line text, p_blocks jsonb) returns jsonb` (`{ "saved": n, "verse_hash": "..." }`); error codes raised as exception messages: `not_signed_in`, `resource_not_found`, `not_owner`, `bad_verse`, `bad_blocks`, `verse_not_found`, `literal_missing`, `text_changed`, `empty_block`, `bete_index_out_of_range`, `bete_index_not_increasing`, `bete_word_in_two_blocks`, `bete_word_uncovered`, `gloss_index_out_of_range`, `gloss_index_not_increasing`, `gloss_word_in_two_blocks`, `gloss_word_uncovered`, `solo_has_gloss`, `solo_not_marker`, `block_without_gloss`.

- [ ] **Step 1: Write the failing tests**

Append to `web/__tests__/rls/resource-word-links.test.ts`:

```ts
describe('save_resource_verse', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('wls-alice'), createUser('wls-bob')])
  })

  const THREE = [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [2])]

  const save = (user: TestUser, id: string, over: Record<string, unknown> = {}) =>
    user.client.rpc('save_resource_verse', {
      p_resource: id, p_verse: 1, p_base_bete: 'a b c', p_base_literal: 'x y z',
      p_bete_line: null, p_literal_line: null, p_blocks: THREE, ...over,
    })

  const rows = async (id: string) =>
    must(await admin.from('resource_word_blocks').select('*').eq('resource_id', id).order('verse_no').order('position'), 'rows')

  it('saves a balanced verse for the contributor and numbers the blocks by sentence order', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    const res = await save(alice, id, { p_blocks: [BLOCK([2], [0]), BLOCK([0, 1], [1, 2])] })
    expect(res.error).toBeNull()
    expect(res.data.saved).toBe(2)
    const saved = await rows(id)
    expect(saved.map(r => [r.position, r.bete_idx, r.gloss_idx])).toEqual([[1, [0, 1], [1, 2]], [2, [2], [0]]])
    expect(saved[0].verse_hash).toBe(res.data.verse_hash)
  })

  it('refuses anyone but the contributor, and anonymous callers', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    expect((await save(bob, id)).error?.message).toContain('not_owner')
    expect((await save({ client: anonClient() } as TestUser, id)).error?.code).toBe('42501')
    expect(await rows(id)).toHaveLength(0)
  })

  it('refuses a save built on an older text and writes nothing', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    ok(await admin.from('community_texts').update({ content_bete: 'a b d' }).eq('id', id), 'edit elsewhere')
    const res = await save(alice, id)
    expect(res.error?.message).toContain('text_changed')
    expect(await rows(id)).toHaveLength(0)
  })

  it.each([
    ['empty_block', [BLOCK([], [0])]],
    ['bete_index_out_of_range', [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([5], [2])]],
    ['bete_index_not_increasing', [BLOCK([1, 0], [0]), BLOCK([2], [1, 2])]],
    ['bete_word_in_two_blocks', [BLOCK([0, 1], [0]), BLOCK([1], [1]), BLOCK([2], [2])]],
    ['bete_word_uncovered', [BLOCK([0], [0]), BLOCK([1], [1, 2])]],
    ['gloss_index_out_of_range', [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [9])]],
    ['gloss_word_in_two_blocks', [BLOCK([0], [0]), BLOCK([1], [0, 1]), BLOCK([2], [2])]],
    ['gloss_word_uncovered', [BLOCK([0], [0]), BLOCK([1, 2], [1])]],
    ['block_without_gloss', [BLOCK([0], [0, 1, 2]), BLOCK([1], []), BLOCK([2], [])]],
    ['solo_has_gloss', [BLOCK([0], [0]), BLOCK([1], [1], { solo: true, is_marker: true }), BLOCK([2], [2])]],
    ['solo_not_marker', [BLOCK([0], [0, 1]), BLOCK([1], [], { solo: true }), BLOCK([2], [2])]],
  ])('rejects %s', async (code, blocks) => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const res = await save(alice, id, { p_blocks: blocks })
    expect(res.error?.message).toContain(code)
    expect(await rows(id)).toHaveLength(0)
  })

  it('replaces the previous blocks of the verse atomically and leaves other verses alone', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    expect((await save(alice, id)).error).toBeNull()
    expect((await save(alice, id, { p_verse: 2, p_base_bete: 'd e', p_base_literal: 'w v', p_blocks: [BLOCK([0], [0]), BLOCK([1], [1])] })).error).toBeNull()
    expect((await save(alice, id, { p_blocks: [BLOCK([0, 1, 2], [0, 1, 2])] })).error).toBeNull()
    const saved = await rows(id)
    expect(saved.map(r => [r.verse_no, r.position])).toEqual([[1, 1], [2, 1], [2, 2]])
    // a failing save leaves the verse as it was
    expect((await save(alice, id, { p_blocks: [BLOCK([0], [0])] })).error).not.toBeNull()
    expect((await rows(id)).filter(r => r.verse_no === 1)).toHaveLength(1)
  })

  it('applies a corrected line to the text and keeps blank lines and the usage index', async () => {
    const id = await resource(alice.id, 'a b c\n\nd e', 'x y z\n\nw v')
    const res = await save(alice, id, {
      p_bete_line: 'a bb c', p_literal_line: 'x yy z',
      p_blocks: THREE,
    })
    expect(res.error).toBeNull()
    const text = must(await admin.from('community_texts').select('content_bete, content_literal').eq('id', id).single(), 'text')
    expect(text.content_bete).toBe('a bb c\n\nd e')
    expect(text.content_literal).toBe('x yy z\n\nw v')
    const lines = must(await admin.from('usage_lines').select('bete').eq('source_type', 'resource').eq('source_id', id), 'usage')
    expect(lines.map(l => l.bete)).toContain('a bb c')
    // the saved verse is not stale after its own correction
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data[0].stale).toBe(false)
  })

  it('lets a correction merge two words into one', async () => {
    const id = await resource(alice.id, 'a en men c', 'x y z')
    const res = await save(alice, id, {
      p_base_bete: 'a en men c', p_bete_line: 'a enmen c', p_blocks: THREE,
    })
    expect(res.error).toBeNull()
  })

  it('stores a marker with no mot à mot counterpart and its shared meaning', async () => {
    const id = await resource(alice.id, 'en ye zigbleh yi', 'je demain venir')
    const res = await save(alice, id, {
      p_base_bete: 'en ye zigbleh yi', p_base_literal: 'je demain venir',
      p_blocks: [
        BLOCK([0], [0]),
        BLOCK([1], [], { is_marker: true, solo: true, marker: { type: ' temps ', meaning: 'futur', french: 'aller + verbe' } }),
        BLOCK([2], [1]),
        BLOCK([3], [2]),
      ],
    })
    expect(res.error).toBeNull()
    const markers = must(await admin.from('resource_word_markers').select('*').eq('resource_id', id), 'markers')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ word_norm: 'ye', word: 'ye', marker_type: 'temps', marker_meaning: 'futur', marker_french: 'aller + verbe' })
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data[0].blocks[1]).toMatchObject({ solo: true, is_marker: true, gloss_idx: [], marker: { meaning: 'futur' } })
  })

  it('shares one meaning per word across verses and removes markers nothing uses any more', async () => {
    const id = await resource(alice.id, 'en ye\nen ye', 'je va\nje va')
    const marker = { type: 'temps', meaning: 'futur', french: '' }
    const verse = (n: number, withMarker: boolean) =>
      save(alice, id, {
        p_verse: n, p_base_bete: 'en ye', p_base_literal: 'je va',
        p_blocks: [BLOCK([0], [0]), withMarker ? BLOCK([1], [1], { is_marker: true, marker }) : BLOCK([1], [1])],
      })
    expect((await verse(1, true)).error).toBeNull()
    expect((await verse(2, true)).error).toBeNull()
    expect(must(await admin.from('resource_word_markers').select('id').eq('resource_id', id), 'm')).toHaveLength(1)
    expect((await verse(1, false)).error).toBeNull()
    expect(must(await admin.from('resource_word_markers').select('id').eq('resource_id', id), 'm')).toHaveLength(1) // verse 2 still uses it
    expect((await verse(2, false)).error).toBeNull()
    expect(must(await admin.from('resource_word_markers').select('id').eq('resource_id', id), 'm')).toHaveLength(0)
  })

  it('counts words like the browser with tabs, non-breaking spaces and Windows line endings', async () => {
    const id = await resource(alice.id, 'x\r\na\u00a0b\tc  d', 'p q r s')
    const res = await save(alice, id, {
      p_verse: 2, p_base_bete: 'a\u00a0b\tc  d', p_base_literal: 'p q r s',
      p_blocks: [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [2]), BLOCK([3], [3])],
    })
    // the literal field has a single line, so verse 2 has no mot à mot
    expect(res.error?.message).toContain('literal_missing')
    const id2 = await resource(alice.id, 'x\r\na\u00a0b\tc  d', 'y\r\np q r s')
    const ok = await save(alice, id2, {
      p_verse: 2, p_base_bete: 'a\u00a0b\tc  d', p_base_literal: 'p q r s',
      p_blocks: [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [2]), BLOCK([3], [3])],
    })
    expect(ok.error).toBeNull()
  })

  it('refuses a verse that does not exist', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    expect((await save(alice, id, { p_verse: 4 })).error?.message).toContain('verse_not_found')
  })

  it('deletes the blocks and markers with the resource', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    await save(alice, id, { p_blocks: [BLOCK([0], [0]), BLOCK([1], [1], { is_marker: true, marker: { type: '', meaning: '', french: '' } }), BLOCK([2], [2])] })
    ok(await admin.from('community_texts').delete().eq('id', id), 'delete resource')
    expect(await rows(id)).toHaveLength(0)
    expect(must(await admin.from('resource_word_markers').select('id').eq('resource_id', id), 'm')).toHaveLength(0)
  })

  it('is not callable by anonymous clients', async () => {
    const res = await anonClient().rpc('save_resource_verse', {
      p_resource: '00000000-0000-0000-0000-000000000000', p_verse: 1, p_base_bete: '', p_base_literal: '',
      p_bete_line: null, p_literal_line: null, p_blocks: [],
    })
    expect(res.error?.code).toBe('42501')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:rls -- resource-word-links`
Expected: the new `describe` fails with `Could not find the function public.save_resource_verse`.

- [ ] **Step 3: Add the function to the migration**

Replace the final comment line `-- (save_resource_verse is added in the next task)` of `supabase/migrations/20261007000000_resource_word_links.sql` with:

```sql
-- ── 4. writing ───────────────────────────────────────────────────────────────────────────────────
-- Atomic: the text correction (if any), the verse's blocks and the marker meanings succeed or fail
-- together. Only the contributor of the resource may call it. Errors are codes the UI translates.
create or replace function save_resource_verse(
  p_resource uuid,
  p_verse int,
  p_base_bete text,      -- the verse's Bété line the editor was built on
  p_base_literal text,   -- ... and its mot à mot line
  p_bete_line text,      -- corrected Bété line, or null when unchanged
  p_literal_line text,   -- corrected mot à mot line, or null when unchanged
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

  -- The editor was built on these lines: if the text moved since, indices could point at other words.
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

  -- Apply the corrected lines (blank lines are kept).
  if p_bete_line is not null then
    v_bete := replace_nth_line(v_bete, p_verse, p_bete_line);
  end if;
  if p_literal_line is not null then
    v_lit := replace_nth_line(v_lit, p_verse, p_literal_line);
  end if;
  v_bl := verse_line(v_bete, p_verse);
  v_ll := verse_line(v_lit, p_verse);
  v_nb := word_count(v_bl);
  v_ng := word_count(v_ll);
  v_seen_b := array_fill(false, array[v_nb]);
  v_seen_g := array_fill(false, array[v_ng]);

  -- Validate the blocks against the resulting lines.
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
  end loop;
  if false = any(v_seen_b) then
    raise exception 'bete_word_uncovered';
  end if;
  if false = any(v_seen_g) then
    raise exception 'gloss_word_uncovered';
  end if;

  -- Text first (the usage_sync trigger rebuilds the usage index), then the blocks.
  update community_texts
     set content_bete = v_bete, content_literal = v_lit
   where id = p_resource
     and (content_bete is distinct from v_bete or content_literal is distinct from v_lit);

  v_hash := verse_hash(v_bete, v_lit, p_verse);

  delete from resource_word_blocks where resource_id = p_resource and verse_no = p_verse;

  insert into resource_word_blocks
    (resource_id, verse_no, position, bete_idx, gloss_idx, is_marker, solo, note, composition, verse_hash)
  select p_resource, p_verse, row_number() over (order by x.bi[1]), x.bi, x.gi,
         coalesce((x.e ->> 'is_marker')::boolean, false),
         coalesce((x.e ->> 'solo')::boolean, false),
         nullif(btrim(x.e ->> 'note'), ''),
         nullif(btrim(x.e ->> 'composition'), ''),
         v_hash
  from (
    select e,
           array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[]  as bi,
           array(select jsonb_array_elements_text(e -> 'gloss_idx'))::int[] as gi
    from jsonb_array_elements(p_blocks) e
  ) x;
  get diagnostics v_saved = row_count;

  -- Marker meanings: keyed by the block's own words (never by the client), last block wins.
  insert into resource_word_markers (resource_id, word_norm, word, marker_type, marker_meaning, marker_french)
  select distinct on (y.wn) p_resource, y.wn, y.w, y.mt, y.mm, y.mf
  from (
    select block_word_norm(v_bl, z.bi) as wn,
           block_words(v_bl, z.bi)     as w,
           nullif(btrim(z.e -> 'marker' ->> 'type'), '')    as mt,
           nullif(btrim(z.e -> 'marker' ->> 'meaning'), '') as mm,
           nullif(btrim(z.e -> 'marker' ->> 'french'), '')  as mf,
           z.bi[1] as first_idx
    from (
      select e, array(select jsonb_array_elements_text(e -> 'bete_idx'))::int[] as bi
      from jsonb_array_elements(p_blocks) e
    ) z
    where coalesce((z.e ->> 'is_marker')::boolean, false)
  ) y
  order by y.wn, y.first_idx desc
  on conflict (resource_id, word_norm) do update
    set word = excluded.word,
        marker_type = excluded.marker_type,
        marker_meaning = excluded.marker_meaning,
        marker_french = excluded.marker_french,
        updated_at = now();

  -- Remove the markers no marker block of the resource uses any more.
  delete from resource_word_markers m
  where m.resource_id = p_resource
    and not exists (
      select 1 from resource_word_blocks b
      where b.resource_id = p_resource
        and b.is_marker
        and block_word_norm(verse_line(v_bete, b.verse_no), b.bete_idx) = m.word_norm
    );

  return jsonb_build_object('saved', v_saved, 'verse_hash', v_hash);
end;
$$;

revoke execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) from public, anon;
grant execute on function save_resource_verse(uuid, int, text, text, text, text, jsonb) to authenticated;
```

- [ ] **Step 4: Apply and run the tests**

Run (repo root): `supabase migration up`. If the migration was already applied while editing, re-apply the new function with `supabase db reset` (local data only) or run the file again with `psql`/the SQL editor (every statement is re-runnable).
Run (from `web/`): `npm run test:rls -- resource-word-links`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add supabase/migrations/20261007000000_resource_word_links.sql web/__tests__/rls/resource-word-links.test.ts
git commit -m "feat(word-links): save_resource_verse with validation and marker sharing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: Data layer (`word-blocks-data.ts`)

**Files:**
- Create: `web/lib/word-blocks-data.ts`
- Test: `web/__tests__/word-blocks-data.test.ts`

**Interfaces:**
- Consumes: Task 1 types `BlockInput`, `MarkerInfo`, `VerseWords`, `WordBlock`; RPCs from Tasks 2 and 3.
- Produces: `Result<T>`, `parseVerse(raw)`, `getResourceWords(client, resourceId): Promise<VerseWords[]>`, `SAVE_ERROR_MESSAGES`, `saveErrorMessage(message: string): string`, `SaveVerseArgs`, `saveVerse(client, args): Promise<Result<{ saved: number; verse_hash: string }>>`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/word-blocks-data.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getResourceWords, parseVerse, saveErrorMessage, saveVerse } from '../lib/word-blocks-data'

const fake = (result: { data?: unknown; error?: { message: string } | null }) =>
  ({ rpc: vi.fn().mockResolvedValue({ data: null, error: null, ...result }) }) as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> }

describe('parseVerse', () => {
  it('reads a verse as returned by get_resource_words', () => {
    const v = parseVerse({
      verse_no: 2, stale: false, bete_line: 'en ye', literal_line: 'je va',
      blocks: [
        { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: 'sujet', composition: null, marker: null },
        { position: 2, bete_idx: [1], gloss_idx: [], is_marker: true, solo: true, note: null, composition: '', marker: { type: 'temps', meaning: 'futur', french: null } },
      ],
    })
    expect(v.verse_no).toBe(2)
    expect(v.blocks[0].note).toBe('sujet')
    expect(v.blocks[1]).toMatchObject({ solo: true, is_marker: true, composition: null, marker: { type: 'temps', meaning: 'futur', french: null } })
  })

  it('survives missing or malformed fields', () => {
    const v = parseVerse({ verse_no: 1, blocks: [{ position: 1, bete_idx: 'x', is_marker: true }] })
    expect(v).toEqual({
      verse_no: 1, stale: false, bete_line: '', literal_line: '',
      blocks: [{ position: 1, bete_idx: [], gloss_idx: [], is_marker: true, solo: false, note: null, composition: null, marker: null }],
    })
  })
})

describe('getResourceWords', () => {
  it('returns the parsed verses', async () => {
    const client = fake({ data: [{ verse_no: 1, stale: true, bete_line: 'a', literal_line: 'x', blocks: [] }] })
    const verses = await getResourceWords(client, 'r1')
    expect(client.rpc).toHaveBeenCalledWith('get_resource_words', { p_resource: 'r1' })
    expect(verses).toEqual([{ verse_no: 1, stale: true, bete_line: 'a', literal_line: 'x', blocks: [] }])
  })

  it('returns nothing when the call fails or the data is not a list', async () => {
    expect(await getResourceWords(fake({ error: { message: 'boom' } }), 'r1')).toEqual([])
    expect(await getResourceWords(fake({ data: null }), 'r1')).toEqual([])
  })
})

describe('saveVerse', () => {
  const args = {
    resourceId: 'r1', verseNo: 3, baseBete: 'a b', baseLiteral: 'x y', beteLine: null, literalLine: 'x yy',
    blocks: [{ bete_idx: [0, 1], gloss_idx: [0, 1], is_marker: false, solo: false, note: null, composition: null }],
  }

  it('sends the lines the editor was built on and the blocks', async () => {
    const client = fake({ data: { saved: 1, verse_hash: 'h' } })
    const res = await saveVerse(client, args)
    expect(client.rpc).toHaveBeenCalledWith('save_resource_verse', {
      p_resource: 'r1', p_verse: 3, p_base_bete: 'a b', p_base_literal: 'x y',
      p_bete_line: null, p_literal_line: 'x yy', p_blocks: args.blocks,
    })
    expect(res).toEqual({ data: { saved: 1, verse_hash: 'h' }, error: null })
  })

  it('turns database error codes into French messages', async () => {
    const res = await saveVerse(fake({ error: { message: 'text_changed' } }), args)
    expect(res.data).toBeNull()
    expect(res.error).toMatch(/texte de ce vers a changé/)
  })
})

describe('saveErrorMessage', () => {
  it('finds the code inside a longer message', () => {
    expect(saveErrorMessage('ERROR: not_owner (SQLSTATE 42501)')).toMatch(/contributeur/)
    expect(saveErrorMessage('bete_word_uncovered')).toMatch(/aucun bloc/)
  })

  it('falls back to a generic message for anything else', () => {
    expect(saveErrorMessage('something odd')).toBe("Erreur lors de l'enregistrement. Veuillez réessayer.")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/word-blocks-data.test.ts`
Expected: FAIL, cannot resolve `../lib/word-blocks-data`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/word-blocks-data.ts`:

```ts
// lib/word-blocks-data.ts — Supabase calls for the word-by-word layer (reader and editor).
// No 'server-only' import: the reader page calls getResourceWords on the server, the editor
// calls saveVerse in the browser.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlockInput, MarkerInfo, VerseWords, WordBlock } from './word-blocks'

export type Result<T> = { data: T; error: null } | { data: null; error: string }

const ints = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function parseMarker(v: unknown): MarkerInfo | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  return { type: text(m.type), meaning: text(m.meaning), french: text(m.french) }
}

function parseBlock(raw: Record<string, unknown>): WordBlock {
  return {
    position: Number(raw.position),
    bete_idx: ints(raw.bete_idx),
    gloss_idx: ints(raw.gloss_idx),
    is_marker: raw.is_marker === true,
    solo: raw.solo === true,
    note: text(raw.note),
    composition: text(raw.composition),
    marker: raw.is_marker === true ? parseMarker(raw.marker) : null,
  }
}

export function parseVerse(raw: Record<string, unknown>): VerseWords {
  const blocks = Array.isArray(raw.blocks) ? (raw.blocks as Record<string, unknown>[]) : []
  return {
    verse_no: Number(raw.verse_no),
    stale: raw.stale === true,
    bete_line: typeof raw.bete_line === 'string' ? raw.bete_line : '',
    literal_line: typeof raw.literal_line === 'string' ? raw.literal_line : '',
    blocks: blocks.map(parseBlock),
  }
}

/** The verses of a resource that have word blocks (stale verses come back without blocks). */
export async function getResourceWords(client: SupabaseClient, resourceId: string): Promise<VerseWords[]> {
  const { data, error } = await client.rpc('get_resource_words', { p_resource: resourceId })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map(parseVerse)
}

export const SAVE_ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'Connectez-vous pour enregistrer.',
  not_owner: 'Seul le contributeur de cette ressource peut relier ses mots.',
  resource_not_found: "Cette ressource n'existe plus.",
  text_changed: "Le texte de ce vers a changé depuis l'ouverture de la page. Rechargez la page, puis reprenez.",
  verse_not_found: "Ce vers n'existe pas dans le texte.",
  literal_missing: "Ce vers n'a pas de mot à mot.",
  bad_verse: 'Numéro de vers invalide.',
  bad_blocks: 'Les blocs envoyés sont invalides.',
  empty_block: 'Un bloc ne contient aucun mot.',
  bete_index_out_of_range: 'Un bloc désigne un mot bhété qui n’existe pas.',
  bete_index_not_increasing: 'Les mots bhété d’un bloc sont dans le désordre.',
  bete_word_in_two_blocks: 'Un mot bhété est dans deux blocs.',
  bete_word_uncovered: 'Un mot bhété n’est dans aucun bloc.',
  gloss_index_out_of_range: 'Un bloc désigne un mot du mot à mot qui n’existe pas.',
  gloss_index_not_increasing: 'Les mots du mot à mot d’un bloc sont dans le désordre.',
  gloss_word_in_two_blocks: 'Un mot du mot à mot est dans deux blocs.',
  gloss_word_uncovered: 'Un mot du mot à mot n’est dans aucun bloc.',
  solo_has_gloss: 'Un marqueur « sans mot correspondant » ne peut pas avoir de mot à mot.',
  solo_not_marker: 'Seul un marqueur grammatical peut être sans mot correspondant.',
  block_without_gloss: 'Un bloc n’a aucun mot du mot à mot.',
}

const GENERIC_SAVE_ERROR = "Erreur lors de l'enregistrement. Veuillez réessayer."

/** The database raises plain codes; find one inside whatever text the client library returns. */
export function saveErrorMessage(message: string): string {
  const code = Object.keys(SAVE_ERROR_MESSAGES).find(c => message.includes(c))
  return code ? SAVE_ERROR_MESSAGES[code] : GENERIC_SAVE_ERROR
}

export interface SaveVerseArgs {
  resourceId: string
  verseNo: number
  /** The verse lines the editor was built on; the database refuses the save if the text moved. */
  baseBete: string
  baseLiteral: string
  /** Corrected lines, or null when unchanged. */
  beteLine: string | null
  literalLine: string | null
  blocks: BlockInput[]
}

export async function saveVerse(
  client: SupabaseClient,
  a: SaveVerseArgs,
): Promise<Result<{ saved: number; verse_hash: string }>> {
  const { data, error } = await client.rpc('save_resource_verse', {
    p_resource: a.resourceId,
    p_verse: a.verseNo,
    p_base_bete: a.baseBete,
    p_base_literal: a.baseLiteral,
    p_bete_line: a.beteLine,
    p_literal_line: a.literalLine,
    p_blocks: a.blocks,
  })
  if (error) return { data: null, error: saveErrorMessage(error.message) }
  const d = data as { saved: number; verse_hash: string }
  return { data: { saved: d.saved, verse_hash: d.verse_hash }, error: null }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/word-blocks-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add web/lib/word-blocks-data.ts web/__tests__/word-blocks-data.test.ts
git commit -m "feat(word-links): data layer and French error messages

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Reader component (`VerseWords`)

**Files:**
- Create: `web/components/VerseWords.tsx`
- Test: `web/__tests__/verse-words.test.tsx`

**Interfaces:**
- Consumes: `readerTokens`, `ReaderToken`, `VerseWords` (type) from Task 1.
- Produces: `WordMode = 'A' | 'B'`; `VerseWords({ verse, mode, initialOpen? })` (client component; `initialOpen` is the token index shown open at first render, used by tests and never by the pages).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/verse-words.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseWords } from '../components/VerseWords'
import type { VerseWords as VerseData, WordBlock } from '../lib/word-blocks'

const block = (position: number, bete: number[], gloss: number[], over: Partial<WordBlock> = {}): WordBlock => ({
  position, bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, marker: null, ...over,
})

// Sê a'a tatini a yii  /  Comme nous laissons nos : "tatini" and "yii" are one word, apart.
const VERSE: VerseData = {
  verse_no: 4, stale: false,
  bete_line: "Sê a'a tatini a yii",
  literal_line: 'Comme nous laissons nos',
  blocks: [block(1, [0], [0]), block(2, [1], [1], { note: 'sujet' }), block(3, [2, 4], [2]), block(4, [3], [3])],
}

// renderToStaticMarkup escapes apostrophes: compare the words as the reader sees them
const decode = (s: string) => s.replace(/&#x27;/g, "'")
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => decode(m[1]))

describe('VerseWords', () => {
  it('shows the words in the original sentence order, in both modes', () => {
    expect(buttons(renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" />))).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
    const a = renderToStaticMarkup(<VerseWords verse={VERSE} mode="A" />)
    const words = [...a.matchAll(/<span class="[^"]*font-semibold[^"]*">([^<]*)<\/span>/g)].map(m => decode(m[1]))
    expect(words).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
  })

  it('mode A shows the exact gloss under each word and points linked words at each other', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="A" />)
    expect(html).toContain('laissons')
    expect(html).toContain('Comme')
    expect(html).toContain('↔ tatini') // under yii
    expect(html).toContain('↔ yii') // under tatini
  })

  it('opens the detail of a word with its partner when the block has separated words', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" initialOpen={4} />)
    expect(html).toContain('tatini … yii')
    expect(html).toContain('Lié à')
    expect(html).toContain('laissons')
    expect(html.match(/data-tied="true"/g)).toHaveLength(2) // tatini and yii are highlighted together
  })

  it('shows a note on the opened word', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" initialOpen={1} />)
    expect(html).toContain('sujet')
    expect(html).not.toContain('Lié à')
  })

  it('says "sens à préciser" for a marker whose meaning was never filled in', () => {
    const verse: VerseData = {
      verse_no: 1, stale: false, bete_line: 'en wo yi do', literal_line: 'je suis venir -ant',
      blocks: [block(1, [0], [0]), block(2, [1], [1], { is_marker: true, marker: null }), block(3, [2], [2]), block(4, [3], [3])],
    }
    const html = renderToStaticMarkup(<VerseWords verse={verse} mode="B" initialOpen={1} />)
    expect(html).toContain('Marqueur grammatical')
    expect(html).toContain('sens à préciser')
  })

  it('shows the shared meaning of a marker and how French renders it', () => {
    const verse: VerseData = {
      verse_no: 2, stale: false, bete_line: 'en ye zigbleh yi', literal_line: 'je demain venir',
      blocks: [
        block(1, [0], [0]),
        block(2, [1], [], { is_marker: true, solo: true, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe : je vais venir' } }),
        block(3, [2], [1]),
        block(4, [3], [2]),
      ],
    }
    const html = renderToStaticMarkup(<VerseWords verse={verse} mode="B" initialOpen={1} />)
    expect(html).toContain('temps : futur')
    expect(html).toContain('aller + verbe : je vais venir')
    expect(html).toContain('⟨futur⟩') // no mot à mot word: the meaning stands in for the gloss
  })

  it('renders nothing but the words for a verse without blocks', () => {
    const html = renderToStaticMarkup(<VerseWords verse={{ ...VERSE, blocks: [] }} mode="B" />)
    expect(buttons(html)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/verse-words.test.tsx`
Expected: FAIL, cannot resolve `../components/VerseWords`.

- [ ] **Step 3: Write the component**

Create `web/components/VerseWords.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { readerTokens, type ReaderToken, type VerseWords as VerseData } from '@/lib/word-blocks'

/** B: running text, tap a word for a bubble. A: word boxes with the exact gloss under each word. */
export type WordMode = 'A' | 'B'

interface Props {
  verse: VerseData
  mode: WordMode
  /** Index of the token shown open on first render (tests only; pages never pass it). */
  initialOpen?: number | null
}

function glossOf(tk: ReaderToken): string {
  if (tk.gloss) return tk.gloss
  return tk.isMarker ? `⟨${tk.marker?.meaning || 'à préciser'}⟩` : '+'
}

function WordDetail({ tk, tokens, onJump }: { tk: ReaderToken; tokens: ReaderToken[]; onJump: (i: number) => void }) {
  const partners = tokens.map((x, i) => ({ x, i })).filter(({ x }) => x.bid === tk.bid && x !== tk)
  const mk = tk.marker
  return (
    <div role="dialog" aria-label={tk.whole} className="space-y-1.5 rounded-lg border border-l-4 border-primary/40 border-l-primary bg-card p-3 text-sm font-normal not-italic text-foreground shadow-md">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{tk.whole}</span>
        <span className="text-muted-foreground">→</span>
        <strong>{tk.gloss ?? (tk.isMarker ? `⟨${mk?.meaning || 'à préciser'}⟩` : 'sens à préciser')}</strong>
      </div>
      {partners.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5">
          Lié à :
          {partners.map(({ x, i }) => (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className="rounded-md border border-primary/50 bg-primary/10 px-2 py-0.5 font-semibold"
            >
              {x.t}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">(un seul mot, séparé dans la phrase)</span>
        </p>
      )}
      {tk.composition && <p className="text-xs text-muted-foreground">Composition : {tk.composition}</p>}
      {tk.note && <p>{tk.note}</p>}
      {tk.isMarker && (
        <div className="space-y-1 border-t border-border pt-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Marqueur grammatical</span>
          {mk?.meaning ? (
            <p className="font-medium">
              {mk.type ? `${mk.type} : ` : ''}
              {mk.meaning}
            </p>
          ) : (
            <p className="text-muted-foreground">Marqueur grammatical, sens à préciser.</p>
          )}
          {mk?.french && <p>En français : {mk.french}</p>}
        </div>
      )}
    </div>
  )
}

export function VerseWords({ verse, mode, initialOpen = null }: Props) {
  const tokens = readerTokens(verse)
  const [open, setOpen] = useState<number | null>(initialOpen)
  const toggle = (i: number) => setOpen(open === i ? null : i)
  const tied = (tk: ReaderToken) => open != null && tokens[open] != null && tk.runs.length > 1 && tokens[open].bid === tk.bid

  if (tokens.length === 0) return null

  if (mode === 'A') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {tokens.map((tk, i) => (
            <button
              key={i}
              type="button"
              aria-expanded={open === i}
              data-tied={tied(tk) ? 'true' : undefined}
              onClick={() => toggle(i)}
              className={cn(
                'inline-flex min-w-[3.5rem] flex-col items-center rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-center',
                open === i && 'border-primary bg-primary/10',
                tied(tk) && 'border-primary bg-primary/10',
                tk.isMarker && 'border-dashed',
              )}
            >
              <span className="text-sm font-semibold text-foreground">{tk.t}</span>
              <span className="text-xs italic text-primary">{tk.k > 0 ? `↔ ${tk.runs[0]}` : glossOf(tk)}</span>
              {tk.k === 0 && tk.runs.length > 1 && (
                <span className="text-[10px] text-muted-foreground">↔ {tk.runs.slice(1).join(', ')}</span>
              )}
            </button>
          ))}
        </div>
        {open != null && tokens[open] && <WordDetail tk={tokens[open]} tokens={tokens} onJump={setOpen} />}
      </div>
    )
  }

  return (
    <p className="font-semibold leading-loose text-foreground">
      {tokens.map((tk, i) => (
        <span key={i} className="relative">
          <button
            type="button"
            aria-expanded={open === i}
            data-tied={tied(tk) ? 'true' : undefined}
            onClick={() => toggle(i)}
            className={cn(
              'border-b-2 border-dotted border-primary/60 font-semibold',
              open === i && 'bg-primary/10',
              tied(tk) && 'border-solid bg-primary/10',
              !tk.gloss && !tk.isMarker && 'border-amber-500',
            )}
          >
            {tk.t}
          </button>{' '}
          {open === i && (
            <span className={cn('absolute top-full z-10 mt-1 block w-72 max-w-[80vw]', i < tokens.length / 2 ? 'left-0' : 'right-0')}>
              <WordDetail tk={tk} tokens={tokens} onJump={setOpen} />
            </span>
          )}
        </span>
      ))}
    </p>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/verse-words.test.tsx`
Expected: PASS. (If the mode A word-order regex finds nothing, check that the word `<span>` keeps the class `font-semibold` on one line in the markup.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add web/components/VerseWords.tsx web/__tests__/verse-words.test.tsx
git commit -m "feat(word-links): reader component with modes B and A

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wire the reader into the resource page

**Files:**
- Modify: `web/components/VerseTranslation.tsx` (whole file replaced below)
- Modify: `web/app/resources/[id]/page.tsx`
- Modify: `web/components/ResourceOwnerActions.tsx`
- Test: `web/__tests__/verse-translation-words.test.tsx`

**Interfaces:**
- Consumes: `VerseWords`, `WordMode` (Task 5); `getResourceWords` (Task 4); `VerseWords` type (Task 1).
- Produces: `VerseTranslation` gains an optional `words?: VerseWords[]` prop; `ResourceOwnerActions` gains optional `canLink?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/verse-translation-words.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseTranslation } from '../components/VerseTranslation'
import type { VerseWords, WordBlock } from '../lib/word-blocks'

const block = (position: number, bete: number[], gloss: number[]): WordBlock => ({
  position, bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, marker: null,
})

const verse1: VerseWords = {
  verse_no: 1, stale: false, bete_line: 'ba ko', literal_line: 'l1 l2',
  blocks: [block(1, [0], [0]), block(2, [1], [1])],
}

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1])

describe('VerseTranslation with word blocks', () => {
  const props = { original: 'ba ko\nsa ni', literal: 'l1 l2\nl3 l4', french: 'F1\nF2' }

  it('shows tappable words for a verse that has blocks and the plain line for the others', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[verse1]} />)
    expect(buttons(html)).toContain('ba')
    expect(buttons(html)).toContain('ko')
    expect(html).toContain('sa ni') // verse 2 has no blocks: plain text as before
    expect(html).toContain('F1')
    expect(html).toContain('F2')
  })

  it('falls back to the plain text for a stale verse', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[{ ...verse1, stale: true, blocks: [] }]} />)
    expect(buttons(html)).not.toContain('ba')
    expect(html).toContain('ba ko')
  })

  it('renders exactly as before without words', () => {
    const without = renderToStaticMarkup(<VerseTranslation {...props} />)
    const empty = renderToStaticMarkup(<VerseTranslation {...props} words={[]} />)
    expect(empty).toBe(without)
    expect(without).toContain('ba ko')
  })

  it('offers the display toggle only when some verse has blocks', () => {
    expect(renderToStaticMarkup(<VerseTranslation {...props} words={[verse1]} />)).toContain('Mot par mot')
    expect(renderToStaticMarkup(<VerseTranslation {...props} />)).not.toContain('Mot par mot')
  })

  it('does not apply blocks when the reader splits a paragraph into sentences', () => {
    const html = renderToStaticMarkup(
      <VerseTranslation original="Ba ko. Sa ni." literal="L1. L2." french="F1. F2." words={[{ ...verse1, bete_line: 'Ba ko. Sa ni.' }]} />,
    )
    expect(buttons(html)).not.toContain('Ba')
  })

  it('shows the words of a single-line resource instead of the three-tier card', () => {
    const single: VerseWords = {
      verse_no: 1, stale: false, bete_line: 'wa yi sa zo', literal_line: 'ils vont ça faire',
      blocks: [block(1, [0], [0]), block(2, [1], [1]), block(3, [2], [2]), block(4, [3], [3])],
    }
    const html = renderToStaticMarkup(
      <VerseTranslation original="wa yi sa zo" literal="ils vont ça faire" french="ils vont faire comme ça" words={[single]} />,
    )
    expect(buttons(html)).toEqual(expect.arrayContaining(['wa', 'yi', 'sa', 'zo']))
    expect(html).toContain('ils vont faire comme ça')
    expect(html).not.toContain('Texte original')
  })

  it('keeps the three-tier card for a single line without blocks', () => {
    const html = renderToStaticMarkup(<VerseTranslation original="wa yi sa zo" literal="ils vont ça faire" french="ils vont faire comme ça" />)
    expect(html).toContain('Texte original')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/verse-translation-words.test.tsx`
Expected: FAIL (the `words` prop is ignored: the first test finds no `ba` button).

- [ ] **Step 3: Replace `VerseTranslation.tsx`**

Overwrite `web/components/VerseTranslation.tsx` with:

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { alignVerses, type Verse } from '@/lib/verses'
import type { VerseWords as VerseWordsData } from '@/lib/word-blocks'
import { InterlinearGloss } from './InterlinearGloss'
import { VerseWords, type WordMode } from './VerseWords'

interface Props {
  original: string
  literal?: string | null
  french?: string | null
  /** The mot à mot is optional to write and optional to read: hidden unless asked for. */
  defaultShowLiteral?: boolean
  /** Word blocks of the resource (get_resource_words). A verse without usable blocks renders as before. */
  words?: VerseWordsData[]
}

const MODE_KEY = 'word-reader-mode'

/** B (running text) by default; the reader's choice is remembered in this browser only. */
function useWordMode(): [WordMode, (m: WordMode) => void] {
  const [mode, setMode] = useState<WordMode>('B')
  useEffect(() => {
    try {
      const v = localStorage.getItem(MODE_KEY)
      if (v === 'A' || v === 'B') setMode(v)
    } catch {
      // storage unavailable (private window): keep the default
    }
  }, [])
  const choose = (m: WordMode) => {
    setMode(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // ignore
    }
  }
  return [mode, choose]
}

function Lines({ children, className }: { children: string; className?: string }) {
  return <p className={cn('whitespace-pre-wrap', className)}>{children}</p>
}

function ModeToggle({ mode, onChange }: { mode: WordMode; onChange: (m: WordMode) => void }) {
  const pill = (m: WordMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => onChange(m)}
      className={cn(
        'shrink-0 text-xs font-medium rounded-full border px-3 py-1 transition-colors',
        mode === m ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-1.5" role="group" aria-label="Affichage des mots">
      {pill('B', 'Texte')}
      {pill('A', 'Mot par mot')}
    </div>
  )
}

function VerseRow({
  verse,
  showLiteral,
  words,
  mode,
}: {
  verse: Verse
  showLiteral: boolean
  words?: VerseWordsData
  mode: WordMode
}) {
  return (
    <div className="space-y-0.5">
      {words ? (
        <VerseWords verse={words} mode={mode} />
      ) : (
        <Lines className="font-semibold text-foreground leading-relaxed">{verse.original}</Lines>
      )}
      {showLiteral && verse.literal && (
        <Lines className="text-xs md:text-sm italic text-primary/80 leading-relaxed">{`« ${verse.literal} »`}</Lines>
      )}
      {verse.french && (
        <Lines className="text-sm md:text-base text-muted-foreground leading-relaxed">{verse.french}</Lines>
      )}
    </div>
  )
}

/**
 * A long text shown verse by verse: each line of the Bhété text sits right above its own
 * translation, so the reader never has to jump between three separate blocks. Text that
 * is short, or whose fields don't line up, keeps the plain three-tier card.
 *
 * Verses that have word blocks (see lib/word-blocks.ts) show their words tappable; a verse is
 * numbered like the gutter of the entry form (n-th non-empty line), which is what the blocks use.
 */
export function VerseTranslation({ original, literal, french, defaultShowLiteral = false, words }: Props) {
  const alignment = useMemo(() => alignVerses(original, literal, french), [original, literal, french])
  const hasLiteral = Boolean(literal?.trim())
  const [showLiteral, setShowLiteral] = useState(defaultShowLiteral)
  const [mode, setMode] = useWordMode()
  const usable = useMemo(
    () => new Map((words ?? []).filter(w => !w.stale && w.blocks.length > 0).map(w => [w.verse_no, w])),
    [words],
  )

  if (alignment.kind === 'single') {
    const w = usable.get(1)
    if (!w) return <InterlinearGloss original={original} literal={literal} final={french} variant="card" />
    return (
      <section className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Texte et traduction</h2>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <VerseRow
          verse={{ original, literal: literal ?? undefined, french: french ?? undefined }}
          showLiteral={false}
          words={w}
          mode={mode}
        />
      </section>
    )
  }

  if (alignment.kind === 'misaligned') {
    return <InterlinearGloss original={original} literal={literal} final={french} variant="card" />
  }

  const wordsApply = alignment.kind === 'verses' && alignment.unit === 'line' && usable.size > 0

  // Verse numbers, counted over all stanzas like the gutter does.
  let n = 0
  const numbered =
    alignment.kind === 'verses' ? alignment.stanzas.map(stanza => stanza.map(verse => ({ verse, no: ++n }))) : []

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {alignment.kind === 'verses'
            ? alignment.unit === 'sentence'
              ? 'Texte et traduction, phrase par phrase'
              : 'Texte et traduction, vers par vers'
            : alignment.stanzas.length > 1
              ? 'Texte et traduction, couplet par couplet'
              : 'Texte et traduction'}
        </h2>
        <div className="flex items-center gap-2">
          {wordsApply && <ModeToggle mode={mode} onChange={setMode} />}
          {hasLiteral && (
            <button
              type="button"
              onClick={() => setShowLiteral(v => !v)}
              aria-pressed={showLiteral}
              className={cn(
                'shrink-0 text-xs font-medium rounded-full border px-3 py-1 transition-colors',
                showLiteral
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              Mot à mot {showLiteral ? '✓' : ''}
            </button>
          )}
        </div>
      </div>

      {alignment.kind === 'verses' ? (
        <div className="space-y-6">
          {numbered.map((stanza, i) => (
            <div key={i} className="space-y-3 border-l-2 border-primary/20 pl-4">
              {stanza.map(({ verse, no }) => (
                <VerseRow
                  key={no}
                  verse={verse}
                  showLiteral={showLiteral}
                  words={wordsApply ? usable.get(no) : undefined}
                  mode={mode}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {alignment.stanzas.map((stanza, i) => (
            <div key={i} className="space-y-2 border-l-2 border-primary/20 pl-4">
              <VerseRow verse={stanza} showLiteral={showLiteral} mode={mode} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run __tests__/verse-translation-words.test.tsx __tests__/verses.test.ts __tests__/resources.test.ts`
Expected: PASS (the existing tests still pass: with no `words`, the markup is unchanged apart from nothing).

- [ ] **Step 5: Fetch the words on the resource page and add the owner link**

In `web/app/resources/[id]/page.tsx`:

Add the import next to the others:

```tsx
import { getResourceWords } from '@/lib/word-blocks-data'
```

Replace

```tsx
  const [comments, isAdmin] = await Promise.all([
    getResourceComments(supabase, id),
    user ? supabase.rpc('is_admin').then(r => r.data === true) : Promise.resolve(false),
  ])
```

with

```tsx
  const [comments, isAdmin, words] = await Promise.all([
    getResourceComments(supabase, id),
    user ? supabase.rpc('is_admin').then(r => r.data === true) : Promise.resolve(false),
    getResourceWords(supabase, id),
  ])
```

Replace `<ResourceOwnerActions id={id} canEdit={isOwner} canDelete={isOwner || isAdmin} />` with

```tsx
          <ResourceOwnerActions id={id} canEdit={isOwner} canDelete={isOwner || isAdmin} canLink={isOwner && Boolean(text.content_literal?.trim())} />
```

Add, right after the closing `)}` of that `(isOwner || isAdmin) && (...)` block inside `<header>`:

```tsx
        {isOwner && text.content_literal?.trim() && words.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Vous pouvez{' '}
            <Link href={`/resources/${id}/relier`} className="text-primary underline underline-offset-2">
              relier les mots
            </Link>{' '}
            de ce texte pour que chacun puisse les explorer un à un.
          </p>
        )}
```

Replace

```tsx
      <VerseTranslation
        original={text.content_bete}
        literal={text.content_literal}
        french={text.content_french}
      />
```

with

```tsx
      <VerseTranslation
        original={text.content_bete}
        literal={text.content_literal}
        french={text.content_french}
        words={words}
      />
```

In `web/components/ResourceOwnerActions.tsx`: add `Link2` to the lucide import (`import { Link2, Pencil, Trash2 } from 'lucide-react'`), add to `Props`

```tsx
  /** The contributor, once the text has a mot à mot to pair with. */
  canLink?: boolean
```

change the signature to `export function ResourceOwnerActions({ id, canEdit, canDelete, canLink = false }: Props)` and add, before the `canEdit` link:

```tsx
      {canLink && (
        <Link
          href={`/resources/${id}/relier`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 h-8 text-xs font-medium hover:bg-muted transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Relier les mots
        </Link>
      )}
```

- [ ] **Step 6: Typecheck, run the whole unit suite, commit**

Run: `npx tsc --noEmit` then `npm test`
Expected: no type errors; all unit tests PASS.

```bash
git branch --show-current
git add web/components/VerseTranslation.tsx web/components/ResourceOwnerActions.tsx "web/app/resources/[id]/page.tsx" web/__tests__/verse-translation-words.test.tsx
git commit -m "feat(word-links): show word blocks in the resource page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Editor state (`word-link-editor.ts`)

**Files:**
- Create: `web/lib/word-link-editor.ts`
- Test: `web/__tests__/word-link-editor.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers and types.
- Produces: `MarkerDef`, `BlockMeta`, `EMPTY_META`, `EMPTY_MARKER`, `VerseDraft`, `Derived`, `Cell`, `Readiness`; functions `collectMarkers(verses)`, `initDraft(verseNo, bete, literal, saved, markers)`, `derive(draft)`, `unitMeta(draft, unit)`, `attachUnits(draft, side, from, to)`, `splitUnit(draft, side, head)`, `setMeta(draft, key, patch)`, `setKind(draft, key, kind, solo)`, `setMarkerDef(draft, words, patch)`, `editWords(draft, side, unit, newWords)` returning `{ draft } | { error: string }`, `addWords(draft, side, pos, newWords)`, `removeWord(draft, side, at)`, `toSave(draft)`, `markSaved(draft)`, `readiness(bete, literal)`, `readinessMessage(r)`, `buildCells(pairs, bw)`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/word-link-editor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addWords, attachUnits, buildCells, collectMarkers, derive, editWords, initDraft, markSaved, readiness,
  readinessMessage, removeWord, setKind, setMarkerDef, setMeta, splitUnit, toSave, unitMeta,
  type VerseDraft,
} from '../lib/word-link-editor'
import { labelOf, splitWords, type Unit, type VerseWords } from '../lib/word-blocks'

const BETE = [
  'A diba Lago ô wu mä ghèhi-wu nikpa wuo ni ghlimani na ngli',
  "Na'a komanon ni ghle glô sê wa zoua mä ghéhi-wu sê en yibhää gba wa kä sibhä mää dudu wu zumen",
  'Nya anyi ziê a lilê',
  "Sê a'a tatini a bhia a'a nyinyo li gbô yii Yaya tatini sibha a'a nyinyo li a gbô yi",
  'Téa anyi yi-tatini a ni ti nyinyo li men bhlini maa sè anyi Sataa a mentenon ngli diba na yizé en men kämaniè enmen tèemen enmen ghliyè kwadrekwadrenon Amen',
]
const LIT = [
  'Notre Père Dieu qui est là-bas au ciel les gens tous que élève ton nom',
  'Ton commandement que arrive terre comme ils font là-bas au ciel comme tu veux ordonne ils vont aussi ici en bas faire',
  "Donne nous aujourd'hui de nourriture",
  'Comme nous laissons nos amis leur mauvaise chose problème pardon laisse aussi nos mauvaise chose nos problème',
  'Ne nous laisse nous ne pas mauvaise chose dedans tomber mais enlève nous Satan son envoyé bouche père toi seul toi commande toi puissant toi grand éternellement Amen',
]

const draftOf = (i: number): VerseDraft => initDraft(i + 1, BETE[i], LIT[i], undefined, {})
const unitAt = (d: VerseDraft, side: 'b' | 'g', first: number): Unit => {
  const r = derive(d)
  return (side === 'b' ? r.bu : r.gu).find(u => u.idx[0] === first)!
}

describe('initDraft / derive', () => {
  it('verse 1 is balanced from the start thanks to the article grouping', () => {
    const r = derive(draftOf(0))
    expect(r.balanced).toBe(true)
    expect(r.pairs).toHaveLength(13)
  })

  it('verse 3 is balanced and "de" stays a word of its own', () => {
    expect(derive(draftOf(2)).balanced).toBe(true)
  })

  it('verse 4 starts unbalanced (19 against 17) and balances once the two particles are linked', () => {
    let d = draftOf(3)
    expect(derive(d).balanced).toBe(false)
    d = attachUnits(d, 'b', 9, 2)
    d = attachUnits(d, 'b', 18, 11)
    const r = derive(d)
    expect(r.balanced).toBe(true)
    expect(r.pairs[2].b!.idx).toEqual([2, 9])
  })

  it('verse 5 starts unbalanced (29 against 28)', () => {
    expect(derive(draftOf(4)).balanced).toBe(false)
  })
})

describe('attach and split keep the notes of the surviving block', () => {
  it('a note on the target block follows it when another block is attached', () => {
    let d = setMeta(draftOf(3), '2', { note: 'verbe' })
    d = attachUnits(d, 'b', 9, 2)
    expect(d.meta['2-9']?.note).toBe('verbe')
    expect(d.meta['2']).toBeUndefined()
  })

  it('splitting gives the note back to the first word', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = setMeta(d, '2-9', { note: 'verbe' })
    d = splitUnit(d, 'b', 2)
    expect(d.meta['2']?.note).toBe('verbe')
    expect(derive(d).bu).toHaveLength(19)
  })
})

describe('text corrections', () => {
  it('merging "en men" into "enmen" in verse 5 keeps the pairing and balances the verse', () => {
    let d = draftOf(4)
    d = attachUnits(d, 'b', 21, 20)
    expect(derive(d).balanced).toBe(true)
    const res = editWords(d, 'b', unitAt(d, 'b', 20), ['enmen'])
    expect('draft' in res).toBe(true)
    if (!('draft' in res)) return
    d = res.draft
    const bw = splitWords(d.bete)
    expect(bw).toHaveLength(28)
    expect(bw.slice(19, 24)).toEqual(['yizé', 'enmen', 'kämaniè', 'enmen', 'tèemen'])
    expect(derive(d).balanced).toBe(true)
  })

  it('refuses an empty correction and a count change for words that are apart', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    const apart = unitAt(d, 'b', 2)
    expect(editWords(d, 'b', apart, [])).toEqual({ error: expect.stringContaining('au moins un mot') })
    expect(editWords(d, 'b', apart, ['tatini'])).toEqual({ error: expect.stringContaining('côte à côte') })
    expect('draft' in editWords(d, 'b', apart, ['tatinì', 'yií'])).toBe(true)
    d = draftOf(0)
  })

  it('adds and removes a word and shifts the links after it', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = addWords(d, 'b', 0, ['Oh'])
    expect(splitWords(d.bete)).toHaveLength(20)
    expect(d.attB).toEqual({ 10: 3 }) // yii was 9, tatini was 2
    d = removeWord(d, 'b', 0)
    expect(d.attB).toEqual({ 9: 2 })
    expect(splitWords(d.bete)).toHaveLength(19)
  })

  it('removing a linked word drops the link', () => {
    const d = removeWord(attachUnits(draftOf(3), 'b', 9, 2), 'b', 9)
    expect(d.attB).toEqual({})
  })

  it('a correction on the mot à mot side does not touch the Bété links or notes', () => {
    let d = setMeta(attachUnits(draftOf(3), 'b', 9, 2), '2-9', { note: 'x' })
    d = addWords(d, 'g', 0, ['Alors'])
    expect(d.attB).toEqual({ 9: 2 })
    expect(d.meta['2-9']?.note).toBe('x')
    expect(splitWords(d.literal)).toHaveLength(18)
  })
})

describe('markers', () => {
  const mk = () => initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined, {})

  it('a marker with no mot à mot counterpart is set aside and the verse balances', () => {
    let d = mk()
    expect(derive(d).balanced).toBe(false)
    d = setKind(d, '1', 'marker', true)
    expect(d.meta['1']).toEqual({ isMarker: true, solo: true, note: '', composition: '' })
    const r = derive(d)
    expect(r.balanced).toBe(true)
    expect(r.pairs.map(p => [labelOf(r.bw, p.b!.idx), p.g ? labelOf(r.gw, p.g.idx) : null])).toEqual([
      ['en', 'je'], ['ye', null], ['zigbleh', 'demain'], ['yi', 'venir'],
    ])
  })

  it('turning a block back into a word clears the marker flags', () => {
    const d = setKind(setKind(mk(), '1', 'marker', true), '1', 'word', false)
    expect(d.meta['1']).toMatchObject({ isMarker: false, solo: false })
  })

  it('the meaning of a marker is shared by word, whatever the case or accents', () => {
    const d = setMarkerDef(mk(), 'Yé', { meaning: 'futur' })
    expect(d.markers[Object.keys(d.markers)[0]]).toEqual({ type: '', meaning: 'futur', french: '' })
    const again = setMarkerDef(d, 'ye', { french: 'aller + verbe' })
    expect(Object.values(again.markers)).toEqual([{ type: '', meaning: 'futur', french: 'aller + verbe' }])
  })

  it('collects the markers already defined in a resource from the saved verses', () => {
    const saved: VerseWords = {
      verse_no: 1, stale: false, bete_line: 'en ye', literal_line: 'je va',
      blocks: [
        { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null },
        { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: true, solo: false, note: null, composition: null, marker: { type: 'temps', meaning: 'futur', french: null } },
      ],
    }
    expect(collectMarkers([saved])).toEqual({ ye: { type: 'temps', meaning: 'futur', french: '' } })
  })
})

describe('toSave / markSaved', () => {
  it('sends only the lines that were corrected, and the base lines never change until saved', () => {
    const d0 = draftOf(2)
    expect(toSave(d0).beteLine).toBeNull()
    expect(toSave(d0).literalLine).toBeNull()
    const d1 = addWords(d0, 'b', 5, ['x'])
    expect(toSave(d1).beteLine).toBe('Nya anyi ziê a lilê x')
    expect(d1.baseBete).toBe(BETE[2])
    expect(toSave(markSaved(d1)).beteLine).toBeNull()
  })

  it('builds one block per pair, marker blocks carrying their meaning and notes trimmed', () => {
    let d = initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined, {})
    d = setKind(d, '1', 'marker', true)
    d = setMarkerDef(d, 'ye', { type: 'temps', meaning: 'futur', french: 'aller + verbe' })
    d = setMeta(d, '0', { note: '  sujet  ' })
    const blocks = toSave(d).blocks
    expect(blocks).toHaveLength(4)
    expect(blocks[0]).toEqual({ bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: 'sujet', composition: null })
    expect(blocks[1]).toEqual({
      bete_idx: [1], gloss_idx: [], is_marker: true, solo: true, note: null, composition: null,
      marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe' },
    })
  })

  it('round-trips: a saved verse reopens as the same pairs, notes and markers', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = attachUnits(d, 'b', 18, 11)
    d = setMeta(d, '2-9', { note: 'verbe + particule' })
    const blocks = toSave(d).blocks
    const saved: VerseWords = {
      verse_no: 4, stale: false, bete_line: d.bete, literal_line: d.literal,
      blocks: blocks.map((b, i) => ({
        position: i + 1, bete_idx: b.bete_idx, gloss_idx: b.gloss_idx, is_marker: b.is_marker, solo: b.solo,
        note: b.note, composition: b.composition, marker: null,
      })),
    }
    const reopened = initDraft(4, d.bete, d.literal, saved, collectMarkers([saved]))
    const a = derive(d)
    const b = derive(reopened)
    const flat = (r: ReturnType<typeof derive>) => r.pairs.map(p => [p.b!.idx, p.g!.idx])
    expect(flat(b)).toEqual(flat(a))
    expect(reopened.meta['2-9']?.note).toBe('verbe + particule')
  })

  it('ignores saved blocks of a stale verse and starts from the automatic grouping', () => {
    const stale: VerseWords = { verse_no: 1, stale: true, bete_line: 'x', literal_line: 'y', blocks: [] }
    const d = initDraft(1, BETE[0], LIT[0], stale, {})
    expect(derive(d).balanced).toBe(true)
  })
})

describe('readiness', () => {
  it('is ready when both fields have the same number of lines', () => {
    expect(readiness(BETE.join('\n'), LIT.join('\n'))).toEqual({ ok: true, verses: 5 })
  })

  it('explains a missing mot à mot, a missing text and a line count mismatch', () => {
    expect(readiness('a b', null)).toMatchObject({ ok: false, reason: 'no_literal' })
    expect(readiness('', 'x')).toMatchObject({ ok: false, reason: 'no_bete' })
    const mismatch = readiness('a\nb\nc', 'x\ny')
    expect(mismatch).toMatchObject({ ok: false, reason: 'line_count', bete: 3, literal: 2 })
    expect(readinessMessage(mismatch)).toContain('3 lignes')
    expect(readinessMessage(mismatch)).toContain('2 lignes')
  })

  it('counts lines like the gutter: blank lines and Windows line endings do not count', () => {
    expect(readiness('a\r\n\r\nb', 'x\n\ny')).toEqual({ ok: true, verses: 2 })
  })
})

describe('buildCells', () => {
  it('keeps the sentence order and puts the partner of a linked word at its own place', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = attachUnits(d, 'b', 18, 11)
    const r = derive(d)
    const cells = buildCells(r.pairs, r.bw)
    const texts = cells.map(c => c.text)
    expect(texts.join(' ')).toBe(r.bw.join(' '))
    const yii = cells.find(c => c.text === 'yii')!
    expect(yii.run).toBe(1)
    expect(yii.runs).toEqual(['tatini', 'yii'])
    expect(cells.find(c => c.text === 'tatini' && c.run === 0)!.pairIndex).toBe(yii.pairIndex)
    expect(texts.indexOf('yii')).toBeGreaterThan(texts.indexOf('gbô'))
  })

  it('puts a mot à mot unit that has no Bété word at the end', () => {
    const d = initDraft(1, 'a b', 'x y z', undefined, {})
    const r = derive(d)
    const cells = buildCells(r.pairs, r.bw)
    expect(cells[cells.length - 1].pair.b).toBeNull()
  })
})

describe('unitMeta', () => {
  it('returns empty meta for a block that has none', () => {
    const d = draftOf(0)
    expect(unitMeta(d, { head: 0, idx: [0] })).toEqual({ isMarker: false, solo: false, note: '', composition: '' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/word-link-editor.test.ts`
Expected: FAIL, cannot resolve `../lib/word-link-editor`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/word-link-editor.ts`:

```ts
// lib/word-link-editor.ts — state of the word-linking editor for ONE verse, as pure functions.
// The React editor only calls these and renders the result; everything that can go wrong
// (re-keying notes when blocks merge, index remapping after a correction, the save payload) is here.
import {
  attachTo, autoGroup, blockKey, blockWords, buildUnits, contiguous, mapInsert, mapRemove, mapReplace,
  nonEmptyLines, normWord, pairUnits, remapAtt, remapKeys, splitRuns, splitWords,
  type BlockInput, type IndexMap, type Pair, type Side, type Unit, type VerseWords,
} from './word-blocks'

export interface MarkerDef {
  type: string
  meaning: string
  french: string
}

export interface BlockMeta {
  isMarker: boolean
  solo: boolean
  note: string
  composition: string
}

export const EMPTY_META: BlockMeta = { isMarker: false, solo: false, note: '', composition: '' }
export const EMPTY_MARKER: MarkerDef = { type: '', meaning: '', french: '' }

export interface VerseDraft {
  verseNo: number
  /** The lines the draft was built on: sent back so the database can refuse a save on moved text. */
  baseBete: string
  baseLiteral: string
  /** Current lines (corrected ones differ from the base). */
  bete: string
  literal: string
  /** Attachments: member word index -> head word index, per side. */
  attB: Record<number, number>
  attG: Record<number, number>
  /** Per Bété block, keyed by blockKey (word indices joined by "-"). */
  meta: Record<string, BlockMeta>
  /** Marker meanings, keyed by normWord of the block's words: shared by the whole resource. */
  markers: Record<string, MarkerDef>
}

export interface Derived {
  bw: string[]
  gw: string[]
  bu: Unit[]
  gu: Unit[]
  pairs: Pair[]
  balanced: boolean
}

/** Marker meanings already saved in the resource, shared by every verse. */
export function collectMarkers(verses: VerseWords[]): Record<string, MarkerDef> {
  const out: Record<string, MarkerDef> = {}
  for (const v of verses) {
    if (v.stale) continue
    const bw = splitWords(v.bete_line)
    for (const b of v.blocks) {
      if (!b.is_marker || !b.marker) continue
      out[normWord(blockWords(bw, b.bete_idx))] = {
        type: b.marker.type ?? '',
        meaning: b.marker.meaning ?? '',
        french: b.marker.french ?? '',
      }
    }
  }
  return out
}

/** A draft from a verse's lines and, when the verse was saved and is not stale, its blocks. */
export function initDraft(
  verseNo: number,
  bete: string,
  literal: string,
  saved: VerseWords | undefined,
  markers: Record<string, MarkerDef>,
): VerseDraft {
  const base = { verseNo, baseBete: bete, baseLiteral: literal, bete, literal, markers }
  if (!saved || saved.stale || saved.blocks.length === 0) {
    return { ...base, attB: {}, attG: autoGroup(splitWords(literal)), meta: {} }
  }
  const attB: Record<number, number> = {}
  const attG: Record<number, number> = {}
  const meta: Record<string, BlockMeta> = {}
  for (const b of saved.blocks) {
    b.bete_idx.slice(1).forEach(i => (attB[i] = b.bete_idx[0]))
    b.gloss_idx.slice(1).forEach(i => (attG[i] = b.gloss_idx[0]))
    meta[b.bete_idx.join('-')] = {
      isMarker: b.is_marker,
      solo: b.solo,
      note: b.note ?? '',
      composition: b.composition ?? '',
    }
  }
  return { ...base, attB, attG, meta }
}

export const unitMeta = (d: VerseDraft, u: Unit): BlockMeta => d.meta[blockKey(u)] ?? EMPTY_META

export function derive(d: VerseDraft): Derived {
  const bw = splitWords(d.bete)
  const gw = splitWords(d.literal)
  const bu = buildUnits(bw, d.attB)
  const gu = buildUnits(gw, d.attG)
  const solo = new Set(bu.filter(u => d.meta[blockKey(u)]?.solo).map(blockKey))
  const pairs = pairUnits(bu, gu, solo)
  const balanced = bw.length > 0 && gw.length > 0 && bu.length - solo.size === gu.length
  return { bw, gw, bu, gu, pairs, balanced }
}

/** Notes, markers and compositions follow the block that contains their first word. */
function rekeyMeta(before: Unit[], after: Unit[], meta: Record<string, BlockMeta>): Record<string, BlockMeta> {
  const oldKeyOfWord = new Map<number, string>()
  before.forEach(u => u.idx.forEach(i => oldKeyOfWord.set(i, blockKey(u))))
  const out: Record<string, BlockMeta> = {}
  for (const u of after) {
    const old = oldKeyOfWord.get(u.idx[0])
    const m = old != null ? meta[old] : undefined
    if (m) out[blockKey(u)] = m
  }
  return out
}

/** Attach the unit headed by `from` to the unit headed by `to`. */
export function attachUnits(d: VerseDraft, side: Side, from: number, to: number): VerseDraft {
  if (side === 'g') return { ...d, attG: attachTo(d.attG, from, to) }
  const bw = splitWords(d.bete)
  const before = buildUnits(bw, d.attB)
  const attB = attachTo(d.attB, from, to)
  return { ...d, attB, meta: rekeyMeta(before, buildUnits(bw, attB), d.meta) }
}

/** Undo the grouping of the unit headed by `head`. */
export function splitUnit(d: VerseDraft, side: Side, head: number): VerseDraft {
  const without = (att: Record<number, number>) => {
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(att)) if (v !== head) out[Number(k)] = v
    return out
  }
  if (side === 'g') return { ...d, attG: without(d.attG) }
  const bw = splitWords(d.bete)
  const before = buildUnits(bw, d.attB)
  const attB = without(d.attB)
  return { ...d, attB, meta: rekeyMeta(before, buildUnits(bw, attB), d.meta) }
}

export function setMeta(d: VerseDraft, key: string, patch: Partial<BlockMeta>): VerseDraft {
  return { ...d, meta: { ...d.meta, [key]: { ...(d.meta[key] ?? EMPTY_META), ...patch } } }
}

/** Word or grammatical marker. A marker may be flagged `solo` (no mot à mot counterpart). */
export function setKind(d: VerseDraft, key: string, kind: 'word' | 'marker', solo: boolean): VerseDraft {
  return setMeta(d, key, kind === 'marker' ? { isMarker: true, solo } : { isMarker: false, solo: false })
}

/** Edit the meaning of a marker, shared by every block with the same word. `words` is the block's words. */
export function setMarkerDef(d: VerseDraft, words: string, patch: Partial<MarkerDef>): VerseDraft {
  const key = normWord(words)
  return { ...d, markers: { ...d.markers, [key]: { ...(d.markers[key] ?? EMPTY_MARKER), ...patch } } }
}

// ── Text corrections: the links, notes and markers follow the words ─────────────────────────────

function applyTextEdit(d: VerseDraft, side: Side, words: string[], f: IndexMap): VerseDraft {
  if (side === 'b') {
    return { ...d, bete: words.join(' '), attB: remapAtt(d.attB, f), meta: remapKeys(d.meta, f) }
  }
  return { ...d, literal: words.join(' '), attG: remapAtt(d.attG, f) }
}

const wordsOf = (d: VerseDraft, side: Side) => splitWords(side === 'b' ? d.bete : d.literal)

/**
 * Replace the words of a unit. Words side by side can become any number of words (merge or split);
 * words that are apart keep their count.
 */
export function editWords(
  d: VerseDraft,
  side: Side,
  unit: Unit,
  newWords: string[],
): { draft: VerseDraft } | { error: string } {
  if (newWords.length === 0) return { error: 'Écrivez au moins un mot, ou utilisez « Supprimer ».' }
  const words = wordsOf(d, side)
  if (!contiguous(unit.idx)) {
    if (newWords.length !== unit.idx.length) {
      return { error: 'Ces mots ne sont pas côte à côte : gardez le même nombre de mots.' }
    }
    const next = words.slice()
    unit.idx.forEach((ix, k) => (next[ix] = newWords[k]))
    return { draft: applyTextEdit(d, side, next, i => i) }
  }
  const next = words.slice()
  next.splice(unit.idx[0], unit.idx.length, ...newWords)
  return { draft: applyTextEdit(d, side, next, mapReplace(unit.idx, newWords.length)) }
}

export function addWords(d: VerseDraft, side: Side, pos: number, newWords: string[]): VerseDraft {
  const next = wordsOf(d, side).slice()
  next.splice(pos, 0, ...newWords)
  return applyTextEdit(d, side, next, mapInsert(pos, newWords.length))
}

export function removeWord(d: VerseDraft, side: Side, at: number): VerseDraft {
  const next = wordsOf(d, side).filter((_, i) => i !== at)
  return applyTextEdit(d, side, next, mapRemove(at))
}

// ── Saving ──────────────────────────────────────────────────────────────────────────────────────

export interface SavePayload {
  /** Corrected line, or null when it is the one the draft was built on. */
  beteLine: string | null
  literalLine: string | null
  blocks: BlockInput[]
}

export function toSave(d: VerseDraft): SavePayload {
  const { bw, pairs } = derive(d)
  const blocks: BlockInput[] = pairs
    .filter((p): p is Pair & { b: Unit } => p.b != null && (p.g != null || p.solo === true))
    .map(p => {
      const m = d.meta[blockKey(p.b)] ?? EMPTY_META
      const block: BlockInput = {
        bete_idx: p.b.idx,
        gloss_idx: p.g ? p.g.idx : [],
        is_marker: m.isMarker,
        solo: m.solo,
        note: m.note.trim() || null,
        composition: m.composition.trim() || null,
      }
      if (m.isMarker) block.marker = d.markers[normWord(blockWords(bw, p.b.idx))] ?? EMPTY_MARKER
      return block
    })
  return {
    beteLine: d.bete !== d.baseBete ? d.bete : null,
    literalLine: d.literal !== d.baseLiteral ? d.literal : null,
    blocks,
  }
}

/** After a successful save the current lines become the base the next save is checked against. */
export const markSaved = (d: VerseDraft): VerseDraft => ({ ...d, baseBete: d.bete, baseLiteral: d.literal })

// ── Can this resource be linked? ────────────────────────────────────────────────────────────────

export type Readiness =
  | { ok: true; verses: number }
  | { ok: false; reason: 'no_bete' | 'no_literal' | 'line_count'; bete: number; literal: number }

export function readiness(bete: string, literal: string | null): Readiness {
  const b = nonEmptyLines(bete).length
  const l = literal ? nonEmptyLines(literal).length : 0
  if (b === 0) return { ok: false, reason: 'no_bete', bete: b, literal: l }
  if (l === 0) return { ok: false, reason: 'no_literal', bete: b, literal: l }
  if (b !== l) return { ok: false, reason: 'line_count', bete: b, literal: l }
  return { ok: true, verses: b }
}

export function readinessMessage(r: Readiness): string {
  if (r.ok) return ''
  if (r.reason === 'no_bete') return "Cette ressource n'a pas de texte en bhété."
  if (r.reason === 'no_literal') {
    return 'Pour relier les mots, ajoutez d’abord le mot à mot (la traduction exacte, mot par mot) dans « Modifier la ressource ».'
  }
  return `Le texte bhété a ${r.bete} lignes et le mot à mot a ${r.literal} lignes : il faut le même nombre de lignes dans les deux champs (un vers par ligne). Corrigez-le dans « Modifier la ressource ».`
}

// ── The strip of pairs, in sentence order ───────────────────────────────────────────────────────

export interface Cell {
  key: string
  /** Index of the pair in `pairs` (the block number minus one). */
  pairIndex: number
  pair: Pair
  /** 0 for the first place of the block, 1+ for its partner places (words apart). */
  run: number
  /** Text of every place of the block. */
  runs: string[]
  /** Text of this place. */
  text: string
}

/** One cell per word place: a block with separated words gets a cell at each of its places. */
export function buildCells(pairs: Pair[], bw: string[]): Cell[] {
  const cells: (Cell & { start: number })[] = []
  pairs.forEach((pair, pairIndex) => {
    if (!pair.b) {
      cells.push({ key: `g${pairIndex}`, pairIndex, pair, run: 0, runs: [], text: '', start: 1e6 + pairIndex })
      return
    }
    const runs = splitRuns(pair.b.idx)
    const names = runs.map(r => r.map(i => bw[i] ?? '').join(' '))
    runs.forEach((r, run) =>
      cells.push({ key: `${pairIndex}.${run}`, pairIndex, pair, run, runs: names, text: names[run], start: r[0] }),
    )
  })
  return cells.sort((a, b) => a.start - b.start)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/word-link-editor.test.ts`
Expected: PASS. Two expectations worth checking if one fails: the `setMarkerDef(mk(), 'Yé', …)` key must equal `normWord('ye')` (both fold to `ye`), and in "round-trips" the second `attachUnits(d, 'b', 18, 11)` runs on the already-keyed meta.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add web/lib/word-link-editor.ts web/__tests__/word-link-editor.test.ts
git commit -m "feat(word-links): editor state as pure functions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Editor screens and page

**Files:**
- Create: `web/components/word-link/PairStrip.tsx`
- Create: `web/components/word-link/BlockPanel.tsx`
- Create: `web/components/word-link/WordLinkEditor.tsx`
- Create: `web/app/resources/[id]/relier/page.tsx`
- Test: `web/__tests__/word-link-panels.test.tsx`

**Interfaces:**
- Consumes: Task 7 (`VerseDraft`, `derive`, `buildCells`, mutations, `toSave`, `markSaved`, `readiness`, `readinessMessage`, `initDraft`, `collectMarkers`), Task 4 (`saveVerse`, `getResourceWords`), Task 1 (`nonEmptyLines`, `splitRuns`, `labelOf`, `blockKey`, types).
- Produces: `Focus = { side: Side; head: number }`; `PairStrip`, `BlockPanel`, `WordLinkEditor`, and the route `/resources/[id]/relier`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/word-link-panels.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlockPanel } from '../components/word-link/BlockPanel'
import { PairStrip } from '../components/word-link/PairStrip'
import { attachUnits, derive, initDraft, setKind } from '../lib/word-link-editor'

const noop = () => {}

describe('PairStrip', () => {
  const BETE = "Sê a'a tatini a yii Yaya"
  const LIT = 'Comme nous laissons nos pardon'

  it('shows the Bété words in sentence order with a partner box for a linked word', () => {
    const d = attachUnits(initDraft(4, BETE, LIT, undefined, {}), 'b', 4, 2)
    const r = derive(d)
    const html = renderToStaticMarkup(
      <PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={d.meta} focus={null} onFocus={noop} />,
    )
    const words = [...html.matchAll(/data-word="([^"]*)"/g)].map(m => m[1].replace(/&#x27;/g, "'"))
    expect(words).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii', 'Yaya'])
    expect(html).toContain(' ↔ yii') // under the block: where its partner is
    expect(html).toContain('↔ tatini') // the partner place points back
    expect(html).toContain('laissons')
  })

  it('flags a Bété word without a mot à mot, and a mot à mot without a Bété word', () => {
    const r = derive(initDraft(1, 'a b', 'x y z', undefined, {}))
    const html = renderToStaticMarkup(<PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={{}} focus={null} onFocus={noop} />)
    expect(html).toContain('aucun mot bhété')
    const r2 = derive(initDraft(1, 'a b c', 'x y', undefined, {}))
    expect(renderToStaticMarkup(<PairStrip pairs={r2.pairs} bw={r2.bw} gw={r2.gw} meta={{}} focus={null} onFocus={noop} />)).toContain('sans équivalent')
  })

  it('shows a marker set aside with its meaning', () => {
    let d = initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined, {})
    d = setKind(d, '1', 'marker', true)
    const r = derive(d)
    const html = renderToStaticMarkup(<PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={d.meta} focus={null} onFocus={noop} />)
    expect(html).toContain('marqueur')
    expect(html).not.toContain('sans équivalent')
  })
})

describe('BlockPanel', () => {
  it('shows the empty marker fields and the "sens à préciser" hint for a new marker', () => {
    let d = initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined, {})
    d = setKind(d, '1', 'marker', true)
    const html = renderToStaticMarkup(<BlockPanel draft={d} focus={{ side: 'b', head: 1 }} onChange={noop} onFocus={noop} />)
    expect(html).toContain('Marqueur grammatical')
    expect(html).toContain('sens à préciser')
    expect(html).toContain('Aucun mot du mot à mot ne lui correspond')
    expect(html).not.toContain('<select') // type is free text, not a dropdown
  })

  it('offers to regroup, correct and add words for a selected word', () => {
    const d = initDraft(1, 'a b c', 'x y z', undefined, {})
    const html = renderToStaticMarkup(<BlockPanel draft={d} focus={{ side: 'b', head: 0 }} onChange={noop} onFocus={noop} />)
    expect(html).toContain('Regrouper avec')
    expect(html).toContain('Corriger, ajouter ou supprimer un mot')
    expect(html).toContain('Marqueur grammatical') // the switch between a word and a marker
  })

  it('shows nothing to edit when no block is selected', () => {
    const d = initDraft(1, 'a b c', 'x y z', undefined, {})
    const html = renderToStaticMarkup(<BlockPanel draft={d} focus={null} onChange={noop} onFocus={noop} />)
    expect(html).toContain('Touchez un bloc')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/word-link-panels.test.tsx`
Expected: FAIL, cannot resolve `../components/word-link/PairStrip`.

- [ ] **Step 3: Write `PairStrip.tsx`**

Create `web/components/word-link/PairStrip.tsx`:

```tsx
'use client'
import { cn } from '@/lib/utils'
import { blockKey, labelOf, type Pair, type Side } from '@/lib/word-blocks'
import { buildCells, EMPTY_META, type BlockMeta } from '@/lib/word-link-editor'

export interface Focus {
  side: Side
  head: number
}

interface Props {
  pairs: Pair[]
  bw: string[]
  gw: string[]
  meta: Record<string, BlockMeta>
  focus: Focus | null
  onFocus: (f: Focus) => void
}

/**
 * The pairs of a verse. Bété words stay in sentence order: a block whose words are apart appears
 * at each of its places, the first with the mot à mot, the others as dashed partner boxes.
 */
export function PairStrip({ pairs, bw, gw, meta, focus, onFocus }: Props) {
  const cells = buildCells(pairs, bw)
  const selected = (pair: Pair, side: Side) => {
    if (!focus || focus.side !== side) return false
    const u = side === 'b' ? pair.b : pair.g
    return !!u && u.idx.includes(focus.head)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {cells.map(cell => {
        const { pair, pairIndex: k } = cell
        const m = pair.b ? meta[blockKey(pair.b)] ?? EMPTY_META : EMPTY_META
        const current = selected(pair, 'b') || selected(pair, 'g')

        if (cell.run > 0) {
          return (
            <div
              key={cell.key}
              className={cn(
                'relative inline-flex min-w-[4rem] flex-col overflow-hidden rounded-md border border-dashed border-primary bg-primary/10',
                current && 'ring-2 ring-primary/40',
              )}
            >
              <span className="absolute left-1 top-0.5 text-[10px] tabular-nums text-muted-foreground">{k + 1}</span>
              <button
                type="button"
                data-word={cell.text}
                onClick={() => onFocus({ side: 'b', head: pair.b!.head })}
                className="px-3 pb-1 pt-4 text-center font-semibold"
              >
                {cell.text}
              </button>
              <span className="border-t border-border px-3 py-1 text-center text-xs text-muted-foreground">↔ {cell.runs[0]}</span>
            </div>
          )
        }

        const apart = cell.runs.length > 1
        return (
          <div
            key={cell.key}
            className={cn(
              'relative inline-flex min-w-[4rem] flex-col overflow-hidden rounded-md border bg-muted/40',
              (!pair.b || (!pair.g && !pair.solo)) && 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
              m.isMarker && 'border-violet-400',
              apart && 'border-primary',
              current && 'ring-2 ring-primary/40',
            )}
          >
            <span className="absolute left-1 top-0.5 text-[10px] tabular-nums text-muted-foreground">{k + 1}</span>
            {pair.b ? (
              <button
                type="button"
                data-word={cell.text}
                onClick={() => onFocus({ side: 'b', head: pair.b!.head })}
                className="px-3 pb-1 pt-4 text-center font-semibold"
              >
                {m.isMarker && <span aria-hidden="true" className="mr-1 text-violet-500">◆</span>}
                {cell.text}
                {apart && <span className="text-xs font-normal text-muted-foreground"> ↔ {cell.runs.slice(1).join(', ')}</span>}
              </button>
            ) : (
              <span className="px-3 pb-1 pt-4 text-center text-xs text-amber-700">aucun mot bhété</span>
            )}
            {pair.g ? (
              <button
                type="button"
                onClick={() => onFocus({ side: 'g', head: pair.g!.head })}
                className="border-t border-border px-3 py-1 text-center text-sm italic text-primary"
              >
                {labelOf(gw, pair.g.idx)}
              </button>
            ) : pair.solo ? (
              <span className="border-t border-border px-3 py-1 text-center text-xs text-muted-foreground">marqueur</span>
            ) : (
              <span className="border-t border-border px-3 py-1 text-center text-xs text-amber-700">sans équivalent</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Write `BlockPanel.tsx`**

Create `web/components/word-link/BlockPanel.tsx`:

```tsx
'use client'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { blockKey, blockWords, labelOf, normWord, type Side, type Unit } from '@/lib/word-blocks'
import {
  addWords, attachUnits, derive, editWords, EMPTY_MARKER, removeWord, setKind, setMarkerDef, setMeta, splitUnit,
  type VerseDraft,
} from '@/lib/word-link-editor'
import type { Focus } from './PairStrip'

interface Props {
  draft: VerseDraft
  focus: Focus | null
  onChange: (d: VerseDraft) => void
  onFocus: (f: Focus | null) => void
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

/** Correct, add or delete a word of the selected unit; links and notes follow (see word-link-editor). */
function WordTools({
  side, unit, words, onEdit, onAdd, onRemove,
}: {
  side: Side
  unit: Unit
  words: string[]
  onEdit: (nw: string[]) => string | null
  onAdd: (pos: number, nw: string[]) => void
  onRemove: (at: number) => void
}) {
  const current = unit.idx.map(i => words[i]).join(' ')
  const [value, setValue] = useState(current)
  const [added, setAdded] = useState('')
  const [error, setError] = useState('')
  const split = (s: string) => s.trim().split(/[ \t\u00a0]+/).filter(Boolean)
  const add = (pos: number) => {
    const nw = split(added)
    if (nw.length === 0) return setError('Écrivez le mot à ajouter.')
    setError('')
    onAdd(pos, nw)
  }
  return (
    <details className="rounded-md border border-border p-2.5">
      <summary className="cursor-pointer text-xs font-semibold">
        Corriger, ajouter ou supprimer un mot ({side === 'b' ? 'bhété' : 'mot à mot'})
      </summary>
      <div className="mt-2.5 space-y-2.5">
        <Field label={`Corriger « ${current} » (réunir ou séparer des mots est possible)`}>
          <input className={inputClass} value={value} onChange={e => setValue(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setError(onEdit(split(value)) ?? '')}>Corriger</button>
          <button
            type="button"
            className={btn}
            disabled={unit.idx.length !== 1}
            title={unit.idx.length !== 1 ? 'Séparez d’abord les mots regroupés' : undefined}
            onClick={() => onRemove(unit.idx[0])}
          >
            Supprimer ce mot
          </button>
        </div>
        <Field label="Ajouter un mot manquant">
          <input className={inputClass} value={added} onChange={e => setAdded(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => add(unit.idx[0])}>Avant « {current} »</button>
          <button type="button" className={btn} onClick={() => add(unit.idx[unit.idx.length - 1] + 1)}>Après « {current} »</button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </details>
  )
}

export function BlockPanel({ draft, focus, onChange, onFocus }: Props) {
  const r = derive(draft)
  if (!focus) {
    return <p className="text-sm text-muted-foreground">Touchez un bloc pour le regrouper, le corriger, ajouter une note ou le marquer comme marqueur grammatical.</p>
  }

  const side = focus.side
  const words = side === 'b' ? r.bw : r.gw
  const units = side === 'b' ? r.bu : r.gu
  const unit = units.find(u => u.idx.includes(focus.head))
  if (!unit) return null
  const pair = r.pairs.find(p => (side === 'b' ? p.b : p.g)?.head === unit.head)
  const b = pair?.b ?? null
  const key = b ? blockKey(b) : null
  const meta = key ? draft.meta[key] : undefined
  const bWords = b ? blockWords(r.bw, b.idx) : ''
  // Markers share one meaning per word: the model keys it by normWord of the block's words.
  const markerDef = b && meta?.isMarker ? (draft.markers[normWord(bWords)] ?? EMPTY_MARKER) : null

  const apply = (next: VerseDraft) => onChange(next)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3.5">
      <p className="text-sm font-semibold">
        {side === 'b' ? 'Bhété' : 'Mot à mot'} : « {labelOf(words, unit.idx)} »
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {unit.idx.length > 1 && (
          <button type="button" className={btn} onClick={() => apply(splitUnit(draft, side, unit.head))}>
            Séparer ces {unit.idx.length} mots
          </button>
        )}
        <span className="text-xs text-muted-foreground">Regrouper avec :</span>
        {units.filter(u => u !== unit).map(u => (
          <button
            key={u.head}
            type="button"
            className={cn(btn, side === 'b' && 'font-semibold')}
            onClick={() => {
              apply(attachUnits(draft, side, unit.head, u.head))
              onFocus({ side, head: u.head })
            }}
          >
            {labelOf(words, u.idx)}
          </button>
        ))}
      </div>

      <WordTools
        key={`${side}:${unit.idx.join('-')}:${words.join(' ')}`}
        side={side}
        unit={unit}
        words={words}
        onEdit={nw => {
          const res = editWords(draft, side, unit, nw)
          if ('error' in res) return res.error
          apply(res.draft)
          onFocus(null)
          return null
        }}
        onAdd={(pos, nw) => {
          apply(addWords(draft, side, pos, nw))
          onFocus(null)
        }}
        onRemove={at => {
          apply(removeWord(draft, side, at))
          onFocus(null)
        }}
      />

      {b && key && (
        <div className="space-y-3">
          <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Nature du mot">
            <button
              type="button"
              className={cn('px-3 py-1.5 text-xs', !meta?.isMarker && 'bg-primary text-primary-foreground')}
              onClick={() => apply(setKind(draft, key, 'word', false))}
            >
              Mot
            </button>
            <button
              type="button"
              className={cn('px-3 py-1.5 text-xs', meta?.isMarker && 'bg-primary text-primary-foreground')}
              onClick={() => apply(setKind(draft, key, 'marker', !pair?.g))}
            >
              Marqueur grammatical
            </button>
          </div>

          {markerDef && (
            <div className={cn('space-y-2.5 rounded-md border border-l-4 border-violet-400 p-3', !markerDef.meaning && 'border-dashed')}>
              <p className="text-xs font-semibold">
                Marqueur grammatical{!markerDef.meaning && ', sens à préciser'}
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="Type (champ libre, ex : temps, aspect, mouvement)">
                  <input className={inputClass} value={markerDef.type} onChange={e => apply(setMarkerDef(draft, bWords, { type: e.target.value }))} />
                </Field>
                <Field label="Ce qu'il indique (ex : futur, en cours)">
                  <input className={inputClass} value={markerDef.meaning} onChange={e => apply(setMarkerDef(draft, bWords, { meaning: e.target.value }))} />
                </Field>
              </div>
              <Field label="Comment le français le rend (ex : « aller + verbe » : je vais venir)">
                <input className={inputClass} value={markerDef.french} onChange={e => apply(setMarkerDef(draft, bWords, { french: e.target.value }))} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={meta?.solo ?? false}
                  onChange={e => apply(setMeta(draft, key, { solo: e.target.checked }))}
                />
                Aucun mot du mot à mot ne lui correspond
              </label>
              <p className="text-xs text-muted-foreground">
                Le sens saisi ici s’applique à tous les blocs de cette ressource marqués comme marqueur avec ce mot.
              </p>
            </div>
          )}

          <Field label="Composition du mot (optionnel), ex : ghèhi (en haut) + wu (lieu)">
            <input className={inputClass} value={meta?.composition ?? ''} onChange={e => apply(setMeta(draft, key, { composition: e.target.value }))} />
          </Field>
          <Field label={`Contexte ou explication de « ${bWords} » (optionnel)`}>
            <input className={inputClass} value={meta?.note ?? ''} onChange={e => apply(setMeta(draft, key, { note: e.target.value }))} />
          </Field>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the panel tests**

Run: `npx vitest run __tests__/word-link-panels.test.tsx`
Expected: PASS. (`renderToStaticMarkup` does not run effects; both components render their initial state.)

- [ ] **Step 6: Write the editor and the page**

Create `web/components/word-link/WordLinkEditor.tsx`:

```tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import { saveVerse } from '@/lib/word-blocks-data'
import { type VerseWords } from '@/lib/word-blocks'
import { collectMarkers, derive, initDraft, markSaved, toSave, type VerseDraft } from '@/lib/word-link-editor'
import { BlockPanel } from './BlockPanel'
import { PairStrip, type Focus } from './PairStrip'

interface Props {
  resourceId: string
  /** The non-empty lines of the Bété and mot à mot fields, same count (see readiness). */
  beteLines: string[]
  literalLines: string[]
  saved: VerseWords[]
}

const draftKey = (resourceId: string, verseNo: number) => `word-links:${resourceId}:${verseNo}`

/** A draft kept in this browser until the verse is saved; ignored if the text moved meanwhile. */
function loadStored(resourceId: string, initial: VerseDraft): VerseDraft {
  try {
    const raw = localStorage.getItem(draftKey(resourceId, initial.verseNo))
    if (!raw) return initial
    const d = JSON.parse(raw) as VerseDraft
    return d.baseBete === initial.baseBete && d.baseLiteral === initial.baseLiteral ? { ...initial, ...d } : initial
  } catch {
    return initial
  }
}

export function WordLinkEditor({ resourceId, beteLines, literalLines, saved }: Props) {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const initial = useMemo(() => {
    const markers = collectMarkers(saved)
    return beteLines.map((b, i) =>
      initDraft(i + 1, b, literalLines[i] ?? '', saved.find(v => v.verse_no === i + 1), markers),
    )
  }, [beteLines, literalLines, saved])
  const [drafts, setDrafts] = useState<VerseDraft[]>(initial)
  // What each verse looked like when it was loaded or last saved: a verse is "modified" when it differs.
  const [baseline, setBaseline] = useState<string[]>(() => initial.map(d => JSON.stringify(d)))
  const [cur, setCur] = useState(0)
  const [focus, setFocus] = useState<Focus | null>(null)
  const [status, setStatus] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)

  // Restore the drafts kept in this browser (after hydration, so the first render matches the server).
  useEffect(() => {
    setDrafts(initial.map(d => loadStored(resourceId, d)))
    setBaseline(initial.map(d => JSON.stringify(d)))
    setRestored(true)
  }, [initial, resourceId])

  const dirty = (d: VerseDraft, i: number) => JSON.stringify(d) !== baseline[i]

  // Keep the draft of a verse in this browser while it is not saved.
  useEffect(() => {
    if (!restored) return
    drafts.forEach((d, i) => {
      try {
        if (dirty(d, i)) localStorage.setItem(draftKey(resourceId, d.verseNo), JSON.stringify(d))
        else localStorage.removeItem(draftKey(resourceId, d.verseNo))
      } catch {
        // storage unavailable: the page still works, the draft is just not kept
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, restored])

  useEffect(() => {
    const anyDirty = drafts.some((d, i) => dirty(d, i))
    if (!anyDirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts])

  const derived = drafts.map(derive)
  const draft = drafts[cur]
  const r = derived[cur]
  const update = (d: VerseDraft) => setDrafts(ds => ds.map((x, i) => (i === cur ? d : x)))

  async function save() {
    setBusy(true)
    setStatus(s => ({ ...s, [cur]: '' }))
    const payload = toSave(draft)
    const res = await saveVerse(supabaseRef.current, {
      resourceId,
      verseNo: draft.verseNo,
      baseBete: draft.baseBete,
      baseLiteral: draft.baseLiteral,
      beteLine: payload.beteLine,
      literalLine: payload.literalLine,
      blocks: payload.blocks,
    })
    setBusy(false)
    if (res.error) {
      setStatus(s => ({ ...s, [cur]: res.error }))
      return
    }
    try {
      localStorage.removeItem(draftKey(resourceId, draft.verseNo))
    } catch {
      // ignore
    }
    const savedDraft = markSaved(draft)
    setDrafts(ds => ds.map((x, i) => (i === cur ? savedDraft : x)))
    setBaseline(b => b.map((x, i) => (i === cur ? JSON.stringify(savedDraft) : x)))
    setStatus(s => ({ ...s, [cur]: 'Enregistré ✓' }))
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Vers">
        {drafts.map((d, i) => (
          <button
            key={d.verseNo}
            type="button"
            role="tab"
            aria-selected={cur === i}
            onClick={() => { setCur(i); setFocus(null) }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
              cur === i ? 'border-primary bg-primary/10' : 'border-border',
            )}
          >
            Vers {d.verseNo}
            <span className={cn('rounded-full border px-1.5 text-[11px] tabular-nums', derived[i].balanced ? 'border-primary text-primary' : 'border-amber-500 text-amber-700')}>
              {derived[i].bu.length}/{derived[i].gu.length}
            </span>
            {dirty(d, i) && <span aria-label="modifié" className="text-amber-600">●</span>}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Dans chaque onglet : blocs bhété / blocs du mot à mot. Un point ● signale un vers modifié et pas encore enregistré.</p>

      <div className="space-y-1 border-l-2 border-border pl-3">
        <p className="font-semibold">{draft.bete}</p>
      </div>

      {!r.balanced && (
        <p className="text-sm text-amber-700">
          Il manque des regroupements : chaque mot bhété doit être dans un bloc, et chaque mot du mot à mot aussi
          (ou le mot est un marqueur sans mot correspondant).
        </p>
      )}

      <PairStrip pairs={r.pairs} bw={r.bw} gw={r.gw} meta={draft.meta} focus={focus} onFocus={setFocus} />

      <BlockPanel draft={draft} focus={focus} onChange={update} onFocus={setFocus} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !r.balanced}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? 'Enregistrement…' : 'Enregistrer ce vers'}
        </button>
        {!r.balanced && <span className="text-xs text-muted-foreground">Disponible quand le vers est équilibré.</span>}
        {status[cur] && (
          <span role="status" className={cn('text-sm', status[cur].startsWith('Enregistré') ? 'text-primary' : 'text-destructive')}>
            {status[cur]}
          </span>
        )}
      </div>
    </div>
  )
}
```

Create `web/app/resources/[id]/relier/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { getCommunityText } from '@/lib/community'
import { getResourceWords } from '@/lib/word-blocks-data'
import { nonEmptyLines } from '@/lib/word-blocks'
import { readiness, readinessMessage } from '@/lib/word-link-editor'
import { WordLinkEditor } from '@/components/word-link/WordLinkEditor'

export const metadata: Metadata = {
  title: 'Relier les mots',
  robots: { index: false, follow: false },
}

export default async function LinkWordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth?next=/resources/${id}/relier`)

  const text = await getCommunityText(supabase, id)
  // Only the contributor links the words: anyone else gets the same 404 as a missing resource.
  if (!text || text.created_by !== user.id) notFound()

  const ready = readiness(text.content_bete, text.content_literal)
  const saved = ready.ok ? await getResourceWords(supabase, id) : []

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-10 py-10">
      <Link
        href={`/resources/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Retour à la ressource
      </Link>

      <h1 className="font-heading text-3xl font-bold mb-2">Relier les mots</h1>
      <p className="text-sm text-muted-foreground mb-8">
        {text.title}. Reliez chaque mot bhété à son mot à mot, vers par vers. Un marqueur grammatical peut rester sans sens :
        il pourra être précisé plus tard.
      </p>

      {ready.ok ? (
        <WordLinkEditor
          resourceId={id}
          beteLines={nonEmptyLines(text.content_bete)}
          literalLines={nonEmptyLines(text.content_literal ?? '')}
          saved={saved}
        />
      ) : (
        <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
          <p>{readinessMessage(ready)}</p>
          <Link href={`/resources/${id}/edit`} className="mt-2 inline-block text-primary underline underline-offset-2">
            Modifier la ressource
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Typecheck, lint, test, build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`
Expected: no type errors; lint clean (fix reported warnings in the new files only); all unit tests PASS; the build lists the new route `/resources/[id]/relier`.

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add web/components/word-link "web/app/resources/[id]/relier" web/__tests__/word-link-panels.test.tsx
git commit -m "feat(word-links): editor screens and /resources/[id]/relier

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Whole-feature verification and rollout

**Files:** none created; this task runs everything and records the result.

- [ ] **Step 1: Run every automated check**

From `web/`:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

Expected: all green. Then the database suites, in groups (the local signup limit is 30 per 5 minutes):

```bash
npm run test:rls -- resource-word-links
npm run test:rls -- function-grants
npm run test:rls -- usage-lines
npm run test:rls -- resources-community
```

Expected: PASS. (`usage-lines` and `resources-community` guard the triggers and guard columns that `save_resource_verse` writes through.)

- [ ] **Step 2: Pilot on the local stack**

Start the app (from `web/`, in a short path worktree: `next dev` crashes on deeply nested Windows paths), sign in as the contributor of a test resource that has the five Notre Père verses in all three fields, then check by eye:

1. `/resources/<id>` shows a "Relier les mots" action and the prompt.
2. `/resources/<id>/relier`: verses 1, 3 and 5 balance 13/13, 5/5; verse 4 shows 19/17 until *yii* is regrouped with the first *tatini* and *yi* with the second (then 17/17, and the strip shows `tatini ↔ yii` plus a dashed `yii ↔ tatini` box at *yii*'s own place); verse 5 balances after regrouping *en* and *men* and correcting them to *enmen* (28/28).
3. Flag *ye* as a marker in a second resource with `en ye zigbleh yi` / `je demain venir`, leave its meaning empty, tick "Aucun mot du mot à mot ne lui correspond": the verse balances 3/3 and saves.
4. Save every verse. Reload `/resources/<id>`: words are tappable in the original order, tapping *yii* highlights *tatini* too and shows "Lié à : tatini"; the toggle switches between "Texte" and "Mot par mot" and survives a reload; the marker detail says "sens à préciser".
5. Edit the Bété text in "Modifier la ressource": the changed verse falls back to the plain line, the others keep their words; the editor shows the verse unsaved.
6. Open the editor in two tabs, change the text in one, save in the other: the save is refused with the "texte de ce vers a changé" message.

- [ ] **Step 3: Record the result and stop for approval before touching production**

Write the outcome of Steps 1 and 2 in the pull request description when it is opened. Do not apply the migration to the production project (`agdqbzbjcxrzfhkvempe`) and do not push or open the pull request without the user's explicit go-ahead: both are outward-facing. When approved, the migration is applied by hand in the Supabase SQL editor if the MCP tool declines it (it contains `drop policy if exists` for its own new policies), the pilot resource is linked by its contributor, and `get_resource_words` is checked once on production for the pilot resource id.

- [ ] **Step 4: Commit any fixes found during the pilot**

```bash
git branch --show-current
git add -A
git commit -m "fix(word-links): issues found in the local pilot

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Skip this step if the pilot found nothing to fix.)

