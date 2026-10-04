# Resource word links: word-by-word reading with block pairing and grammatical markers

Date: 2026-10-04

## Goal

Let a reader of a resource (a song, a prayer, a story) tap any Bété word and see its exact meaning in that sentence and how it relates to the other words of the sentence. Let the contributor build that layer, even with little knowledge of the language. The first resource is the Notre Père (5 verses), whose pairing was done by hand in the interactive mockups.

Two things the current resource page cannot do, and this spec adds:

1. **Word-level pairing that survives free word order.** Today the word-by-word chips only work when the Bété text and the *mot à mot* have the same number of space-separated words, and only for one-line texts. Real pairs are many-to-many: *nikpa* = "les gens", *tatini … yii* = "laissons" with a particle that sits at the end of the clause.
2. **Grammatical markers.** Words like *wo* (am), *do* (-ing), *ye* (will) have no dictionary meaning. They are flagged as markers, their meaning can be left empty and filled in later, and a marker with no counterpart in the *mot à mot* must not shift the pairing of the words after it.

## Decisions (agreed)

- The **numbered verse UI of production stays**: `NumberedTextarea` for entry (blank line = stanza break, only non-empty lines are numbered), `VerseTranslation` for display (stanzas with a left border, optional "Mot à mot" toggle, fallback to the plain card). "Vers n" in the new editor means the line numbered n in the gutter.
- **Two translations with two jobs.** The *mot à mot* is the exact word-for-word translation and is what blocks pair with. The French field is the general sense, stays line-level, and is never aligned word by word.
- **A block** is a set of Bété words of one verse paired with a set of *mot à mot* words. Words in a block need not be adjacent. The sentence is never rewritten: a block with separated words (*tatini … yii*) keeps every word at its original position and links them.
- **French articles** (le, la, les, un, une, des, au, aux, du) are grouped with the next *mot à mot* word by default (Bété has no articles). Editable. "de" is not grouped: it can be a real Bété word.
- **Grammatical markers** are flagged on a block. Type, meaning and French rendering are free text, all optional. The meaning is defined once per word in a resource and shared by every occurrence of that word in it. A marker may be flagged "no counterpart in the *mot à mot*".
- **Reader display:** mode B (running text, tap a word for a bubble) is the default, mode A (word boxes with the gloss visible) is a toggle for beginners. The choice is remembered in the browser only.
- **A verse is saved only when fully linked** (every Bété word in a block, every *mot à mot* word in a block, or the block is a marker with no counterpart). Work in progress stays in the browser.
- Only the **resource's contributor** edits its blocks and marker meanings (same ownership as the resource).

## Out of scope: lexicon entries (a separate spec)

Everything that touches `lexicon` is left out and designed next, on top of the tables below:

- Linking a block to a lexicon entry and to one of its senses; creating or completing entries from a block (including the full entry form, example sentences and completing pending placeholders); showing the dictionary definition in the word detail.
- Spelling variants as data: extra spellings of an entry, the candidate search that suggests existing words (*ghèhi-wu*, *ghéhi-wu*, *rhéhi-wu*), "add this spelling to an existing word".
- Markers as lexicon entries, with their meaning completed and corrected by the whole community through the corrections flow, and the audit of lexicon readers that this implies.
- The function that turns pairs into lexicon meanings automatically.

Until then, marker meanings are completed by the resource's contributor only, and the word detail shows no dictionary part.

Also out of scope: embeddings on blocks, using blocks to improve `find_usages`, bulk "mark every occurrence", importing existing glosses, French-side display of non-adjacent French words (grouped French words are shown as one block, as in `ne … pas`).

## Data model (one migration: `supabase/migrations/20261006000000_resource_word_links.sql`)

Additive only. No policy is dropped. Nothing in `lexicon` changes.

### 1. `resource_word_blocks`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| resource_id | uuid not null | FK `community_texts` on delete cascade |
| verse_no | int not null | `>= 1`, the gutter number (n-th non-empty line) |
| position | int not null | `>= 1`, order of the block by its first Bété word |
| bete_idx | int[] not null | 0-based word indices in the verse's Bété line, strictly increasing, not empty |
| gloss_idx | int[] not null default `{}` | 0-based word indices in the verse's *mot à mot* line |
| is_marker | boolean not null default false | grammatical marker |
| solo | boolean not null default false | marker with no *mot à mot* counterpart |
| note | text null | context or explanation, max 500 |
| composition | text null | for compounds, e.g. `ghèhi (en haut) + wu (lieu)`, max 300 |
| verse_hash | text not null | md5 of the verse's Bété and *mot à mot* lines when saved |
| created_at, updated_at | timestamptz | |

Unique `(resource_id, verse_no, position)`. Checks: `solo or cardinality(gloss_idx) >= 1`; `solo = false or is_marker`. No text is duplicated: the words come from the resource's own lines, sliced by index. RLS: select for everyone; **no client insert, update or delete**; only the functions below write.

