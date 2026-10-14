# Texte API pour les ressources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a contributor add an IPA / African-orthography version of a resource's text, link its words to the Latin words by position, and let readers switch the text view and the word-for-word view between Latin and IPA.

**Architecture:** One nullable column `community_texts.content_ipa`. A pure module (`lib/ipa-alignment.ts`) aligns the IPA lines with the Latin lines (same line number, same word count → word *i* ↔ word *i*) and reports a status per verse. The reader (`VerseTranslation`, `VerseWords`) takes the IPA text and a remembered Latin/API switch; a verse that is not aligned falls back to Latin. The word-link editor reuses the same alignment to prefill the IPA transcription when a lexicon entry is created from a block.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, Tailwind v4, Supabase (hand-applied SQL migration), Vitest 4 with `renderToStaticMarkup` (no jsdom).

**Spec:** `docs/superpowers/specs/2026-10-14-resource-ipa-text-design.md`

## Global Constraints

- Work in `web/` on the current branch (`master`); no branches or worktrees. Run `git branch --show-current` before every commit; stage explicit paths only. Run tests from `web/`: `npx vitest run <file>`; type-check `npx tsc --noEmit -p .`; lint `npx eslint <paths>` (a pre-existing error at `components/lexicon/PronunciationSection.tsx:40` is not yours).
- `web/AGENTS.md`: this Next.js version has breaking changes; this plan uses only plain client components and existing patterns.
- UI copy is French with typographic apostrophes (’ U+2019) in JSX text; code and comments in English, short comments explaining *why*. Use Edit/Write tools; never rewrite files through PowerShell `Set-Content`/`Out-File` (BOM/CRLF noise); check `git diff --stat` before committing.
- iOS Safari 16.1 must keep working: no new CSS that needs Safari ≥ 16.4.
- Bhété text is stored with `toStoredForm` (NFC); no other rewriting (hyphens and apostrophes are tone marks).
- The migration is applied by hand in production **before** the app is deployed. The app must still work for a resource that has no IPA text when the column does not exist yet: send `content_ipa` only when it is filled or when the resource already had one.
- Words are split on spaces and tabs only (`splitWords`, same rule as the SQL `word_count`). Lines are the non-empty lines (`nonEmptyLines`), numbered from 1 like the gutter.
- The IPA text is never part of `verse_hash`: editing it must not invalidate word links.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Review Focus

1. An IPA text with fewer lines than the Latin text: the verses without an IPA line render in Latin, nothing throws (Task 2, Task 4).
2. An IPA text with more lines than the Latin text: the extra lines are ignored (Task 2).
3. A line whose word count differs from the Latin line must never produce word pairs (`words` is null) and must never index past the end of the IPA words (Task 2, Task 4).
4. An empty or blank IPA field is stored as null, and clearing a previously filled field writes null (Task 1).
5. Editing Latin words later so the counts no longer match: the verse falls back to Latin in the reader, and the word-link editor offers no IPA prefill for it (Task 4, Task 5).
6. A private window where `localStorage` throws: the Latin/API switch still works for the session (Task 4).

---

### Task 1: Column, types and save functions

**Files:**
- Create: `supabase/migrations/20261014000000_resource_ipa_text.sql`
- Modify: `web/lib/types.ts` (`CommunityText`, `CreateCommunityTextInput`)
- Modify: `web/lib/community-mutations.ts` (`resourceColumns`)
- Test: `web/__tests__/resource-mutations.test.ts` (add one `describe`)

**Interfaces:**
- Produces: `CommunityText.content_ipa: string | null`; `CreateCommunityTextInput.content_ipa?: string` (`undefined`: leave the column alone; `''`: clear it).

- [ ] **Step 1: Write the failing tests**

At the end of `web/__tests__/resource-mutations.test.ts` add:

```ts
describe('content_ipa', () => {
  it('is not sent when the field was never used (the column may not exist yet)', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    await submitCommunityText(client, input)
    expect(calls[0].payload).not.toHaveProperty('content_ipa')
  })

  it('is stored in NFC, trimmed, and keeps its lines', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    await submitCommunityText(client, { ...input, content_ipa: '  go\u0308 a\n\nb\u0308  ' })
    expect(calls[0].payload?.content_ipa).toBe('g\u00F6 a\n\nb\u0308')
  })

  it('writes null for a blank value, so a filled field can be cleared on edit', async () => {
    const { client, calls } = fakeClient(ok({ id: 'r1' }))
    await updateCommunityText(client, 'r1', { ...input, content_ipa: '   ' })
    expect(calls[0].payload?.content_ipa).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run __tests__/resource-mutations.test.ts`
Expected: FAIL (the 2nd and 3rd tests: `content_ipa` is undefined).

- [ ] **Step 3: Implement**

`web/lib/types.ts`: in `CommunityText` add, after `content_literal`:

```ts
  content_ipa: string | null      // the same text in IPA / African orthography (optional)
```

In `CreateCommunityTextInput` add, after `content_literal?: string`:

```ts
  /** undefined: leave it alone; '' (or blanks): clear it. */
  content_ipa?: string
```

