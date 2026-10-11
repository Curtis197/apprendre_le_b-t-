# Alphabet phonétique du bhété — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `/alphabet` reference page, a symbol picker next to every field where Bhété is typed, a phonetic font for Bhété text, and NFC normalisation on save.

**Architecture:** Symbol inventories live in code (`lib/phonetic-alphabet.ts`, one list per dialect, notes and examples empty). Pure helpers (`lib/phonetic.ts`) do the cursor insertion and NFC normalisation; a small client component (`SymbolPicker`) is bound to any `<input>`/`<textarea>` through a ref and writes to it with the native value setter, so every existing controlled form keeps its own `onChange` untouched. A `.phonetic` font class (Noto Sans, `latin-ext`) replaces `font-mono`/Lexend wherever Bhété text is shown.

**Tech Stack:** Next.js 16.2.6 (App Router; read `node_modules/next/dist/docs/` before touching routing/fonts, per `web/AGENTS.md`), React 19.2.4, Tailwind v4, Vitest 4 (`renderToStaticMarkup`, no jsdom, no Testing Library).

**Spec:** `docs/superpowers/specs/2026-10-11-phonetic-alphabet-design.md`

## Global Constraints

- Work in `web/` on the current branch (`master`); do NOT create branches or worktrees. Check `git branch --show-current` before every commit; stage explicit paths only.
- Run tests from `web/`: `npx vitest run <file>`; type-check with `npx tsc --noEmit -p .`; lint with `npx eslint <paths>`.
- UI copy is French. Code and comments in English, matching the surrounding files (short comments explaining *why*).
- iOS Safari 16.1 must keep working: no new CSS that needs Safari ≥ 16.4 (no `color-mix` opacity utilities on new elements, no container queries).
- All glyph strings in `lib/phonetic-alphabet.ts` are NFC (precomposed `ä ë ö ï`). The picker inserts one standard form per character: western hyphen is U+2011 `‑`, eastern/northern hyphen is U+002D `-`, apostrophe is U+0027 `'`, the northern tone mark is U+0022 `"`.
- Hyphens and apostrophes are NEVER rewritten by `toStoredForm` (they differ by dialect); it only applies `normalize('NFC')`.
- Do not change the search folding (`search_norm`, `normWord`) in this plan. It is a separate later step (spec, "Hors périmètre").
- Do not apply any database migration; this plan has none.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Review Focus

1. Insertion past the field's `maxLength` (programmatic value changes ignore `maxLength`): the picker must refuse and say so, not overflow. Pinned in Task 1 (`insertAtSelection` returns `null`) and shown in Task 3.
2. Text typed with a combining diaeresis (`o` + U+0308) or pasted that way: must be stored as the precomposed `ö`. Pinned in Task 1 and Task 6.
3. A symbol not used by the chosen dialect must not be offered (`ɩ ʋ` in northern, `ŋ` outside northern). Pinned in Task 2 and Task 3.
4. Multi-line resource text and line breaks must survive `toStoredForm` unchanged (verse numbering depends on lines). Pinned in Task 1 and Task 6.
5. Inserting with nothing selected, or into an empty field, or into a field that never had focus (`selectionStart` at 0): the glyph must appear once, at the cursor, or at the end if the position is unknown. Pinned in Task 1.

---

### Task 1: Pure helpers — `lib/phonetic.ts`

**Files:**
- Create: `web/lib/phonetic.ts`
- Test: `web/__tests__/phonetic.test.ts`

**Interfaces:**
- Produces: `toStoredForm(text: string): string`; `insertAtSelection(value: string, start: number, end: number, glyph: string, max?: number): { value: string; caret: number } | null`

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/phonetic.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toStoredForm, insertAtSelection } from '@/lib/phonetic'

describe('toStoredForm', () => {
  it('composes a letter and a combining diaeresis into one character', () => {
    expect(toStoredForm('go\u0308')).toBe('g\u00F6')
    expect(toStoredForm('go\u0308').length).toBe(2)
  })

  it('leaves plain text, IPA letters, apostrophes and hyphens untouched', () => {
    const s = "gwälɩɛ 'mö \u2011mä -yɛ \"ne"
    expect(toStoredForm(s)).toBe(s)
  })

  it('keeps line breaks and blank lines (verse numbering relies on them)', () => {
    const s = 'a\u0308 b\n\nc\r\nd'
    expect(toStoredForm(s)).toBe('\u00E4 b\n\nc\r\nd')
  })

  it('is idempotent and handles the empty string', () => {
    const once = toStoredForm('o\u0308e\u0308')
    expect(toStoredForm(once)).toBe(once)
    expect(toStoredForm('')).toBe('')
  })
})

