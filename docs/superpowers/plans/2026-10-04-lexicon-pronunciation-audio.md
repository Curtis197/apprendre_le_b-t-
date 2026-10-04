# Lexicon Pronunciation Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users can record how a lexicon word is pronounced; anyone can listen on the entry page and from the word detail of a resource; listeners can report a bad recording.

**Architecture:** A public storage bucket plus a table `lexicon_pronunciations` written only through two SECURITY DEFINER functions; reports reuse the `corrections` system with a new target type `pronunciation`; `lexicon_summary` carries the 3 latest recordings so the reader needs no extra request. The existing `PronunciationRecorder` becomes configurable; a new `PronunciationSection` (entry page) and a play button in `VerseWords` (reader) use it.

**Tech Stack:** Next.js 16.2 / React 19, Supabase (Postgres, RLS, Storage), Vitest (unit + RLS), Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-04-lexicon-pronunciation-audio-design.md` (read it first). Context: the lexicon/word-link work in `docs/superpowers/plans/2026-10-04-lexicon-from-word-links.md` (already built and pushed).

## Global Constraints

- **No branch, no worktree** (project policy since 2026-10-04): work on `master` in `C:\Users\DELL LATITUDE 7480\traduction bété`. Run `git branch --show-current` (must print `master`) and `git status` before every commit; stage explicit paths only; never push (the user pushes).
- One migration: `supabase/migrations/20261009000000_lexicon_pronunciations.sql`, re-runnable (`create or replace`, `if not exists`, `drop policy if exists` before each `create policy`, `drop trigger if exists` before each `create trigger`). Every new function: `security definer`, `set search_path = public`, `revoke execute … from public, anon` then explicit `grant` (reads: `grant … to anon, authenticated`).
- Limits (spec): **10 seconds, 1 MB (1048576 bytes), 3 recordings per user per entry**. Allowed formats: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/mpeg`; file extensions written by the app: `webm`, `ogg`, `mp4`.
- Storage path: `{author_id}/{lexicon_id}/{timestamp}.{ext}`; bucket `lexicon-pronunciations` (public).
- Database errors are plain codes (`raise exception 'code'`), mapped to French in `web/lib/lexicon-audio-data.ts`.
- Safari 16.1 floor: no `color-mix`, no `:has()`; existing Tailwind tokens only. All user-visible text is French; curly apostrophes (U+2019) as elsewhere in the app, written as `’` (never flattened to `'`).
- Never run the migration against production; the user applies it by hand (Task 9 ends there).
- Local checks: apply SQL with `docker exec -i supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/20261009000000_lexicon_pronunciations.sql`, then `docker exec supabase_db_agdqbzbjcxrzfhkvempe psql -U postgres -c "notify pgrst, 'reload schema'"` and wait ~10 s. RLS tests from `web/`: `npm run test:rls -- <filter>` (one file at a time: the local signup limit is 30 per 5 minutes). The storage API container (`supabase_storage_agdqbzbjcxrzfhkvempe`) must be running for the bucket tests: check `docker ps`; if it is stopped, start it with `docker start supabase_storage_agdqbzbjcxrzfhkvempe`. Unit tests: `npx vitest run <filter>`; types: `npx tsc --noEmit`.

## Review Focus

1. **Upload that the database then refuses** (4th recording, entry deleted meanwhile): the file must not stay behind and the user sees a French message (Task 4 test).
2. **Forged paths**: a path in another user's folder, another entry's folder, a wrong extension, a file that was never uploaded (Task 1 tests).
3. **Reporting your own recording, or the same recording twice** (Task 2 tests).
4. **Report whose recording is deleted**: the report disappears with it; the review page never shows a dead item (Task 2 test, Task 7).
5. **No recording / signed-out visitor / empty author name**: nothing broken, no empty player, author shown as « Contributeur » (Tasks 2, 6, 8 tests).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261009000000_lexicon_pronunciations.sql` (create) | Bucket + policies, table, add/delete/list functions, corrections changes, `audio` in `lexicon_summary` |
| `web/__tests__/rls/lexicon-pronunciations.test.ts` (create) | SQL / storage tests |
| `web/lib/lexicon-audio.ts` (create), `web/__tests__/lexicon-audio.test.ts` (create) | Constants, path, size check, public URL |
| `web/lib/lexicon-audio-data.ts` (create), `web/__tests__/lexicon-audio-data.test.ts` (create) | Upload, delete, list, French errors |
| `web/lib/corrections.ts` (modify), `web/__tests__/corrections.test.ts` (check) | `pronunciation` target type, field, label, href |
| `web/lib/word-blocks.ts`, `web/lib/word-blocks-data.ts` (modify) | `LexAudio`, `LexSummary.audio`, `parseLex` |
| `web/components/courses/PronunciationRecorder.tsx` (modify) | Configurable length and labels |
| `web/components/lexicon/PronunciationList.tsx` (create) | Presentational list: players, delete, report |
| `web/components/lexicon/PronunciationSection.tsx` (create) | Container: data, recorder, list |
| `web/app/lexicon/[id]/page.tsx` (modify) | Mount the section |
| `web/components/CorrectionItem.tsx` (modify) | Player, « Ignorer », « Supprimer l’enregistrement » for pronunciation reports |
| `web/components/VerseWords.tsx` (modify) | Play button in the dictionary part |

Task order: 1 → 2 (SQL), 3 → 4 (TS helpers/data), 5 (recorder), 6 (entry page), 7 (review), 8 (reader), 9 (verification).

---

### Task 1: Bucket, table and functions

**Files:**
- Create: `supabase/migrations/20261009000000_lexicon_pronunciations.sql`
- Create: `web/__tests__/rls/lexicon-pronunciations.test.ts`

**Interfaces:**
- Produces (SQL): table `lexicon_pronunciations(id, lexicon_id, audio_path, created_by, created_at)`; `add_lexicon_pronunciation(p_lexicon_id uuid, p_path text) returns uuid` (authenticated; codes `not_signed_in`, `entry_not_found`, `bad_path`, `file_not_found`, `too_many`); `delete_lexicon_pronunciation(p_id uuid) returns text` (authenticated; returns the storage path; codes `not_signed_in`, `not_found`, `not_allowed`); `get_lexicon_pronunciations(p_lexicon_id uuid) returns table (id uuid, path text, author text, created_by uuid, created_at timestamptz)` (anon + authenticated, newest first, all recordings of the entry).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/rls/lexicon-pronunciations.test.ts`:

