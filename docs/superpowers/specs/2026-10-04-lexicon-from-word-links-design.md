# Lexicon entries from word links: spelling variants, full entries and grammatical markers

Date: 2026-10-04

## Goal

The lexicon was emptied on 2026-10-04 (423 seeded rows deleted, a copy kept in the `archive` schema). It now grows from the texts people link. While pairing the words of a verse, a contributor finds the word in the lexicon even when it is spelled differently, or creates it with all its lexical fields; readers then see the definition in the word detail. Grammatical markers (*wo*, *do*, *ye*) become lexicon entries of a special kind, so anyone can complete their meaning later.

This is the follow-up to `2026-10-04-resource-word-links-design.md`, which deliberately left the lexicon out. Interactive mockups validated every flow below (entry form, spelling suggestions, markers with an optional meaning).

## Decisions (agreed)

- **Extend the existing `lexicon` table**, do not build a new model: the translator, the contribution form, the corrections flow and the lexicon pages keep working.
- **The Latin spelling is not fixed** (*ghèhi-wu*, *ghéhi-wu*, *rhéhi-wu*). Candidates are found by spelling, by spelling without accents and tones, and by a small edit distance. A contributor can add a spelling to an existing entry or create a new entry. A spelling is never merged silently.
- **Homonyms are senses of one entry**: `lexicon` is unique on `(bete_word, dialect)`, so *wu* "est" and *wu* "lieu" are two senses (`lexicon_translations` rows) of one entry, and a block points to the sense used.
- **A new entry can carry every lexical field** (IPA, dialect, category, senses with context, synonyms, definition, base form, usage notes), all optional but one spelling and one sense. The first sense is proposed from the *mot à mot* with its leading article removed ("au ciel" becomes "ciel"); the block keeps the exact "au ciel".
- **Grammatical markers are entries** with `entry_kind = 'marker'` and three free-text fields (type, what it indicates, how French renders it), all optional. The first person to fill an empty meaning sets it, then changes go through the existing corrections flow (the author and admins may edit directly).
- **Everything the contributor writes in the lexicon is community content**: entries start unvalidated, authored by the contributor, never validated by the client.
- **Lexicon writes are immediate** (they are community contributions with their own rules); the verse save only records which entry and sense each block uses.
- The numbered-verse UI and the editor/reader design of the word-links spec are unchanged.

## Out of scope

- Creating entries automatically from the pairs (second step, once the manual path is proven).
- Reseeding the lexicon with a French word list.
- Embeddings for new entries: entries created here have none, so the semantic translator ignores them until a separate job computes them.
- Community voting on entries beyond the existing `upvotes`/`validated` columns, moving or merging entries, changing an entry's kind other than through corrections.

## Data model (one migration: `supabase/migrations/20261008000000_lexicon_from_word_links.sql`)

Re-runnable (`create or replace`, `if not exists`, `drop policy if exists` before each `create policy`).

### 1. `lexicon`: marker columns and an insert guard

```sql
alter table lexicon add column if not exists entry_kind text not null default 'word'
  check (entry_kind in ('word', 'marker'));
alter table lexicon add column if not exists marker_type    text check (marker_type    is null or char_length(marker_type)    <= 100);
alter table lexicon add column if not exists marker_meaning text check (marker_meaning is null or char_length(marker_meaning) <= 300);
alter table lexicon add column if not exists marker_french  text check (marker_french  is null or char_length(marker_french)  <= 300);
```

A marker entry has `top_french = ''`, `french_candidates = []`, `probability = 0`, `pos = null`, no embedding, and no seeded translation (the existing `lexicon_seed_translation` trigger skips an empty `top_french`).

**Insert guard.** The policy `lexicon insert own` has `with check (true)`, so a client can today insert a row with any author, `validated = true` or any `source`. A `before insert` trigger, same pattern as `community_texts_guard_columns`, forces for callers with `current_user = 'authenticated'`: `created_by := auth.uid()`, `validated := false`, `upvotes := 0`, `source := 'contributed'`, `embedding := null`, `created_at := now()`. Service-role and security-definer writes pass untouched.

