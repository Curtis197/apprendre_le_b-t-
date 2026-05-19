# Two-Step Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `french_literal` (mot à mot) field to sentence contributions alongside the existing `french_phrase` (sens global), and display it in the contribution form, pending cards, and lexicon detail page.

**Architecture:** Two nullable `french_literal text` columns (on `expressions` and `lexicon_examples`), a TypeScript type update, and three UI components updated to collect/display the new field. No translator changes — display only.

**Tech Stack:** Next.js App Router, Supabase (Postgres), TypeScript, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/20260519000001_expressions_literal.sql` | ADD COLUMN to expressions |
| Create | `supabase/migrations/20260519000002_lexicon_examples_literal.sql` | ADD COLUMN to lexicon_examples |
| Modify | `web/lib/types.ts` | Add `french_literal` to Expression + LexiconExample |
| Modify | `web/components/ContributionForm.tsx` | New optional field + relabelled french_phrase |
| Modify | `web/components/PendingContributions.tsx` | Show literal in expression cards |
| Modify | `web/app/lexicon/[id]/page.tsx` | Show literal in NT examples |

---

## Task 1: Migration — expressions

**Files:**
- Create: `supabase/migrations/20260519000001_expressions_literal.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260519000001_expressions_literal.sql
ALTER TABLE expressions ADD COLUMN french_literal text;
```

- [ ] **Step 2: Apply the migration to your local Supabase instance**

```bash
npx supabase db push
```

Expected: no errors. If using remote only, apply via the Supabase dashboard SQL editor.

- [ ] **Step 3: Verify the column exists**

In the Supabase dashboard or SQL editor:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'expressions' AND column_name = 'french_literal';
```
Expected: one row — `french_literal | text | YES`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260519000001_expressions_literal.sql
git commit -m "feat(db): add french_literal column to expressions"
```

---

## Task 2: Migration — lexicon_examples

**Files:**
- Create: `supabase/migrations/20260519000002_lexicon_examples_literal.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260519000002_lexicon_examples_literal.sql
ALTER TABLE lexicon_examples ADD COLUMN french_literal text;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: no errors.

- [ ] **Step 3: Verify the column exists**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'lexicon_examples' AND column_name = 'french_literal';
```
Expected: one row — `french_literal | text | YES`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260519000002_lexicon_examples_literal.sql
git commit -m "feat(db): add french_literal column to lexicon_examples"
```

---

## Task 3: Update TypeScript types

**Files:**
- Modify: `web/lib/types.ts`

The `Expression` interface currently ends at `created_at: string`. The `LexiconExample` interface needs to be extended — it is currently **not defined** in `types.ts` (the page uses an inline type). We add `french_literal` to `Expression` and create a named `LexiconExample` interface.

- [ ] **Step 1: Add `french_literal` to the `Expression` interface**

In `web/lib/types.ts`, find the `Expression` interface and add the field:

```ts
export interface Expression {
  id: string
  french_phrase: string
  bete_phrase: string
  bete_phonetic: string
  type: 'idiomatic' | 'fixed' | 'proverb'
  french_literal: string | null   // word-for-word literal translation (optional)
  validated: boolean
  upvotes: number
  created_by: string | null
  created_at: string
}
```

- [ ] **Step 2: Add a named `LexiconExample` interface**

Below the `LexiconExample`-related area (after `LexiconEntry`), add:

```ts
export interface LexiconExample {
  id: string
  lexicon_id: string
  verse_id: string | null
  bete_snippet: string
  french_snippet: string
  french_literal: string | null   // word-for-word literal translation (optional)
}
```

- [ ] **Step 3: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors. If you see errors about `french_literal` not existing on existing usages, that means a component is already casting to `Expression` — the cast will still work since the field is `| null` and won't break narrowing.

- [ ] **Step 4: Commit**

```bash
git add web/lib/types.ts
git commit -m "feat(types): add french_literal to Expression and LexiconExample"
```

---

## Task 4: Update ContributionForm

**Files:**
- Modify: `web/components/ContributionForm.tsx`

The expression tab currently has: `frPhrase`, `betePhrase`, `betePhonetic`, `exprType`. We add `frLiteral` and reorder/relabel.

- [ ] **Step 1: Add the `frLiteral` state variable**

In `web/components/ContributionForm.tsx`, find the expression fields block (around line 33) and add the new state:

```ts
// Expression fields
const [frPhrase, setFrPhrase] = useState('')
const [frLiteral, setFrLiteral] = useState('')        // new
const [betePhrase, setBetePhrase] = useState('')
const [betePhonetic, setBetePhonetic] = useState('')
const [exprType, setExprType] = useState<'idiomatic' | 'fixed' | 'proverb'>('idiomatic')
```

- [ ] **Step 2: Pass `french_literal` in the insert call**

In `handleSubmit`, find the expression branch and update the insert:

