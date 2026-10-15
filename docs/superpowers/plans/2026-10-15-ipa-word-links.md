# Liens explicites mots API ↔ blocs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the contributor link the IPA words of a verse to the word blocks of the word-link editor, so the IPA no longer needs the same number of words as the Latin text, and make the reader use those links.

**Architecture:** Two new columns on `resource_word_blocks` (`ipa_idx`, `ipa_hash`) and two rewritten SQL functions (`get_resource_words`, `save_resource_verse`) carry the links. The editor's pure state module (`lib/word-link-editor.ts`) gains `ipaIdx` per block (it follows block merges), `toggleIpaWord`, `autoLinkIpa`, `syncIpa`; a small component (`IpaWordsPanel`) shows the IPA words as chips. The reader (`readerTokens`) prefers explicit links, then position, then Latin.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, Tailwind v4, Supabase (hand-applied SQL), Vitest 4 with `renderToStaticMarkup` (no jsdom).

**Spec:** `docs/superpowers/specs/2026-10-15-ipa-word-links-design.md` (builds on `2026-10-14-resource-ipa-text-design.md`)

## Global Constraints

- Work in `web/` on `master`, no branches or worktrees. Run `git branch --show-current` before every commit; stage explicit paths only. Tests from `web/`: `npx vitest run <file>`; type-check `npx tsc --noEmit -p .`; lint `npx eslint <paths>` (the pre-existing error at `components/lexicon/PronunciationSection.tsx:40` is not yours). A repo-scanning test such as `no-vote-ui.test.ts` can time out under load: re-run it alone.
- `web/AGENTS.md`: this Next.js version has breaking changes; this plan only edits plain client components and pure modules.
- UI copy is French with typographic apostrophes (’ U+2019) in JSX text; code and comments in English, short comments explaining *why*. Edit/Write tools only; never PowerShell `Set-Content`/`Out-File` (BOM/CRLF noise); check `git diff --stat` before committing; existing tests are only extended, never rewritten. Keep `\uXXXX` escapes as escapes in tests (the Edit tool can turn them into raw characters: check with grep after editing).
- Every new field of `BlockMeta`, `VerseDraft`, `WordBlock`, `VerseWords`, `BlockInput`, `SavePayload`, `SaveVerseArgs` is **optional** and added to objects **only when it has a value**, so that resources without IPA text produce byte-identical drafts, payloads and RPC arguments to today (existing `toEqual` tests must keep passing untouched).
- Words are split on spaces/tabs/NBSP only (`splitWords`); verse numbers are the n-th non-empty line.
- The migration is applied by hand in production **before** the app is deployed. The app must keep working without it for a resource without IPA text: `p_base_ipa` and `ipa_idx` are only sent for a verse whose draft has an IPA line.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (git commit -F - with a heredoc).

## Review Focus

