# Lexicon: multiple translations, description, detail page, bilingual search

Date: 2026-10-01

## Goal

Make the lexicon a community-built dictionary where a Bété word can carry several French translations (each with an optional context), a description text, a proper detail page, and search that works from Bété (both written forms) and from French. Voting on lexicon entries is removed.

## Decisions (agreed)

- Any logged-in user can add translations and edit the description of any word. A user edits/deletes only their own translations. No validation step. Same community model as resources.
- Only lexicon voting is removed; votes elsewhere stay.
- The translator keeps working; `lexicon.top_french` stays as the primary translation.
- Existing data migrates without loss.

## Data model (one migration)

### `lexicon_translations`
| column | type | notes |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| lexicon_id | uuid not null | FK `lexicon(id)` on delete cascade |
| french | text not null | `char_length(btrim(french)) between 1 and 200` |
| context | text null | optional, `<= 300` chars |
| position | int not null default 0 | display order; 0 = primary |
| author_name | text not null default '' | set by the guard trigger from `profiles.name` (never from the client) |
| created_by | uuid null | FK `auth.users`, on delete set null |
| created_at / updated_at | timestamptz | `updated_at` via `course_touch_updated_at()` |

Index on `(lexicon_id, position)`. Unique on `(lexicon_id, lower(btrim(french)), coalesce(btrim(context), ''))` to avoid duplicates.

RLS: select public; insert/update `created_by = auth.uid()`; delete own or `is_admin()`. A guard trigger (same shape as `community_texts_guard_columns`) freezes `created_by`, `created_at`, `lexicon_id` on update and forces `created_by` on insert for `authenticated`.

### Backfill and new words
Every existing `lexicon` row with a non-blank `top_french` (placeholders included: their French is the meaning awaiting a Bété word) gets one translation (`position 0`, `created_by = lexicon.created_by`). An after-insert trigger on `lexicon` does the same for every new word, whatever its source (form, import script, pipeline), so no caller needs a second write. Idempotent (`on conflict do nothing`).

### `top_french` sync
Trigger on `lexicon_translations` (insert/update/delete) sets `lexicon.top_french` to the translation with the lowest `position`, then oldest `created_at`. When the last translation is deleted `top_french` is left unchanged (never blank the translator's source). Runs `security definer`, `search_path = public`.

### Description
`lexicon.description text null` (`<= 2000` chars), `lexicon.updated_at` (bumped when the description changes). The existing `"lexicon upvote"` update policy stays, with a `before update` guard trigger that, for the `authenticated` role, restores every column from `old` except `description`. **Exception, the placeholder claim path:** when the row is an untranslated placeholder (`old.bete_phonetic = ''`), the guard also lets `bete_word`, `bete_phonetic`, `pos`, `notes`, `dialect` through and stamps `created_by = auth.uid()`, `source = 'contributed'`. This keeps the existing flow where the homepage word of the day and the contribution form (`&id=`) fill in a placeholder. `top_french`, `upvotes`, `validated` are never client-writable (only the sync trigger changes `top_french`). The vote RPC and service role are unaffected (guard checks `current_user`). The page shows `description`, falling back to the legacy `notes`.

### Votes
`upvotes` column and the RPC lexicon branch stay in the DB; the app stops reading or showing them for the lexicon.

## Search

`search_lexicon(q text, p_dialect text default null, p_pos text default null, p_limit int default 20, p_offset int default 0)` (`p_dialect` null = all dialects, limit capped at 50) (stable SQL function, `unaccent` + `ilike`):
- matches `bete_phonetic`, `bete_word`, and any `lexicon_translations.french`;
- excludes `_pending_` / empty `bete_phonetic` rows and `pos` containing `fragment`;
- ranks exact (3) > prefix (2) > contains (1), best rank across matching fields, ties by `bete_phonetic`;
- returns lexicon columns plus a `matched_french text[]`/`total_count` so the UI can show which translation matched.
Requires the `unaccent` extension (`create extension if not exists unaccent`). `q` is trimmed; `%` and `_` escaped.

Callers: `HeaderSearch`, `LexiconSearch`, and a new search box on `/lexicon` (replaces the letter-only filtering when text is entered). The list page sorts alphabetically on `bete_phonetic` instead of `upvotes`.

## UI

### `/lexicon/[id]`
- Header: both Bété forms (western primary, IPA in brackets), POS badges. No vote buttons.
- Description block; "Modifier" for logged-in users (inline textarea, save).
- Translations list: French + context, author name; own rows editable/deletable. "Ajouter une traduction" form (French, optional context).
- Existing NT examples section unchanged.
- Metadata: `description` is used for the meta description when present; JSON-LD `DefinedTerm.description` lists all translations. `_pending_` entries stay `noindex`.

### Cards / list
`WordCard`, `ListRow`, `LexiconEntry` drop the vote UI and the `upvotes`/`french_candidates` percentages; show `top_french` and, when more exist, "+N autres sens".

### Contribution form
Word submission continues to create a `lexicon` row; its French field creates the first translation row (the sync trigger keeps `top_french`).

## Out of scope
Comments on words, description revision history, removal of the `upvotes` column.

## Testing
- RLS (`npm run test:rls`): translations own-only CRUD, guard columns frozen, anonymous cannot write, description-only update on `lexicon`, bete forms cannot be changed by a client.
- Unit: search ranking and accent-insensitivity, query escaping.
- Migration check: every non-placeholder word has at least one translation after backfill; `top_french` unchanged.
- Local apply via docker exec psql per existing harness; Safari 16.1 constraints respected in any new UI.
