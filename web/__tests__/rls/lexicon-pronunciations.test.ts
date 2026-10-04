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
    expect(data!.allowed_mime_types).toEqual(expect.arrayContaining(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']))
    expect(data!.allowed_mime_types).toHaveLength(4)
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