1. Merging two blocks in the editor pools their IPA links; splitting leaves them with the block that keeps the first word; correcting Latin words never moves IPA links (Task 3).
2. An IPA word can never belong to two blocks: `toggleIpaWord` moves it, and the SQL refuses it (Task 1, Task 3).
3. The IPA line changed after linking: the reader ignores explicit links (`ipa_stale`) and falls back to position then Latin; the editor drops stale links (Tasks 4, 5).
4. Saving explicit links when the resource has no IPA line, or the line moved: clear French error, nothing half-saved (Task 1, Task 2).
5. Old database (migration not applied): reading returns no IPA fields and the reader behaves as before; saving a verse of a resource without IPA text is unchanged (Task 2, Task 5).
6. Blocks whose Latin words are apart: IPA pieces are matched run by run only when the run counts are equal, otherwise all IPA words go on the first piece and the others show “…” (Task 4).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20261015000000_word_block_ipa_links.sql`
- Create: `docs/superpowers/walkthroughs/2026-10-15-ipa-word-links-apply.md`

No automated test (Docker is not available in this environment and the SQL runs only in production). Verification is by diff against the current functions and by the read-only checks in the walkthrough, which the user runs after applying the file by hand.

- [ ] **Step 1: Build the migration from the current functions, mechanically**

`get_resource_words` and `save_resource_verse` are defined in their latest form in `supabase/migrations/20261008000000_lexicon_from_word_links.sql` (`get_resource_words` lines 455–504 including its `revoke`/`grant` lines; `save_resource_verse` lines 507–715 including its `revoke`/`grant`; confirm the line numbers with `grep -n "create or replace function get_resource_words\|create or replace function save_resource_verse\|^revoke execute on function save_resource_verse" <file>` first). **Do not retype them**: create the new file by copying those ranges with a script or `sed -n`, then apply ONLY the edits below with the Edit tool.

File header and table changes (write at the top of the new file):

```sql
-- supabase/migrations/20261015000000_word_block_ipa_links.sql
-- A word block can carry the IPA words of its verse (positions in the verse's IPA line). The links are only valid
-- while the IPA line is the one they were made on, so every block stores the md5 of that line (ipa_hash): editing
-- the IPA text never invalidates the Latin / mot à mot links (verse_hash is unchanged).
-- get_resource_words returns ipa_idx per block and ipa_line / ipa_stale per verse; save_resource_verse takes an
-- optional p_base_ipa (default null: the function then behaves exactly as before).
-- Both functions change signature, so the old ones are dropped first.
-- Apply BEFORE deploying the app version that saves IPA links.
alter table resource_word_blocks add column if not exists ipa_idx int[] not null default '{}';
alter table resource_word_blocks add column if not exists ipa_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resource_word_blocks_ipa_hash_ck') then
    alter table resource_word_blocks
      add constraint resource_word_blocks_ipa_hash_ck check (cardinality(ipa_idx) = 0 or ipa_hash is not null);
  end if;
end $$;
```

Edits to the copied `get_resource_words`:

- G0. Replace the line `create or replace function get_resource_words(p_resource uuid)` with
  ```sql
  drop function if exists get_resource_words(uuid);
  create function get_resource_words(p_resource uuid)
  ```
- G1. Replace `returns table (verse_no int, stale boolean, bete_line text, literal_line text, blocks jsonb)` with
  `returns table (verse_no int, stale boolean, bete_line text, literal_line text, blocks jsonb, ipa_line text, ipa_stale boolean)`.
- G2. Replace `select ct.content_bete, ct.content_literal into t from community_texts ct where ct.id = p_resource;` with
  `select ct.content_bete, ct.content_literal, ct.content_ipa into t from community_texts ct where ct.id = p_resource;`.
- G3. In the `jsonb_build_object(`, after the line `'composition', b.composition,` add the line `'ipa_idx', to_jsonb(b.ipa_idx),`.
- G4. The select list currently ends with a line `         end` followed by `  from (` / `    select b2.verse_no, min(b2.verse_hash) as stored`. Replace that single `         end` line (the one right before `  from (`) with:
  ```sql
           end,
           verse_line(t.content_ipa, s.verse_no),
           exists (
             select 1 from resource_word_blocks bb
             where bb.resource_id = p_resource and bb.verse_no = s.verse_no
               and bb.ipa_hash is not null
               and bb.ipa_hash is distinct from md5(coalesce(verse_line(t.content_ipa, s.verse_no), ''))
           )
  ```

Edits to the copied `save_resource_verse`:

- S0. Replace `create or replace function save_resource_verse(` with
  ```sql
  drop function if exists save_resource_verse(uuid, int, text, text, text, text, jsonb);
  create function save_resource_verse(
  ```
- S1. Replace the two lines `  p_blocks jsonb` / `) returns jsonb` with
  ```sql
    p_blocks jsonb,
    p_base_ipa text default null   -- the verse's IPA line the editor was built on; null: the resource has none
  ) returns jsonb
  ```
- S2. In `declare`, after the line `  v_kind    text;` add:
  ```sql
    v_ipa     text;
    v_il      text;
    v_nipa    int := 0;
    v_seen_i  boolean[];
    v_pidx    int[];
    v_ihash   text;
  ```
- S3. Replace `  select ct.created_by, ct.content_bete, ct.content_literal` / `    into v_owner, v_bete, v_lit` with
  `  select ct.created_by, ct.content_bete, ct.content_literal, ct.content_ipa` / `    into v_owner, v_bete, v_lit, v_ipa`.
- S4. Right after the `text_changed` check (the `if btrim(coalesce(p_base_bete, '') … then raise exception 'text_changed'; end if;` block), insert:
  ```sql
    v_il := verse_line(v_ipa, p_verse);
    if p_base_ipa is not null then
      if v_il is null or btrim(p_base_ipa, E' \t') is distinct from v_il then
        raise exception 'ipa_moved';
      end if;
      v_nipa := word_count(v_il);
      v_ihash := md5(v_il);
    end if;
  ```
- S5. After the line `  v_seen_g := array_fill(false, array[v_ng]);` add `  v_seen_i := array_fill(false, array[greatest(v_nipa, 1)]);`.
- S6. In the `for r in select e as b from jsonb_array_elements(p_blocks) e loop` body, immediately BEFORE the line `    if coalesce((r.b ->> 'solo')::boolean, false) then` (its first occurrence), insert:
  ```sql
      v_pidx := array(select jsonb_array_elements_text(
        case when jsonb_typeof(r.b -> 'ipa_idx') = 'array' then r.b -> 'ipa_idx' else '[]'::jsonb end))::int[];
      if cardinality(v_pidx) > 0 then
        if p_base_ipa is null then
          raise exception 'ipa_not_based';
        end if;
        for v_i in 1 .. cardinality(v_pidx) loop
          if v_pidx[v_i] < 0 or v_pidx[v_i] >= v_nipa then
            raise exception 'ipa_index_out_of_range';
          end if;
          if v_i > 1 and v_pidx[v_i] <= v_pidx[v_i - 1] then
            raise exception 'ipa_index_not_increasing';
          end if;
          if v_seen_i[v_pidx[v_i] + 1] then
            raise exception 'ipa_word_in_two_blocks';
          end if;
          v_seen_i[v_pidx[v_i] + 1] := true;
        end loop;
      end if;

  ```
- S7. In the `insert into resource_word_blocks` statement: change the column list `lexicon_id, translation_id)` to `lexicon_id, translation_id, ipa_idx, ipa_hash)`; change the select list's last two values (`nullif(x.e ->> 'lexicon_id', '')::uuid,` / `nullif(x.e ->> 'translation_id', '')::uuid`) to
  ```sql
           nullif(x.e ->> 'lexicon_id', '')::uuid,
           nullif(x.e ->> 'translation_id', '')::uuid,
           x.pi,
           case when p_base_ipa is not null then v_ihash end
  ```
  and in the inner `select e, array(...) as bi, array(...) as gi` add a third computed column after `gi`:
  ```sql
           , array(select jsonb_array_elements_text(
               case when jsonb_typeof(e -> 'ipa_idx') = 'array' then e -> 'ipa_idx' else '[]'::jsonb end))::int[] as pi
  ```
- S8. In the last two lines (`revoke execute on function save_resource_verse(...)` and `grant execute on function save_resource_verse(...)`) append `, text` to the argument type list: `(uuid, int, text, text, text, text, jsonb, text)`.

- [ ] **Step 2: Verify the copy is faithful**

Run (from the repo root; replace the line ranges with the ones found in Step 1):
```bash
diff <(sed -n 455,504p supabase/migrations/20261008000000_lexicon_from_word_links.sql) <(awk '/^drop function if exists get_resource_words/,/^grant execute on function get_resource_words/' supabase/migrations/20261015000000_word_block_ipa_links.sql)
diff <(sed -n 507,715p supabase/migrations/20261008000000_lexicon_from_word_links.sql) <(awk '/^drop function if exists save_resource_verse/,/^grant execute on function save_resource_verse/' supabase/migrations/20261015000000_word_block_ipa_links.sql)
```
Expected: the only differences are the edits G0–G4 / S0–S8 above (no other line changed or lost). Paste both diffs in your report. Also run `grep -c "ipa" supabase/migrations/20261015000000_word_block_ipa_links.sql` (a sanity count) and check that the file contains each of the strings `ipa_moved`, `ipa_not_based`, `ipa_index_out_of_range`, `ipa_index_not_increasing`, `ipa_word_in_two_blocks`.

- [ ] **Step 3: Walkthrough for the person who applies it**

Create `docs/superpowers/walkthroughs/2026-10-15-ipa-word-links-apply.md` (French) with: (1) what the migration does in two sentences; (2) how to apply it (paste the file in the Supabase SQL editor, project `agdqbzbjcxrzfhkvempe`, run once); (3) read-only checks to run afterwards, each with the expected result:
```sql
select column_name, data_type from information_schema.columns
 where table_name = 'resource_word_blocks' and column_name in ('ipa_idx', 'ipa_hash');            -- 2 rows
select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'save_resource_verse';                                  -- ends with ", p_base_ipa text"
select verse_no, stale, ipa_line is not null as has_ipa, ipa_stale, jsonb_array_length(blocks) as blocks
 from get_resource_words('43259afc-d7c3-4944-a7c3-0dae605b9869');                                   -- 5 rows, stale = false, ipa_stale = false
select blocks -> 0 -> 'ipa_idx' as first_block_ipa from get_resource_words('43259afc-d7c3-4944-a7c3-0dae605b9869') limit 1;  -- []
```
(4) the rollback: drop the two new functions, then run again the two function definitions of `20261008000000_lexicon_from_word_links.sql` (lines found in Step 1, say which); the columns can stay (they are harmless) or be dropped with `alter table resource_word_blocks drop constraint resource_word_blocks_ipa_hash_ck, drop column ipa_idx, drop column ipa_hash;`.

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add supabase/migrations/20261015000000_word_block_ipa_links.sql docs/superpowers/walkthroughs/2026-10-15-ipa-word-links-apply.md
git commit -F - <<'EOF'
feat(resources): store explicit IPA word links on word blocks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Types and data layer

**Files:**
- Modify: `web/lib/word-blocks.ts` (`WordBlock`, `VerseWords`, `BlockInput`)
- Modify: `web/lib/word-blocks-data.ts` (`parseBlock`, `parseVerse`, `SAVE_ERROR_MESSAGES`, `SaveVerseArgs`, `saveVerse`)
- Test: `web/__tests__/word-blocks-data.test.ts` (add)

**Interfaces:**
- Produces: `WordBlock.ipa_idx?: number[]`; `VerseWords.ipa_line?: string`, `VerseWords.ipa_stale?: boolean`; `BlockInput.ipa_idx?: number[]`; `SaveVerseArgs.ipaBase?: string | null`.

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/word-blocks-data.test.ts` (reuse its imports; add `parseVerse`, `saveVerse`, `saveErrorMessage` to the import from `../lib/word-blocks-data` if missing; look at how the file builds a fake client for `saveVerse` and reuse it):

```ts
describe('IPA fields of the reading and saving functions', () => {
  const rawVerse = {
    verse_no: 1, stale: false, bete_line: 'a b', literal_line: 'x y',
    blocks: [{ position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null }],
  }

  it('keeps the old shape when the database sends no IPA fields', () => {
    const v = parseVerse(rawVerse)
    expect(v).not.toHaveProperty('ipa_line')
    expect(v).not.toHaveProperty('ipa_stale')
    expect(v.blocks[0]).not.toHaveProperty('ipa_idx')
  })

  it('reads the IPA line, the stale flag and the links of each block', () => {
    const v = parseVerse({
      ...rawVerse, ipa_line: 'ɛ ɩ', ipa_stale: true,
      blocks: [{ ...rawVerse.blocks[0], ipa_idx: [0, 1] }, { ...rawVerse.blocks[0], position: 2, ipa_idx: [] }],
    })
    expect(v.ipa_line).toBe('ɛ ɩ')
    expect(v.ipa_stale).toBe(true)
    expect(v.blocks[0].ipa_idx).toEqual([0, 1])
    expect(v.blocks[1]).not.toHaveProperty('ipa_idx')
  })

  it('translates the new database errors', () => {
    expect(saveErrorMessage('ipa_moved')).toContain('API')
    expect(saveErrorMessage('ipa_not_based')).toContain('API')
    expect(saveErrorMessage('ipa_index_out_of_range')).toContain('API')
    expect(saveErrorMessage('ipa_index_not_increasing')).toContain('API')
    expect(saveErrorMessage('ipa_word_in_two_blocks')).toContain('API')
  })
})
```

And a `saveVerse` test using the file's existing fake `rpc` pattern (copy how the nearest existing `saveVerse` test builds `client` and reads `rpc.mock.calls`):

```ts
  it('sends p_base_ipa only when an IPA base is given', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { saved: 1, verse_hash: 'h' }, error: null })
    const client = { rpc } as unknown as SupabaseClient
    const base = { resourceId: 'R', verseNo: 1, baseBete: 'a', baseLiteral: 'x', beteLine: null, literalLine: null, blocks: [] }
    await saveVerse(client, base)
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_base_ipa')
    await saveVerse(client, { ...base, ipaBase: 'ɛ ɩ' })
    expect(rpc.mock.calls[1][1].p_base_ipa).toBe('ɛ ɩ')
    await saveVerse(client, { ...base, ipaBase: null })
    expect(rpc.mock.calls[2][1]).not.toHaveProperty('p_base_ipa')
  })
```
(import `vi` and `SupabaseClient` type if the file does not already.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run __tests__/word-blocks-data.test.ts`
Expected: FAIL (the new tests; the existing ones still pass).

- [ ] **Step 3: Implement**

`web/lib/word-blocks.ts`: in `WordBlock` add `ipa_idx?: number[]` (comment: positions of the verse's IPA words linked to this block); in `VerseWords` add `ipa_line?: string` and `ipa_stale?: boolean`; in `BlockInput` add `ipa_idx?: number[]`.

`web/lib/word-blocks-data.ts`:
- `parseBlock`: add at the end of the returned object `...(Array.isArray(raw.ipa_idx) && raw.ipa_idx.length > 0 ? { ipa_idx: ints(raw.ipa_idx) } : {}),`.
- `parseVerse`: add after `blocks: blocks.map(parseBlock),` the two spreads `...(typeof raw.ipa_line === 'string' ? { ipa_line: raw.ipa_line } : {}),` and `...(raw.ipa_stale === true ? { ipa_stale: true } : {}),`.
- `SAVE_ERROR_MESSAGES`: add
```ts
  ipa_moved: 'Le texte API de ce vers a changé depuis l’ouverture de la page. Rechargez la page, puis reprenez.',
  ipa_not_based: 'Des mots API sont reliés alors que ce vers n’a pas de ligne API.',
  ipa_index_out_of_range: 'Un bloc désigne un mot API qui n’existe pas.',
  ipa_index_not_increasing: 'Les mots API d’un bloc sont dans le désordre.',
  ipa_word_in_two_blocks: 'Un mot API est dans deux blocs.',
```
- `SaveVerseArgs`: add `/** The verse's IPA line the editor was built on; omit when the resource has no IPA text. */ ipaBase?: string | null`.
- `saveVerse`: add to the rpc arguments `...(a.ipaBase != null ? { p_base_ipa: a.ipaBase } : {}),` (after `p_blocks`).

- [ ] **Step 4: Verify and commit**

Run: `cd web && npx vitest run __tests__/word-blocks-data.test.ts __tests__/word-blocks.test.ts && npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint lib/word-blocks.ts lib/word-blocks-data.ts`
Expected: PASS, clean.

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/word-blocks.ts web/lib/word-blocks-data.ts web/__tests__/word-blocks-data.test.ts
git commit -F - <<'EOF'
feat(resources): read and send the IPA links of word blocks

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Editor state — pure functions

**Files:**
- Modify: `web/lib/word-link-editor.ts`
- Test: `web/__tests__/word-link-editor.test.ts` (add one `describe`)

**Interfaces:**
- Consumes: `WordBlock.ipa_idx`, `VerseWords.ipa_stale` (Task 2); `BlockInput.ipa_idx`.
- Produces (all exported from `lib/word-link-editor.ts`):
  - `BlockMeta.ipaIdx?: number[]`; `VerseDraft.ipa?: string`, `VerseDraft.baseIpa?: string`; `SavePayload.ipaBase?: string`
  - `initDraft(verseNo, bete, literal, saved, ipa?: string)` (new optional 5th argument)
  - `autoLinkIpa(d: VerseDraft): VerseDraft`
  - `toggleIpaWord(d: VerseDraft, key: string, i: number): VerseDraft`
  - `ipaChips(d: VerseDraft, key: string): IpaChip[]` with `interface IpaChip { i: number; word: string; state: 'mine' | 'other' | 'free'; ownerWords: string | null }`
  - `ipaStatus(d: VerseDraft): { words: number; linked: number; unlinked: number }`
  - `syncIpa(d: VerseDraft, initial: VerseDraft): VerseDraft`

Read the existing `web/__tests__/word-link-editor.test.ts` first to reuse its helpers (how it builds a `VerseDraft` and a `VerseWords`), then add (all new tests; the existing ones must stay untouched):

- [ ] **Step 1: Write the failing tests**

```ts
describe('IPA links in the editor state', () => {
  // Latin: "Sê a'a tatini yii" (4 words, one block each); IPA: "Sɛ a'a tatɩnɩ yɩɩ" (4 words)
  const mk = (ipa?: string) => initDraft(1, "Sê a'a tatini yii", 'Comme nous laissons nos', undefined, ipa)
  const keys = (d: VerseDraft) => derive(d).bu.map(blockKey)

  it('keeps a draft without IPA text exactly as before', () => {
    const d = mk()
    expect(d).not.toHaveProperty('ipa')
    expect(d).not.toHaveProperty('baseIpa')
    expect(JSON.stringify(d.meta)).not.toContain('ipaIdx')
    const p = toSave(d)
    expect(p).not.toHaveProperty('ipaBase')
    expect(p.blocks.every(b => !('ipa_idx' in b))).toBe(true)
  })

  it('links by position at the start when both lines have the same number of words', () => {
    const d = mk("Sɛ a'a tatɩnɩ yɩɩ")
    expect(d.ipa).toBe("Sɛ a'a tatɩnɩ yɩɩ")
    expect(d.baseIpa).toBe("Sɛ a'a tatɩnɩ yɩɩ")
    expect(keys(d).map(k => d.meta[k]?.ipaIdx)).toEqual([[0], [1], [2], [3]])
  })

  it('links nothing when the counts differ (the contributor links by hand)', () => {
    const d = mk("Sɛ a'a tatɩ nɩ yɩɩ")
    expect(keys(d).every(k => !d.meta[k]?.ipaIdx?.length)).toBe(true)
  })

  it('autoLinkIpa does nothing when the counts differ and overwrites when they match', () => {
    const odd = mk("Sɛ a'a tatɩ nɩ yɩɩ")
    expect(autoLinkIpa(odd)).toBe(odd)
    const d = toggleIpaWord(mk("Sɛ a'a tatɩnɩ yɩɩ"), keys(mk())[0], 3)
    expect(autoLinkIpa(d).meta[keys(d)[0]].ipaIdx).toEqual([0])
  })

  it('toggleIpaWord links, unlinks and moves a word from another block', () => {
    let d = mk("Sɛ a'a tatɩ nɩ yɩɩ")
    const [k0, k1] = keys(d)
    d = toggleIpaWord(d, k0, 0)
    d = toggleIpaWord(d, k0, 1)
    expect(d.meta[k0].ipaIdx).toEqual([0, 1])
    d = toggleIpaWord(d, k1, 1)                       // moved: a word belongs to one block only
    expect(d.meta[k0].ipaIdx).toEqual([0])
    expect(d.meta[k1].ipaIdx).toEqual([1])
    d = toggleIpaWord(d, k1, 1)                       // unlinked
    expect(d.meta[k1].ipaIdx).toEqual([])
    expect(toggleIpaWord(d, k0, 99)).toBe(d)          // out of range: nothing
  })

  it('ipaChips tells which words are mine, another block’s, or free', () => {
    let d = mk("Sɛ a'a tatɩ nɩ yɩɩ")
    const [k0, k1] = keys(d)
    d = toggleIpaWord(toggleIpaWord(d, k0, 0), k1, 2)
    const chips = ipaChips(d, k0)
    expect(chips.map(c => c.state)).toEqual(['mine', 'free', 'other', 'free', 'free'])
    expect(chips[2]).toMatchObject({ word: 'tatɩ', ownerWords: "a'a" })
  })

  it('ipaStatus counts linked and unlinked IPA words', () => {
    const d = toggleIpaWord(mk("Sɛ a'a tatɩ nɩ yɩɩ"), keys(mk())[0], 0)
    expect(ipaStatus(d)).toEqual({ words: 5, linked: 1, unlinked: 4 })
    expect(ipaStatus(mk())).toEqual({ words: 0, linked: 0, unlinked: 0 })
  })

  it('merging two blocks pools their IPA links; splitting leaves them with the first word', () => {
    const d = mk("Sɛ a'a tatɩnɩ yɩɩ")                 // [0] [1] [2] [3]
    const merged = attachUnits(d, 'b', 2, 3)          // block "tatini yii"
    expect(derive(merged).bu.map(u => merged.meta[blockKey(u)]?.ipaIdx)).toEqual([[0], [1], [2, 3]])
    const back = splitUnit(merged, 'b', 2)
    expect(derive(back).bu.map(u => back.meta[blockKey(u)]?.ipaIdx)).toEqual([[0], [1], [2, 3], undefined])
  })

  it('correcting Latin words does not move IPA links', () => {
    const d = mk("Sɛ a'a tatɩnɩ yɩɩ")
    const unit = derive(d).bu[1]
    const res = editWords(d, 'b', unit, ["a'a", 'ni'])
    if ('error' in res) throw new Error(res.error)
    expect(Object.values(res.draft.meta).flatMap(m => m.ipaIdx ?? []).sort()).toEqual([0, 1, 2, 3].filter(i => i !== 1))
  })

  it('toSave sends ipa_idx for linked blocks and the IPA base line', () => {
    const p = toSave(mk("Sɛ a'a tatɩnɩ yɩɩ"))
    expect(p.ipaBase).toBe("Sɛ a'a tatɩnɩ yɩɩ")
    expect(p.blocks.map(b => b.ipa_idx)).toEqual([[0], [1], [2], [3]])
  })

  it('a saved verse brings its links back, unless they are stale', () => {
    const saved = (stale: boolean) => ({
      verse_no: 1, stale: false, ipa_stale: stale, bete_line: "Sê a'a tatini yii", literal_line: 'Comme nous laissons nos',
      blocks: [0, 1, 2, 3].map(i => ({
        position: i + 1, bete_idx: [i], gloss_idx: [i], is_marker: false, solo: false, note: null, composition: null,
        ...(i === 2 ? { ipa_idx: [2, 3] } : i === 3 ? {} : { ipa_idx: [i] }),
      })),
    })
    const fresh = initDraft(1, "Sê a'a tatini yii", 'Comme nous laissons nos', saved(false), "Sɛ a'a tatɩnɩ yɩɩ")
    expect(derive(fresh).bu.map(u => fresh.meta[blockKey(u)]?.ipaIdx ?? [])).toEqual([[0], [1], [2, 3], []])
    const stale = initDraft(1, "Sê a'a tatini yii", 'Comme nous laissons nos', saved(true), "Sɛ a'a tatɩnɩ yɩɩ")
    expect(derive(stale).bu.map(u => stale.meta[blockKey(u)]?.ipaIdx ?? [])).toEqual([[0], [1], [2], [3]])  // redone by position
  })

  it('syncIpa takes the server’s IPA line and drops links made on an older line', () => {
    const initial = mk("Sɛ a'a tatɩnɩ yɩɩ")
    const sameBase = syncIpa({ ...initial, ipa: 'old' }, initial)
    expect(sameBase.ipa).toBe("Sɛ a'a tatɩnɩ yɩɩ")
    const older = { ...toggleIpaWord(initial, keys(initial)[0], 3), baseIpa: 'an older line' }
    const synced = syncIpa(older, initial)
    expect(synced.baseIpa).toBe("Sɛ a'a tatɩnɩ yɩɩ")
    expect(derive(synced).bu.map(u => synced.meta[blockKey(u)]?.ipaIdx)).toEqual([[0], [1], [2], [3]])
    const noIpa = mk()
    expect(syncIpa(noIpa, noIpa)).toBe(noIpa)
  })
})
```

Import what is missing at the top of the test file from `../lib/word-link-editor` (`autoLinkIpa`, `toggleIpaWord`, `ipaChips`, `ipaStatus`, `syncIpa`, `attachUnits`, `splitUnit`, `editWords`, `toSave`, `initDraft`, `derive`) and from `../lib/word-blocks` (`blockKey`), and the `VerseDraft` type.

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run __tests__/word-link-editor.test.ts`
Expected: FAIL (the new `describe`: missing exports).

- [ ] **Step 3: Implement** (`web/lib/word-link-editor.ts`, Edit tool, read the file first)

1. `BlockMeta`: add `/** Positions (0-based) of the verse's IPA words that belong to this block. */ ipaIdx?: number[]`.
2. `VerseDraft`: add `/** The verse's IPA line (read-only here) and the line the IPA links were made on. */ ipa?: string; baseIpa?: string`.
3. `SavePayload`: add `/** The verse's IPA line the draft was built on; absent when the resource has no IPA text. */ ipaBase?: string`.
4. `initDraft`: new 5th parameter `ipa?: string`. Build `const base = { verseNo, baseBete: bete, baseLiteral: literal, bete, literal, ...(ipa ? { ipa, baseIpa: ipa } : {}) }`. In the saved branch, when filling `meta[...]` add `...(!saved.ipa_stale && b.ipa_idx?.length ? { ipaIdx: b.ipa_idx } : {})` to the meta object. Wrap both return values: `return withAutoIpa({ ...base, attB: {}, attG: autoGroup(splitWords(literal)), meta: {} })` and `return withAutoIpa({ ...base, attB, attG, meta })` where
```ts
/** Without explicit IPA links, link by position when the IPA line has as many words as the Latin line. */
function withAutoIpa(d: VerseDraft): VerseDraft {
  const linked = Object.values(d.meta).some(m => m.ipaIdx?.length)
  return d.ipa && !linked ? autoLinkIpa(d) : d
}
```
5. `rekeyMeta`: after the existing loop (before `return out`) add the pooling step:
```ts
  // IPA links follow the block that contains the old block's first word: merged blocks pool theirs.
  const newKeyOfWord = new Map<number, string>()
  for (const u of after) for (const i of u.idx) newKeyOfWord.set(i, blockKey(u))
  const pooled: Record<string, number[]> = {}
  for (const u of before) {
    const ipa = meta[blockKey(u)]?.ipaIdx
    const nk = ipa?.length ? newKeyOfWord.get(u.idx[0]) : undefined
    if (ipa && nk) pooled[nk] = [...(pooled[nk] ?? []), ...ipa]
  }
  for (const [nk, ipa] of Object.entries(pooled)) {
    out[nk] = { ...(out[nk] ?? EMPTY_META), ipaIdx: [...new Set(ipa)].sort((a, b) => a - b) }
  }
```
6. Add the new exported functions (place them after `unlinkedMarkers`):
```ts
const ipaWordsOf = (d: VerseDraft) => splitWords(d.ipa ?? '')

/** Link every block to the IPA words at the same positions; only when both lines have the same number of words. */
export function autoLinkIpa(d: VerseDraft): VerseDraft {
  const ipaWords = ipaWordsOf(d)
  const { bw, bu } = derive(d)
  if (ipaWords.length === 0 || ipaWords.length !== bw.length) return d
  const meta = { ...d.meta }
  for (const u of bu) {
    const k = blockKey(u)
    meta[k] = { ...(meta[k] ?? EMPTY_META), ipaIdx: u.idx.slice() }
  }
  return { ...d, meta }
}

/** Link the IPA word `i` to the block `key`, or unlink it; a word that belongs to another block is moved. */
export function toggleIpaWord(d: VerseDraft, key: string, i: number): VerseDraft {
  if (i < 0 || i >= ipaWordsOf(d).length) return d
  const mine = d.meta[key]?.ipaIdx ?? []
  const meta: Record<string, BlockMeta> = {}
  for (const [k, m] of Object.entries(d.meta)) {
    meta[k] = k !== key && m.ipaIdx?.includes(i) ? { ...m, ipaIdx: m.ipaIdx.filter(x => x !== i) } : m
  }
  const next = mine.includes(i) ? mine.filter(x => x !== i) : [...mine, i].sort((a, b) => a - b)
  meta[key] = { ...(d.meta[key] ?? EMPTY_META), ipaIdx: next }
  return { ...d, meta }
}

export interface IpaChip {
  i: number
  word: string
  state: 'mine' | 'other' | 'free'
  /** The Latin words of the block that owns this IPA word, when it is another block. */
  ownerWords: string | null
}

/** The IPA words of the verse with who owns each one, from the point of view of the block `key`. */
export function ipaChips(d: VerseDraft, key: string): IpaChip[] {
  const { bw, bu } = derive(d)
  return ipaWordsOf(d).map((word, i) => {
    const owner = bu.find(u => d.meta[blockKey(u)]?.ipaIdx?.includes(i))
    const state = !owner ? 'free' : blockKey(owner) === key ? 'mine' : 'other'
    return { i, word, state, ownerWords: state === 'other' && owner ? blockWords(bw, owner.idx) : null }
  })
}

export function ipaStatus(d: VerseDraft): { words: number; linked: number; unlinked: number } {
  const words = ipaWordsOf(d).length
  const keys = new Set(derive(d).bu.map(blockKey))
  const linked = new Set(Object.entries(d.meta).filter(([k]) => keys.has(k)).flatMap(([, m]) => m.ipaIdx ?? [])).size
  return { words, linked, unlinked: words - linked }
}

/**
 * The IPA line is not editable here: always take the server's. A draft made on an older IPA line has IPA links
 * that no longer point at the same words: drop them and link by position again when possible.
 */
export function syncIpa(d: VerseDraft, initial: VerseDraft): VerseDraft {
  if (d.ipa === undefined && initial.ipa === undefined) return d
  if ((d.baseIpa ?? '') === (initial.baseIpa ?? '')) return { ...d, ipa: initial.ipa, baseIpa: initial.baseIpa }
  const meta = Object.fromEntries(Object.entries(d.meta).map(([k, m]) => [k, { ...m, ipaIdx: [] }]))
  return autoLinkIpa({ ...d, meta, ipa: initial.ipa, baseIpa: initial.baseIpa })
}
```
7. `toSave`: in the block mapper add `...(m.ipaIdx?.length ? { ipa_idx: m.ipaIdx } : {}),` to the returned object; in the final return add `...(d.baseIpa ? { ipaBase: d.baseIpa } : {}),`.

(`syncIpa`'s first branch with `ipa: initial.ipa` when `initial.ipa` is undefined yields an explicit undefined key; `JSON.stringify` drops it, so the editor's dirty check is unaffected.)

- [ ] **Step 4: Verify and commit**

Run: `cd web && npx vitest run __tests__/word-link-editor.test.ts __tests__/word-link-status.test.ts __tests__/word-link-panels.test.tsx && npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint lib/word-link-editor.ts`
Expected: PASS (existing tests untouched), clean. If an existing `toEqual` test fails because an object gained a key, the cause is a key added when it should not be: fix the code (conditional spread), not the test.

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/word-link-editor.ts web/__tests__/word-link-editor.test.ts
git commit -F - <<'EOF'
feat(resources): keep IPA word links in the word-link editor state

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Reader

**Files:**
- Modify: `web/lib/ipa-alignment.ts` (`IpaVerse.all`)
- Modify: `web/lib/word-blocks.ts` (`readerTokens`)
- Modify: `web/components/VerseWords.tsx` (prop `ipaAll`)
- Modify: `web/components/VerseTranslation.tsx` (pass `ipaAll`, adjust the mismatch note)
- Test: `web/__tests__/ipa-alignment.test.ts`, `web/__tests__/word-blocks.test.ts`, `web/__tests__/verse-words.test.tsx`, `web/__tests__/verse-translation-ipa.test.tsx` (additions only)

**Interfaces:**
- Consumes: `WordBlock.ipa_idx`, `VerseWords.ipa_stale` (Task 2).
- Produces: `IpaVerse.all: string[]` (all the IPA words of the verse's line, `[]` when there is none); `readerTokens(verse, ipaWords?, ipaAll?)`; `VerseWords` prop `ipaAll?: string[] | null`.

- [ ] **Step 1: Write the failing tests**

Add to `web/__tests__/ipa-alignment.test.ts`:
```ts
describe('IpaVerse.all', () => {
  it('lists every IPA word of the line, even when the counts differ', () => {
    const v = alignIpa("a b c", "x y")
    expect(v[0]).toMatchObject({ status: 'words-differ', words: null, all: ['x', 'y'] })
    expect(alignIpa('a b', 'x y')[0].all).toEqual(['x', 'y'])
    expect(alignIpa('a b', null)[0].all).toEqual([])
    expect(alignIpa('a b\nc', 'x y')[1].all).toEqual([])
  })
})
```

Add to `web/__tests__/word-blocks.test.ts`, inside or after the existing `describe('readerTokens with IPA words'`, reusing its `verse` fixture style (a verse `Sê a tatini yii` with blocks `[0]`, `[1]`, `[2,3]`; build a new one with `ipa_idx` on the blocks):
```ts
describe('readerTokens with explicit IPA links', () => {
  const blk = (position: number, bete: number[], gloss: number[], ipa?: number[]) => ({
    position, bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null,
    ...(ipa ? { ipa_idx: ipa } : {}),
  })
  const verse = (blocks: ReturnType<typeof blk>[], extra = {}) => ({
    verse_no: 1, stale: false, bete_line: 'Sê a tatini yii', literal_line: 'Comme nous laissons', blocks, ...extra,
  })
  const IPA = ['Sɛ', 'a', 'ta', 'tɩnɩ', 'yɩɩ']   // 5 IPA words for 4 Latin words: positions do not line up

  it('uses the explicit links when the counts differ', () => {
    const t = readerTokens(verse([blk(1, [0], [0], [0]), blk(2, [1], [1], [1]), blk(3, [2, 3], [2], [2, 3, 4])]), null, IPA)
    expect(t.map(x => x.ipa)).toEqual(['Sɛ', 'a', 'ta tɩnɩ yɩɩ'])
    expect(t[2].wholeIpa).toBe('ta tɩnɩ yɩɩ')
  })

  it('ignores explicit links of a stale IPA line and falls back to position, then to nothing', () => {
    const blocks = [blk(1, [0], [0], [0]), blk(2, [1], [1], [1]), blk(3, [2, 3], [2], [2, 3, 4])]
    const stale = readerTokens(verse(blocks, { ipa_stale: true }), null, IPA)
    expect(stale.every(x => x.ipa === null)).toBe(true)
    const positional = readerTokens(verse(blocks, { ipa_stale: true }), ['A', 'B', 'C', 'D'], IPA)
    expect(positional.map(x => x.ipa)).toEqual(['A', 'B', 'C D'])
  })

  it('ignores a link that points past the IPA words', () => {
    const t = readerTokens(verse([blk(1, [0], [0], [9]), blk(2, [1], [1]), blk(3, [2, 3], [2])]), null, IPA)
    expect(t.every(x => x.ipa === null)).toBe(true)
  })

  it('a block without links uses the position fallback when the counts are equal', () => {
    const t = readerTokens(verse([blk(1, [0], [0], [0]), blk(2, [1], [1]), blk(3, [2, 3], [2])]), ['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D'])
    expect(t.map(x => x.ipa)).toEqual(['A', 'B', 'C D'])
  })

  it('for a block whose Latin words are apart: run by run when the run counts are equal, else all on the first piece', () => {
    const apart = (ipa: number[]) => readerTokens(
      verse([blk(1, [0], [0]), blk(2, [1], [1]), blk(3, [2, 3], [2]), blk(4, [4], [3], undefined)], { bete_line: 'a b c d e' }), null, null,
    ) && readerTokens(
      { verse_no: 1, stale: false, bete_line: 'a b c d e', literal_line: 'x y z w', blocks: [blk(1, [0], [0]), blk(2, [1], [1]), blk(3, [2, 4], [2], ipa), blk(4, [3], [3])] },
      null, ['I0', 'I1', 'I2', 'I3', 'I4', 'I5'],
    )
    const equalRuns = apart([2, 5])         // two Latin pieces [2] and [4]; two IPA runs [2] and [5]
    expect(equalRuns.filter(x => x.bid === '1:3').map(x => x.ipa)).toEqual(['I2', 'I5'])
    const unequal = apart([2, 3, 4])        // one IPA run of three words for two Latin pieces
    expect(unequal.filter(x => x.bid === '1:3').map(x => x.ipa)).toEqual(['I2 I3 I4', '…'])
  })
})
```
(The `apart` helper above is deliberately written so that the first `readerTokens(...) &&` call is ignored: it is a leftover guard; simplify it to a plain function returning the second call if you prefer, but keep the two assertions.)

Add to `web/__tests__/verse-words.test.tsx` (additions): a test that `VerseWords` with `script="ipa"` and `ipaAll` shows the explicit IPA words of a block whose Latin and IPA counts differ (build a `VerseData` with `ipa_idx` on the blocks, pass `ipaAll`, assert via the existing `buttons` helper).

Add to `web/__tests__/verse-translation-ipa.test.tsx` (additions): `VerseTranslation` with `words` that carry `ipa_idx`, an IPA text whose word count differs from the Latin line, `defaultScript="ipa"` → the output contains the explicit IPA word and does NOT contain the "ne correspond" note; the same verse with `ipa_stale: true` shows the Latin words and the note.

- [ ] **Step 2: Run to verify they fail**

Run: `cd web && npx vitest run __tests__/ipa-alignment.test.ts __tests__/word-blocks.test.ts __tests__/verse-words.test.tsx __tests__/verse-translation-ipa.test.tsx`
Expected: FAIL (new tests).

- [ ] **Step 3: Implement**

`web/lib/ipa-alignment.ts`: add `/** Every word of the IPA line (empty when the verse has no IPA line). */ all: string[]` to `IpaVerse`; in `alignIpa` return `all: []` for the `none` and `line-missing` branches and `all: words` for the two others (compute `const words = splitWords(line)` once, before the equality test, as the code already does).

`web/lib/word-blocks.ts` `readerTokens(verse, ipaWords?, ipaAll?)`:
```ts
export function readerTokens(verse: VerseWords, ipaWords?: string[] | null, ipaAll?: string[] | null): ReaderToken[] {
  const bw = splitWords(verse.bete_line)
  const gw = splitWords(verse.literal_line)
  // Positional IPA words only when they line up one to one with the Latin words.
  const iw = ipaWords && ipaWords.length === bw.length ? ipaWords : null
  // Explicit links only while the IPA line is the one they were made on.
  const all = verse.ipa_stale ? null : ipaAll ?? null
  const out: ReaderToken[] = []
  for (const b of verse.blocks) {
    const runs = splitRuns(b.bete_idx)
    const names = runs.map(r => r.map(i => bw[i] ?? '').join(' '))
    const link = b.ipa_idx ?? []
    let ipaNames: string[] | null = null
    let wholeIpa: string | null = null
    if (all && link.length > 0 && link.every(i => i >= 0 && i < all.length)) {
      const ipaRuns = splitRuns(link)
      ipaNames = ipaRuns.length === runs.length
        ? ipaRuns.map(r => r.map(i => all[i]).join(' '))
        : runs.map((_, k) => (k === 0 ? link.map(i => all[i]).join(' ') : '…'))
      wholeIpa = labelOf(all, link)
    } else if (iw) {
      ipaNames = runs.map(r => r.map(i => iw[i] ?? '').join(' '))
      wholeIpa = labelOf(iw, b.bete_idx)
    }
    runs.forEach((r, k) =>
      out.push({
        /* …every field exactly as today, except: */
        ipa: ipaNames ? ipaNames[k] : null,
        wholeIpa,
        /* … */
      }),
    )
  }
  return out.sort((a, b) => a.start - b.start)
}
```
Keep every other field of the pushed object as it is today (read the current function and only replace the `ipa`/`wholeIpa` lines and add the new locals; the existing `iw` computation and `ipaNames` for positional are replaced by the code above).

`web/components/VerseWords.tsx`: add `ipaAll?: string[] | null` to `Props`, destructure it (default `null`) and pass it: `readerTokens(verse, ipaWords, ipaAll)`.

`web/components/VerseTranslation.tsx` (`VerseRow`): pass `ipaAll={ipaVerse?.all?.length ? ipaVerse.all : null}` to `<VerseWords …>`; change the mismatch note condition so that it only shows when the verse has no usable explicit links: compute `const explicit = Boolean(words && !words.ipa_stale && words.blocks.some(b => b.ipa_idx?.length))` and use `words && ipaVerse.status === 'words-differ' && !explicit` for the “ne correspond pas” note (keep its text).

- [ ] **Step 4: Verify and commit**

Run: `cd web && npx vitest run __tests__/ipa-alignment.test.ts __tests__/word-blocks.test.ts __tests__/verse-words.test.tsx __tests__/verse-translation-ipa.test.tsx __tests__/verse-translation-words.test.tsx __tests__/verse-translation-literal-toggle.test.tsx && npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint lib/ipa-alignment.ts lib/word-blocks.ts components/VerseWords.tsx components/VerseTranslation.tsx`
Expected: PASS, clean.

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/lib/ipa-alignment.ts web/lib/word-blocks.ts web/components/VerseWords.tsx web/components/VerseTranslation.tsx web/__tests__/ipa-alignment.test.ts web/__tests__/word-blocks.test.ts web/__tests__/verse-words.test.tsx web/__tests__/verse-translation-ipa.test.tsx
git commit -F - <<'EOF'
feat(resources): read IPA words from explicit block links

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: The editor interface

**Files:**
- Create: `web/components/word-link/IpaWordsPanel.tsx`
- Modify: `web/components/word-link/BlockPanel.tsx`
- Modify: `web/components/word-link/WordLinkEditor.tsx`
- Modify: `web/app/resources/[id]/relier/page.tsx` (only if `ipaLines` wiring needs it; it already passes `ipaLines`)
- Test: `web/__tests__/word-link-ipa-panel.test.tsx` (create)

**Interfaces:**
- Consumes: `ipaChips`, `ipaStatus`, `toggleIpaWord`, `autoLinkIpa`, `syncIpa`, `initDraft(…, ipa)` (Task 3); `saveVerse` arg `ipaBase` (Task 2); `VerseWords.ipa_stale` (Task 2).
- Produces: `IpaWordsPanel({ draft, blockKey, onChange })`.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/word-link-ipa-panel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IpaWordsPanel } from '../components/word-link/IpaWordsPanel'
import { derive, initDraft, toggleIpaWord } from '../lib/word-link-editor'
import { blockKey } from '../lib/word-blocks'

const draft = (ipa?: string) => initDraft(1, "Sê a'a tatini yii", 'Comme nous laissons nos', undefined, ipa)
const decode = (s: string) => s.replace(/&#x27;/g, "'")

describe('IpaWordsPanel', () => {
  it('renders nothing when the verse has no IPA line', () => {
    const d = draft()
    expect(renderToStaticMarkup(<IpaWordsPanel draft={d} blockKey={blockKey(derive(d).bu[0])} onChange={() => {}} />)).toBe('')
  })

  it('shows each IPA word as a button, pressed when it belongs to the block, with the linked count', () => {
    let d = draft("Sɛ a'a ta tɩnɩ yɩɩ")                     // 5 IPA words, 4 Latin: nothing linked yet
    const k0 = blockKey(derive(d).bu[0])
    const k1 = blockKey(derive(d).bu[1])
    d = toggleIpaWord(toggleIpaWord(d, k0, 0), k1, 1)
    const html = decode(renderToStaticMarkup(<IpaWordsPanel draft={d} blockKey={k0} onChange={() => {}} />))
    expect(html).toContain('Mots en API')
    expect([...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)</g)].map(m => `${m[2]}:${m[1]}`))
      .toEqual(['Sɛ:true', "a'a:false", 'ta:false', 'tɩnɩ:false', 'yɩɩ:false'])
    expect(html).toContain('2 mots sur 5')                     // linked words of the verse
    expect(html).toContain('non relié')                        // wording of the unlinked count
  })

  it('offers "Relier par position" only when the counts are equal', () => {
    const equal = draft("Sɛ a'a tatɩnɩ yɩɩ")
    const k = blockKey(derive(equal).bu[0])
    expect(renderToStaticMarkup(<IpaWordsPanel draft={equal} blockKey={k} onChange={() => {}} />)).toContain('Relier par position')
    const odd = draft("Sɛ a'a ta tɩnɩ yɩɩ")
    expect(renderToStaticMarkup(<IpaWordsPanel draft={odd} blockKey={blockKey(derive(odd).bu[0])} onChange={() => {}} />)).not.toContain('Relier par position')
  })

  it('shows which block owns a word that is not this block’s', () => {
    let d = draft("Sɛ a'a ta tɩnɩ yɩɩ")
    const [k0, k1] = derive(d).bu.map(blockKey)
    d = toggleIpaWord(d, k1, 2)
    const html = decode(renderToStaticMarkup(<IpaWordsPanel draft={d} blockKey={k0} onChange={() => {}} />))
    expect(html).toContain("a'a")                              // the owner's Latin words, in the word's title
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run __tests__/word-link-ipa-panel.test.tsx`
Expected: FAIL — cannot resolve `IpaWordsPanel`.

- [ ] **Step 3: Implement the panel**

Create `web/components/word-link/IpaWordsPanel.tsx`:

```tsx
'use client'
import { cn } from '@/lib/utils'
import { splitWords } from '@/lib/word-blocks'
import { autoLinkIpa, derive, ipaChips, ipaStatus, toggleIpaWord, type VerseDraft } from '@/lib/word-link-editor'

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors'

interface Props {
  draft: VerseDraft
  /** The selected block (its Latin words' key). */
  blockKey: string
  onChange: (d: VerseDraft) => void
}

/** « Mots en API » of the selected block: tap an IPA word of the verse to link it to this block, or to unlink it. */
export function IpaWordsPanel({ draft, blockKey, onChange }: Props) {
  if (!draft.ipa) return null
  const chips = ipaChips(draft, blockKey)
  const status = ipaStatus(draft)
  const sameCount = status.words === derive(draft).bw.length && splitWords(draft.ipa).length === status.words

  return (
    <div className="space-y-2 rounded-md border border-border p-2.5">
      <p className="text-xs font-semibold">Mots en API</p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(c => (
          <button
            key={c.i}
            type="button"
            aria-pressed={c.state === 'mine'}
            title={c.state === 'other' ? `Relié à « ${c.ownerWords} » : toucher pour le déplacer ici` : undefined}
            onClick={() => onChange(toggleIpaWord(draft, blockKey, c.i))}
            className={cn(
              'phonetic rounded-md border px-2 py-1 text-sm',
              c.state === 'mine' && 'border-primary bg-primary text-primary-foreground',
              c.state === 'other' && 'border-border bg-muted text-muted-foreground',
              c.state === 'free' && 'border-border bg-background',
            )}
          >
            {c.word}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {status.linked} mots sur {status.words} reliés{status.unlinked > 0 ? ` (${status.unlinked} non relié${status.unlinked > 1 ? 's' : ''}, absents de la vue mot par mot)` : ''}.
      </p>
      {sameCount && (
        <button type="button" className={btn} onClick={() => onChange(autoLinkIpa(draft))}>
          Relier par position
        </button>
      )}
    </div>
  )
}
```
The panel's `sameCount` compares the IPA word count with the draft's Latin word count (`derive(draft).bw.length`); if that expression feels redundant, simplify it to `status.words === derive(draft).bw.length` (they are the same value) — keep the behaviour covered by the third test.

- [ ] **Step 4: Wire the editor**

`web/components/word-link/BlockPanel.tsx`:
1. Import `IpaWordsPanel` and `splitWords` (add `splitWords` to the existing import from `@/lib/word-blocks`).
2. Remove the `ipaWords` prop (from `Props`, the destructuring and the `ipaOfBlock` guard written for the position-only prefill). Replace the `ipaOfBlock` computation with:
```tsx
  // The IPA form of the selected block: its explicit links, else the same position when the counts are equal.
  const ipaWords = splitWords(draft.ipa ?? '')
  const ipaOfBlock = !b
    ? ''
    : meta?.ipaIdx?.length
      ? blockWords(ipaWords, meta.ipaIdx)
      : ipaWords.length > 0 && ipaWords.length === r.bw.length ? blockWords(ipaWords, b.idx) : ''
```
3. Render `<IpaWordsPanel draft={draft} blockKey={key} onChange={apply} />` inside the `{b && key && (<div className="space-y-3"> … )}` block, directly before `<LexiconPanel …>` (keep `ipa={ipaOfBlock}` and the key that already includes it).

`web/components/word-link/WordLinkEditor.tsx`:
1. `initial` memo: pass the IPA line as the 5th argument of `initDraft`: `initDraft(i + 1, b, literalLines[i] ?? '', saved.find(v => v.verse_no === i + 1), ipaLines?.[i])`; add `ipaLines` to the memo's dependency array.
2. In the restore effect, wrap each reconciled draft: `syncIpa(reconcileDraft(...), d)` (import `syncIpa`).
3. In `save()`, pass `ipaBase: payload.ipaBase` to `saveVerse`.
4. Remove the `ipaWords={…}` prop passed to `<BlockPanel>` and the now unused `splitWords` import if nothing else uses it.
5. Under the `PairStrip`, add the verse summary and the stale notice:
```tsx
      {draft.ipa && (() => {
        const s = ipaStatus(draft)
        const staleSaved = saved.find(v => v.verse_no === draft.verseNo)?.ipa_stale === true && !savedNos.includes(draft.verseNo)
        return (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              API : {s.words} mot{s.words > 1 ? 's' : ''}, {s.linked} relié{s.linked > 1 ? 's' : ''}{s.unlinked > 0 ? `, ${s.unlinked} non relié${s.unlinked > 1 ? 's' : ''}` : ''}.
            </p>
            {staleSaved && (
              <p className="text-xs text-amber-700">Le texte API de ce vers a changé depuis l’enregistrement : les anciens liens API sont ignorés. Reliez-les de nouveau puis enregistrez.</p>
            )}
          </div>
        )
      })()}
```
(import `ipaStatus`.)

`relier/page.tsx` already passes `ipaLines`; leave it.

- [ ] **Step 5: Verify and commit**

Run: `cd web && npx vitest run __tests__/word-link-ipa-panel.test.tsx __tests__/word-link-panels.test.tsx __tests__/word-link-editor.test.ts && npx vitest run 2>&1 | tail -5; npx tsc --noEmit -p . 2>&1 | tail -5; npx eslint components/word-link lib/word-link-editor.ts`
Expected: PASS, clean.

Manual check (say if you could not; the user does it on a preview after applying the migration): on `/resources/<id>/relier` of a resource with IPA text, selecting a Latin block shows « Mots en API »; tapping an IPA word links it (filled chip), tapping a grey chip moves it, the summary « API : n mots, m reliés » updates, « Relier par position » appears only when the counts are equal; saving the verse works; in the reader the word view shows the linked IPA words; a verse whose IPA text was edited afterwards says the links are ignored.

```bash
cd "c:/Users/DELL LATITUDE 7480/traduction bété" && git branch --show-current
git add web/components/word-link/IpaWordsPanel.tsx web/components/word-link/BlockPanel.tsx web/components/word-link/WordLinkEditor.tsx web/__tests__/word-link-ipa-panel.test.tsx
git commit -F - <<'EOF'
feat(resources): link IPA words to word blocks in the editor

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
```

---

## Self-review notes

- Spec coverage: columns, hash and two functions (Task 1), data layer and error codes (Task 2), editor state incl. merge/split/pooling and stale handling (Task 3), reader preference order explicit → position → Latin and the run rule (Task 4), editor panel, summary, prefill from block links, stale notice (Task 5). Out of scope as in the spec: editing the IPA text from the editor, linking IPA words directly to mot-à-mot words.
- Names used across tasks: `ipa_idx`, `ipa_line`, `ipa_stale` (data), `ipaIdx`, `ipa`, `baseIpa`, `ipaBase` (editor), `autoLinkIpa`, `toggleIpaWord`, `ipaChips`, `ipaStatus`, `syncIpa`, `IpaVerse.all`, `readerTokens(verse, ipaWords, ipaAll)`, `VerseWords.ipaAll`, `IpaWordsPanel`.
- The SQL cannot be run here; Task 1 relies on a mechanical copy plus a diff review, then the read-only checks of the walkthrough in production.