**Update guard.** The existing `lexicon_guard_update` already ignores every column but `description` (and the form fields of an empty placeholder) for clients, so the marker columns and `entry_kind` cannot be changed directly by a client; they change only through the functions and the corrections below.

### 2. `lexicon_spellings`: additional spellings of an entry

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| lexicon_id | uuid not null | FK `lexicon` on delete cascade |
| spelling | text not null | 1 to 100 characters after trim |
| spelling_norm | text not null | `usage_token_norm(spelling)`, set by a trigger |
| created_by | uuid null | FK `auth.users` on delete set null; set to `auth.uid()` by the guard |
| created_at | timestamptz | |

Unique `(lexicon_id, lower(spelling))`. Trigram GIN index on `spelling_norm` (operator class resolved through the search path, as in `20261002000000_search_lexicon_index.sql`). RLS: select for everyone; inserts only through `add_lexicon_spelling`; the author or an admin may delete. The entry's own forms (`bete_phonetic` = Latin, `bete_word` = IPA or the Latin when no IPA is known) stay where they are; this table holds only extra spellings.

### 3. `resource_word_blocks`: the link

Two nullable columns: `lexicon_id uuid references lexicon(id) on delete set null` and `translation_id uuid references lexicon_translations(id) on delete set null` (the sense used in this block). Deleting the entry or the sense unlinks the block without deleting it.

`resource_word_markers` (0 rows in production) is dropped: marker meanings now live on the marker entry, shared by every resource. `get_resource_words` keeps returning a `marker` object per marker block (`{type, meaning, french}` read from the linked entry) so existing readers keep working, and adds `lex` (below).

### 4. Functions

All `security definer`, `set search_path = public`, executable by signed-in users only (revoked from `public` and `anon`) unless stated.

- **`create_lexicon_entry(p_spelling text, p_ipa text, p_dialect text, p_kind text, p_pos text[], p_description text, p_notes text, p_synonyms text[], p_lemma text, p_senses jsonb, p_example jsonb) returns jsonb`**. `p_senses` is `[{french, context}]` (at least one for a word, none for a marker). Sets `bete_phonetic = p_spelling`, `bete_word = coalesce(p_ipa, p_spelling)`, `created_by = auth.uid()`; inserts the first sense through the existing seed trigger and the others as `lexicon_translations`; when `p_example` is `{bete, french, literal}` it also inserts a `lexicon_examples` row. If `(bete_word, dialect)` already exists it creates nothing and returns the existing entry with `existed: true` (the editor then links to it). Returns `{id, existed, sense_ids}`.
- **`add_lexicon_spelling(p_lexicon_id uuid, p_spelling text) returns uuid`**: trims, rejects an empty spelling or one that already belongs to the entry (its own forms or an extra spelling, case-insensitive).
- **`set_marker_meaning(p_lexicon_id uuid, p_type text, p_meaning text, p_french text) returns void`**: the entry must be a marker. Anyone signed in may set it while `marker_meaning` is null; afterwards only the entry's author or an admin; everyone else proposes a correction.
- **`find_lexicon_candidates(p_text text, p_dialect text default null, p_kind text default null, p_limit int default 6)`**, executable by anon and authenticated. Matches the block's spelling against `bete_phonetic`, `bete_word` and `lexicon_spellings.spelling`: kind `exact` (equal ignoring case), `norm` (equal after `usage_token_norm`: accents, tones, apostrophes, hyphens), `near` (edit distance on the normalised forms: 1 for 3 to 7 characters, 2 from 8, none for 1 to 2 characters). Same dialect first, then match kind, then distance. Returns for each entry: id, `entry_kind`, Latin spelling, IPA (never a `_pending_` form), dialect, `pos`, description, marker fields, all senses `[{id, french, context}]`, all spellings, and the spelling that matched. `p_kind` filters the kind; without it, entries of both kinds are returned so the editor can say that a spelling exists as the other kind. Thresholds are parameters with defaults, tuned on real data like `find_usages`.
- **`save_resource_verse`** (changed): a block may carry `lexicon_id` and `translation_id`. The function checks that the entry exists, that `translation_id` belongs to it, that a non-marker block links a `word` entry and a marker block links a `marker` entry, and that a solo block links a marker entry. A marker block must link a marker entry (the editor creates the entry the moment a word is flagged as a marker, with an empty meaning). The `marker` object of the previous version and the marker upsert and cleanup are removed.
- **`get_resource_words`** (changed): per block, `lex` = `{id, kind, spelling, ipa, dialect, pos, description, synonyms, marker: {type, meaning, french}, senses: [{id, french, context}], sense_id, spellings}` or `null`. A stale verse still returns no blocks.