Words are split with one rule everywhere (SQL and TypeScript): on runs of ` `, tab and U+00A0. Hyphens and apostrophes stay inside a word (`ghèhi-wu`, `Na'a`).

### 2. `resource_word_markers`: the meaning of a marker, once per word in a resource

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| resource_id | uuid not null | FK `community_texts` on delete cascade |
| word_norm | text not null | `usage_token_norm` of the block's Bété words joined by a space |
| word | text not null | the spelling as first written, for display |
| marker_type | text null | free text, max 100 (temps, aspect, mouvement… or anything else) |
| marker_meaning | text null | free text, max 300 (what it indicates: futur, en cours…) |
| marker_french | text null | free text, max 300 (how French renders it: « aller + verbe : je vais venir ») |
| updated_at | timestamptz | |

Unique `(resource_id, word_norm)`. A marker block uses the row whose `word_norm` matches its words; all three text fields may be empty ("sens à préciser"). Same RLS as the blocks table (read for everyone, written only by the save function). The follow-up lexicon spec moves this data into the lexicon.

### 3. Helper functions

- `verse_line(p_text text, p_n int) returns text`: the n-th non-empty trimmed line, same numbering as `numberLines` and `usage_split`.
- `verse_hash(p_bete text, p_literal text, p_n int) returns text`: `md5(verse_line(p_bete,n) || E'\n' || verse_line(p_literal,n))`.
- `replace_nth_line(p_text text, p_n int, p_line text) returns text`: replaces the n-th non-empty line and leaves blank lines (stanza breaks) untouched.

### 4. `save_resource_verse(p_resource uuid, p_verse int, p_base_bete text, p_base_literal text, p_bete_line text, p_literal_line text, p_blocks jsonb)`

`security definer`, `set search_path = public`. Atomic. Executable by signed-in users only. Steps:

1. The caller must be `community_texts.created_by` for `p_resource`. Otherwise error `not_owner`.
2. **Stale-editor guard:** the verse's current Bété and *mot à mot* lines must equal `p_base_bete` and `p_base_literal` (the lines the editor was built on, compared trimmed). Otherwise error `text_changed`, and nothing is written. Without this, indices built on an old text could validate against a new one and attach glosses to the wrong words.
3. If `p_bete_line` or `p_literal_line` is given, replace the verse's line in `content_bete` / `content_literal` with `replace_nth_line` (this is how a word correction made in the editor reaches the text; the existing `usage_sync` trigger rebuilds the usage index).
4. Validate `p_blocks` against the resulting lines: every index in range and strictly increasing; no index used twice across blocks on the same side; the union of all `bete_idx` covers every Bété word; the union of all `gloss_idx` covers every *mot à mot* word (so the verse is balanced); `solo` blocks have an empty `gloss_idx`; a solo block is a marker. Errors are specific codes the UI maps to French messages.
5. Delete the verse's rows, insert the new ones with `position` = order of first Bété word and the new `verse_hash`.
6. Each marker block may carry `marker: {type, meaning, french}`. The function derives the word key from the block's own words (never from the client) and upserts `resource_word_markers`, the last block in position order winning for a word. Then it deletes the resource's marker rows that no marker block uses any more.
7. Return `{ saved, verse_hash }`.

### 5. `get_resource_words(p_resource uuid)`

`stable`, executable by anon and authenticated. Returns one row per verse that has blocks: `verse_no`, `stale` (stored hash differs from the hash of the current lines), `bete_line`, `literal_line`, and `blocks` (jsonb array with indices, flags, note, composition and, for markers, the shared type, meaning and French rendering). A stale verse returns no blocks, so readers fall back to the plain row.

## Web

### Pure helpers: `web/lib/word-blocks.ts` (ported from the mockups, unit tested)

