# Pronunciation audio for lexicon entries

Date: 2026-10-04

## Goal

Anyone signed in can record how a lexicon word is pronounced; anyone can listen, on the entry page and from the word detail of a resource. The lexicon is community-built, so recordings are too: several per entry, each credited to its author, with a way to report a bad one.

## Decisions (agreed)

- **Several recordings per entry, open to any signed-in user**, each shown with its author's name. Only the author or an admin can delete one.
- **Where:** the lexicon entry page (listen, record, delete, report) and the reader's word detail (play). The word-link editor is unchanged; the recorder is a reusable component so it can be added there later.
- **Moderation:** a listener can report a recording with a message; reports use the existing corrections system. The author or an admin dismisses the report or deletes the recording.
- **Public audio:** the bucket is public, so playing needs no sign-in and no signed URLs.

## Out of scope

- Recording from the word-link editor.
- Per-spelling or per-sense recordings (a recording belongs to the entry).
- Voting, ranking or "official" recordings, transcoding, trimming, waveform display.
- Recordings for expressions, grammar rules or resources.
- Deleting the storage file when an entry is deleted by cascade (the file stays as an unlisted orphan).

## Data model (one migration: `supabase/migrations/20261009000000_lexicon_pronunciations.sql`)

Re-runnable (`if not exists`, `create or replace`, `drop policy if exists` before each `create policy`, `drop trigger if exists` before each `create trigger`).

### 1. Storage bucket `lexicon-pronunciations`

Public, `file_size_limit` 1 MB (1048576), `allowed_mime_types` `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`. Path convention: `{author_id}/{lexicon_id}/{timestamp}.{ext}`.
Policies on `storage.objects` for this bucket: insert for `authenticated` when the first folder equals `auth.uid()`; delete when the first folder equals `auth.uid()` or `is_admin()`; no select policy is needed (public bucket), none is added.

### 2. Table `lexicon_pronunciations`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| lexicon_id | uuid not null | FK `lexicon` on delete cascade |
| audio_path | text not null unique | storage path, `char_length <= 300` |
| created_by | uuid not null | FK `auth.users` on delete cascade (the recordings of a deleted account go with it) |
| created_at | timestamptz | default now() |

Index on `(lexicon_id, created_at desc)`. RLS: select for everyone; no insert/update/delete policy (writes only through the functions below).

### 3. Functions

`security definer`, `set search_path = public`, revoked from `public` and `anon`, granted to `authenticated`.

- **`add_lexicon_pronunciation(p_lexicon_id uuid, p_path text) returns uuid`.** Errors (plain codes): `not_signed_in`, `entry_not_found`, `bad_path` (the path must be `{auth.uid()}/{p_lexicon_id}/…` with one of the four extensions), `file_not_found` (no `storage.objects` row in the bucket with that name), `too_many` (the caller already has 3 recordings on this entry). Inserts the row and returns its id.
- **`delete_lexicon_pronunciation(p_id uuid) returns text`.** The author or an admin only (`not_allowed` otherwise, `not_found` when missing). Deletes the row (the corrections cleanup trigger removes its reports) and returns the storage path so the client can remove the file.

### 4. Reports through the corrections system

- `corrections.target_type` check gains `'pronunciation'`.
- `correction_column`: `pronunciation.audio` maps to `lexicon_pronunciations.audio_path`. The guard then reads `created_by` and the current value like for any target, rejects reporting your own recording, and enforces the open-report limits already in place.
- `corrections_guard`: label = the entry's spelling (`bete_phonetic`), `ref_id` = the entry id, so the review list links to the entry page.
- `corrections_cleanup` trigger on `lexicon_pronunciations` with target type `pronunciation`.
- A report on a recording has a message and no suggestion. `accept_correction` already refuses a report without suggestion; `reject_correction` (dismiss) works for the author or an admin.
- The TypeScript mirror `web/lib/corrections.ts` gains the `pronunciation` target with the field `audio` (label « Enregistrement »); the existing test keeps both in step.

### 5. Entry data for readers

`lexicon_summary` gains `audio`: the 3 most recent recordings `[{id, path, author}]` (author = the profile name, `'Contributeur'` when empty). `get_lexicon_entry` and `get_resource_words` return it through the summary, so the reader needs no extra request. `find_lexicon_candidates` returns it too (harmless).

## Web

### Recorder