```ts
} else {
  ({ error } = await supabaseRef.current.from('expressions').insert({
    french_phrase: frPhrase,
    french_literal: frLiteral.trim() || null,          // new — null when empty
    bete_phrase: betePhrase,
    bete_phonetic: betePhonetic,
    type: exprType,
    created_by: user.id,
  }))
}
```

- [ ] **Step 3: Update the expression form JSX**

Replace the expression tab JSX block (the `type === 'expression'` branch) with:

```tsx
) : type === 'expression' ? (
  <div className="space-y-3">
    <Input
      placeholder="Phrase en bété (standard) *"
      value={betePhrase}
      onChange={e => setBetePhrase(e.target.value)}
    />
    <Input
      placeholder="Forme phonétique *"
      value={betePhonetic}
      onChange={e => setBetePhonetic(e.target.value)}
    />
    <Input
      placeholder="Traduction littérale mot par mot (ex : la pluie me bat)"
      value={frLiteral}
      onChange={e => setFrLiteral(e.target.value)}
    />
    <Input
      placeholder="Sens réel en français (ex : il pleut) *"
      value={frPhrase}
      onChange={e => setFrPhrase(e.target.value)}
    />
    <select
      className="w-full border rounded px-3 py-2 text-sm"
      value={exprType}
      onChange={e => setExprType(e.target.value as typeof exprType)}
    >
      <option value="idiomatic">Idiomatique</option>
      <option value="fixed">Expression figée</option>
      <option value="proverb">Proverbe</option>
    </select>
  </div>
```

- [ ] **Step 4: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add web/components/ContributionForm.tsx
git commit -m "feat(contribute): add mot-à-mot literal field to expression contribution"
```

---

## Task 5: Update PendingContributions

**Files:**
- Modify: `web/components/PendingContributions.tsx`

Expression cards currently show `french_phrase` as title, then `bete_phrase` and `bete_phonetic`. We add a conditional `Mot à mot` line.

- [ ] **Step 1: Update the expression card CardContent**

In `web/components/PendingContributions.tsx`, find the expression card body (inside the `expressions.map` block, around line 99) and replace it:

```tsx
<CardContent>
  <p className="font-bold">{ex.bete_phrase}</p>
  <p className="text-sm font-mono text-muted-foreground">[{ex.bete_phonetic}]</p>
  {ex.french_literal && (
    <p className="text-sm text-muted-foreground mt-1">
      <span className="font-medium">Mot à mot :</span> {ex.french_literal}
    </p>
  )}
  <ContributionComments targetTable="expressions" targetId={ex.id} />
</CardContent>
```

- [ ] **Step 2: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors. TypeScript will enforce that `ex.french_literal` exists on `Expression` (added in Task 3).

- [ ] **Step 3: Commit**

```bash
git add web/components/PendingContributions.tsx
git commit -m "feat(pending): show mot-à-mot literal in expression contribution cards"
```

---

## Task 6: Update Lexicon Detail Page

**Files:**
- Modify: `web/app/lexicon/[id]/page.tsx`

The page fetches `lexicon_examples(*)` — the wildcard already includes `french_literal` once the column exists. We only need to update the display.

- [ ] **Step 1: Update the inline type cast to use the named interface**

In `web/app/lexicon/[id]/page.tsx`, update the import and the type cast:

```ts
import type { LexiconEntry as TLexiconEntry, LexiconExample } from '@/lib/types'
```

Replace the `entry` type annotation:

```ts
const entry = data as TLexiconEntry & {
  lexicon_examples: LexiconExample[]
}
```

- [ ] **Step 2: Add the literal line to each example**

Find the example render block and update it:

```tsx
{entry.lexicon_examples.map((ex, i) => (
  <div key={i} className="border rounded p-3 text-sm space-y-1">
    <p className="font-mono">{ex.bete_snippet}</p>
    {ex.french_literal && (
      <p className="text-muted-foreground">
        <span className="font-medium">Mot à mot :</span> {ex.french_literal}
      </p>
    )}
    <p className="text-muted-foreground">{ex.french_snippet}</p>
  </div>
))}
```

- [ ] **Step 3: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Build check**

```bash
cd web && npm run build
```

Expected: build completes with no type errors. Ignore any pre-existing warnings.

- [ ] **Step 5: Commit**

```bash
git add web/app/lexicon/[id]/page.tsx
git commit -m "feat(lexicon): show mot-à-mot literal in NT examples on word detail page"
```

---

## Manual Verification Checklist

After all tasks are complete:

- [ ] Open `/contribute`, select "Expression" tab — verify field order: Bété phrase → Phonétique → Traduction littérale (optional) → Sens global (required) → Type
- [ ] Submit an expression with a literal (e.g., bété: `fli tchu mi`, literal: `la pluie me bat`, sens global: `il pleut`)
- [ ] Open "En attente de validation" — find the expression card — verify `Mot à mot : la pluie me bat` appears below the phonetic line
- [ ] Submit an expression **without** a literal — verify the card shows no `Mot à mot` line
- [ ] Open any `/lexicon/[id]` page — if NT examples exist, verify they render as before (no literal shown since column is null for seeded data)