`splitWords`, `buildUnits` (a unit is a head word plus attached words, ordered by first index), `attachTo`, `autoGroup` (French articles), `splitRuns` (consecutive runs of a block's words), `remapAtt` / `remapKey` (index remapping after a correction), `toBlocks` / `fromBlocks` (editor state to rows and back), and the pairing rule: the k-th Bété unit pairs with the k-th *mot à mot* unit, skipping solo markers.

### Editor: `/resources/[id]/relier` (owner only; server redirects others)

Client component `WordLinkEditor`, one tab per verse showing two badges (Bété blocks / *mot à mot* blocks, then blocks done / blocks). Works from the saved text; to change the text itself the page links to the existing edit form. Requires the *mot à mot* field with the same number of lines as the Bété field, otherwise it explains what to fix.

For the active verse:

- **Pairing strip:** Bété words in sentence order, each block with its *mot à mot* below. A block with separated words appears at each of its places (`tatini ↔ yii` and a dashed partner box `yii ↔ tatini`). Tapping either half selects the same block; tapping the *mot à mot* half selects the same pair.
- **Block panel:** regroup with another unit or split; correct, add or delete a word (the correction keeps attachments, notes, compositions and marker flags by remapping indices); composition and note fields; a switch "Mot / Marqueur grammatical".
- **Marker:** type, what it indicates and how French renders it, all free text and optional; checkbox "Aucun mot du mot à mot ne lui correspond" (sets `solo`). An empty marker shows as "sens à préciser". The meaning is shared by every block of the resource with the same word, and the panel says how many other occurrences exist.
- **Save:** per verse, `save_resource_verse` with the lines the editor was built on (refused as `text_changed` if the text moved meanwhile), only when the verse is balanced. A draft per resource and verse is kept in `localStorage` (try/catch) until saved. A verse whose text changed elsewhere is flagged "à revoir".

### Reader: changes to `VerseTranslation`

`VerseTranslation` gets an optional `words` prop (the result of `get_resource_words`). For each verse with non-stale blocks, the Bété line of `VerseRow` is replaced by `VerseWords`:

- Words are rendered in the **original order**, one place per word. Tapping a word opens the detail; for a block with separated words, both words are highlighted together and the detail is titled `tatini … yii` with a "Lié à : yii" button (and `yii` shows "Lié à : tatini").
- **Mode B** (default): running text, dotted underline, popover. **Mode A:** word boxes with the exact gloss under each word, `↔` on linked words. Toggle in the section header next to "Mot à mot", remembered in `localStorage`.
- **Word detail:** the block's exact gloss, composition and note; for a marker, "Marqueur grammatical · temps : futur · En français : aller + verbe", or "sens à préciser" when empty.
- Verses without blocks and stale verses keep today's rendering. Word blocks apply when the reader shows a text line by line (alignment `verses` with unit `line`) or a single-line text (alignment `single`, verse 1). A text that the reader splits into sentences, or whose fields do not line up (`stanzas`, `misaligned`), keeps today's rendering. Stanza borders and numbering are unchanged.
- `/resources/[id]` fetches `get_resource_words` in parallel with the existing queries. The owner sees a "Relier les mots" action in `ResourceOwnerActions` and a prompt when the resource has a *mot à mot* but no blocks.

Styling uses the existing Tailwind tokens; nothing from the mockups that needs `color-mix` or `:has()` is ported as is (Safari 16.1 floor).

## Data integrity rules

- A block never stores text, only indices into the resource's own lines plus the verse hash. A text edit made anywhere (edit form, accepted correction) changes the hash; the verse silently falls back to the plain display and is flagged for the owner. Wrong glosses are never shown against changed words.
- Saving a verse is atomic: text replacement, blocks and marker meanings succeed or fail together.
- Every Bété word of a saved verse belongs to exactly one block, and every *mot à mot* word to exactly one block.
- A marker meaning exists once per word and resource; marker rows no block uses are removed on save.
- Deleting the resource deletes its blocks and markers.

## Edge cases

- Duplicate words in a verse (*nyinyo li* twice) are different blocks with different indices; as markers they share one meaning.
- A correction that merges or splits words (*en men* to *enmen*) remaps attachments, notes, compositions and marker flags of that verse.
- Blank lines in the text (stanzas) are preserved by every text rewrite.
- A resource edited by its contributor after linking: only the verses whose lines changed become stale.
- Anonymous readers see everything the reader view needs; nothing in the two new tables is private.

## Testing

- **Unit (vitest):** every helper in `word-blocks.ts`, with the real Notre Père verses as fixtures: verse 1 balanced 13/13 after article grouping, verse 4 balanced 17/17 with the two *tatini … yi(i)* groups, *en men* corrected to *enmen* in verse 5, a marker with no counterpart realigning the rest of its verse, index remapping after add, delete, merge and split.
- **RLS / SQL (`npm run test:rls`, run in groups because of the local signup limit):** `save_resource_verse` (owner only, non-owner and anon denied, every validation error, atomic replace, text replacement keeps blank lines, `usage_lines` follow, markers upserted and cleaned); stale detection after a text change; cascade delete with the resource; `get_resource_words` (stale verses carry no blocks, marker meanings attached); clients cannot write either table directly.
- **Component tests:** tapping either word of a linked block highlights both and shows the partner button; mode B and A render the same words in the same order; the marker panel with all fields empty; the shared marker meaning appears on every block of the same word.
- **Manual pilot:** the Notre Père resource, verse by verse, including a marker with no *mot à mot* counterpart.

## Rollout

The migration is additive and touches no existing table. Migrations since the hardening one must be re-runnable (`web/__tests__/migrations.test.ts`), so it starts each policy with `drop policy if exists` on its own new tables; the Supabase tool may decline DDL containing `drop policy`, in which case apply it by hand in the SQL editor as was done for the resources migration. After the migration, `get_resource_words` returns nothing for every existing resource, so production pages are unchanged until a contributor links a resource.

## Open decisions (defaults chosen, change if you disagree)

1. **Partial saves:** a verse is saved only when balanced; drafts stay in the browser. Alternative: save partial verses with a `complete` flag.
2. **Markers at resource level** until the lexicon spec: only the contributor completes a marker's meaning. The community completion the mockups showed arrives with the lexicon spec.
3. **Reader mode** is remembered per browser; no account-level setting.
