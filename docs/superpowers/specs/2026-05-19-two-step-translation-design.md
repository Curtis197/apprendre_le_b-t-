# Two-Step Translation for Sentence Contributions — Design Spec
**Date:** 2026-05-19
**Status:** Approved

---

## Overview

Bété sentence logic differs fundamentally from French. A direct (word-for-word) translation of a Bété phrase often yields a different French surface form than the phrase's actual meaning. For example:

> Bété phrase → word-for-word: **"la pluie me bat"** → natural meaning: **"il pleut"**

A Python string comparator cannot bridge this gap. The solution is a 2-step translation model:
1. **Traduction mot à mot** (`french_literal`) — the literal word-for-word French rendering of the Bété
2. **Sens global** (`french_phrase`) — the actual natural French meaning

This design implements the 2-step model in the contribution form and surfaces the literal step wherever examples are displayed. The translator itself is out of scope for this change.

---

## Approach: Option A

Add `french_literal text` (nullable) to both `expressions` and `lexicon_examples`. The contribution form gains an optional literal field. Display components show it when non-null. NT-seeded `lexicon_examples` rows carry `null` until a future enrichment pass.

---

## 1. Database

### Migration 1 — `expressions`
```sql
ALTER TABLE expressions ADD COLUMN french_literal text;
```
- Nullable, no default
- Existing rows unaffected

### Migration 2 — `lexicon_examples`
```sql
ALTER TABLE lexicon_examples ADD COLUMN french_literal text;
```
- Nullable, no default
- NT-seeded rows will be `null` until enriched separately

---

## 2. Types (`lib/types.ts`)

Add `french_literal: string | null` to two interfaces:

```ts
export interface Expression {
  // ... existing fields ...
  french_literal: string | null   // word-for-word literal translation (optional)
}

export interface LexiconExample {
  // ... existing fields ...
  french_literal: string | null   // word-for-word literal translation (optional)
}
```

---

## 3. Contribution Form (`components/ContributionForm.tsx`)

Expression tab field order (changes only):

| # | Field | State var | Required | Change |
|---|---|---|---|---|
| 1 | Phrase en bété | `betePhrase` | yes | unchanged |
| 2 | Forme phonétique | `betePhonetic` | yes | unchanged |
| 3 | Traduction mot à mot | `frLiteral` (new) | **no** | new field |
| 4 | Sens global en français | `frPhrase` | yes | relabelled |
| 5 | Type | `exprType` | yes | unchanged |

**Field 3 placeholder:** `"Traduction littérale mot par mot (ex: la pluie me bat)"`
**Field 4 placeholder:** `"Sens réel en français (ex: il pleut)"`

The `french_literal` value is passed to the `expressions` insert when non-empty, otherwise omitted (column stays null).

---

## 4. Pending Contributions Display (`components/PendingContributions.tsx`)

Expression cards gain a conditional literal line. When `french_literal` is non-null:

```
[CardTitle]  →  french_phrase  (unchanged — global meaning as title)
[bete_phrase]
[bete_phonetic]  (monospace, muted)
Mot à mot : [french_literal]   ← new line, shown only when present
```

When `french_literal` is null the card is identical to today.

---

## 5. Lexicon Detail Page (`app/lexicon/[id]/page.tsx`)

The NT examples section currently renders `bete_snippet` + `french_snippet`. When `french_literal` is present on a `lexicon_examples` row:

```
[bete_snippet]
Mot à mot : [french_literal]   ← new line, shown only when present
[french_snippet]               (global meaning — unchanged)
```

The page already fetches `lexicon_examples(*)` via a wildcard select, so `french_literal` is included automatically once the column exists.

---

## 6. Files to Create / Modify

| Action | File |
|---|---|
| Create | `supabase/migrations/20260519000001_expressions_literal.sql` |
| Create | `supabase/migrations/20260519000002_lexicon_examples_literal.sql` |
| Modify | `web/lib/types.ts` — add `french_literal` to `Expression` and `LexiconExample` |
| Modify | `web/components/ContributionForm.tsx` — new optional field, relabel french_phrase |
| Modify | `web/components/PendingContributions.tsx` — show literal in expression cards |
| Modify | `web/app/lexicon/[id]/page.tsx` — show literal in NT examples section |

---

## 7. Out of Scope

- Translator changes (will adapt separately after contribution data is collected)
- UI for contributing `french_literal` to existing NT `lexicon_examples` rows
- Backfilling existing expression rows with literal translations
- Grammar rule or word (lexicon) contribution types — unchanged