`web/lib/community-mutations.ts`: in `resourceColumns`, after the `content_literal` line add:

```ts
    ...(input.content_ipa !== undefined
      ? { content_ipa: input.content_ipa.trim() ? toStoredForm(input.content_ipa.trim()) : null }
      : {}),
```

Create `supabase/migrations/20261014000000_resource_ipa_text.sql` (read `20260930000002_community_texts_literal.sql` first and use the same limit as `content_bete`/`content_literal`: 10000):

```sql
-- Resources: optional version of the Bhété text in IPA / African orthography. Its words are linked to the Latin
-- words by position (same line number, same word count), so it is not part of verse_hash.
-- Apply BEFORE deploying the app version that saves it.
alter table community_texts
  add column if not exists content_ipa text
  check (content_ipa is null or char_length(content_ipa) <= 10000);
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd web && npx vitest run __tests__/resource-mutations.test.ts && npx tsc --noEmit -p . 2>&1 | tail -5`
Expected: PASS; tsc may report errors for places that build a `CommunityText` literal (fixtures): add `content_ipa: null` there (`grep -rn "content_literal:" web --include=*.ts --include=*.tsx`).

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add supabase/migrations/20261014000000_resource_ipa_text.sql web/lib/types.ts web/lib/community-mutations.ts web/__tests__/resource-mutations.test.ts
git commit -m "feat(resources): store an IPA version of the text

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Alignment — `lib/ipa-alignment.ts`

**Files:**
- Create: `web/lib/ipa-alignment.ts`
- Test: `web/__tests__/ipa-alignment.test.ts`

**Interfaces:**
- Consumes: `nonEmptyLines`, `splitWords` from `@/lib/word-blocks`.
- Produces:
  - `type IpaStatus = 'none' | 'ok' | 'words-differ' | 'line-missing'`
  - `interface IpaVerse { no: number; status: IpaStatus; line: string | null; words: string[] | null; beteWords: number; ipaWords: number }`
  - `alignIpa(beteText: string, ipaText?: string | null): IpaVerse[]` — one element per non-empty Latin line, `no` from 1.
  - `describeIpa(verses: IpaVerse[], ipaLineCount: number): { ok: boolean; message: string } | null` — the hint shown under the form field; `null` when there is no IPA text.
  - `hasIpa(verses: IpaVerse[]): boolean` — at least one verse has an IPA line.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/ipa-alignment.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alignIpa, describeIpa, hasIpa } from '@/lib/ipa-alignment'

const LATIN = "Sê a'a tatini a yii\nKaba nunu"

describe('alignIpa', () => {
  it('has one element per non-empty Latin line, and "none" without an IPA text', () => {
    const v = alignIpa(LATIN + '\n\nTroisième', null)
    expect(v.map(x => x.status)).toEqual(['none', 'none', 'none'])
    expect(v.map(x => x.no)).toEqual([1, 2, 3])
    expect(v[0].beteWords).toBe(5)
    expect(alignIpa(LATIN, '   \n ').map(x => x.status)).toEqual(['none', 'none'])
  })

  it('links the words by position when the counts are equal', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii\nKaba nʋnʋ")
    expect(v[0]).toMatchObject({ status: 'ok', line: "Sɛ a'a tatɩnɩ a yii", words: ['Sɛ', "a'a", 'tatɩnɩ', 'a', 'yii'] })
    expect(v[1].words).toEqual(['Kaba', 'nʋnʋ'])
  })

  it('never gives words when the counts differ, but keeps the line for the plain view', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ yii\nKaba nʋnʋ")
    expect(v[0]).toMatchObject({ status: 'words-differ', words: null, line: "Sɛ a'a tatɩnɩ yii", beteWords: 5, ipaWords: 4 })
    expect(v[1].status).toBe('ok')
  })

  it('marks the verses that have no IPA line, and ignores extra IPA lines', () => {
    const fewer = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii")
    expect(fewer.map(x => x.status)).toEqual(['ok', 'line-missing'])
    expect(fewer[1]).toMatchObject({ line: null, words: null, ipaWords: 0 })
    const more = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii\nKaba nʋnʋ\nde trop")
    expect(more).toHaveLength(2)
  })

  it('splits on spaces and tabs only, and skips blank lines on both sides', () => {
    const v = alignIpa("a\tb\n\n  c d  ", "x\ty\n\n z   w ")
    expect(v.map(x => x.status)).toEqual(['ok', 'ok'])
    expect(v[1].words).toEqual(['z', 'w'])
  })

  it('treats a hyphenated tone mark as part of its word', () => {
    expect(alignIpa("‑nyɛ Davidɩ", "‑nyɛ Davidɩ")[0].words).toEqual(['\u2011nyɛ', 'Davidɩ'])
  })
})

describe('hasIpa', () => {
  it('is true when at least one verse has an IPA line', () => {
    expect(hasIpa(alignIpa(LATIN, null))).toBe(false)
    expect(hasIpa(alignIpa(LATIN, 'x'))).toBe(true)
  })
})