describe('insertAtSelection', () => {
  it('inserts at the cursor and puts the caret after the glyph', () => {
    expect(insertAtSelection('ab', 1, 1, 'ɛ')).toEqual({ value: 'aɛb', caret: 2 })
  })

  it('replaces the selection', () => {
    expect(insertAtSelection('abcd', 1, 3, 'ɔ')).toEqual({ value: 'aɔd', caret: 2 })
  })

  it('works on an empty field and at both ends', () => {
    expect(insertAtSelection('', 0, 0, 'ɩ')).toEqual({ value: 'ɩ', caret: 1 })
    expect(insertAtSelection('ab', 0, 0, 'ʋ')).toEqual({ value: 'ʋab', caret: 1 })
    expect(insertAtSelection('ab', 2, 2, 'ŋ')).toEqual({ value: 'abŋ', caret: 3 })
  })

  it('clamps a position beyond the text to the end', () => {
    expect(insertAtSelection('ab', 99, 99, 'ɛ')).toEqual({ value: 'abɛ', caret: 3 })
  })

  it('composes a typed letter with an inserted combining mark', () => {
    expect(insertAtSelection('go', 2, 2, '\u0308')).toEqual({ value: 'g\u00F6', caret: 2 })
  })

  it('refuses when the result would exceed the maximum length', () => {
    expect(insertAtSelection('abc', 3, 3, 'ɛ', 3)).toBeNull()
    expect(insertAtSelection('abc', 3, 3, 'ɛ', 4)).toEqual({ value: 'abcɛ', caret: 4 })
    expect(insertAtSelection('abc', 0, 3, 'ɛ', 3)).toEqual({ value: 'ɛ', caret: 1 })
  })

  it('treats a max of 0 as "no limit"', () => {
    expect(insertAtSelection('abc', 3, 3, 'ɛ', 0)?.value).toBe('abcɛ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/phonetic.test.ts`
Expected: FAIL — cannot resolve `@/lib/phonetic`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/phonetic.ts`:

```ts
// Pure helpers for Bhété text: the corpus mixes a letter + combining diaeresis (U+0308) with the
// precomposed letter, so everything stored or inserted goes through NFC. Hyphens and apostrophes are
// left alone: they differ by dialect.

/** The form we store: NFC, nothing else changed. */
export function toStoredForm(text: string): string {
  return text.normalize('NFC')
}

/**
 * Inserts `glyph` at the selection of `value`. Returns the new value and where the caret goes, or
 * `null` when `max` (> 0) would be exceeded: a programmatic value change ignores the field's
 * `maxLength`, so the caller must check.
 */
export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  glyph: string,
  max = 0,
): { value: string; caret: number } | null {
  const a = Math.max(0, Math.min(start, value.length))
  const b = Math.max(a, Math.min(end, value.length))
  const before = value.slice(0, a)
  const after = value.slice(b)
  const next = toStoredForm(before + glyph + after)
  if (max > 0 && next.length > max) return null
  return { value: next, caret: toStoredForm(before + glyph).length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/phonetic.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/phonetic.ts web/__tests__/phonetic.test.ts
git commit -m "feat(phonetic): add NFC storage form and cursor insertion helpers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Symbol inventories — `lib/phonetic-alphabet.ts`

**Files:**
- Create: `web/lib/phonetic-alphabet.ts`
- Test: `web/__tests__/phonetic-alphabet.test.ts`

**Interfaces:**
- Consumes: `DialectKey`, `DIALECT_KEYS` from `@/lib/dialect`.
- Produces:
  - `type SymbolGroup = 'voyelles' | 'trema' | 'consonnes' | 'marques'`
  - `interface PhoneticSymbol { id: string; group: SymbolGroup; glyph: string; upper?: string; codePoint?: string; typable?: boolean; frequency: number; upperFrequency?: number; note: string | null; noteNeedsReview?: boolean; examples: { bete: string; french: string }[] }`
  - `ALPHABET: Record<DialectKey, PhoneticSymbol[]>`
  - `SYMBOL_GROUPS: { id: SymbolGroup; title: string; hint: string }[]`
  - `groupedSymbols(dialect: DialectKey): { id: SymbolGroup; title: string; hint: string; symbols: PhoneticSymbol[] }[]` (groups with no symbol are omitted)
  - `trayRows(dialect: DialectKey): { title: string; glyphs: string[] }[]` (rows "Voyelles" = voyelles+trema, "Autres" = consonnes+marques; excludes `typable`; adds `upper` when `upperFrequency > 0`; rows with no glyph omitted)

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/phonetic-alphabet.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DIALECT_KEYS } from '@/lib/dialect'
import { ALPHABET, groupedSymbols, trayRows } from '@/lib/phonetic-alphabet'

const hex = (s: string) => 'U+' + s.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')

describe('ALPHABET inventories', () => {
  it('has a non-empty list for every dialect, with unique ids', () => {
    for (const d of DIALECT_KEYS) {
      expect(ALPHABET[d].length).toBeGreaterThan(0)
      const ids = ALPHABET[d].map(s => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('every glyph is NFC, and letter groups are the only entries without a code point', () => {
    for (const d of DIALECT_KEYS) {
      for (const s of ALPHABET[d]) {
        expect(s.glyph).toBe(s.glyph.normalize('NFC'))
        if (s.upper) expect(s.upper).toBe(s.upper.normalize('NFC'))
        if (s.codePoint) expect(hex(s.glyph)).toBe(s.codePoint)
        else expect(s.typable).toBe(true)
        expect(s.frequency).toBeGreaterThan(0)
        expect(s.examples).toEqual([])
      }
    }
  })

  it('uses exactly the intended characters (not look-alikes)', () => {
    // Written as escapes so a look-alike pasted into the data file cannot pass unnoticed.
    const expected: Record<string, string> = {
      'ɛ': 'U+025B', 'ɔ': 'U+0254', 'ɩ': 'U+0269', 'ʋ': 'U+028B', 'ŋ': 'U+014B',
      'ä': 'U+00E4', 'ë': 'U+00EB', 'ö': 'U+00F6', 'ï': 'U+00EF',
      "'": 'U+0027', '‑': 'U+2011', '-': 'U+002D', '"': 'U+0022',
    }
    const capitals: Record<string, string> = {
      'Ɛ': 'U+0190', 'Ɔ': 'U+0186', 'Ɩ': 'U+0196', 'Ʋ': 'U+01B2', 'Ŋ': 'U+014A',
    }
    const seen = new Set<string>()
    for (const d of DIALECT_KEYS) {
      for (const s of ALPHABET[d]) {
        if (s.typable) continue
        expect(expected[s.glyph], `unexpected glyph ${s.glyph}`).toBe(s.codePoint)
        seen.add(s.glyph)
        if (s.upper) expect(capitals[s.upper], `unexpected capital ${s.upper}`).toBe(hex(s.upper))
      }
    }
    expect(seen.size).toBe(Object.keys(expected).length)
  })

  it('only offers a symbol in a dialect that uses it', () => {
    const has = (d: (typeof DIALECT_KEYS)[number], g: string) => ALPHABET[d].some(s => s.glyph === g)
    expect(has('northern', 'ɩ')).toBe(false)
    expect(has('northern', 'ʋ')).toBe(false)
    expect(has('northern', 'ŋ')).toBe(true)
    expect(has('western', 'ŋ')).toBe(false)
    expect(has('eastern', 'ŋ')).toBe(false)
    expect(has('western', 'ä')).toBe(true)
    expect(has('eastern', 'ä')).toBe(false)
    expect(has('northern', 'ö')).toBe(false)
  })

  it('uses the dialect’s own hyphen and the northern quote mark', () => {
    const glyphs = (d: (typeof DIALECT_KEYS)[number]) => ALPHABET[d].map(s => s.glyph)
    expect(glyphs('western')).toContain('\u2011')
    expect(glyphs('western')).not.toContain('-')
    expect(glyphs('eastern')).toContain('-')
    expect(glyphs('northern')).toContain('-')
    expect(glyphs('northern')).toContain('"')
    expect(glyphs('western')).not.toContain('"')
  })
})

describe('groupedSymbols', () => {
  it('omits empty groups and keeps the declared order', () => {
    const north = groupedSymbols('northern').map(g => g.id)
    expect(north).toEqual(['voyelles', 'consonnes', 'marques'])
    const west = groupedSymbols('western').map(g => g.id)
    expect(west).toEqual(['voyelles', 'trema', 'consonnes', 'marques'])
  })
})

describe('trayRows', () => {
  it('lists insertable glyphs only (no letter groups like bh), capitals included when attested', () => {
    const rows = trayRows('eastern')
    const all = rows.flatMap(r => r.glyphs)
    expect(all).toContain('ɛ')
    expect(all).toContain('Ɛ')
    expect(all).toContain('Ɩ')
    expect(all).not.toContain('bh')
    expect(rows[0].title).toBe('Voyelles')
  })

  it('does not offer a capital that does not occur in the dialect', () => {
    expect(trayRows('western').flatMap(r => r.glyphs)).not.toContain('Ɩ')
  })

  it('has no row without glyphs', () => {
    for (const d of DIALECT_KEYS) for (const r of trayRows(d)) expect(r.glyphs.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/phonetic-alphabet.test.ts`
Expected: FAIL — cannot resolve `@/lib/phonetic-alphabet`.

- [ ] **Step 3: Write the implementation**

Create `web/lib/phonetic-alphabet.ts`. The frequencies are real counts from `corpus/bete.txt` (western), `corpus/eastern/bete.txt`, `corpus/northern/bete.txt` (occurrences of the symbol in the New Testament); notes marked `noteNeedsReview` are indicative and must be validated by a speaker.

```ts
import type { DialectKey } from '@/lib/dialect'

export type SymbolGroup = 'voyelles' | 'trema' | 'consonnes' | 'marques'

export interface PhoneticSymbol {
  id: string
  group: SymbolGroup
  /** The standard form the picker inserts (always NFC). */
  glyph: string
  /** Capital, when it exists in this dialect. */
  upper?: string
  /** 'U+025B'. Absent for letter groups (bh, kp…), which are typed with the keyboard. */
  codePoint?: string
  /** A group of ordinary letters: shown on the page, not offered by the picker. */
  typable?: boolean
  /** Occurrences in this dialect's New Testament (corpus/). */
  frequency: number
  upperFrequency?: number
  /** null: « Note à venir ». */
  note: string | null
  noteNeedsReview?: boolean
  /** Empty until a speaker contributes: « Exemples à venir ». */
  examples: { bete: string; french: string }[]
}

export const SYMBOL_GROUPS: { id: SymbolGroup; title: string; hint: string }[] = [
  { id: 'voyelles', title: 'Voyelles', hint: 'Lettres absentes des claviers français' },
  { id: 'trema', title: 'Voyelles à tréma', hint: 'Une seule lettre, avec son tréma' },
  { id: 'consonnes', title: 'Consonnes', hint: 'Lettres et groupes de lettres' },
  { id: 'marques', title: 'Marques', hint: 'Tons, liaisons et signes propres au texte' },
]

const NOTE_E = 'Proche du « è » de mère.'
const NOTE_O = 'Proche du « o » de note.'
const NOTE_NG = 'Proche du « ng » de parking. Les autres dialectes l’écrivent « ng ».'
const NOTE_APOS = 'Placée devant certains mots.'
const NOTE_NBH = 'Trait d’union insécable qui relie un petit mot au mot voisin.'
const NOTE_HY = 'Trait d’union ordinaire qui relie un petit mot au mot voisin.'

const s = (
  id: string,
  group: SymbolGroup,
  glyph: string,
  frequency: number,
  extra: Partial<PhoneticSymbol> = {},
): PhoneticSymbol => ({
  id, group, glyph, frequency, note: null, examples: [],
  ...(/^[a-z]{2}$/.test(glyph) ? { typable: true } : { codePoint: 'U+' + glyph.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0') }),
  ...extra,
})

export const ALPHABET: Record<DialectKey, PhoneticSymbol[]> = {
  western: [
    s('e-open', 'voyelles', 'ɛ', 50714, { upper: 'Ɛ', upperFrequency: 529, note: NOTE_E, noteNeedsReview: true }),
    s('o-open', 'voyelles', 'ɔ', 36797, { upper: 'Ɔ', upperFrequency: 1403, note: NOTE_O, noteNeedsReview: true }),
    s('i-lax', 'voyelles', 'ɩ', 68529),
    s('u-lax', 'voyelles', 'ʋ', 31665),
    s('a-t', 'trema', 'ä', 35385),
    s('e-t', 'trema', 'ë', 11131),
    s('o-t', 'trema', 'ö', 23993),
    s('i-t', 'trema', 'ï', 3501),
    s('bh', 'consonnes', 'bh', 17795),
    s('ny', 'consonnes', 'ny', 11443),
    s('kp', 'consonnes', 'kp', 6140),
    s('gb', 'consonnes', 'gb', 4342),
    s('gl', 'consonnes', 'gl', 5534),
    s('apos', 'marques', "'", 78623, { note: NOTE_APOS, noteNeedsReview: true }),
    s('nbh', 'marques', '\u2011', 52175, { note: NOTE_NBH, noteNeedsReview: true }),
  ],
  eastern: [
    s('e-open', 'voyelles', 'ɛ', 33450, { upper: 'Ɛ', upperFrequency: 118, note: NOTE_E, noteNeedsReview: true }),
    s('o-open', 'voyelles', 'ɔ', 32152, { upper: 'Ɔ', upperFrequency: 1246, note: NOTE_O, noteNeedsReview: true }),
    s('i-lax', 'voyelles', 'ɩ', 52092, { upper: 'Ɩ', upperFrequency: 715 }),
    s('u-lax', 'voyelles', 'ʋ', 32596, { upper: 'Ʋ', upperFrequency: 70 }),
    s('e-t', 'trema', 'ë', 4375),
    s('o-t', 'trema', 'ö', 17876),
    s('i-t', 'trema', 'ï', 1945),
    s('bh', 'consonnes', 'bh', 21545),
    s('ny', 'consonnes', 'ny', 8285),
    s('kp', 'consonnes', 'kp', 5453),
    s('gb', 'consonnes', 'gb', 5933),
    s('gl', 'consonnes', 'gl', 5078),
    s('apos', 'marques', "'", 62855, { note: NOTE_APOS, noteNeedsReview: true }),
    s('hy', 'marques', '-', 80307, { note: NOTE_HY, noteNeedsReview: true }),
  ],
  northern: [
    s('e-open', 'voyelles', 'ɛ', 68059, { upper: 'Ɛ', upperFrequency: 1603, note: NOTE_E, noteNeedsReview: true }),
    s('o-open', 'voyelles', 'ɔ', 58236, { upper: 'Ɔ', upperFrequency: 1096, note: NOTE_O, noteNeedsReview: true }),
    s('eng', 'consonnes', 'ŋ', 2235, { upper: 'Ŋ', upperFrequency: 195, note: NOTE_NG, noteNeedsReview: true }),
    s('bh', 'consonnes', 'bh', 15569),
    s('ny', 'consonnes', 'ny', 15685),
    s('kp', 'consonnes', 'kp', 4981),
    s('gb', 'consonnes', 'gb', 6304),
    s('gl', 'consonnes', 'gl', 2190),
    s('apos', 'marques', "'", 73404, { note: NOTE_APOS, noteNeedsReview: true }),
    s('hy', 'marques', '-', 70921, { note: NOTE_HY, noteNeedsReview: true }),
    s('dq', 'marques', '"', 37415),
  ],
}

export function groupedSymbols(dialect: DialectKey) {
  return SYMBOL_GROUPS
    .map(g => ({ ...g, symbols: ALPHABET[dialect].filter(sym => sym.group === g.id) }))
    .filter(g => g.symbols.length > 0)
}

/** What the picker offers for a dialect, in two rows. Letter groups (bh, kp…) are typed, so they are left out. */
export function trayRows(dialect: DialectKey): { title: string; glyphs: string[] }[] {
  const glyphsOf = (groups: SymbolGroup[]) =>
    ALPHABET[dialect]
      .filter(sym => !sym.typable && groups.includes(sym.group))
      .flatMap(sym => [sym.glyph, ...(sym.upper && (sym.upperFrequency ?? 0) > 0 ? [sym.upper] : [])])
  return [
    { title: 'Voyelles', glyphs: glyphsOf(['voyelles', 'trema']) },
    { title: 'Autres', glyphs: glyphsOf(['consonnes', 'marques']) },
  ].filter(r => r.glyphs.length > 0)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/phonetic-alphabet.test.ts`
Expected: PASS. If the code-point test fails for `'` or `"`, the helper `s` is computing from `glyph.codePointAt(0)`; those are U+0027 and U+0022 and must match the `codePoint` produced, so the test compares the same value: fix the glyph literal, not the test.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/phonetic-alphabet.ts web/__tests__/phonetic-alphabet.test.ts
git commit -m "feat(phonetic): add per-dialect symbol inventories from the New Testament corpus

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `SymbolPicker` component and `NumberedTextarea` ref

**Files:**
- Create: `web/components/SymbolPicker.tsx`
- Modify: `web/components/NumberedTextarea.tsx` (add `textareaRef` prop)
- Test: `web/__tests__/symbol-picker.test.tsx`

**Interfaces:**
- Consumes: `trayRows(dialect)` from `@/lib/phonetic-alphabet`; `insertAtSelection` from `@/lib/phonetic`; `DialectKey` from `@/lib/dialect`.
- Produces:
  - `SymbolPicker({ target, dialect, className }: { target: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; dialect: DialectKey; className?: string })` — closed by default; a toggle button `Symboles ɛ` and, when open, a tray with the dialect's glyphs and a link to `/alphabet`.
  - `NumberedTextarea` gains the optional prop `textareaRef?: React.Ref<HTMLTextAreaElement>`, attached to the inner `<textarea>`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/symbol-picker.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SymbolPicker } from '@/components/SymbolPicker'
import { NumberedTextarea } from '@/components/NumberedTextarea'

describe('SymbolPicker', () => {
  it('starts closed: a toggle only, no symbols yet', () => {
    const html = renderToStaticMarkup(<SymbolPicker target={{ current: null }} dialect="western" />)
    expect(html).toContain('Symboles')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('ɛ</button>')
    expect(html).not.toContain('/alphabet')
  })
})

describe('NumberedTextarea textareaRef', () => {
  it('still renders with a ref attached to the inner textarea', () => {
    const html = renderToStaticMarkup(
      <NumberedTextarea value={'a\nb'} onChange={() => {}} textareaRef={{ current: null }} />,
    )
    expect(html).toContain('<textarea')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/symbol-picker.test.tsx`
Expected: FAIL — cannot resolve `@/components/SymbolPicker`.

- [ ] **Step 3: Write the implementation**

Edit `web/components/NumberedTextarea.tsx`: in `interface Props` add, after `className?: string`:

```ts
  /** Lets a symbol picker write into the field. */
  textareaRef?: React.Ref<HTMLTextAreaElement>
```

In the destructuring list add `textareaRef,` after `className,`. On the inner `<textarea` element add the attribute `ref={textareaRef}` right after `<textarea` (keep the other attributes). The element then starts:

```tsx
      <textarea
        ref={textareaRef}
        id={id}
        aria-label={ariaLabel}
        wrap="off"
```

Create `web/components/SymbolPicker.tsx`:

```tsx
'use client'
import { useId, useState, type RefObject } from 'react'
import Link from 'next/link'
import type { DialectKey } from '@/lib/dialect'
import { insertAtSelection } from '@/lib/phonetic'
import { trayRows } from '@/lib/phonetic-alphabet'

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * Writes `glyph` at the field's cursor. The value is set through the native setter and an `input`
 * event is dispatched so the form's own React `onChange` runs: callers keep their state untouched.
 * Returns false when the field's maxLength would be exceeded.
 */
function applyInsert(el: Field, glyph: string): boolean {
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const result = insertAtSelection(el.value, start, end, glyph, el.maxLength > 0 ? el.maxLength : 0)
  if (!result) return false
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, result.value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  el.setSelectionRange(result.caret, result.caret)
  return true
}

interface Props {
  /** The input or textarea the symbols are written into. */
  target: RefObject<Field | null>
  dialect: DialectKey
  className?: string
}

export function SymbolPicker({ target, dialect, className }: Props) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  const trayId = useId()
  const rows = trayRows(dialect)

  function insert(glyph: string) {
    const el = target.current
    if (!el) return
    setFull(!applyInsert(el, glyph))
  }

  return (
    <div className={className}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={trayId}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <span className="phonetic text-sm font-semibold text-primary" aria-hidden="true">ɛ</span>
          Symboles
        </button>
      </div>
      {open && (
        <div id={trayId} className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
          {rows.map(row => (
            <div key={row.title} className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{row.title}</p>
              <div className="flex flex-wrap gap-1.5">
                {row.glyphs.map(g => (
                  <button
                    key={g}
                    type="button"
                    // keep the field focused and its selection intact while the symbol is tapped
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => insert(g)}
                    aria-label={`Insérer ${g}`}
                    className="phonetic min-h-10 min-w-10 rounded-md border border-border bg-card px-2 text-lg font-semibold hover:bg-muted"
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {full && <p role="alert" className="text-xs text-destructive">Limite de caractères atteinte pour ce champ.</p>}
          <Link href="/alphabet" className="inline-block text-xs font-medium text-primary hover:underline">
            Tout l’alphabet →
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run __tests__/symbol-picker.test.tsx && npx tsc --noEmit -p . 2>&1 | grep -E "SymbolPicker|NumberedTextarea" ; echo tsc-done`
Expected: tests PASS, no type errors printed for these two files.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/components/SymbolPicker.tsx web/components/NumberedTextarea.tsx web/__tests__/symbol-picker.test.tsx
git commit -m "feat(phonetic): add the symbol picker and let NumberedTextarea expose its field

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The `/alphabet` reference page

**Files:**
- Create: `web/components/AlphabetReference.tsx`
- Create: `web/app/alphabet/page.tsx`
- Modify: `web/app/sitemap.ts` (add the route)
- Modify: `web/components/lexicon/EditMode.tsx` (link to `/alphabet` while editing)
- Test: `web/__tests__/alphabet-reference.test.tsx`

**Interfaces:**
- Consumes: `groupedSymbols`, `PhoneticSymbol` from `@/lib/phonetic-alphabet`; `useDialect` from `@/context/DialectContext`; `DIALECTS`, `DIALECT_KEYS` from `@/lib/dialect`; `PageHeader` from `@/components/PageHeader`.
- Produces: `AlphabetReference()` (client component: dialect tabs + groups of cards, tap-to-copy).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/alphabet-reference.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlphabetReference } from '@/components/AlphabetReference'

describe('AlphabetReference', () => {
  it('renders the default dialect with its groups, counts and empty content slots', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain('Voyelles')
    expect(html).toContain('Voyelles à tréma')
    expect(html).toContain('Marques')
    expect(html).toContain('ɩ')
    expect(html).toContain('Exemples à venir')
    expect(html).toContain('Note à venir')
    expect(html).toContain('à valider')
    expect(html).toContain('50')   // a formatted frequency, e.g. 50 714
  })

  it('offers the three dialects as tabs', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain('Occidental')
    expect(html).toContain('Oriental')
    expect(html).toContain('Septentrional')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/alphabet-reference.test.tsx`
Expected: FAIL — cannot resolve `@/components/AlphabetReference`.

- [ ] **Step 3: Write the implementation**

Create `web/components/AlphabetReference.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useDialect } from '@/context/DialectContext'
import { DIALECTS, DIALECT_KEYS, type DialectKey } from '@/lib/dialect'
import { groupedSymbols, type PhoneticSymbol } from '@/lib/phonetic-alphabet'

const SHORT: Record<DialectKey, string> = { western: 'Occidental', eastern: 'Oriental', northern: 'Septentrional' }
const fmt = (n: number) => n.toLocaleString('fr-FR')

function GlyphButton({ ch, count, onCopy }: { ch: string; count: number; onCopy: (ch: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(ch)}
      aria-label={`Copier ${ch}`}
      title={`Copier ${ch}`}
      className="flex min-w-[84px] flex-1 flex-col items-center gap-0.5 rounded-lg bg-muted/60 px-1.5 pb-2 pt-2.5 transition-colors hover:bg-muted"
    >
      <span className="phonetic text-4xl font-semibold leading-tight text-primary">{ch}</span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{fmt(count)}</span>
    </button>
  )
}

function SymbolCard({ sym, max, onCopy }: { sym: PhoneticSymbol; max: number; onCopy: (ch: string) => void }) {
  const peak = Math.max(sym.frequency, sym.upperFrequency ?? 0)
  return (
    <article className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-wrap gap-2">
        <GlyphButton ch={sym.glyph} count={sym.frequency} onCopy={onCopy} />
        {sym.upper && (sym.upperFrequency ?? 0) > 0 && (
          <GlyphButton ch={sym.upper} count={sym.upperFrequency ?? 0} onCopy={onCopy} />
        )}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-secondary" style={{ width: `${Math.max(3, (peak / max) * 100)}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {sym.codePoint ? <span className="font-mono">{sym.codePoint}</span> : 'groupe de lettres'}
      </p>
      {sym.note ? (
        <p className="text-sm">
          {sym.note}{' '}
          {sym.noteNeedsReview && (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent">à valider</span>
          )}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">Note à venir</p>
      )}
      <div className="mt-auto space-y-1 border-t border-dashed border-border pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Exemples</p>
        {sym.examples.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">Exemples à venir</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {sym.examples.map(ex => (
              <li key={ex.bete}><span className="phonetic font-semibold">{ex.bete}</span> — {ex.french}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

export function AlphabetReference() {
  const { dialect, setDialect } = useDialect()
  const [toast, setToast] = useState('')
  const groups = groupedSymbols(dialect)
  const max = Math.max(...groups.flatMap(g => g.symbols.map(s => Math.max(s.frequency, s.upperFrequency ?? 0))))

  async function copy(ch: string) {
    try {
      await navigator.clipboard.writeText(ch)
      setToast(`« ${ch} » copié`)
    } catch {
      setToast('Copie impossible : sélectionnez le symbole')
    }
    setTimeout(() => setToast(''), 1600)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1.5">
        <div role="tablist" aria-label="Dialecte" className="inline-flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-0.5">
          {DIALECT_KEYS.map(key => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={dialect === key}
              onClick={() => setDialect(key)}
              className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors ${
                dialect === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {SHORT[key]}
            </button>
          ))}
        </div>
        <p className="font-heading text-sm font-semibold text-primary">{DIALECTS[dialect].name}</p>
      </div>

      {groups.map(g => (
        <section key={g.id} aria-labelledby={`g-${g.id}`} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id={`g-${g.id}`} className="font-heading text-lg font-bold">{g.title}</h2>
            <p className="text-sm text-muted-foreground">{g.hint}</p>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))' }}>
            {g.symbols.map(sym => <SymbolCard key={sym.id} sym={sym} max={max} onCopy={copy} />)}
          </div>
        </section>
      ))}

      <p className="max-w-prose text-sm text-muted-foreground">
        Les nombres indiquent combien de fois le symbole apparaît dans le Nouveau Testament de ce dialecte.
        Taper sur un symbole le copie.
      </p>

      <div role="status" className={`fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background transition-opacity ${toast ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {toast}
      </div>
    </div>
  )
}
```

Create `web/app/alphabet/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { PageHeader } from '@/components/PageHeader'
import { AlphabetReference } from '@/components/AlphabetReference'

export const metadata: Metadata = {
  title: 'Alphabet du bhété',
  description: 'Les lettres et signes utilisés pour écrire le bhété (ɛ, ɔ, ɩ, ʋ, ŋ, voyelles à tréma, marques de ton), par dialecte, avec leur fréquence dans le Nouveau Testament.',
  alternates: { canonical: '/alphabet' },
}

export default function AlphabetPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-10">
      <PageHeader
        badge="Alphabet"
        title="Alphabet du bhété"
        subtitle="Les symboles à connaître pour lire et écrire le bhété, dialecte par dialecte."
      />
      <AlphabetReference />
      <section className="mt-12 max-w-prose space-y-2 border-t border-border pt-6">
        <h2 className="font-heading text-lg font-bold">Pour aller plus loin</h2>
        <p className="text-sm text-muted-foreground">
          Plusieurs de ces lettres (ɛ, ɔ, ŋ) viennent de l’alphabet phonétique international ; ɩ et ʋ viennent de
          l’Alphabet africain de référence.
        </p>
        <a
          href="https://www.ipachart.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          Écouter les sons du tableau de l’API (ipachart.com) →
        </a>
      </section>
    </div>
  )
}
```

Edit `web/app/sitemap.ts`: in `STATIC_ROUTES`, after the `/contribute` line, add:

```ts
  { path: '/alphabet',   changeFrequency: 'monthly', priority: 0.5 },
```

Edit `web/components/lexicon/EditMode.tsx`: add `import Link from 'next/link'` under the `lucide-react` import, and replace the `EditToggle` return with:

```tsx
  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={editing}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {editing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
        {editing ? 'Terminer' : 'Modifier ou contribuer'}
      </button>
      {editing && (
        <Link href="/alphabet" className="text-xs text-primary hover:underline">
          Besoin d’un symbole (ɛ, ɔ, ɩ…) ? Voir l’alphabet →
        </Link>
      )}
    </div>
  )
```

- [ ] **Step 4: Run tests and checks**

Run: `cd web && npx vitest run __tests__/alphabet-reference.test.tsx __tests__/lexicon-edit-mode.test.tsx && npx tsc --noEmit -p . 2>&1 | grep -E "alphabet|Alphabet|EditMode|sitemap" ; npx eslint app/alphabet components/AlphabetReference.tsx components/lexicon/EditMode.tsx`
Expected: tests PASS (the existing edit-mode tests still pass: the toggle's initial markup still contains `Modifier ou contribuer` and `aria-pressed="false"`); no type or lint errors for these files.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/components/AlphabetReference.tsx web/app/alphabet/page.tsx web/app/sitemap.ts web/components/lexicon/EditMode.tsx web/__tests__/alphabet-reference.test.tsx
git commit -m "feat(alphabet): add the per-dialect alphabet reference page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Phonetic font and `cleanBeteWord`

**Files:**
- Modify: `web/app/layout.tsx` (load Noto Sans with `latin-ext`, expose `--font-phonetic`)
- Modify: `web/app/globals.css` (`.phonetic` utility)
- Modify: `web/lib/utils.ts` (`cleanBeteWord` keeps the leading apostrophe)
- Modify (apply `.phonetic`): `web/components/LexiconEntry.tsx`, `web/components/WordCard.tsx`, `web/app/lexicon/page.tsx`, `web/components/UsageCard.tsx`, `web/components/InterlinearGloss.tsx`, `web/components/VerseWords.tsx`, `web/components/lexicon/SpellingsList.tsx`, `web/components/ResourceSubmitForm.tsx`
- Test: `web/__tests__/clean-bete-word.test.ts`

**Interfaces:**
- Produces: the CSS class `phonetic` (font-family stack), used by Tasks 3, 4 and 7.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/clean-bete-word.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cleanBeteWord } from '@/lib/utils'

describe('cleanBeteWord', () => {
  it('keeps the leading apostrophe: it is a tone mark', () => {
    expect(cleanBeteWord("'gwɛlenya")).toBe("'gwɛlenya")
  })

  it('still strips a leading hyphen that only links the word to the previous one', () => {
    expect(cleanBeteWord('\u2011mä')).toBe('mä')
    expect(cleanBeteWord('\u2010mä')).toBe('mä')
    expect(cleanBeteWord('\u2012mä')).toBe('mä')
  })

  it('still strips trailing punctuation and surrounding spaces', () => {
    expect(cleanBeteWord(' bhö, ')).toBe('bhö')
    expect(cleanBeteWord('lɛ.')).toBe('lɛ')
    expect(cleanBeteWord('lɛ?!')).toBe('lɛ')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/clean-bete-word.test.ts`
Expected: FAIL on the first test (the apostrophe is currently stripped).

- [ ] **Step 3: Implement**

`web/lib/utils.ts`: read lines 26–31 first (`Read` with `offset: 26, limit: 6`), then replace the first `.replace(...)` line of `cleanBeteWord` — the one beginning `.replace(/^[` — with exactly:

```ts
    .replace(/^[\u2011\u2010\u2012]+/, '')
```

(Only the hyphen variants U+2011, U+2010, U+2012 are stripped; apostrophes of any kind are kept.)

`web/app/layout.tsx`: change the font import and add the font:

```ts
import { Inter, Lexend, Noto_Sans } from 'next/font/google'
```

and after the `lexend` line:

```ts
// Bhété text needs ɛ ɔ ɩ ʋ ŋ and their capitals: Inter/Lexend ship the `latin` subset only, so those letters
// would fall back to an arbitrary system font. Noto Sans covers them through `latin-ext`.
const phonetic = Noto_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-phonetic', weight: ['400', '600'], display: 'swap' })
```

Find where `inter.variable` and `lexend.variable` are applied to the `<body>`/`<html>` className (`grep -n "variable" web/app/layout.tsx`) and add `${phonetic.variable}` next to them in the same template string.

`web/app/globals.css`: inside the existing `@layer utilities { ... }` block (it starts with `.pattern-bg`), add as the first rule:

```css
  .phonetic {
    font-family: var(--font-phonetic), var(--font-sans), sans-serif;
  }
```

Apply the class (each edit replaces an existing font class; use `Edit` after reading the line):
- `web/components/LexiconEntry.tsx`: on `<CardTitle className="text-2xl font-heading">` change to `className="text-2xl phonetic font-semibold"`; on the bracketed IPA `<p className="text-sm text-muted-foreground font-mono">` change `font-mono` to `phonetic`.
- `web/components/WordCard.tsx` (line ~82): `<span className="text-xs text-muted-foreground font-mono">` (the one printing `[{cleanBeteWord(entry.bete_word)}]`) → `<span className="text-xs text-muted-foreground phonetic">`.
- `web/app/lexicon/page.tsx` line ~71: `<span className="text-xs font-mono text-muted-foreground">` → `text-xs phonetic text-muted-foreground`; line ~68: `font-heading font-bold` on the Bhété word span → `phonetic font-bold`.
- `web/components/UsageCard.tsx`: `<p className="font-heading text-lg leading-snug break-words">` → `<p className="phonetic text-lg font-semibold leading-snug break-words">`.
- `web/components/InterlinearGloss.tsx`: (a) compact variant `<p className="font-semibold text-foreground">{original}</p>` → `<p className="phonetic font-semibold text-foreground">{original}</p>`; (b) tier 1 container: replace `'text-lg md:text-xl font-bold font-heading tracking-wide'` with `'text-lg md:text-xl font-bold phonetic tracking-wide'` and `'text-base leading-relaxed'` stays; add `phonetic` to the long variant too by changing `'text-foreground whitespace-pre-wrap'` to `'phonetic text-foreground whitespace-pre-wrap'` and removing the duplicate from the short variant string; (c) `font-mono` on the `[forme phonétique : …]` div → `phonetic`.
- `web/components/VerseWords.tsx`: four edits. Line ~76: `<strong>{lex.spelling}</strong>` → `<strong className="phonetic">{lex.spelling}</strong>`. Line ~77: `<span className="text-muted-foreground">[{lex.ipa}]</span>` → `<span className="phonetic text-muted-foreground">[{lex.ipa}]</span>`. Line ~155: `<span className="font-semibold">{tk.whole}</span>` → `<span className="phonetic font-semibold">{tk.whole}</span>`. Line ~235: `<span className="text-sm font-semibold text-foreground">{tk.t}</span>` → `<span className="phonetic text-sm font-semibold text-foreground">{tk.t}</span>`.
- `web/components/lexicon/SpellingsList.tsx`: `<span className="font-medium">{s.spelling}</span>` → `<span className="phonetic font-medium">{s.spelling}</span>`.
- `web/components/ResourceSubmitForm.tsx`: the `NumberedTextarea` with `aria-label="Texte en bhété"` has `className="font-mono"` → `className="phonetic"`; the one with `aria-label="Mot à mot"` has `className="italic"` → `className="phonetic italic"`.

- [ ] **Step 4: Run tests and checks**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint app/layout.tsx lib/utils.ts components/LexiconEntry.tsx components/UsageCard.tsx components/InterlinearGloss.tsx components/lexicon/SpellingsList.tsx`
Expected: the whole suite passes (previous count 540 plus the new tests); no new type or lint errors. (`PronunciationSection.tsx:40` already has a pre-existing lint error, ignore it.)

Visual check (cannot be automated; do it before the commit): `cd web && npm run dev`, open a lexicon entry, `/alphabet`, and a resource with Bhété text; confirm `ɛ ɔ ɩ ʋ ŋ` look like the surrounding letters (same height and weight). If the dev server crashes on the deep Windows path, say so and skip: the final check then happens on the Vercel preview.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/app/layout.tsx web/app/globals.css web/lib/utils.ts web/components/LexiconEntry.tsx web/components/WordCard.tsx web/app/lexicon/page.tsx web/components/UsageCard.tsx web/components/InterlinearGloss.tsx web/components/VerseWords.tsx web/components/lexicon/SpellingsList.tsx web/components/ResourceSubmitForm.tsx web/__tests__/clean-bete-word.test.ts
git commit -m "feat(phonetic): load a font that covers the Bhété letters and keep tone apostrophes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: NFC on save

**Files:**
- Modify: `web/lib/lexicon-links-data.ts` (`createEntry`, `addSpelling`)
- Modify: `web/lib/community-mutations.ts` (`resourceColumns`)
- Modify: `web/lib/word-blocks-data.ts` (`saveVerse`)
- Modify: `web/components/ContributionForm.tsx` (grammar rule and expression inserts)
- Test: `web/__tests__/phonetic-storage.test.ts`

**Interfaces:**
- Consumes: `toStoredForm` from `@/lib/phonetic`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/phonetic-storage.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addSpelling, createEntry } from '@/lib/lexicon-links-data'
import { emptyEntryForm } from '@/lib/lexicon-links'
import { saveVerse } from '@/lib/word-blocks-data'

const COMBINING = 'go\u0308'      // g + o + combining diaeresis
const PRECOMPOSED = 'g\u00F6'
const failing = () => vi.fn().mockResolvedValue({ data: null, error: { message: 'x' } })
const fake = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient

describe('createEntry stores NFC', () => {
  it('normalises the spelling, the transcription, the synonyms and the example', async () => {
    const rpc = failing()
    const form = { ...emptyEntryForm(COMBINING, 'enfant', 'western'), ipa: 'a\u0308', synonyms: 'o\u0308, plain' }
    await createEntry(fake(rpc), {
      form,
      kind: 'word',
      example: { bete: 'e\u0308 mö', french: 'un enfant', literal: '' },
    })
    const args = rpc.mock.calls[0][1]
    expect(args.p_spelling).toBe(PRECOMPOSED)
    expect(args.p_ipa).toBe('\u00E4')
    expect(args.p_synonyms).toEqual(['\u00F6', 'plain'])
    expect(args.p_example.bete).toBe('\u00EB m\u00F6')
  })
})

describe('addSpelling stores NFC', () => {
  it('normalises the spelling', async () => {
    const rpc = failing()
    await addSpelling(fake(rpc), 'L1', ` ${COMBINING} `)
    expect(rpc.mock.calls[0][1]).toEqual({ p_lexicon_id: 'L1', p_spelling: PRECOMPOSED })
  })
})

describe('saveVerse stores NFC and keeps the lines', () => {
  it('normalises the Bhété line and the literal line without touching line structure', async () => {
    const rpc = failing()
    await saveVerse(fake(rpc), {
      resourceId: 'R1', verseNo: 1, baseBete: 'x', baseLiteral: null,
      beteLine: 'a\u0308 b', literalLine: 'c\u0308', blocks: [],
    })
    const args = rpc.mock.calls[0][1]
    expect(args.p_bete_line).toBe('\u00E4 b')
    expect(args.p_literal_line).toBe('c\u0308'.normalize('NFC'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run __tests__/phonetic-storage.test.ts`
Expected: FAIL (values are not normalised yet). If `saveVerse`'s argument type rejects the object literal, read `SaveVerseArgs` in `lib/word-blocks-data.ts` (just above `saveVerse`) and adjust the literal in the test to its exact fields.

- [ ] **Step 3: Implement**

In each file add `import { toStoredForm } from '@/lib/phonetic'` with the other imports.

`web/lib/lexicon-links-data.ts` — in `createEntry`: change the `synonyms` line to
```ts
  const synonyms = splitList(f.synonyms).map(toStoredForm)
```
and in the rpc arguments use:
```ts
    p_spelling: toStoredForm(f.spelling.trim()),
    p_ipa: toStoredForm(f.ipa.trim()) || null,
```
```ts
    p_lemma: toStoredForm(f.lemma.trim()) || null,
```
and replace `p_example: a.example ?? null,` by:
```ts
    p_example: a.example ? { ...a.example, bete: toStoredForm(a.example.bete), literal: toStoredForm(a.example.literal) } : null,
```
In `addSpelling`: `p_spelling: toStoredForm(spelling.trim())`.

`web/lib/community-mutations.ts` — in `resourceColumns`:
```ts
    content_bete:    toStoredForm(input.content_bete.trim()),
    content_literal: input.content_literal?.trim() ? toStoredForm(input.content_literal.trim()) : null,
```
(leave `title`, `content_french`, `video_url`, `region` as they are).

`web/lib/word-blocks-data.ts` — in `saveVerse` rpc arguments:
```ts
    p_base_bete: a.baseBete,
    p_base_literal: a.baseLiteral,
    p_bete_line: a.beteLine === null ? null : toStoredForm(a.beteLine),
    p_literal_line: a.literalLine === null ? null : toStoredForm(a.literalLine),
```
(`baseBete`/`baseLiteral` are hashes of the text the editor loaded: do NOT normalise them, they must stay what the server saw.)

`web/components/ContributionForm.tsx` — in `handleSubmit`:
```ts
          category, pattern_french: patternFr, pattern_bete: toStoredForm(patternBete),
          description, example_french: exFr || null, example_bete: exBete ? toStoredForm(exBete) : null,
```
```ts
          bete_phrase: toStoredForm(betePhrase),
          bete_phonetic: toStoredForm(betePhonetic),
```
and add `import { toStoredForm } from '@/lib/phonetic'`. The word-creation path goes through `createEntry` (already covered); `wordExBete` reaches `createEntry` as `example.bete` (covered).

- [ ] **Step 4: Run tests**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: all tests PASS (existing `lexicon-links-data` and `community` tests still pass; if one asserts exact rpc arguments for an entry without special characters it is unaffected because NFC leaves plain text unchanged).

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/lexicon-links-data.ts web/lib/community-mutations.ts web/lib/word-blocks-data.ts web/components/ContributionForm.tsx web/__tests__/phonetic-storage.test.ts
git commit -m "feat(phonetic): store Bhété text in NFC

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Put the picker next to the Bhété fields

**Files:**
- Modify: `web/components/ContributionForm.tsx`
- Modify: `web/components/ResourceSubmitForm.tsx`
- Modify: `web/components/word-link/EntryForm.tsx`
- Modify: `web/components/word-link/LexiconPanel.tsx`
- Modify: `web/components/lexicon/SpellingsList.tsx`

**Interfaces:**
- Consumes: `SymbolPicker({ target, dialect })` (Task 3), `NumberedTextarea.textareaRef` (Task 3), `useDialect()` for pages without their own dialect.

Pattern for every field: create `const xRef = useRef<HTMLInputElement>(null)` (or `HTMLTextAreaElement`), pass `ref={xRef}` to the field (for the shared `<Input>` component the `ref` prop is forwarded to the `<input>` in React 19; for `NumberedTextarea` use `textareaRef={xRef}`), and render `<SymbolPicker target={xRef} dialect={dialect} className="mt-1.5" />` directly under the field. Add `useRef` to the React import where missing, plus `import { SymbolPicker } from '@/components/SymbolPicker'`.

- [ ] **Step 1: ContributionForm** (`dialect` already comes from `useDialect()`)

Fields to equip (each gets a ref + picker below it): outer word spelling `Input placeholder="Mot en bhété (forme phonétique latine) *"` (`wordSpellingRef`); `wordExBete` (`wordExBeteRef`); expression `betePhrase` (`betePhraseRef`), `betePhonetic` (`betePhoneticRef`); grammar `patternBete` (`patternBeteRef`), `exBete` (`exBeteRef`). The French fields get nothing. Example for the first one:

```tsx
            <Input
              ref={wordSpellingRef}
              placeholder="Mot en bhété (forme phonétique latine) *"
              value={wordSpelling}
              onChange={e => { setWordSpelling(e.target.value); setExisting(null); setSubmitError(null) }}
            />
            <SymbolPicker target={wordSpellingRef} dialect={dialect} />
```

The `wordSpelling` field sits in a fragment with other siblings: keep the `<SymbolPicker>` immediately after its `<Input>`.

- [ ] **Step 2: ResourceSubmitForm**

Find how the form gets a dialect: `grep -n "dialect\|Dialect" web/components/ResourceSubmitForm.tsx`. It has a region select, not a dialect; use `const { dialect } = useDialect()` (import from `@/context/DialectContext`). Equip the two `NumberedTextarea` fields "Texte en bhété" and "Mot à mot":

```tsx
        <NumberedTextarea
          aria-label="Texte en bhété"
          placeholder="Texte en bhété *"
          value={contentBete}
          onChange={setContentBete}
          rows={6}
          className="phonetic"
          textareaRef={beteRef}
        />
        <SymbolPicker target={beteRef} dialect={dialect} />
```

with `const beteRef = useRef<HTMLTextAreaElement>(null)` and the same pattern for `literalRef` on the "Mot à mot" field. Do not add it to "Traduction en français".

- [ ] **Step 3: EntryForm** (its own dialect field `f.dialect`, type `Dialect` = `DialectKey` union)

In `web/components/word-link/EntryForm.tsx` add refs `spellingRef`, `ipaRef` (`HTMLInputElement`), set `ref` on the two `<input className={inputClass} …>` for "Graphie" and "Transcription", and render `<SymbolPicker target={spellingRef} dialect={f.dialect} />` / `<SymbolPicker target={ipaRef} dialect={f.dialect} />` inside the corresponding `<Field>` after the input. If `Field` only accepts a single child element, wrap the input and the picker in a fragment.

- [ ] **Step 4: LexiconPanel and SpellingsList**

`web/components/word-link/LexiconPanel.tsx` (the "Nouvelle graphie" input, line ~325): add `spellingInputRef`, `ref` on the `<input>`, and the picker after the row. The panel knows the entry's dialect (`entry.dialect`, a `string`): pass `dialect={(DIALECT_KEYS.includes(entry.dialect as DialectKey) ? entry.dialect : DEFAULT_DIALECT) as DialectKey}` with `import { DIALECT_KEYS, DEFAULT_DIALECT, type DialectKey } from '@/lib/dialect'`.

`web/components/lexicon/SpellingsList.tsx` (input "Proposer une autre graphie"): add `const inputRef = useRef<HTMLInputElement>(null)`, `ref={inputRef}` on the `<input>`, and after the `<form>`'s closing tag (inside the `userId ?` branch, wrapped with the form in a fragment) render `<SymbolPicker target={inputRef} dialect={dialect} />` with `const { dialect } = useDialect()`. `SpellingsList` is rendered by static-markup tests without a provider: `useDialect()` has a default context value, so this stays safe.

- [ ] **Step 5: Verify and commit**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . 2>&1 | tail -8 && npx eslint components/ContributionForm.tsx components/ResourceSubmitForm.tsx components/word-link components/lexicon/SpellingsList.tsx`
Expected: all tests PASS (the `lexicon-spellings` tests still pass: the picker is closed by default so the markup only gains a small button), no new type or lint errors.

Manual check in `npm run dev` (or on the preview): open the contribution form, tap `Symboles`, tap `ɛ` with the cursor in the middle of a word: it is inserted there, the caret stays after it, the form state updates (submit button logic reacts). Fill a field to its `maxLength` and tap a symbol: the red message appears and nothing is inserted. Repeat in the resource form (multi-line text) and on a lexicon entry's "Autres graphies". Report what you could not check.

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/components/ContributionForm.tsx web/components/ResourceSubmitForm.tsx web/components/word-link/EntryForm.tsx web/components/word-link/LexiconPanel.tsx web/components/lexicon/SpellingsList.tsx
git commit -m "feat(phonetic): offer the symbol picker next to every Bhété field

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes (already applied)

- Spec coverage: data (Task 2), reference page + sitemap + edit-mode link (Task 4), picker with ref binding and maxLength guard (Tasks 1, 3), field wiring (Task 7), font + `cleanBeteWord` (Task 5), NFC on save (Task 6), tests per task. Out of scope (search folding, `lang`, audio) is untouched.
- One deliberate deviation from the spec: the picker's toggle sits **under** the field (right-aligned) instead of beside it, because the fields are laid out in many different containers; the tray behaviour is as specified. The spec text should be updated to match when this plan is executed.
- Names used across tasks: `toStoredForm`, `insertAtSelection`, `ALPHABET`, `groupedSymbols`, `trayRows`, `SymbolPicker` (props `target`, `dialect`, `className`), `NumberedTextarea.textareaRef`, `AlphabetReference`, CSS class `phonetic`.