```ts
// web/__tests__/rls/lexicon-pronunciations.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, uid, type TestUser } from './helpers'

export const BUCKET = 'lexicon-pronunciations'
export const blob = (bytes = 100, type = 'audio/webm') => new Blob([new Uint8Array(bytes)], { type })

export async function newEntry(owner: TestUser): Promise<string> {
  const res = await owner.client.rpc('create_lexicon_entry', {
    p_spelling: `pron-${uid()}`, p_ipa: null, p_dialect: 'western', p_kind: 'word', p_pos: null, p_description: null,
    p_notes: null, p_synonyms: null, p_lemma: null, p_senses: [{ french: 'voix', context: null }], p_example: null,
  })
  return must(res, 'entry').id as string
}

let counter = 0
/** Uploads a small file into the user's own folder for the entry and returns its path. */
export async function uploadFor(user: TestUser, lexiconId: string, ext = 'webm'): Promise<string> {
  const path = `${user.id}/${lexiconId}/${Date.now()}${++counter}.${ext}`
  const res = await user.client.storage.from(BUCKET).upload(path, blob(), { contentType: 'audio/webm' })
  if (res.error) throw new Error(`upload: ${res.error.message}`)
  return path
}

describe('lexicon pronunciation bucket', () => {
  let alice: TestUser
  let bob: TestUser
  let lexId: string

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('pa-alice'), createUser('pa-bob')])
    lexId = await newEntry(alice)
  })

  it('is public, 1 MB, audio only', async () => {
    const { data, error } = await admin.storage.getBucket(BUCKET)
    expect(error).toBeNull()
    expect(data).toMatchObject({ public: true, file_size_limit: 1048576 })
    expect(data!.allowed_mime_types).toEqual(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
  })

  it('lets a user upload into their own folder and anyone play the file', async () => {
    const path = await uploadFor(alice, lexId)
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
    const res = await fetch(url)
    expect(res.status).toBe(200)
  })

  it('refuses an upload into someone else’s folder, a non-audio file and a file over 1 MB', async () => {
    const other = await bob.client.storage.from(BUCKET).upload(`${alice.id}/${lexId}/1.webm`, blob(), { contentType: 'audio/webm' })
    expect(other.error).not.toBeNull()
    const text = await alice.client.storage.from(BUCKET).upload(`${alice.id}/${lexId}/2.webm`, new Blob(['x'], { type: 'text/plain' }), { contentType: 'text/plain' })
    expect(text.error).not.toBeNull()
    const big = await alice.client.storage.from(BUCKET).upload(`${alice.id}/${lexId}/3.webm`, blob(1048577), { contentType: 'audio/webm' })
    expect(big.error).not.toBeNull()
    const anon = await anonClient().storage.from(BUCKET).upload(`x/${lexId}/4.webm`, blob(), { contentType: 'audio/webm' })
    expect(anon.error).not.toBeNull()
  })

  it('lets only the owner or an admin delete a file', async () => {
    const boss = await createUser('pa-boss')
    await makeAdmin(boss.id)
    const path = await uploadFor(alice, lexId)
    await bob.client.storage.from(BUCKET).remove([path])
    expect((await admin.storage.from(BUCKET).list(`${alice.id}/${lexId}`)).data?.some(f => path.endsWith(f.name))).toBe(true)
    await boss.client.storage.from(BUCKET).remove([path])
    expect((await admin.storage.from(BUCKET).list(`${alice.id}/${lexId}`)).data?.some(f => path.endsWith(f.name))).toBe(false)
  })
})

describe('add_lexicon_pronunciation and delete_lexicon_pronunciation', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser
  let lexId: string
  const add = (user: TestUser | null, lex: string, path: string) =>
    (user ? user.client : anonClient()).rpc('add_lexicon_pronunciation', { p_lexicon_id: lex, p_path: path })

  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([createUser('pf-alice'), createUser('pf-bob'), createUser('pf-boss')])
    await makeAdmin(boss.id)
    lexId = await newEntry(alice)
  })

  it('does not let clients write the table directly', async () => {
    expect((await alice.client.from('lexicon_pronunciations').insert({ lexicon_id: lexId, audio_path: 'x', created_by: alice.id })).error).not.toBeNull()
    expect((await anonClient().from('lexicon_pronunciations').select('id')).error).toBeNull()
  })

  it('records an uploaded file for the caller, once', async () => {
    const path = await uploadFor(bob, lexId)
    const res = await add(bob, lexId, path)
    expect(res.error).toBeNull()
    const row = must(await admin.from('lexicon_pronunciations').select('*').eq('id', res.data).single(), 'row')
    expect(row).toMatchObject({ lexicon_id: lexId, audio_path: path, created_by: bob.id })
    expect((await add(bob, lexId, path)).error).not.toBeNull()
  })

  it.each([
    ['bad_path', (u: TestUser, l: string) => `${u.id}/${l}/12.exe`],
    ['bad_path', (u: TestUser, l: string) => `${u.id}/${l}/abc.webm`],
    ['bad_path', (u: TestUser, l: string) => `other/${l}/12.webm`],
    ['bad_path', (u: TestUser) => `${u.id}/00000000-0000-0000-0000-000000000001/12.webm`],
    ['file_not_found', (u: TestUser, l: string) => `${u.id}/${l}/99999999.webm`],
  ])('refuses %s', async (code, mk) => {
    const res = await add(alice, lexId, mk(alice, lexId))
    expect(res.error?.message).toContain(code)
  })

  it('refuses an unknown entry and anonymous callers', async () => {
    const ghost = '00000000-0000-0000-0000-000000000000'
    expect((await add(alice, ghost, `${alice.id}/${ghost}/1.webm`)).error?.message).toContain('entry_not_found')
    expect((await add(null, lexId, 'x')).error?.code).toBe('42501')
  })

  it('refuses a 4th recording of the same user on the same entry, and keeps the limit per user', async () => {
    const lex = await newEntry(alice)
    for (let i = 0; i < 3; i++) expect((await add(alice, lex, await uploadFor(alice, lex))).error).toBeNull()
    expect((await add(alice, lex, await uploadFor(alice, lex))).error?.message).toContain('too_many')
    expect((await add(bob, lex, await uploadFor(bob, lex))).error).toBeNull()
  })

  it('lists the recordings newest first with the author name, « Contributeur » when empty', async () => {
    const lex = await newEntry(alice)
    await admin.from('profiles').update({ name: 'Awa' }).eq('id', alice.id)
    await admin.from('profiles').update({ name: '' }).eq('id', bob.id)
    const a = must(await add(alice, lex, await uploadFor(alice, lex)), 'a')
    const b = must(await add(bob, lex, await uploadFor(bob, lex)), 'b')
    const { data, error } = await anonClient().rpc('get_lexicon_pronunciations', { p_lexicon_id: lex })
    expect(error).toBeNull()
    expect(data.map((r: { id: string }) => r.id)).toEqual([b, a])
    expect(data.map((r: { author: string }) => r.author)).toEqual(['Contributeur', 'Awa'])
  })

  it('lets the author or an admin delete and returns the path; refuses others', async () => {
    const lex = await newEntry(alice)
    const path = await uploadFor(bob, lex)
    const id = must(await add(bob, lex, path), 'id') as string
    const del = (u: TestUser | null) => (u ? u.client : anonClient()).rpc('delete_lexicon_pronunciation', { p_id: id })
    expect((await del(alice)).error?.message).toContain('not_allowed')
    expect((await del(null)).error?.code).toBe('42501')
    const ok = await del(bob)
    expect(ok.error).toBeNull()
    expect(ok.data).toBe(path)
    expect((await del(bob)).error?.message).toContain('not_found')
    const path2 = await uploadFor(bob, lex)
    const id2 = must(await add(bob, lex, path2), 'id2') as string
    const byAdmin = await boss.client.rpc('delete_lexicon_pronunciation', { p_id: id2 })
    expect(byAdmin.data).toBe(path2)
  })

  it('deletes the rows with the entry', async () => {
    const lex = await newEntry(alice)
    await add(alice, lex, await uploadFor(alice, lex))
    await admin.from('lexicon').delete().eq('id', lex)
    expect(must(await admin.from('lexicon_pronunciations').select('id').eq('lexicon_id', lex), 'rows')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

`npm run test:rls -- lexicon-pronunciations` (from `web/`) → FAIL (bucket / functions do not exist).

- [ ] **Step 3: Write the migration (part 1)**

Create `supabase/migrations/20261009000000_lexicon_pronunciations.sql`:

```sql
-- supabase/migrations/20261009000000_lexicon_pronunciations.sql
-- Pronunciation recordings of lexicon entries: several per entry, open to any signed-in user, credited to
-- their author; reported through the corrections system. Only adds (table, bucket, functions, one check
-- constraint change, one trigger). Re-runnable.
-- Spec: docs/superpowers/specs/2026-10-04-lexicon-pronunciation-audio-design.md

-- ── 1. storage bucket (public: anyone can play a recording) ─────────────────────────────────────
-- Path convention: "{author_id}/{lexicon_id}/{timestamp}.{ext}"
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lexicon-pronunciations',
  'lexicon-pronunciations',
  true,
  1048576, -- 1 MB cap: a recording is one word
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

drop policy if exists "lexicon_pron_insert_own" on storage.objects;
create policy "lexicon_pron_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lexicon-pronunciations'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "lexicon_pron_delete" on storage.objects;
create policy "lexicon_pron_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lexicon-pronunciations'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select is_admin()))
  );
-- No select policy: the bucket is public, files are read through the public URL.