`web/components/courses/PronunciationRecorder.tsx` gets optional props `maxSeconds` (default `MAX_RECORDING_SECONDS`), `startLabel`, `sendLabel` (defaults keep today's texts). The course exercise is unchanged. Lexicon use: 10 seconds, « Enregistrer la prononciation », « Publier ». The size check (1 MB) happens before the upload with a French message.

### Pure helpers and data layer

- `web/lib/lexicon-audio.ts`: `LEXICON_AUDIO_BUCKET`, `MAX_LEXICON_AUDIO_SECONDS = 10`, `MAX_LEXICON_AUDIO_BYTES = 1048576`, `MAX_PER_USER = 3`, `lexiconAudioPath(userId, lexiconId, nowMs, ext)` (extension from the existing `extensionForMime`), `checkAudioSize(blob)` (French message or null).
- `web/lib/lexicon-audio-data.ts`: `publicAudioUrl(client, path)`, `uploadPronunciation(client, {userId, lexiconId, blob})` (upload, then `add_lexicon_pronunciation`; removes the file if the function refuses), `deletePronunciation(client, id)` (function, then removes the file), `listPronunciations(client, lexiconId)` for the entry page, with French error messages for the plain codes.

### Entry page `/lexicon/[id]`

New section « Prononciation » under the entry card (also on marker entries): each recording has an audio player, the author's name and the date. The author or an admin sees « Supprimer »; any other signed-in user sees « Signaler » (a short message box that creates the correction). Signed-in users see the recorder, unless they have 3 recordings on this entry (a sentence says so). Visitors can listen; a line invites them to sign in to record.

### Reader (`VerseWords`)

In the « Dans le lexique » part of the word detail, a play button appears when the entry has recordings; it plays the most recent one, loading the audio only when pressed. With several recordings a « Voir toutes les prononciations » link leads to the entry page. No recording means nothing is shown.

### Review of reports

The existing `/corrections` page must show a message-only report on a recording: label, the message, a link to the entry, and « Supprimer l'enregistrement » for the author or an admin next to « Ignorer ». The plan reads that page first and adapts it where it assumes replacement text.

Styling uses existing Tailwind tokens; nothing that needs `color-mix` or `:has()` (Safari 16.1 floor). The recorder already picks `audio/mp4` for Safari.

## Data integrity rules

- A row exists only if its file existed under the author's own folder when it was added.
- At most 3 recordings per user per entry.
- Deleting an entry deletes its rows and their reports; the files stay unlisted.
- Reports die with their recording; a user cannot report their own recording.
- Clients cannot insert, update or delete `lexicon_pronunciations` rows directly.

## Edge cases

- Upload succeeds but the function refuses (limit, deleted entry): the client removes the file and shows the French message.
- Two files added for the same path: the unique constraint refuses the second.
- Microphone denied or unsupported browser: the recorder's existing French messages.
- A recording longer than 10 s is cut by the recorder; one over 1 MB is refused before upload.
- The entry deleted while someone is recording: `entry_not_found`.
- A signed-out visitor sees no recorder and no report button.

## Testing

- **SQL / RLS** (run one file at a time): table not writable by clients; `add_lexicon_pronunciation` (own folder only, missing file, wrong entry, 4th recording refused, anonymous refused); `delete_lexicon_pronunciation` (author, admin, other user refused, returns the path); cascade with the entry; reports (create, own recording refused, duplicate open report refused, cleanup on delete, accept refused without suggestion, dismiss by author/admin); bucket limits and folder rule via the storage API; `lexicon_summary.audio` (3 most recent, author name); the corrections allow-list and its TypeScript mirror.
- **Unit:** `lexicon-audio.ts` helpers, the data layer with a fake client (error mapping, cleanup of the file on refusal), the recorder props (static markup).
- **Component (static markup):** the entry section for the author, an admin, another user and a signed-out visitor; the reader play button with and without recordings.
- **Manual:** real microphone and playback in Chrome and Safari cannot be automated; the plan lists the check and the report says what was not verified.

## Rollout

The migration only adds (table, bucket, functions, one check-constraint change, trigger); apply it by hand in the SQL editor of project `agdqbzbjcxrzfhkvempe` before deploying the frontend (the MCP tool may refuse the constraint change). The previous frontend ignores the new `audio` field, so applying first is safe.

## Open decisions (defaults chosen, change if you disagree)

1. **10 seconds and 1 MB** per recording, **3 recordings per user per entry**.
2. **Most recent first** in the reader; no ranking.
3. **Public bucket**: anyone with a file URL can play it, which is intended; nothing private is stored there.