describe('describeIpa', () => {
  it('says nothing without an IPA text', () => {
    expect(describeIpa(alignIpa(LATIN, ''), 0)).toBeNull()
  })

  it('confirms when every line is linked', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii\nKaba nʋnʋ")
    expect(describeIpa(v, 2)).toEqual({ ok: true, message: 'Les mots API sont reliés à leurs mots latins, ligne par ligne.' })
  })

  it('names the lines whose word counts differ, with the same numbers as the gutter', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ yii\nKaba nʋnʋ")
    const d = describeIpa(v, 2)
    expect(d?.ok).toBe(false)
    expect(d?.message).toContain('ligne 1 : 5 mots en latin, 4 en API')
    expect(d?.message).not.toContain('ligne 2')
  })

  it('says how many lines are missing or extra', () => {
    expect(describeIpa(alignIpa(LATIN, 'Sɛ a’a tatɩnɩ a yii'), 1)?.message).toContain('Le texte API a 1 ligne, le texte latin en a 2')
    expect(describeIpa(alignIpa(LATIN, 'a\nb\nc'), 3)?.message).toContain('Le texte API a 3 lignes, le texte latin en a 2')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run __tests__/ipa-alignment.test.ts`
Expected: FAIL — cannot resolve `@/lib/ipa-alignment`.

- [ ] **Step 3: Implement**

Create `web/lib/ipa-alignment.ts`:

```ts
// The IPA / African-orthography version of a resource text is linked to the Latin text by position: line n of
// one is line n of the other (the gutter numbers), and word i of an IPA line is word i of its Latin line.
// That only holds when both lines have the same number of words, so every verse gets a status.
import { nonEmptyLines, splitWords } from '@/lib/word-blocks'

export type IpaStatus = 'none' | 'ok' | 'words-differ' | 'line-missing'

export interface IpaVerse {
  /** 1-based number of the non-empty Latin line. */
  no: number
  status: IpaStatus
  /** The IPA line, when there is one (even if its words cannot be linked). */
  line: string | null
  /** The IPA words, only when they line up one to one with the Latin words. */
  words: string[] | null
  beteWords: number
  ipaWords: number
}

export function alignIpa(beteText: string, ipaText?: string | null): IpaVerse[] {
  const bete = nonEmptyLines(beteText)
  const used = Boolean(ipaText && ipaText.trim() !== '')
  const ipa = used ? nonEmptyLines(ipaText as string) : []
  return bete.map((b, i): IpaVerse => {
    const beteWords = splitWords(b).length
    const base = { no: i + 1, beteWords }
    if (!used) return { ...base, status: 'none', line: null, words: null, ipaWords: 0 }
    const line = ipa[i]
    if (line === undefined) return { ...base, status: 'line-missing', line: null, words: null, ipaWords: 0 }
    const words = splitWords(line)
    return words.length === beteWords
      ? { ...base, status: 'ok', line, words, ipaWords: words.length }
      : { ...base, status: 'words-differ', line, words: null, ipaWords: words.length }
  })
}

/** At least one verse has an IPA line: the reader then offers the Latin / API switch. */
export function hasIpa(verses: IpaVerse[]): boolean {
  return verses.some(v => v.status === 'ok' || v.status === 'words-differ')
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The hint under the form field. Never blocks: the contributor can publish anyway. */
export function describeIpa(verses: IpaVerse[], ipaLineCount: number): { ok: boolean; message: string } | null {
  if (!verses.some(v => v.status !== 'none')) return null
  const parts: string[] = []
  if (ipaLineCount !== verses.length) {
    parts.push(`Le texte API a ${plural(ipaLineCount, 'ligne', 'lignes')}, le texte latin en a ${verses.length}.`)
  }
  const differ = verses.filter(v => v.status === 'words-differ')
  for (const v of differ.slice(0, 3)) parts.push(`ligne ${v.no} : ${plural(v.beteWords, 'mot', 'mots')} en latin, ${v.ipaWords} en API.`)
  if (differ.length > 3) parts.push(`… et ${differ.length - 3} autre${differ.length - 3 > 1 ? 's' : ''} ligne${differ.length - 3 > 1 ? 's' : ''}.`)
  if (parts.length === 0) return { ok: true, message: 'Les mots API sont reliés à leurs mots latins, ligne par ligne.' }
  return { ok: false, message: parts.join(' ') + ' Les lignes qui ne correspondent pas restent affichées en latin mot à mot.' }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run __tests__/ipa-alignment.test.ts`
Expected: PASS. If the `describeIpa` "extra lines" test fails on the exact sentence, fix the code, not the test.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/ipa-alignment.ts web/__tests__/ipa-alignment.test.ts
git commit -m "feat(resources): align an IPA text with the Latin text line by line and word by word

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The form field

**Files:**
- Modify: `web/components/ResourceSubmitForm.tsx`

**Interfaces:**
- Consumes: `alignIpa`, `describeIpa` (Task 2); `NumberedTextarea.textareaRef`, `SymbolPicker`, `useDialect` (already used in this file); `nonEmptyLines` from `@/lib/word-blocks`; `CreateCommunityTextInput.content_ipa` (Task 1).

No unit test (the component needs a browser client): verification is tsc, eslint, the existing suite and the manual check below.

- [ ] **Step 1: Add state, hint and input**

In `web/components/ResourceSubmitForm.tsx`:

1. Imports: add `import { alignIpa, describeIpa } from '@/lib/ipa-alignment'` and `import { nonEmptyLines } from '@/lib/word-blocks'` (skip the second if already imported).
2. After `const literalRef = useRef<HTMLTextAreaElement>(null)` add `const ipaRef = useRef<HTMLTextAreaElement>(null)`.
3. After the `contentBete` state line add `const [contentIpa, setContentIpa] = useState(resource?.content_ipa ?? '')`.
4. After the `alignmentHint` `useMemo` add:

```tsx
  const ipaHint = useMemo(
    () => describeIpa(alignIpa(contentBete, contentIpa), nonEmptyLines(contentIpa).length),
    [contentBete, contentIpa],
  )
```

5. In `handleSubmit`, in the `input` object add, after `content_literal`:

```ts
      // Never sent for a resource that never had one: the column may not exist yet in production.
      ...(contentIpa.trim() || resource?.content_ipa ? { content_ipa: contentIpa } : {}),
```

6. Between the "Texte en bhété" block and the "Mot à mot" block (anchor on `      <div className="space-y-1.5">\n        <NumberedTextarea\n          aria-label="Mot à mot"`), insert:

```tsx
      <div className="space-y-1.5">
        <NumberedTextarea
          aria-label="Texte en API / orthographe africaine"
          placeholder="Texte en API / orthographe africaine (optionnel)"
          value={contentIpa}
          onChange={setContentIpa}
          rows={4}
          className="phonetic"
          textareaRef={ipaRef}
        />
        <SymbolPicker target={ipaRef} dialect={dialect} />
        <p className="text-xs text-muted-foreground">
          Le même texte écrit avec les lettres ɛ ɔ ɩ ʋ ŋ… Même nombre de lignes et de mots que le texte en bhété
          ci-dessus : chaque mot sera alors relié à son mot latin, et les lecteurs pourront choisir l’écriture.
        </p>
        {ipaHint && (
          <p role="status" className={`text-xs ${ipaHint.ok ? 'text-emerald-600' : 'text-amber-700'}`}>
            {ipaHint.message}
          </p>
        )}
      </div>
```

- [ ] **Step 2: Verify**

Run: `cd web && npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint components/ResourceSubmitForm.tsx; npx vitest run 2>&1 | tail -4`
Expected: tsc and eslint clean for this file, suite passes (a repo-scanning test such as `no-vote-ui.test.ts` can time out under load: re-run it alone).

Manual check (`npm run dev` or the Vercel preview; say if you could not): the new field shows between the Latin text and the mot à mot, the `Symboles` button inserts ɛ at the cursor, the hint shows "ligne 3 : 5 mots en latin, 4 en API" when counts differ, publishing without API text works, editing a resource that has API text prefills the field and clearing it saves.

- [ ] **Step 3: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/components/ResourceSubmitForm.tsx
git commit -m "feat(resources): add the IPA / African-orthography field to the resource form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The reading view

**Files:**
- Modify: `web/lib/word-blocks.ts` (`ReaderToken`, `readerTokens`)
- Modify: `web/components/VerseWords.tsx` (script prop, shown word, detail line)
- Modify: `web/components/VerseTranslation.tsx` (IPA prop, script switch, per-verse choice)
- Modify: `web/app/resources/[id]/page.tsx` (pass `ipa`)
- Test: `web/__tests__/word-blocks.test.ts` (add), `web/__tests__/verse-words.test.tsx` (add), `web/__tests__/verse-translation-ipa.test.tsx` (create)

**Interfaces:**
- Consumes: `alignIpa`, `hasIpa`, `IpaVerse` (Task 2).
- Produces:
  - `readerTokens(verse, ipaWords?: string[] | null)`; `ReaderToken` gains `ipa: string | null` (IPA text of this piece) and `wholeIpa: string | null` (IPA text of the whole block). Both are `null` unless `ipaWords.length` equals the number of Latin words of the verse.
  - `VerseWords` props gain `ipaWords?: string[] | null` and `script?: 'latin' | 'ipa'` (default `'latin'`).
  - `VerseTranslation` props gain `ipa?: string | null` and `defaultScript?: 'latin' | 'ipa'` (default `'latin'`, for tests; the reader's choice is remembered in `localStorage` under `word-reader-script`).

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/word-blocks.test.ts` (reuse its imports; add `readerTokens` to the import list from `../lib/word-blocks` if missing and build the verse with the same helper style used in that file):

```ts
describe('readerTokens with IPA words', () => {
  const verse = {
    verse_no: 1, stale: false,
    bete_line: 'Sê a tatini yii', literal_line: 'Comme nous laissons',
    blocks: [
      { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null },
      { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: false, solo: false, note: null, composition: null, marker: null },
      { position: 3, bete_idx: [2, 3], gloss_idx: [2], is_marker: false, solo: false, note: null, composition: null, marker: null },
    ],
  }

  it('gives each piece the IPA words at the same positions', () => {
    const t = readerTokens(verse, ['Sɛ', 'a', 'tatɩnɩ', 'yii'])
    expect(t.map(x => x.ipa)).toEqual(['Sɛ', 'a', 'tatɩnɩ yii'])
    expect(t[2].wholeIpa).toBe('tatɩnɩ yii')
    expect(t.map(x => x.t)).toEqual(['Sê', 'a', 'tatini yii'])   // the Latin text is never rewritten
  })

  it('gives null for IPA when there are no IPA words, or when the counts differ', () => {
    expect(readerTokens(verse).every(x => x.ipa === null && x.wholeIpa === null)).toBe(true)
    expect(readerTokens(verse, ['Sɛ', 'a', 'tatɩnɩ']).every(x => x.ipa === null)).toBe(true)
    expect(readerTokens(verse, ['Sɛ', 'a', 'tatɩnɩ', 'yii', 'de trop']).every(x => x.ipa === null)).toBe(true)
  })
})
```

Add to `web/__tests__/verse-words.test.tsx`:

```tsx
describe('VerseWords in the IPA script', () => {
  const ipa = ['Sɛ', "a'a", 'tatɩnɩ', 'a', 'yɩɩ']

  it('shows the IPA words in both modes, in the original sentence order', () => {
    expect(buttons(renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" script="ipa" ipaWords={ipa} />)))
      .toEqual(['Sɛ', "a'a", 'tatɩnɩ', 'a', 'yɩɩ'])
    const a = renderToStaticMarkup(<VerseWords verse={VERSE} mode="A" script="ipa" ipaWords={ipa} />)
    const words = [...a.matchAll(/<span class="[^"]*font-semibold[^"]*">([^<]*)<\/span>/g)].map(m => decode(m[1]))
    expect(words).toEqual(['Sɛ', "a'a", 'tatɩnɩ', 'a', 'yɩɩ'])
  })

  it('keeps the Latin words when the script is Latin, or when the IPA words do not line up', () => {
    expect(buttons(renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" script="latin" ipaWords={ipa} />)))
      .toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
    expect(buttons(renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" script="ipa" ipaWords={ipa.slice(0, 4)} />)))
      .toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
    expect(buttons(renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" script="ipa" ipaWords={null} />)))
      .toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
  })

  it('the detail of a word shows both forms', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" script="ipa" ipaWords={ipa} initialOpen={2} />)
    expect(decode(html)).toContain('tatini')
    expect(decode(html)).toContain('API')
    expect(decode(html)).toContain('tatɩnɩ yɩɩ')
  })
})
```

Create `web/__tests__/verse-translation-ipa.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseTranslation } from '../components/VerseTranslation'
import type { VerseWords as VerseData } from '../lib/word-blocks'

const decode = (s: string) => s.replace(/&#x27;/g, "'")
const LATIN = "Sê a'a tatini a yii\nKaba nunu"
const FRENCH = 'Comme nous laissons nos\nKaba mange'

describe('VerseTranslation with an IPA text', () => {
  it('offers the Latin / API switch only when an IPA text exists', () => {
    const without = renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} />)
    expect(without).not.toContain('API')
    const withIpa = renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa={"Sɛ a'a tatɩnɩ a yɩɩ\nKaba nʋnʋ"} />)
    expect(withIpa).toContain('Latin')
    expect(withIpa).toContain('API')
  })

  it('shows the Latin lines by default and the IPA lines when the script is API', () => {
    const ipa = "Sɛ a'a tatɩnɩ a yɩɩ\nKaba nʋnʋ"
    const latin = decode(renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa={ipa} />))
    expect(latin).toContain("Sê a'a tatini a yii")
    const api = decode(renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa={ipa} defaultScript="ipa" />))
    expect(api).toContain("Sɛ a'a tatɩnɩ a yɩɩ")
    expect(api).toContain('Kaba nʋnʋ')
    expect(api).not.toContain("Sê a'a tatini a yii")
    expect(api).toContain('Comme nous laissons nos')   // the French is never swapped
  })

  it('keeps a verse in Latin, with a note, when its IPA line is missing', () => {
    const api = decode(renderToStaticMarkup(<VerseTranslation original={LATIN} french={FRENCH} ipa="Sɛ a'a tatɩnɩ a yɩɩ" defaultScript="ipa" />))
    expect(api).toContain("Sɛ a'a tatɩnɩ a yɩɩ")
    expect(api).toContain('Kaba nunu')
    expect(api).toContain('Pas d’API pour ce vers')
  })

  it('shows the plain IPA line even when its word count differs, but reads the words in Latin', () => {
    const one: VerseData = {
      verse_no: 1, stale: false, bete_line: "Sê a'a tatini a yii", literal_line: 'Comme nous laissons nos',
      blocks: [0, 1, 2, 3, 4].map(i => ({ position: i + 1, bete_idx: [i], gloss_idx: [i % 4], is_marker: false, solo: false, note: null, composition: null, marker: null })),
    }
    const html = decode(renderToStaticMarkup(
      <VerseTranslation original="Sê a'a tatini a yii" literal="Comme nous laissons nos" ipa="Sɛ a'a tatɩnɩ yɩɩ" words={[one]} defaultScript="ipa" />,
    ))
    expect(html).toContain('tatini')          // the word view stays in Latin
    expect(html).toContain('ne correspond')    // and says why
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run __tests__/word-blocks.test.ts __tests__/verse-words.test.tsx __tests__/verse-translation-ipa.test.tsx`
Expected: FAIL (`readerTokens` ignores the second argument, `script`/`ipaWords`/`ipa` props do not exist).

- [ ] **Step 3: `readerTokens`**

`web/lib/word-blocks.ts`: in `ReaderToken` add after `whole`:

```ts
  /** IPA text of this piece / of the whole block, when the IPA words line up with the Latin words; else null. */
  ipa: string | null
  wholeIpa: string | null
```

Change the signature and body of `readerTokens`:

```ts
export function readerTokens(verse: VerseWords, ipaWords?: string[] | null): ReaderToken[] {
  const bw = splitWords(verse.bete_line)
  const gw = splitWords(verse.literal_line)
  // IPA words are used only when they line up one to one with the Latin words.
  const iw = ipaWords && ipaWords.length === bw.length ? ipaWords : null
  const out: ReaderToken[] = []
  for (const b of verse.blocks) {
    const runs = splitRuns(b.bete_idx)
    const names = runs.map(r => r.map(i => bw[i] ?? '').join(' '))
    const ipaNames = iw ? runs.map(r => r.map(i => iw[i] ?? '').join(' ')) : null
    runs.forEach((r, k) =>
      out.push({
        start: r[0],
        k,
        runs: names,
        bid: `${verse.verse_no}:${b.position}`,
        t: names[k],
        whole: labelOf(bw, b.bete_idx),
        ipa: ipaNames ? ipaNames[k] : null,
        wholeIpa: iw ? labelOf(iw, b.bete_idx) : null,
        gloss: b.gloss_idx.length ? labelOf(gw, b.gloss_idx) : null,
```

(keep the remaining fields of the pushed object exactly as they are). Fix any other place that builds a `ReaderToken` literal (`grep -rn "bid:" web --include=*.ts --include=*.tsx`): add `ipa: null, wholeIpa: null`.

- [ ] **Step 4: `VerseWords`**

`web/components/VerseWords.tsx`:
1. In `interface Props` add `ipaWords?: string[] | null` and `script?: 'latin' | 'ipa'`.
2. In `export function VerseWords({ verse, mode, initialOpen = null, canEditMarkers }: Props)` add `ipaWords = null, script = 'latin'` to the destructuring and change `const tokens = readerTokens(verse)` to `const tokens = readerTokens(verse, ipaWords)`. Right after `const toggle…` add:

```tsx
  const shown = (tk: ReaderToken) => (script === 'ipa' && tk.ipa ? tk.ipa : tk.t)
```

3. In mode A replace `{tk.t}` inside `<span className="phonetic text-sm font-semibold text-foreground">` by `{shown(tk)}`; in mode B replace the button's `{tk.t}` by `{shown(tk)}`.
4. In `WordDetail`, right after the first `div` that shows `{tk.whole}` and its gloss (the `flex flex-wrap items-baseline gap-2` block), add:

```tsx
      {tk.wholeIpa && tk.wholeIpa !== tk.whole && (
        <p className="text-xs text-muted-foreground">
          En latin : <span className="phonetic">{tk.whole}</span> · En API : <span className="phonetic">{tk.wholeIpa}</span>
        </p>
      )}
```

(Read the block first; place it as a sibling directly under the header row of the card.)

- [ ] **Step 5: `VerseTranslation`**

`web/components/VerseTranslation.tsx`:
1. Imports: `import { alignIpa, hasIpa, type IpaVerse } from '@/lib/ipa-alignment'`.
2. Props: add `ipa?: string | null` and `defaultScript?: Script` with `type Script = 'latin' | 'ipa'`.
3. After `useWordMode` add the same pattern for the script:

```tsx
const SCRIPT_KEY = 'word-reader-script'

function useScript(initial: Script): [Script, (s: Script) => void] {
  const [script, setScript] = useState<Script>(initial)
  useEffect(() => {
    try {
      const v = localStorage.getItem(SCRIPT_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration (localStorage is client-only)
      if (v === 'latin' || v === 'ipa') setScript(v)
    } catch {
      // storage unavailable (private window): keep the default
    }
  }, [])
  const choose = (s: Script) => {
    setScript(s)
    try {
      localStorage.setItem(SCRIPT_KEY, s)
    } catch {
      // ignore
    }
  }
  return [script, choose]
}

function ScriptToggle({ script, onChange }: { script: Script; onChange: (s: Script) => void }) {
  const pill = (s: Script, label: string) => (
    <button
      type="button"
      aria-pressed={script === s}
      onClick={() => onChange(s)}
      className={cn(
        'shrink-0 text-xs font-medium rounded-full border px-3 py-1 transition-colors',
        script === s ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )
  return (
    <div className="flex gap-1.5" role="group" aria-label="Écriture">
      {pill('latin', 'Latin')}
      {pill('ipa', 'API')}
    </div>
  )
}
```

(`useEffect`/`useState`/`cn` are already imported there.)

4. `VerseRow` gains `ipaVerse?: IpaVerse` and `script: Script`; its body becomes:

```tsx
  const showIpa = script === 'ipa'
  const plain = showIpa && ipaVerse?.line ? ipaVerse.line : verse.original
  const note = !showIpa || !ipaVerse
    ? null
    : !ipaVerse.line
      ? 'Pas d’API pour ce vers.'
      : words && ipaVerse.status === 'words-differ'
        ? 'Le nombre de mots en API ne correspond pas au latin : lecture mot à mot en latin.'
        : null
  return (
    <div className="space-y-0.5">
      {words ? (
        <VerseWords verse={words} mode={mode} canEditMarkers={canEditMarkers} script={script} ipaWords={ipaVerse?.words ?? null} />
      ) : (
        <Lines className="font-semibold text-foreground leading-relaxed">{plain}</Lines>
      )}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
      {/* …the literal and French lines exactly as they are today… */}
    </div>
  )
```

Add the Latin lines to `className` only through `plain`; when the IPA line is shown give the paragraph the `phonetic` class: `className={cn('font-semibold text-foreground leading-relaxed', showIpa && ipaVerse?.line && 'phonetic')}`.

5. In `VerseTranslation`: compute `const ipaVerses = useMemo(() => alignIpa(original, ipa), [original, ipa])`, `const ipaUsable = hasIpa(ipaVerses) && (alignment.kind === 'verses' || alignment.kind === 'single')`, `const [script, setScript] = useScript(defaultScript)`; define `const scriptNow: Script = ipaUsable ? script : 'latin'`. Pass `ipaVerse={ipaVerses[no - 1]}` and `script={scriptNow}` to every `VerseRow` in the `verses` and `single` branches (single: `ipaVerses[0]`; `stanzas` branch: `script="latin"`). Render `{ipaUsable && <ScriptToggle script={script} onChange={setScript} />}` next to the existing `ModeToggle` in the header (for the `single` header too). In the two `InterlinearGloss` fallbacks use `original={scriptNow === 'ipa' && ipa?.trim() ? ipa : original}`.

6. `web/app/resources/[id]/page.tsx`: add `ipa={text.content_ipa}` to `<VerseTranslation …>`.

- [ ] **Step 6: Verify and commit**

Run: `cd web && npx vitest run __tests__/word-blocks.test.ts __tests__/verse-words.test.tsx __tests__/verse-translation-ipa.test.tsx __tests__/verse-translation-words.test.tsx __tests__/verse-translation-literal-toggle.test.tsx && npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint components/VerseWords.tsx components/VerseTranslation.tsx lib/word-blocks.ts lib/ipa-alignment.ts "app/resources/[id]/page.tsx"`
Expected: all PASS, tsc and eslint clean. If a test string in `verse-translation-ipa.test.tsx` fails because of HTML escaping of `’`, compare against the decoded output (`decode`), not the raw markup.

Manual check (say if not possible): on a resource with an IPA text, the "Latin | API" switch appears; "API" swaps the lines; in the word view each word shows its IPA form and tapping it shows both forms; a verse without an IPA line stays Latin with the note; reloading remembers the choice; a resource without IPA text looks exactly as before.

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/word-blocks.ts web/components/VerseWords.tsx web/components/VerseTranslation.tsx "web/app/resources/[id]/page.tsx" web/__tests__/word-blocks.test.ts web/__tests__/verse-words.test.tsx web/__tests__/verse-translation-ipa.test.tsx
git commit -m "feat(resources): read a resource in Latin or in API, as text or word by word

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Prefill the lexicon transcription from the IPA word

**Files:**
- Modify: `web/lib/lexicon-links.ts` (`emptyEntryForm`)
- Modify: `web/components/lexicon/LexiconPicker.tsx` (new optional `ipa` prop)
- Modify: `web/components/word-link/LexiconPanel.tsx` (new optional `ipa` prop)
- Modify: `web/components/word-link/BlockPanel.tsx` (compute the block's IPA)
- Modify: `web/components/word-link/WordLinkEditor.tsx` (new optional `ipaLines` prop)
- Modify: `web/app/resources/[id]/relier/page.tsx` (pass the IPA lines)
- Test: `web/__tests__/lexicon-links.test.ts` (add)

**Interfaces:**
- Produces: `emptyEntryForm(spelling, gloss, dialect, ipa = '')`; `WordLinkEditor` prop `ipaLines?: string[] | null` (the non-empty IPA lines, same numbering as `beteLines`); `LexiconPanel` and `LexiconPicker` prop `ipa?: string`.

- [ ] **Step 1: Write the failing test**

Add to `web/__tests__/lexicon-links.test.ts` (use the file's existing imports; add `emptyEntryForm` if missing):

```ts
describe('emptyEntryForm with an IPA word', () => {
  it('prefills the transcription, and leaves it empty by default', () => {
    expect(emptyEntryForm('tatini', 'laissons', 'western').ipa).toBe('')
    const f = emptyEntryForm('tatini', 'laissons', 'western', 'tatɩnɩ')
    expect(f.ipa).toBe('tatɩnɩ')
    expect(f.spelling).toBe('tatini')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run __tests__/lexicon-links.test.ts`
Expected: FAIL (`f.ipa` is `''`).

- [ ] **Step 3: Implement**

`web/lib/lexicon-links.ts`:

```ts
export function emptyEntryForm(spelling: string, gloss: string, dialect: Dialect, ipa = ''): EntryForm {
  return {
    spelling, ipa, dialect, category: '', description: '', notes: '', synonyms: '', lemma: '',
    senses: [{ french: senseSeed(gloss), context: '' }], useExample: false,
  }
}
```

`web/components/lexicon/LexiconPicker.tsx`: add `ipa?: string` to its props type, read it from the destructured props (default `''`), and change `initial={emptyEntryForm(spelling, gloss, dialect)}` (line ~147) to `initial={emptyEntryForm(spelling, gloss, dialect, ipa)}`.

`web/components/word-link/LexiconPanel.tsx`: add `ipa?: string` to `Props`, default `''` in the destructuring, pass `ipa={ipa}` to the `<LexiconPicker …>` it renders, and use `emptyEntryForm(words, gloss, dialect, ipa)` for the word entry (line ~181) and `emptyEntryForm(words, '', dialect, ipa)` for the marker entry (line ~189).

`web/components/word-link/BlockPanel.tsx`: add `ipaWords?: string[] | null` to `Props` and to the destructuring (default `null`); after `const bWords = …` add

```tsx
  // The IPA form of the selected block, only when the IPA line lines up with the (possibly edited) Latin words.
  const ipaOfBlock = b && ipaWords && ipaWords.length === r.bw.length ? blockWords(ipaWords, b.idx) : ''
```

and pass `ipa={ipaOfBlock}` to `<LexiconPanel …>` (also add `ipaOfBlock` to its `key` so the form resets when the block changes: the key already contains `bWords`).

`web/components/word-link/WordLinkEditor.tsx`: add `ipaLines?: string[] | null` to `Props`, destructure it (default `null`), import `splitWords` from `@/lib/word-blocks`, and pass to `<BlockPanel …>`:

```tsx
        ipaWords={ipaLines?.[cur] ? splitWords(ipaLines[cur]) : null}
```

`web/app/resources/[id]/relier/page.tsx`: in the `<WordLinkEditor …>` call add

```tsx
                ipaLines={text.content_ipa?.trim() ? nonEmptyLines(text.content_ipa) : null}
```

- [ ] **Step 4: Verify**

Run: `cd web && npx vitest run __tests__/lexicon-links.test.ts && npx vitest run 2>&1 | tail -4; npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint components/word-link components/lexicon/LexiconPicker.tsx lib/lexicon-links.ts "app/resources/[id]/relier/page.tsx"`
Expected: PASS, tsc and eslint clean (the `PronunciationSection.tsx:40` error is not in these paths).

Manual check (say if not possible): on `/resources/<id>/relier` of a resource with an aligned IPA text, selecting a word and creating a lexicon entry shows the IPA word in « Transcription (API…) »; with a mismatched verse it stays empty.

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/lexicon-links.ts web/components/lexicon/LexiconPicker.tsx web/components/word-link/LexiconPanel.tsx web/components/word-link/BlockPanel.tsx web/components/word-link/WordLinkEditor.tsx "web/app/resources/[id]/relier/page.tsx" web/__tests__/lexicon-links.test.ts
git commit -m "feat(resources): prefill the lexicon transcription with the IPA word of a block

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec coverage: column + save (Task 1), alignment + statuses (Task 2), form field with the hint and the picker (Task 3), reading view in text and word modes with the remembered switch and per-verse fallback (Task 4), lexicon prefill (Task 5). Out of scope as in the spec: corrections of the IPA field, search indexing, IPA on the lexicon page.
- Spec deviation: `ipaForBlock` is replaced by the existing `blockWords(ipaWords, idx)` (same semantics), used in Task 5.
- Names used across tasks: `alignIpa`, `describeIpa`, `hasIpa`, `IpaVerse`, `readerTokens(verse, ipaWords)`, `ReaderToken.ipa`/`wholeIpa`, `VerseWords` props `ipaWords`/`script`, `VerseTranslation` props `ipa`/`defaultScript`, `emptyEntryForm(..., ipa)`, `WordLinkEditor.ipaLines`, `BlockPanel.ipaWords`, `LexiconPanel`/`LexiconPicker` `ipa`.
- The migration must be applied by hand before deploying Tasks 3–5.