-- ── 2. table ────────────────────────────────────────────────────────────────────────────────────
create table if not exists lexicon_pronunciations (
  id         uuid primary key default gen_random_uuid(),
  lexicon_id uuid not null references lexicon(id) on delete cascade,
  audio_path text not null unique check (char_length(audio_path) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists lexicon_pronunciations_entry_idx on lexicon_pronunciations (lexicon_id, created_at desc);

alter table lexicon_pronunciations enable row level security;
drop policy if exists lexicon_pronunciations_select on lexicon_pronunciations;
create policy lexicon_pronunciations_select on lexicon_pronunciations for select using (true);
-- No insert/update/delete policy: only the functions below write.

-- ── 3. functions ────────────────────────────────────────────────────────────────────────────────
create or replace function add_lexicon_pronunciation(p_lexicon_id uuid, p_path text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from lexicon where id = p_lexicon_id) then
    raise exception 'entry_not_found';
  end if;
  if p_path is null
     or p_path !~ ('^' || v_uid::text || '/' || p_lexicon_id::text || '/[0-9]+\.(webm|ogg|mp4)$') then
    raise exception 'bad_path';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'lexicon-pronunciations' and o.name = p_path) then
    raise exception 'file_not_found';
  end if;
  if (select count(*) from lexicon_pronunciations p where p.lexicon_id = p_lexicon_id and p.created_by = v_uid) >= 3 then
    raise exception 'too_many';
  end if;
  insert into lexicon_pronunciations (lexicon_id, audio_path, created_by)
  values (p_lexicon_id, p_path, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function add_lexicon_pronunciation(uuid, text) from public, anon;
grant execute on function add_lexicon_pronunciation(uuid, text) to authenticated;

-- Deletes the row (its reports go with it) and hands the storage path back so the app removes the file.
create or replace function delete_lexicon_pronunciation(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_path   text;
  v_author uuid;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select p.audio_path, p.created_by into v_path, v_author
  from lexicon_pronunciations p where p.id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_author <> v_uid and not is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from lexicon_pronunciations where id = p_id;
  return v_path;
end;
$$;
revoke execute on function delete_lexicon_pronunciation(uuid) from public, anon;
grant execute on function delete_lexicon_pronunciation(uuid) to authenticated;

-- All recordings of an entry, newest first, with the author's name (the profile table is not public).
create or replace function get_lexicon_pronunciations(p_lexicon_id uuid)
returns table (id uuid, path text, author text, created_by uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.audio_path, coalesce(nullif(pr.name, ''), 'Contributeur'), p.created_by, p.created_at
  from lexicon_pronunciations p
  left join profiles pr on pr.id = p.created_by
  where p.lexicon_id = p_lexicon_id
  order by p.created_at desc
$$;
revoke execute on function get_lexicon_pronunciations(uuid) from public;
grant execute on function get_lexicon_pronunciations(uuid) to anon, authenticated;
```

- [ ] **Step 4: Apply and run**

Apply the file (Global Constraints), reload PostgREST, then `npm run test:rls -- lexicon-pronunciations`.
Expected: PASS. If `getBucket` returns `allowed_mime_types` in another order, assert with `expect.arrayContaining` plus length 4 instead (do not change the SQL). If storage deletes by non-owner do not behave as expected because the storage API container is stopped, start it (Global Constraints) and rerun.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add supabase/migrations/20261009000000_lexicon_pronunciations.sql web/__tests__/rls/lexicon-pronunciations.test.ts
git commit -m "feat(lexicon): pronunciation bucket, table and add/delete/list functions" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Reports and `audio` in the entry summary (SQL)

**Files:**
- Modify (append): `supabase/migrations/20261009000000_lexicon_pronunciations.sql`
- Modify: `web/__tests__/rls/lexicon-pronunciations.test.ts`

**Interfaces:**
- Produces: `corrections.target_type` accepts `'pronunciation'`; `correction_column('pronunciation','audio')` = `['lexicon_pronunciations','audio_path']`; a report's `original` is the audio path, `label` the entry's spelling, `ref_id` the entry id; `lexicon_summary` gains `'audio': [{id, path, author, created_at}]` (3 latest, newest first).

- [ ] **Step 1: Write the failing tests**

Append to `web/__tests__/rls/lexicon-pronunciations.test.ts`:

```ts
describe('reports on a recording', () => {
  let alice: TestUser // author
  let bob: TestUser // listener
  let boss: TestUser
  let lexId: string
  let recId: string
  let path: string

  const report = (user: TestUser, message: string | null = 'Trop de bruit.') =>
    user.client
      .from('corrections')
      .insert({ target_type: 'pronunciation', target_id: recId, field: 'audio', kind: 'other', message, reporter_id: user.id })
      .select('*')
      .single()

  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([createUser('pr-alice'), createUser('pr-bob'), createUser('pr-boss')])
    await makeAdmin(boss.id)
    lexId = await newEntry(alice)
    path = await uploadFor(alice, lexId)
    recId = must(await alice.client.rpc('add_lexicon_pronunciation', { p_lexicon_id: lexId, p_path: path }), 'rec') as string
  })

  it('lets a listener report with a message and fills the target data', async () => {
    const res = await report(bob)
    expect(res.error).toBeNull()
    expect(res.data).toMatchObject({ original: path, ref_id: lexId, owner_id: alice.id, status: 'open', suggestion: null })
    expect(res.data.label).toBeTruthy()
  })

  it('refuses the author reporting their own recording, a second open report and an empty report', async () => {
    expect((await report(alice)).error).not.toBeNull()
    expect((await report(bob)).error?.code).toBe('23505')
    expect((await report(boss, null)).error).not.toBeNull()
  })

  it('cannot be accepted (no suggestion) but can be dismissed by the author or an admin only', async () => {
    const id = must(await admin.from('corrections').select('id').eq('target_id', recId).eq('status', 'open'), 'open')[0].id as string
    expect((await alice.client.rpc('accept_correction', { p_id: id })).error).not.toBeNull()
    expect((await bob.client.rpc('reject_correction', { p_id: id })).error).not.toBeNull()
    expect((await alice.client.rpc('reject_correction', { p_id: id })).error).toBeNull()
    expect(must(await admin.from('corrections').select('status').eq('id', id).single(), 'row').status).toBe('rejected')
  })

  it('removes the reports with the recording', async () => {
    const lex = await newEntry(alice)
    const rec = must(await alice.client.rpc('add_lexicon_pronunciation', { p_lexicon_id: lex, p_path: await uploadFor(alice, lex) }), 'rec') as string
    must(
      await bob.client.from('corrections').insert({ target_type: 'pronunciation', target_id: rec, field: 'audio', kind: 'other', message: 'Faux mot.', reporter_id: bob.id }).select('id').single(),
      'report',
    )
    await boss.client.rpc('delete_lexicon_pronunciation', { p_id: rec })
    expect(must(await admin.from('corrections').select('id').eq('target_id', rec), 'rows')).toHaveLength(0)
  })

  it('keeps the allow-list entry for the audio field', async () => {
    const { data } = await admin.rpc('correction_column', { p_type: 'pronunciation', p_field: 'audio' })
    expect(data).toEqual(['lexicon_pronunciations', 'audio_path'])
    const word = await admin.rpc('correction_column', { p_type: 'word', p_field: 'marker_meaning' })
    expect(word.data).toEqual(['lexicon', 'marker_meaning'])
  })
})

describe('audio in the entry summary', () => {
  it('carries the 3 latest recordings, newest first, and still the other keys', async () => {
    const alice = await createUser('ps-alice')
    const lex = await newEntry(alice)
    await admin.from('profiles').update({ name: 'Awa' }).eq('id', alice.id)
    const ids: string[] = []
    for (let i = 0; i < 3; i++) {
      ids.push(must(await alice.client.rpc('add_lexicon_pronunciation', { p_lexicon_id: lex, p_path: await uploadFor(alice, lex) }), 'rec') as string)
      await new Promise(r => setTimeout(r, 20))
    }
    const bob = await createUser('ps-bob')
    ids.push(must(await bob.client.rpc('add_lexicon_pronunciation', { p_lexicon_id: lex, p_path: await uploadFor(bob, lex) }), 'rec') as string)
    const { data } = await anonClient().rpc('get_lexicon_entry', { p_id: lex })
    expect(data.audio).toHaveLength(3)
    expect(data.audio.map((a: { id: string }) => a.id)).toEqual([ids[3], ids[2], ids[1]])
    expect(data.audio[1]).toMatchObject({ author: 'Awa' })
    expect(data).toMatchObject({ id: lex, kind: 'word' })
    expect(data.senses).toHaveLength(1)
    const empty = await newEntry(alice)
    expect((await anonClient().rpc('get_lexicon_entry', { p_id: empty })).data.audio).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

`npm run test:rls -- lexicon-pronunciations` → FAIL (target type refused / `audio` missing).

- [ ] **Step 3: Append the SQL**

Append to the migration. For `lexicon_summary`: open `supabase/migrations/20261008000000_lexicon_from_word_links.sql`, section 4, copy the **current** `lexicon_summary` body as it is there, and add the `audio` key shown below as the last key of `jsonb_build_object` (the `revoke execute … from public, anon, authenticated` line stays too). The `correction_column` list below is the full current list; if the file `20261008000000…` shows more entries than these 22, keep all of them.

```sql
-- ── 4. reports on a recording ───────────────────────────────────────────────────────────────────
alter table corrections drop constraint if exists corrections_target_type_check;
alter table corrections add constraint corrections_target_type_check
  check (target_type in ('translation', 'word', 'expression', 'grammar_rule', 'resource', 'pronunciation'));

create or replace function correction_column(p_type text, p_field text)
returns text[]
language sql immutable
set search_path = public
as $$
  select case p_type || '.' || p_field
    when 'translation.french'          then array['lexicon_translations', 'french']
    when 'translation.context'         then array['lexicon_translations', 'context']
    when 'word.bete_phonetic'          then array['lexicon', 'bete_phonetic']
    when 'word.bete_word'              then array['lexicon', 'bete_word']
    when 'word.description'            then array['lexicon', 'description']
    when 'word.marker_type'            then array['lexicon', 'marker_type']
    when 'word.marker_meaning'         then array['lexicon', 'marker_meaning']
    when 'word.marker_french'          then array['lexicon', 'marker_french']
    when 'word.entry_kind'             then array['lexicon', 'entry_kind']
    when 'expression.bete_phrase'      then array['expressions', 'bete_phrase']
    when 'expression.bete_phonetic'    then array['expressions', 'bete_phonetic']
    when 'expression.french_phrase'    then array['expressions', 'french_phrase']
    when 'expression.french_literal'   then array['expressions', 'french_literal']
    when 'grammar_rule.pattern_french' then array['grammar_rules', 'pattern_french']
    when 'grammar_rule.pattern_bete'   then array['grammar_rules', 'pattern_bete']
    when 'grammar_rule.description'    then array['grammar_rules', 'description']
    when 'grammar_rule.example_bete'   then array['grammar_rules', 'example_bete']
    when 'grammar_rule.example_french' then array['grammar_rules', 'example_french']
    when 'resource.title'              then array['community_texts', 'title']
    when 'resource.content_bete'       then array['community_texts', 'content_bete']
    when 'resource.content_literal'    then array['community_texts', 'content_literal']
    when 'resource.content_french'     then array['community_texts', 'content_french']
    when 'pronunciation.audio'         then array['lexicon_pronunciations', 'audio_path']
  end
$$;

-- The guard is the one of 20261003000005_corrections.sql with a branch for the new target type
-- (a CASE without a matching branch raises case_not_found).
create or replace function corrections_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col   text[];
  v_owner uuid;
  v_value text;
begin
  v_col := correction_column(new.target_type, new.field);
  if v_col is null then
    raise exception 'Ce champ ne peut pas être signalé.' using errcode = '22023';
  end if;

  begin
    execute format('select created_by, %I::text from %I where id = $1', v_col[2], v_col[1])
      into strict v_owner, v_value using new.target_id;
  exception when no_data_found then
    raise exception 'Contenu introuvable.' using errcode = 'P0002';
  end;

  new.message    := nullif(btrim(coalesce(new.message, '')), '');
  new.suggestion := nullif(btrim(coalesce(new.suggestion, '')), '');
  if new.suggestion is not null and new.suggestion is not distinct from btrim(coalesce(v_value, '')) then
    raise exception 'La correction proposée est identique au texte actuel.' using errcode = '22023';
  end if;

  if current_user = 'authenticated' then
    new.reporter_id := auth.uid();
    new.status      := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_at  := now();
    if v_owner is not null and v_owner = auth.uid() then
      raise exception 'Vous pouvez modifier directement votre propre contenu.' using errcode = '22023';
    end if;
    if (select count(*) from corrections where reporter_id = auth.uid() and status = 'open') >= 50 then
      raise exception 'Vous avez trop de signalements en attente.' using errcode = '53400';
    end if;
  end if;

  new.original      := v_value;
  new.owner_id      := v_owner;
  new.reporter_name := coalesce(nullif((select name from profiles where id = new.reporter_id), ''), 'Contributeur');

  case new.target_type
    when 'translation' then
      select t.lexicon_id, coalesce(nullif(l.bete_phonetic, ''), nullif(l.bete_word, ''), t.french)
        into new.ref_id, new.label
        from lexicon_translations t join lexicon l on l.id = t.lexicon_id
       where t.id = new.target_id;
    when 'word' then
      select l.id, coalesce(nullif(l.bete_phonetic, ''), nullif(l.bete_word, ''), l.top_french)
        into new.ref_id, new.label
        from lexicon l where l.id = new.target_id;
    when 'expression' then
      new.ref_id := null;
      select e.french_phrase into new.label from expressions e where e.id = new.target_id;
    when 'grammar_rule' then
      new.ref_id := null;
      select left(g.description, 80) into new.label from grammar_rules g where g.id = new.target_id;
    when 'resource' then
      select c.id, c.title into new.ref_id, new.label from community_texts c where c.id = new.target_id;
    when 'pronunciation' then
      select p.lexicon_id, coalesce(nullif(l.bete_phonetic, ''), nullif(l.bete_word, ''), 'Mot')
        into new.ref_id, new.label
        from lexicon_pronunciations p join lexicon l on l.id = p.lexicon_id
       where p.id = new.target_id;
  end case;

  return new;
end;
$$;

drop trigger if exists corrections_cleanup on lexicon_pronunciations;
create trigger corrections_cleanup after delete on lexicon_pronunciations
  for each row execute function corrections_target_deleted('pronunciation');

-- ── 5. the entry summary carries the 3 latest recordings ────────────────────────────────────────
-- lexicon_summary of 20261008000000_lexicon_from_word_links.sql with one more key: 'audio'.
create or replace function lexicon_summary(p_id uuid, p_sense uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id,
    'kind', l.entry_kind,
    'spelling', coalesce(nullif(l.bete_phonetic, ''), l.bete_word),
    'ipa', case when l.bete_word is distinct from l.bete_phonetic and l.bete_word not like '\_pending\_%' then l.bete_word end,
    'dialect', l.dialect,
    'pos', coalesce(to_jsonb(l.pos), '[]'::jsonb),
    'description', l.description,
    'synonyms', coalesce(to_jsonb(l.french_synonyms), '[]'::jsonb),
    'marker', jsonb_build_object('type', l.marker_type, 'meaning', l.marker_meaning, 'french', l.marker_french),
    'senses', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'french', t.french, 'context', t.context)
                                          order by t.position, t.created_at), '[]'::jsonb)
               from lexicon_translations t where t.lexicon_id = l.id),
    'sense_id', (select t.id from lexicon_translations t where t.id = p_sense and t.lexicon_id = l.id),
    'spellings', (select coalesce(jsonb_agg(s.spelling order by s.created_at), '[]'::jsonb)
                  from lexicon_spellings s where s.lexicon_id = l.id),
    'audio', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', a.id, 'path', a.audio_path,
                       'author', coalesce(nullif(pr.name, ''), 'Contributeur'), 'created_at', a.created_at)
                     order by a.created_at desc), '[]'::jsonb)
              from (select p.* from lexicon_pronunciations p where p.lexicon_id = l.id
                    order by p.created_at desc limit 3) a
              left join profiles pr on pr.id = a.created_by)
  )
  from lexicon l
  where l.id = p_id
$$;
revoke execute on function lexicon_summary(uuid, uuid) from public, anon, authenticated;
```

- [ ] **Step 4: Apply and run**

Apply the file again (must succeed twice in a row), reload PostgREST, run `npm run test:rls -- lexicon-pronunciations`, then `npm run test:rls -- lexicon-from-word-links` and `npm run test:rls -- corrections` to prove nothing regressed (they use the summary and the guard).
Expected: all PASS. The `corrections` unit test (`npx vitest run corrections`) fails until Task 3 mirrors the new allow-list entry: that is expected here.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add supabase/migrations/20261009000000_lexicon_pronunciations.sql web/__tests__/rls/lexicon-pronunciations.test.ts
git commit -m "feat(lexicon): report a recording through corrections, audio in the entry summary" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pure helpers, types and the corrections mirror

**Files:**
- Create: `web/lib/lexicon-audio.ts`, `web/__tests__/lexicon-audio.test.ts`
- Modify: `web/lib/corrections.ts`, `web/lib/word-blocks.ts`, `web/lib/word-blocks-data.ts`, `web/__tests__/word-blocks-data.test.ts`

**Interfaces:**
- Produces in `lexicon-audio.ts`:
```ts
export const LEXICON_AUDIO_BUCKET = 'lexicon-pronunciations'
export const MAX_LEXICON_AUDIO_SECONDS = 10
export const MAX_LEXICON_AUDIO_BYTES = 1048576
export const MAX_AUDIO_PER_USER = 3
export function lexiconAudioPath(userId: string, lexiconId: string, nowMs: number, ext: string): string
export function checkAudioSize(blob: { size: number }): string | null
export function publicAudioUrl(path: string, base?: string): string
```
- Produces in `word-blocks.ts`: `export interface LexAudio { id: string; path: string; author: string; createdAt: string }`; `LexSummary` gets `audio?: LexAudio[]`.
- `word-blocks-data.ts`: `parseLex` fills `audio` (empty array when absent or malformed).
- `corrections.ts`: `CorrectionTargetType` gains `'pronunciation'`; `CORRECTION_FIELDS.pronunciation = [{ field: 'audio', label: 'Enregistrement' }]`; `TARGET_TYPE_LABELS.pronunciation = 'Prononciation'`; `correctionHref` returns `/lexicon/${ref_id}#prononciation` for it.

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/lexicon-audio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  LEXICON_AUDIO_BUCKET, MAX_AUDIO_PER_USER, MAX_LEXICON_AUDIO_BYTES, MAX_LEXICON_AUDIO_SECONDS,
  checkAudioSize, lexiconAudioPath, publicAudioUrl,
} from '@/lib/lexicon-audio'

describe('lexicon audio constants', () => {
  it('match the migration', () => {
    expect(LEXICON_AUDIO_BUCKET).toBe('lexicon-pronunciations')
    expect(MAX_LEXICON_AUDIO_SECONDS).toBe(10)
    expect(MAX_LEXICON_AUDIO_BYTES).toBe(1048576)
    expect(MAX_AUDIO_PER_USER).toBe(3)
  })
})

describe('lexiconAudioPath', () => {
  it('puts the author first, then the entry, then the timestamp', () => {
    expect(lexiconAudioPath('u1', 'e1', 1700000000000, 'webm')).toBe('u1/e1/1700000000000.webm')
  })
})

describe('checkAudioSize', () => {
  it('accepts a normal recording and refuses empty or too large ones in French', () => {
    expect(checkAudioSize({ size: 50_000 })).toBeNull()
    expect(checkAudioSize({ size: MAX_LEXICON_AUDIO_BYTES })).toBeNull()
    expect(checkAudioSize({ size: 0 })).toMatch(/vide/)
    expect(checkAudioSize({ size: MAX_LEXICON_AUDIO_BYTES + 1 })).toMatch(/1 Mo/)
  })
})

describe('publicAudioUrl', () => {
  it('builds the public storage URL and tolerates a trailing slash', () => {
    expect(publicAudioUrl('u1/e1/1.webm', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/lexicon-pronunciations/u1/e1/1.webm',
    )
    expect(publicAudioUrl('u1/e1/1.webm', 'https://x.supabase.co/')).toBe(
      'https://x.supabase.co/storage/v1/object/public/lexicon-pronunciations/u1/e1/1.webm',
    )
  })
})
```

Add to `web/__tests__/word-blocks-data.test.ts`:

```ts
it('parses the recordings of a linked entry and defaults to none', () => {
  const lex = (audio: unknown) =>
    parseVerse({
      verse_no: 1, stale: false, bete_line: 'a', literal_line: 'x',
      blocks: [{ position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, lex: { id: 'L1', kind: 'word', audio } }],
    }).blocks[0].lex!
  expect(lex([{ id: 'A1', path: 'u/e/1.webm', author: 'Awa', created_at: '2026-10-04T10:00:00Z' }]).audio).toEqual([
    { id: 'A1', path: 'u/e/1.webm', author: 'Awa', createdAt: '2026-10-04T10:00:00Z' },
  ])
  expect(lex(undefined).audio).toEqual([])
  expect(lex([{ id: 5 }, null, 'x']).audio).toEqual([])
})
```

In `web/__tests__/corrections.test.ts` add:

```ts
it('knows the pronunciation target', () => {
  expect(isCorrectableField('pronunciation', 'audio')).toBe(true)
  expect(fieldLabel('pronunciation', 'audio')).toBe('Enregistrement')
  expect(correctionHref({ target_type: 'pronunciation', ref_id: 'E1' })).toBe('/lexicon/E1#prononciation')
  expect(correctionHref({ target_type: 'pronunciation', ref_id: null })).toBeNull()
})
```

(import `correctionHref` from `@/lib/corrections` if the file does not import it yet.)

- [ ] **Step 2: Run to verify failure**

`npx vitest run lexicon-audio word-blocks-data corrections` → FAIL.

- [ ] **Step 3: Implement**

Create `web/lib/lexicon-audio.ts`:

```ts
// lib/lexicon-audio.ts — constants and pure helpers for the pronunciation recordings of lexicon entries.
// The limits mirror supabase/migrations/20261009000000_lexicon_pronunciations.sql.

export const LEXICON_AUDIO_BUCKET = 'lexicon-pronunciations'
export const MAX_LEXICON_AUDIO_SECONDS = 10
export const MAX_LEXICON_AUDIO_BYTES = 1048576
export const MAX_AUDIO_PER_USER = 3

/** Storage RLS requires the author's id as the first folder, the database the entry id as the second. */
export function lexiconAudioPath(userId: string, lexiconId: string, nowMs: number, ext: string): string {
  return `${userId}/${lexiconId}/${nowMs}.${ext}`
}

/** A French message, or null when the recording can be sent. */
export function checkAudioSize(blob: { size: number }): string | null {
  if (blob.size === 0) return 'L’enregistrement est vide, veuillez recommencer.'
  if (blob.size > MAX_LEXICON_AUDIO_BYTES) return 'Enregistrement trop volumineux (1 Mo maximum).'
  return null
}

/** The public URL of a recording (the bucket is public: no signed URL, no sign-in needed to play). */
export function publicAudioUrl(path: string, base: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${LEXICON_AUDIO_BUCKET}/${path}`
}
```

In `web/lib/word-blocks.ts` add after `LexSense`:

```ts
/** One pronunciation recording of an entry (the summary carries the 3 latest). */
export interface LexAudio {
  id: string
  path: string
  author: string
  createdAt: string
}
```
and in `LexSummary` add `audio?: LexAudio[]` after `spellings`.

In `web/lib/word-blocks-data.ts`: import `LexAudio`, and inside `parseLex`'s returned object add `audio: audioList(r.audio),` with, next to `strs`:

```ts
function audioList(v: unknown): LexAudio[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((a): LexAudio[] => {
    if (!a || typeof a !== 'object') return []
    const r = a as Record<string, unknown>
    if (typeof r.id !== 'string' || typeof r.path !== 'string') return []
    return [{
      id: r.id,
      path: r.path,
      author: typeof r.author === 'string' && r.author.trim() ? r.author : 'Contributeur',
      createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    }]
  })
}
```

In `web/lib/corrections.ts`: add `'pronunciation'` to `CorrectionTargetType`; add to `CORRECTION_FIELDS` the entry `pronunciation: [{ field: 'audio', label: 'Enregistrement' }],`; add `pronunciation: 'Prononciation',` to `TARGET_TYPE_LABELS`; add to the `correctionHref` switch:

```ts
    case 'pronunciation':
      return correction.ref_id ? `/lexicon/${correction.ref_id}#prononciation` : null
```

The first corrections unit test (SQL ↔ TS mirror) reads the latest migration defining `correction_column`, which is now `20261009000000…`; it must pass.

- [ ] **Step 4: Run tests and types**

`npx vitest run lexicon-audio word-blocks-data corrections` → PASS; `npx tsc --noEmit` → clean (fix `Record<CorrectionTargetType, …>` literals elsewhere that the new member breaks: search with `grep -rn "CorrectionTargetType" web --include=*.ts --include=*.tsx`).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/lib/lexicon-audio.ts web/lib/corrections.ts web/lib/word-blocks.ts web/lib/word-blocks-data.ts web/__tests__/lexicon-audio.test.ts web/__tests__/word-blocks-data.test.ts web/__tests__/corrections.test.ts
git commit -m "feat(lexicon): audio helpers, recordings in the entry summary type, pronunciation correction target" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Data layer

**Files:**
- Create: `web/lib/lexicon-audio-data.ts`, `web/__tests__/lexicon-audio-data.test.ts`

**Interfaces:**
- Consumes: `lexiconAudioPath`, `checkAudioSize`, `LEXICON_AUDIO_BUCKET` (Task 3); `baseMimeType`, `extensionForMime` from `@/lib/courses/pronunciation`; `Result<T>` from `@/lib/word-blocks-data`.
- Produces:
```ts
export interface PronunciationRow { id: string; path: string; author: string; createdBy: string; createdAt: string }
export function audioErrorMessage(message: string): string
export async function uploadPronunciation(client: SupabaseClient, a: { userId: string; lexiconId: string; blob: Blob }): Promise<Result<{ id: string }>>
export async function deletePronunciation(client: SupabaseClient, id: string): Promise<Result<true>>
export async function listPronunciations(client: SupabaseClient, lexiconId: string): Promise<PronunciationRow[]>
export async function reportPronunciation(client: SupabaseClient, recordingId: string, message: string): Promise<Result<true>>
```

- [ ] **Step 1: Write the failing tests**

Create `web/__tests__/lexicon-audio-data.test.ts` with a fake client built from `vi.fn()`s:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { audioErrorMessage, deletePronunciation, listPronunciations, reportPronunciation, uploadPronunciation } from '@/lib/lexicon-audio-data'

const mk = (over: { upload?: unknown; remove?: unknown; rpc?: unknown; insert?: unknown; auth?: unknown } = {}) => {
  const upload = vi.fn().mockResolvedValue(over.upload ?? { error: null })
  const remove = vi.fn().mockResolvedValue(over.remove ?? { error: null })
  const rpc = vi.fn().mockResolvedValue(over.rpc ?? { data: 'rec-1', error: null })
  const insert = vi.fn().mockResolvedValue(over.insert ?? { error: null })
  const client = {
    storage: { from: vi.fn().mockReturnValue({ upload, remove }) },
    rpc,
    from: vi.fn().mockReturnValue({ insert }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: over.auth === null ? null : { id: 'u1' } } }) },
  } as unknown as SupabaseClient
  return { client, upload, remove, rpc, insert }
}
const blob = (size = 100, type = 'audio/webm;codecs=opus') => new Blob([new Uint8Array(size)], { type })

describe('uploadPronunciation', () => {
  it('uploads into the author’s folder with the bare mime type, then records it', async () => {
    const { client, upload, rpc } = mk()
    const res = await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob() })
    expect(res).toEqual({ data: { id: 'rec-1' }, error: null })
    const [path, , opts] = upload.mock.calls[0]
    expect(path).toMatch(/^u1\/e1\/\d+\.webm$/)
    expect(opts).toEqual({ contentType: 'audio/webm', upsert: false })
    expect(rpc).toHaveBeenCalledWith('add_lexicon_pronunciation', { p_lexicon_id: 'e1', p_path: path })
  })
  it('refuses an empty or oversized blob before any upload', async () => {
    const { client, upload } = mk()
    expect((await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob(0) })).error).toMatch(/vide/)
    expect((await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob(1048577) })).error).toMatch(/1 Mo/)
    expect(upload).not.toHaveBeenCalled()
  })
  it('removes the file and explains when the database refuses', async () => {
    const { client, remove, upload } = mk({ rpc: { data: null, error: { message: 'too_many' } } })
    const res = await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob() })
    expect(res.error).toMatch(/3 enregistrements/)
    expect(remove).toHaveBeenCalledWith([upload.mock.calls[0][0]])
  })
  it('reports an upload failure without calling the database', async () => {
    const { client, rpc } = mk({ upload: { error: { message: 'boom' } } })
    const res = await uploadPronunciation(client, { userId: 'u1', lexiconId: 'e1', blob: blob() })
    expect(res.error).toMatch(/réessayer/i)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('deletePronunciation', () => {
  it('deletes the row, then the file it returned', async () => {
    const { client, remove, rpc } = mk({ rpc: { data: 'u1/e1/1.webm', error: null } })
    expect(await deletePronunciation(client, 'rec-1')).toEqual({ data: true, error: null })
    expect(rpc).toHaveBeenCalledWith('delete_lexicon_pronunciation', { p_id: 'rec-1' })
    expect(remove).toHaveBeenCalledWith(['u1/e1/1.webm'])
  })
  it('keeps going when the file removal fails (the row is already gone)', async () => {
    const { client } = mk({ rpc: { data: 'p', error: null }, remove: { error: { message: 'x' } } })
    expect((await deletePronunciation(client, 'r')).error).toBeNull()
  })
  it('maps the refusals', async () => {
    expect((await deletePronunciation(mk({ rpc: { data: null, error: { message: 'not_allowed' } } }).client, 'r')).error).toMatch(/auteur/)
    expect((await deletePronunciation(mk({ rpc: { data: null, error: { message: 'not_found' } } }).client, 'r')).error).toMatch(/n’existe plus/)
  })
})

describe('listPronunciations', () => {
  it('maps the rows and returns nothing on error', async () => {
    const rows = [{ id: 'a', path: 'p', author: 'Awa', created_by: 'u1', created_at: 't' }]
    const { client, rpc } = mk({ rpc: { data: rows, error: null } })
    expect(await listPronunciations(client, 'e1')).toEqual([{ id: 'a', path: 'p', author: 'Awa', createdBy: 'u1', createdAt: 't' }])
    expect(rpc).toHaveBeenCalledWith('get_lexicon_pronunciations', { p_lexicon_id: 'e1' })
    expect(await listPronunciations(mk({ rpc: { data: null, error: { message: 'x' } } }).client, 'e1')).toEqual([])
  })
})

describe('reportPronunciation', () => {
  it('creates a message-only correction', async () => {
    const { client, insert } = mk()
    expect(await reportPronunciation(client, 'rec-1', ' Trop de bruit. ')).toEqual({ data: true, error: null })
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      target_type: 'pronunciation', target_id: 'rec-1', field: 'audio', kind: 'other', message: 'Trop de bruit.', suggestion: null, reporter_id: 'u1',
    }))
  })
  it('needs a message and a session', async () => {
    expect((await reportPronunciation(mk().client, 'r', '  ')).error).toMatch(/Expliquez/)
    expect((await reportPronunciation(mk({ auth: null }).client, 'r', 'x')).error).toMatch(/Connectez-vous/)
  })
})

describe('audioErrorMessage', () => {
  it('falls back to a generic message', () => {
    expect(audioErrorMessage('boom')).toMatch(/réessayer/i)
  })
})
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run lexicon-audio-data` → FAIL.

- [ ] **Step 3: Implement**

Create `web/lib/lexicon-audio-data.ts`:

```ts
// lib/lexicon-audio-data.ts — Supabase calls for the pronunciation recordings of lexicon entries.
// Runs in the browser; no 'server-only'. The database enforces who may do what; this adds French errors
// and keeps storage and database in step (a refused row removes its file, a deleted row removes its file).
import type { SupabaseClient } from '@supabase/supabase-js'
import { baseMimeType, extensionForMime } from './courses/pronunciation'
import { checkCorrectionInput } from './corrections'
import { LEXICON_AUDIO_BUCKET, checkAudioSize, lexiconAudioPath } from './lexicon-audio'
import type { Result } from './word-blocks-data'

export interface PronunciationRow {
  id: string
  path: string
  author: string
  createdBy: string
  createdAt: string
}

const MESSAGES: Record<string, string> = {
  not_signed_in: 'Connectez-vous pour enregistrer une prononciation.',
  entry_not_found: 'Ce mot n’existe plus dans le lexique.',
  bad_path: 'Le fichier envoyé est invalide.',
  file_not_found: 'Le fichier n’a pas pu être enregistré. Veuillez réessayer.',
  too_many: 'Vous avez déjà 3 enregistrements pour ce mot : supprimez-en un pour en ajouter.',
  not_allowed: 'Seul l’auteur de l’enregistrement ou un administrateur peut le supprimer.',
  not_found: 'Cet enregistrement n’existe plus.',
}
const GENERIC = 'Une erreur est survenue. Veuillez réessayer.'

export function audioErrorMessage(message: string): string {
  const code = Object.keys(MESSAGES).find(c => message.includes(c))
  return code ? MESSAGES[code] : GENERIC
}

export async function uploadPronunciation(
  client: SupabaseClient,
  a: { userId: string; lexiconId: string; blob: Blob },
): Promise<Result<{ id: string }>> {
  const tooBig = checkAudioSize(a.blob)
  if (tooBig) return { data: null, error: tooBig }

  const path = lexiconAudioPath(a.userId, a.lexiconId, Date.now(), extensionForMime(a.blob.type))
  const bucket = client.storage.from(LEXICON_AUDIO_BUCKET)
  const up = await bucket.upload(path, a.blob, { contentType: baseMimeType(a.blob.type), upsert: false })
  if (up.error) return { data: null, error: GENERIC }

  const { data, error } = await client.rpc('add_lexicon_pronunciation', { p_lexicon_id: a.lexiconId, p_path: path })
  if (error) {
    await bucket.remove([path])
    return { data: null, error: audioErrorMessage(error.message) }
  }
  return { data: { id: data as string }, error: null }
}

export async function deletePronunciation(client: SupabaseClient, id: string): Promise<Result<true>> {
  const { data, error } = await client.rpc('delete_lexicon_pronunciation', { p_id: id })
  if (error) return { data: null, error: audioErrorMessage(error.message) }
  // Best effort: the row is gone, an orphan file is harmless.
  if (typeof data === 'string' && data) await client.storage.from(LEXICON_AUDIO_BUCKET).remove([data])
  return { data: true, error: null }
}

export async function listPronunciations(client: SupabaseClient, lexiconId: string): Promise<PronunciationRow[]> {
  const { data, error } = await client.rpc('get_lexicon_pronunciations', { p_lexicon_id: lexiconId })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, string>[]).map(r => ({
    id: r.id,
    path: r.path,
    author: r.author,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

/** Reports a recording with a message (there is nothing to propose in place of a sound). */
export async function reportPronunciation(client: SupabaseClient, recordingId: string, message: string): Promise<Result<true>> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { data: null, error: 'Connectez-vous pour signaler un enregistrement.' }
  const input = { targetType: 'pronunciation' as const, targetId: recordingId, field: 'audio', kind: 'other' as const, message }
  const checked = checkCorrectionInput(input)
  if (!checked.message) return { data: null, error: 'Expliquez le problème (par exemple : bruit, mauvais mot).' }
  if (checked.error) return { data: null, error: checked.error }
  const { error } = await client.from('corrections').insert({
    target_type: 'pronunciation',
    target_id: recordingId,
    field: 'audio',
    kind: 'other',
    message: checked.message,
    suggestion: null,
    reporter_id: user.id,
  })
  if (error?.code === '23505') return { data: null, error: 'Vous avez déjà signalé cet enregistrement.' }
  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}
```

Adjust the test of `reportPronunciation` if `checkCorrectionInput` returns a different message for the empty case: the order above returns the « Expliquez le problème… » message first when `message` is blank, which the test expects.

- [ ] **Step 4: Run tests and types**

`npx vitest run lexicon-audio-data` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/lib/lexicon-audio-data.ts web/__tests__/lexicon-audio-data.test.ts
git commit -m "feat(lexicon): data layer for pronunciation upload, delete, list and report" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Configurable recorder

**Files:**
- Modify: `web/components/courses/PronunciationRecorder.tsx`
- Create: `web/__tests__/pronunciation-recorder.test.tsx`

**Interfaces:**
- Produces: `PronunciationRecorder` props gain optional `maxSeconds?: number` (default `MAX_RECORDING_SECONDS`), `startLabel?: string` (default « Enregistrer ma prononciation »), `sendLabel?: string` (default « Envoyer à l’enseignant »), `sendingLabel?: string` (default « Envoi… »). Course usage unchanged.

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/pronunciation-recorder.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'

describe('PronunciationRecorder (initial state)', () => {
  it('keeps the course wording by default', () => {
    const html = renderToStaticMarkup(<PronunciationRecorder onSend={() => {}} />)
    expect(html).toContain('Enregistrer ma prononciation')
  })
  it('takes the start label from the caller', () => {
    const html = renderToStaticMarkup(<PronunciationRecorder onSend={() => {}} startLabel="Enregistrer la prononciation" />)
    expect(html).toContain('Enregistrer la prononciation')
    expect(html).not.toContain('ma prononciation')
  })
  it('can be disabled', () => {
    expect(renderToStaticMarkup(<PronunciationRecorder onSend={() => {}} disabled />)).toContain('disabled')
  })
})
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run pronunciation-recorder` → FAIL on the second test (label not configurable).

- [ ] **Step 3: Implement**

In `PronunciationRecorder.tsx`:
1. `Props` gets `maxSeconds?: number; startLabel?: string; sendLabel?: string; sendingLabel?: string`.
2. Destructure with defaults: `maxSeconds = MAX_RECORDING_SECONDS, startLabel = 'Enregistrer ma prononciation', sendLabel = 'Envoyer à l’enseignant', sendingLabel = 'Envoi…'`.
3. Replace the two uses of `MAX_RECORDING_SECONDS` in the component body (the timer comparison `prev + 1 >= MAX_RECORDING_SECONDS` and the displayed `{seconds}s / {MAX_RECORDING_SECONDS}s`) by `maxSeconds`.
4. Replace the start button text by `{startLabel}` and the send button text by `{sending ? sendingLabel : sendLabel}`.
Nothing else changes (keep the file's style; the import of `MAX_RECORDING_SECONDS` stays for the default).

- [ ] **Step 4: Run tests**

`npx vitest run pronunciation-recorder course-pronunciation` → PASS; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/components/courses/PronunciationRecorder.tsx web/__tests__/pronunciation-recorder.test.tsx
git commit -m "feat: configurable length and labels for the pronunciation recorder" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Entry page section

**Files:**
- Create: `web/components/lexicon/PronunciationList.tsx`, `web/components/lexicon/PronunciationSection.tsx`, `web/__tests__/pronunciation-section.test.tsx`
- Modify: `web/app/lexicon/[id]/page.tsx`

**Interfaces:**
- Consumes: `PronunciationRow`, `listPronunciations`, `uploadPronunciation`, `deletePronunciation`, `reportPronunciation` (Task 4); `publicAudioUrl`, `MAX_AUDIO_PER_USER`, `MAX_LEXICON_AUDIO_SECONDS` (Task 3); `PronunciationRecorder` (Task 5).
- Produces:
```tsx
// PronunciationList.tsx — presentational
export function PronunciationList(props: {
  items: PronunciationRow[]
  userId: string | null
  isAdmin: boolean
  busy: boolean
  error: string
  notice: string
  onDelete: (id: string) => void
  onReport: (id: string, message: string) => void
}): JSX.Element
// PronunciationSection.tsx — container
export function PronunciationSection(props: { lexiconId: string }): JSX.Element
```

- [ ] **Step 1: Write the failing static-markup tests**

Create `web/__tests__/pronunciation-section.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PronunciationList } from '@/components/lexicon/PronunciationList'

const rows = [
  { id: 'r1', path: 'u1/e1/2.webm', author: 'Awa', createdBy: 'u1', createdAt: '2026-10-04T10:00:00Z' },
  { id: 'r2', path: 'u2/e1/1.webm', author: 'Contributeur', createdBy: 'u2', createdAt: '2026-10-03T10:00:00Z' },
]
const list = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <PronunciationList items={rows} userId="u1" isAdmin={false} busy={false} error="" notice="" onDelete={() => {}} onReport={() => {}} {...over} />,
  )

describe('PronunciationList', () => {
  it('shows a player and the author for each recording', () => {
    const html = list()
    expect((html.match(/<audio/g) ?? []).length).toBe(2)
    expect(html).toContain('Awa')
    expect(html).toContain('Contributeur')
    expect(html).toContain('/storage/v1/object/public/lexicon-pronunciations/u1/e1/2.webm')
    expect(html).toContain('preload="none"')
  })
  it('offers « Supprimer » on the author’s own recording and « Signaler » on the others', () => {
    const html = list()
    expect((html.match(/Supprimer/g) ?? []).length).toBe(1)
    expect((html.match(/Signaler/g) ?? []).length).toBe(1)
  })
  it('lets an admin delete every recording', () => {
    const html = list({ userId: 'boss', isAdmin: true })
    expect((html.match(/Supprimer/g) ?? []).length).toBe(2)
  })
  it('offers nothing to a signed-out visitor but the players', () => {
    const html = list({ userId: null })
    expect(html).not.toContain('Supprimer')
    expect(html).not.toContain('Signaler')
    expect((html.match(/<audio/g) ?? []).length).toBe(2)
  })
  it('says there is no recording yet', () => {
    expect(list({ items: [] })).toContain('Aucune prononciation enregistrée')
  })
  it('shows an error and a notice', () => {
    const html = list({ error: 'Oups.', notice: 'Signalement envoyé.' })
    expect(html).toContain('Oups.')
    expect(html).toContain('Signalement envoyé.')
  })
})
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run pronunciation-section` → FAIL.

- [ ] **Step 3: Implement `PronunciationList.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { publicAudioUrl } from '@/lib/lexicon-audio'
import type { PronunciationRow } from '@/lib/lexicon-audio-data'

interface Props {
  items: PronunciationRow[]
  /** null: signed out (listening only). */
  userId: string | null
  isAdmin: boolean
  busy: boolean
  error: string
  notice: string
  onDelete: (id: string) => void
  onReport: (id: string, message: string) => void
}

const btn = 'rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50'
const formatDate = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

export function PronunciationList({ items, userId, isAdmin, busy, error, notice, onDelete, onReport }: Props) {
  const [reporting, setReporting] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Aucune prononciation enregistrée pour ce mot.</p>
        {notice && <p className="text-xs text-primary" role="status">{notice}</p>}
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map(r => {
          const mine = userId !== null && r.createdBy === userId
          const canDelete = mine || isAdmin
          return (
            <li key={r.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{r.author}</span>
                  {formatDate(r.createdAt) && ` · ${formatDate(r.createdAt)}`}
                </span>
                <span className="flex gap-2">
                  {canDelete && (
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Supprimer cet enregistrement ?')) onDelete(r.id)
                      }}
                    >
                      Supprimer
                    </button>
                  )}
                  {userId !== null && !mine && (
                    <button type="button" className={btn} disabled={busy} onClick={() => setReporting(reporting === r.id ? null : r.id)}>
                      Signaler
                    </button>
                  )}
                </span>
              </div>
              <audio controls preload="none" src={publicAudioUrl(r.path)} className="w-full" />
              {reporting === r.id && (
                <div className="space-y-2">
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                    rows={2}
                    maxLength={1000}
                    placeholder="Qu’est-ce qui ne va pas ? (bruit, mauvais mot…)"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                  />
                  <button
                    type="button"
                    className={`${btn} bg-primary text-primary-foreground`}
                    disabled={busy}
                    onClick={() => {
                      onReport(r.id, message)
                      setReporting(null)
                      setMessage('')
                    }}
                  >
                    Envoyer le signalement
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {notice && <p className="text-xs text-primary" role="status">{notice}</p>}
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Implement `PronunciationSection.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'
import { PronunciationList } from '@/components/lexicon/PronunciationList'
import { createClient } from '@/lib/supabase-browser'
import { MAX_AUDIO_PER_USER, MAX_LEXICON_AUDIO_SECONDS } from '@/lib/lexicon-audio'
import {
  deletePronunciation, listPronunciations, reportPronunciation, uploadPronunciation,
  type PronunciationRow,
} from '@/lib/lexicon-audio-data'

/** « Prononciation » of an entry: listen, record (signed in), delete (author or admin), report. */
export function PronunciationSection({ lexiconId }: { lexiconId: string }) {
  const client = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [items, setItems] = useState<PronunciationRow[] | null>(null)
  // undefined until the session is known: nothing is offered before that
  const [userId, setUserId] = useState<string | null | undefined>(undefined)
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => setItems(await listPronunciations(client, lexiconId)), [client, lexiconId])

  useEffect(() => {
    let cancelled = false
    client.auth.getUser().then(async ({ data }) => {
      if (cancelled) return
      setUserId(data.user?.id ?? null)
      if (data.user) {
        const res = await client.rpc('is_admin')
        if (!cancelled) setIsAdmin(res.data === true)
      }
    })
    load()
    return () => {
      cancelled = true
    }
  }, [client, load])

  const mine = userId ? (items ?? []).filter(i => i.createdBy === userId).length : 0

  async function run(action: () => Promise<{ error: string | null }>, done = '') {
    setBusy(true)
    setError('')
    setNotice('')
    const res = await action()
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setNotice(done)
    await load()
  }

  return (
    <section id="prononciation" className="space-y-3">
      <h2 className="font-semibold text-lg font-heading">Prononciation</h2>
      {items === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <PronunciationList
          items={items}
          userId={userId ?? null}
          isAdmin={isAdmin}
          busy={busy}
          error={error}
          notice={notice}
          onDelete={id => run(() => deletePronunciation(client, id))}
          onReport={(id, message) => run(() => reportPronunciation(client, id, message), 'Signalement envoyé, merci.')}
        />
      )}

      {userId === null && (
        <p className="text-xs text-muted-foreground">
          <Link href={`/auth?next=${encodeURIComponent(pathname)}`} className="text-primary underline underline-offset-2">
            Connectez-vous
          </Link>{' '}
          pour enregistrer la prononciation de ce mot.
        </p>
      )}
      {userId && mine >= MAX_AUDIO_PER_USER && (
        <p className="text-xs text-muted-foreground">
          Vous avez déjà {MAX_AUDIO_PER_USER} enregistrements pour ce mot : supprimez-en un pour en ajouter.
        </p>
      )}
      {userId && mine < MAX_AUDIO_PER_USER && (
        <PronunciationRecorder
          maxSeconds={MAX_LEXICON_AUDIO_SECONDS}
          startLabel="Enregistrer la prononciation"
          sendLabel="Publier"
          sendingLabel="Publication…"
          sending={busy}
          onSend={blob => run(() => uploadPronunciation(client, { userId, lexiconId, blob }), 'Enregistrement publié, merci !')}
        />
      )}
    </section>
  )
}
```

`PronunciationRecorder` keeps showing the recorded preview after sending; after a successful publish the section reloads but the recorder still shows « Publier ». To reset it, give the recorder a `key` that changes with the number of recordings: use `key={items?.length ?? 0}` on the `<PronunciationRecorder … />` element.

- [ ] **Step 5: Mount it on the entry page**

In `web/app/lexicon/[id]/page.tsx` add `import { PronunciationSection } from '@/components/lexicon/PronunciationSection'` and render `<PronunciationSection lexiconId={entry.id} />` right after the marker block (`{entry.entry_kind === 'marker' && (…)}`) and before `<LexiconDescription …/>`.

- [ ] **Step 6: Run tests and types**

`npx vitest run pronunciation-section` → PASS; `npx tsc --noEmit` → clean; `npx eslint components/lexicon lib/lexicon-audio.ts lib/lexicon-audio-data.ts` → clean.

- [ ] **Step 7: Commit**

```bash
git branch --show-current   # must print: master
git add web/components/lexicon web/__tests__/pronunciation-section.test.tsx "web/app/lexicon/[id]/page.tsx"
git commit -m "feat(lexicon): pronunciation section on the entry page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reviewing reports on a recording

**Files:**
- Modify: `web/components/CorrectionItem.tsx`
- Create: `web/__tests__/correction-item-pronunciation.test.tsx`

**Interfaces:**
- Consumes: `deletePronunciation` (Task 4), `publicAudioUrl` (Task 3), `correctionHref` (Task 3: `/lexicon/{id}#prononciation`).
- Behaviour for `correction.target_type === 'pronunciation'`: a player for `correction.original` (the reported file's path); the reject button reads « Ignorer le signalement » instead of « Refuser »; a resolver (author or admin) also gets « Supprimer l’enregistrement » (calls `deletePronunciation(client, correction.target_id)` then `onChanged`); no « Accepter », no « Avant / Proposé » block (no suggestion).

- [ ] **Step 1: Write the failing test**

Create `web/__tests__/correction-item-pronunciation.test.tsx` (static markup; `createClient` is only called in the component's `useRef(createClient())` initialiser, so mock the module):

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/supabase-browser', () => ({ createClient: () => ({}) }))

import { CorrectionItem } from '@/components/CorrectionItem'
import type { Correction } from '@/lib/corrections'

const base: Correction = {
  id: 'c1', target_type: 'pronunciation', target_id: 'rec1', field: 'audio', kind: 'other', message: 'Trop de bruit.',
  suggestion: null, original: 'u1/e1/1.webm', label: 'ghèhi-wu', ref_id: 'e1', owner_id: 'u1', reporter_id: 'u2',
  reporter_name: 'Kofi', status: 'open', resolved_by: null, resolved_at: null, created_at: '2026-10-04T10:00:00Z',
}
const render = (over: { userId: string | null; isAdmin: boolean }) =>
  renderToStaticMarkup(<CorrectionItem correction={base} userId={over.userId} isAdmin={over.isAdmin} showTarget onChanged={() => {}} />)

describe('CorrectionItem for a pronunciation report', () => {
  it('lets the author listen, dismiss or delete the recording', () => {
    const html = render({ userId: 'u1', isAdmin: false })
    expect(html).toContain('<audio')
    expect(html).toContain('/lexicon-pronunciations/u1/e1/1.webm')
    expect(html).toContain('Trop de bruit.')
    expect(html).toContain('Ignorer le signalement')
    expect(html).toContain('Supprimer l’enregistrement')
    expect(html).not.toContain('Accepter')
    expect(html).not.toContain('Proposé')
    expect(html).toContain('/lexicon/e1#prononciation')
  })
  it('gives an admin the same actions', () => {
    const html = render({ userId: 'boss', isAdmin: true })
    expect(html).toContain('Ignorer le signalement')
    expect(html).toContain('Supprimer l’enregistrement')
  })
  it('gives the reporter only the player and « Retirer mon signalement »', () => {
    const html = render({ userId: 'u2', isAdmin: false })
    expect(html).toContain('<audio')
    expect(html).not.toContain('Ignorer le signalement')
    expect(html).not.toContain('Supprimer l’enregistrement')
    expect(html).toContain('Retirer mon signalement')
  })
})
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run correction-item-pronunciation` → FAIL.

- [ ] **Step 3: Implement**

In `CorrectionItem.tsx`: import `deletePronunciation` from `@/lib/lexicon-audio-data` and `publicAudioUrl` from `@/lib/lexicon-audio`. Add `const isAudio = c.target_type === 'pronunciation'`. After the `{c.message && …}` paragraph add:

```tsx
      {isAudio && c.original && <audio controls preload="none" src={publicAudioUrl(c.original)} className="w-full" />}
```
Change the reject button text to `{isAudio ? 'Ignorer le signalement' : 'Refuser'}`. After it, inside the same `{resolver && …}` condition add:

```tsx
        {resolver && isAudio && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!window.confirm('Supprimer cet enregistrement ?')) return
              run(() => deletePronunciation(supabaseRef.current, c.target_id).then(r => ({ error: r.error })))
            }}
          >
            Supprimer l’enregistrement
          </Button>
        )}
```
(The « Accepter » button already requires `c.suggestion`; the « Avant / Proposé » block already requires it.)

- [ ] **Step 4: Run tests and types**

`npx vitest run correction-item-pronunciation corrections` → PASS; `npx tsc --noEmit` → clean. Also open `web/components/CorrectionList.tsx` and `web/app/profile` usages of `CorrectionItem`: they pass `showTarget`, nothing else to change (the label and link come from `TARGET_TYPE_LABELS` and `correctionHref`).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/components/CorrectionItem.tsx web/__tests__/correction-item-pronunciation.test.tsx
git commit -m "feat(lexicon): review reports on a recording (listen, dismiss, delete)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Reader play button

**Files:**
- Modify: `web/components/VerseWords.tsx`, `web/__tests__/verse-words.test.tsx`

**Interfaces:**
- Consumes: `LexSummary.audio` (Task 3), `publicAudioUrl` (Task 3).
- Behaviour: in `DictionaryPart` (word entries) and in the marker block (marker entries), when `lex.audio` is non-empty show a button `aria-label="Écouter la prononciation"` that plays the most recent recording (`audio[0]`); when `audio.length > 1` also a link « Voir toutes les prononciations » to `/lexicon/{id}#prononciation`. The audio element is created only on click.

- [ ] **Step 1: Write the failing tests**

In `web/__tests__/verse-words.test.tsx` (reuse its `entry` and `oneBlock` helpers from the lexicon work):

```tsx
const rec = (id: string) => ({ id, path: `u/e/${id}.webm`, author: 'Awa', createdAt: '2026-10-04T10:00:00Z' })

it('offers to listen to a word that has a recording, without loading the audio', () => {
  const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry({ audio: [rec('1')] })) as never} mode="B" initialOpen={0} />)
  expect(html).toContain('aria-label="Écouter la prononciation"')
  expect(html).not.toContain('<audio')
  expect(html).not.toContain('Voir toutes les prononciations')
})

it('links to all the recordings when there are several', () => {
  const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry({ audio: [rec('1'), rec('2')] })) as never} mode="B" initialOpen={0} />)
  expect(html).toContain('Voir toutes les prononciations')
  expect(html).toContain('/lexicon/L1#prononciation')
})

it('shows nothing about sound when the entry has no recording or the field is missing', () => {
  for (const audio of [[], undefined]) {
    const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry({ audio })) as never} mode="B" initialOpen={0} />)
    expect(html).not.toContain('Écouter la prononciation')
    expect(html).not.toContain('prononciations')
  }
})

it('offers the play button on a marker entry too', () => {
  const m = entry({ kind: 'marker', senses: [], senseId: null, audio: [rec('1')], marker: { type: 'temps', meaning: 'futur', french: null } })
  const html = renderToStaticMarkup(<VerseWords verse={oneBlock(m, { is_marker: true, marker: m.marker }) as never} mode="B" initialOpen={0} />)
  expect(html).toContain('aria-label="Écouter la prononciation"')
})
```

- [ ] **Step 2: Run to verify failure**

`npx vitest run verse-words` → FAIL on the new tests.

- [ ] **Step 3: Implement**

In `VerseWords.tsx` add (near `DictionaryPart`):

```tsx
import { Volume2 } from 'lucide-react'
import { publicAudioUrl } from '@/lib/lexicon-audio'

/** Plays the most recent recording of the entry. The audio is only created when the button is pressed. */
function ListenButton({ lex }: { lex: LexSummary }) {
  const audio = lex.audio ?? []
  const [playing, setPlaying] = useState(false)
  if (audio.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label="Écouter la prononciation"
        aria-pressed={playing}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted"
        onClick={() => {
          const a = new Audio(publicAudioUrl(audio[0].path))
          setPlaying(true)
          a.onended = () => setPlaying(false)
          a.onerror = () => setPlaying(false)
          a.play().catch(() => setPlaying(false))
        }}
      >
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
        Écouter
      </button>
      {audio.length > 1 && (
        <a href={`/lexicon/${lex.id}#prononciation`} className="text-xs text-primary underline underline-offset-2">
          Voir toutes les prononciations
        </a>
      )}
    </span>
  )
}
```
(import `type LexSummary` from `@/lib/word-blocks` if the file does not already.) Render `<ListenButton lex={lex} />`: (a) in `DictionaryPart`, on the line with the spelling/IPA/category (`<p className="flex flex-wrap items-baseline gap-x-2">`), as its last child; (b) in the marker block of `WordDetail`, right under the « Marqueur grammatical » label, when `tk.lex?.kind === 'marker'`. Since `DictionaryPart` returns `null` for marker entries, add the marker button directly in the marker block: `{tk.lex?.kind === 'marker' && <ListenButton lex={tk.lex} />}`.

- [ ] **Step 4: Run tests and types**

`npx vitest run verse-words verse-translation` → PASS; `npx tsc --noEmit` → clean; `npx eslint components/VerseWords.tsx` → clean.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print: master
git add web/components/VerseWords.tsx web/__tests__/verse-words.test.tsx
git commit -m "feat(lexicon): play button for the pronunciation in the reader's word detail" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Verification and rollout stop

**Files:** none new (fix whatever the checks reveal).

- [ ] **Step 1: Re-run everything**

From `web/`:
1. Apply the migration once more on the local DB (must succeed with no error, a second time in a row).
2. `npx tsc --noEmit` → clean.
3. `npx vitest run --exclude "**/rls/**"` → all pass.
4. RLS files one at a time: `lexicon-pronunciations`, `lexicon-from-word-links`, `resource-word-links`, `corrections`, `corrections-helpers`, `search-lexicon`, `lexicon-translations`, `function-grants`. All pass. `function-grants` lists which functions clients may call: if it fails on the four new functions, add them with their roles (`add_lexicon_pronunciation` and `delete_lexicon_pronunciation`: authenticated only; `get_lexicon_pronunciations`: anon and authenticated) in that test's style; `lexicon_summary` stays uncallable.
5. `npm run lint` → no new errors; `npm run build` → succeeds.
6. Read-only production check with the Supabase MCP `execute_sql` on project `agdqbzbjcxrzfhkvempe`: `select to_regclass('public.lexicon_pronunciations');` (expect null before the rollout) and `select id, public from storage.buckets where id = 'lexicon-pronunciations';` (expect no row). If either already exists, stop and report.

- [ ] **Step 2: Browser check (do it, or say it was not done)**

Start the dev server the way the project does (`npm run dev` in `web/` against the local stack; if Turbopack fails on the deep path, use `npx next dev --webpack`). Sign in, open a lexicon entry (`/lexicon/<id>` of an entry created from `/relier`), and check with a real microphone: the recorder asks for permission, records, previews, « Publier » adds the item; the item plays; a second account sees « Signaler » and not « Supprimer »; the report shows on `/corrections` for the author with the player and the two buttons; deleting removes the item and the report. Then open a resource whose word is linked to that entry and press « Écouter » in the word detail. If any of this cannot be run here, say exactly which part was not verified in the final report; do not claim it.

- [ ] **Step 3: Commit any fix**

```bash
git branch --show-current   # must print: master
git status
git add <only the files you changed>
git commit -m "fix(lexicon): <what the checks revealed>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Stop for the production rollout**

Do **not** apply anything to production and do **not** push. Report: what was built, the commands run and their results, what was not verified. Rollout steps for the user:
1. In the Supabase SQL editor of project `agdqbzbjcxrzfhkvempe` (check the ref in the URL), run `supabase/migrations/20261009000000_lexicon_pronunciations.sql`, then `notify pgrst, 'reload schema';`.
2. Push `master` so Vercel deploys the frontend (the previous frontend ignores the new `audio` field, so applying the migration first is safe).
3. Check in the Storage page that the bucket `lexicon-pronunciations` exists and is public.

---

## Self-Review (done while writing)

**Spec coverage.** Bucket + policies (Task 1), table + RLS (1), add/delete functions with their error codes (1), per-user limit 3 (1, tests), reports via corrections incl. constraint, `correction_column`, guard branch, cleanup trigger, TS mirror (2, 3), `audio` in `lexicon_summary` and thus `get_lexicon_entry` / `get_resource_words` / `find_lexicon_candidates` (2), recorder props (5), helpers `lexicon-audio.ts` (3), data layer (4), entry page section for author / admin / other / signed-out (6), review page items (7), reader play button and « Voir toutes » link (8), edge cases (upload refused → file removed: Task 4 test; microphone errors: existing recorder messages; entry deleted: `entry_not_found`), rollout and manual check (9). The spec's `listPronunciations` need for author names is met by the added `get_lexicon_pronunciations` function (the profile table is not public).

**Placeholder scan.** No TBD/TODO. One deliberate "copy then add" instruction (Task 2, `lexicon_summary`) is paired with the full body and the exact key, because the live body lives in a file the executor can diff against.

**Type consistency.** `PronunciationRow` (`id, path, author, createdBy, createdAt`) is the same in Tasks 4 and 6; `LexAudio` (`id, path, author, createdAt`) in Tasks 3 and 8; SQL `created_at` ↔ TS `createdAt` mapped in `audioList` / `listPronunciations`; error codes in SQL (`not_signed_in`, `entry_not_found`, `bad_path`, `file_not_found`, `too_many`, `not_allowed`, `not_found`) all appear in `MESSAGES`; limits 10 s / 1 MB / 3 identical in SQL, constants and tests.