### 5. Corrections and readers

- Add to `correction_column` and `web/lib/corrections.ts` (a test keeps them in step): `word.marker_type`, `word.marker_meaning`, `word.marker_french`, `word.entry_kind`.
- Every reader of `lexicon` ignores `entry_kind = 'marker'` unless `marker_meaning` is set: the `/lexicon` list and search, the sitemap, the translator RPCs `match_lexicon` and `match_lexicon_by_french`, and the `PendingContributions` section. A marker with a meaning appears with a "Marqueur grammatical" badge. The plan audits each reader.

## Web

### Pure helpers: `web/lib/lexicon-links.ts` (unit tested)
`stripArticle` ("au ciel" becomes "ciel"; articles le, la, les, un, une, des, au, aux, du), `senseSeed(gloss)`, `groupCandidates(rows, kind)` (exact, then variants, then other-kind notice), and the entry-form validation (reuses `checkTranslationInput` and `checkDescription` of `lib/lexicon.ts`).

### Data layer: `web/lib/lexicon-links-data.ts`
Wrappers for the four functions with French error messages (a duplicate spelling, an empty spelling, a meaning already set, not signed in). `getResourceWords` parses the new `lex` field.

### Editor (changes to `/resources/[id]/relier`)
- **Block panel, word:** `find_lexicon_candidates` for the block's spelling, restricted to `word` entries. Exact match: "Lier à cette entrée" with a "Sens dans ce texte" selector (an existing sense or "Nouveau sens : « ciel »"). Variant match: "C'est le même mot : ajouter la graphie « x » et lier". Always: "Mot différent : créer l'entrée" (the full form) and "Créer vite, avec le mot à mot seul". A linked block shows the entry with "Compléter la fiche", "Ajouter une graphie", "Ajouter un sens" and "Délier".
- **Entry form:** IPA, dialect (default from the resource's region: Guiberoua western, Gagnoa northern, Daloa eastern, else western), category (including "Particule"), senses with context (the first seeded from the *mot à mot*), synonyms, definition, base form, composition (pre-filled from the block), usage notes, and "utiliser ce vers comme phrase d'exemple" (needs the French line of the verse, passed by the page when the three fields have the same number of lines).
- **Block panel, marker:** switching to "Marqueur grammatical" runs the candidate search restricted to `marker` entries, links an existing one or creates one with an empty meaning (`create_lexicon_entry` with kind `marker`). The three free-text fields read and write the entry through `set_marker_meaning`. The "Aucun mot du mot à mot ne lui correspond" checkbox stays on the block.
- **State:** the editor's resource-level marker map (`markerEdits`, `collectMarkers`, `setMarkerEdit` in `web/lib/word-link-editor.ts`) is replaced by the linked entry; the editor keeps the entry summaries returned by the functions so the panel updates at once. Verse saves send `lexicon_id` and `translation_id` per block.
- **Tab colours and step flow** are unchanged.

### Reader (changes to `VerseWords`)
The word detail gets a dictionary part from `lex`: the sense used here highlighted among the entry's senses; category, IPA, definition, synonyms, other spellings; a link to `/lexicon/[id]`. An unlinked word says "Pas encore dans le lexique". A marker shows type, what it indicates and how French renders it; with an empty meaning it says "sens à préciser", and a signed-in reader gets a small inline form ("Préciser le sens", `set_marker_meaning`); with a meaning already set they get the existing correction box.

Styling uses the existing Tailwind tokens; nothing that needs `color-mix` or `:has()` (Safari 16.1 floor).

## Data integrity rules

- Blocks link by id, never by text: adding or renaming a spelling never breaks a link; deleting an entry or a sense unlinks the block and keeps it.
- Creating the same word twice is impossible: `create_lexicon_entry` returns the existing entry for a duplicate `(bete_word, dialect)`.
- A spelling is stored once per entry; the same spelling may exist on two entries (homonyms across dialects), which the candidate search shows side by side.
- Clients cannot set `validated`, `upvotes`, `source`, `created_by` or `embedding` on insert, and cannot change `entry_kind` or the marker fields by a direct update.
- A marker meaning is set once by anyone, then changes only through corrections or by the author or an admin.

## Edge cases

- A word whose spelling exists as a marker (or the reverse): the panel says so and offers the correction of the kind, never a silent duplicate.
- Entry creation succeeds but the verse is not saved: the entry stays (harmless, community content).
- Two contributors create the same word at once: the second gets `existed: true` and links to it.
- A block whose entry was deleted shows as unlinked; a marker block whose entry was deleted shows "sens à préciser".
- A resource with no *mot à mot* or unequal line counts: the editor is unavailable (unchanged), so no entry can be created from it; the contribution form stays the other way in.
- Many candidates: the list is capped (6) and the editor says when more exist.

## Testing

- **Unit:** `lexicon-links.ts` helpers (article stripping on the real verses, candidate grouping), the data layer error mapping, the changed editor state, the reader detail (static markup: linked word, unlinked word, marker with and without meaning).
- **RLS / SQL** (run in groups): insert guard (a client cannot set `validated`, author, source), update guard still blocks the marker columns, `create_lexicon_entry` (word and marker, example, duplicate returns `existed`, needs a sense for a word, anonymous refused), `add_lexicon_spelling` (duplicate, empty, own forms), `set_marker_meaning` (first fill by anyone, later by author or admin only, refused on a word), `find_lexicon_candidates` (exact, norm, near, short words, same dialect first, kind filter, other-kind notice), `save_resource_verse` link checks (sense of another entry, word block on a marker entry, solo without marker entry), `get_resource_words` `lex` payload and stale verses, deleting an entry unlinks the block, readers exclude empty markers, corrections allow-list and its TypeScript mirror.
- **Pilot:** extend the Notre Père RLS pilot: create entries for *ghèhi-wu* and *wu*, link them, add the spelling *ghéhi-wu*, flag *ye* as a marker in a second resource, read everything back anonymously.

## Rollout

The migration changes existing functions and drops the empty `resource_word_markers`. Apply it by hand in the SQL editor of project `agdqbzbjcxrzfhkvempe` before deploying (the MCP tool refuses destructive statements without confirmation). The previous frontend keeps working against the new functions (the `marker` object in `get_resource_words` is preserved, unknown block keys are ignored); the new frontend needs the migration. No data needs migrating (0 lexicon rows, 0 marker rows, the Notre Père has no marker).

## Open decisions (defaults chosen, change if you disagree)

1. **Dialect default** from the resource's region (Guiberoua western, Gagnoa northern, Daloa eastern, otherwise western), always editable.
2. **Candidate thresholds** (distance 1 up to 7 characters, 2 from 8) are starting values, tuned on real data.
3. **The permissive insert policy** `lexicon insert own` stays; the insert guard makes it safe instead of dropping it, so the contribution form keeps working unchanged.
4. **Changing an entry's kind** (word to marker) goes through a correction, not a direct edit.
