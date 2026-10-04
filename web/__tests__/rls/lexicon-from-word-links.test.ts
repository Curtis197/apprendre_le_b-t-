// web/__tests__/rls/lexicon-from-word-links.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, createUser, makeAdmin, must, uid, type TestUser } from './helpers'

const rpc = (user: TestUser | null, fn: string, args: Record<string, unknown>) =>
  (user ? user.client : anonClient()).rpc(fn, args)

const entryArgs = (over: Record<string, unknown> = {}) => ({
  p_spelling: `ghèhi-${uid()}`, p_ipa: null, p_dialect: 'western', p_kind: 'word', p_pos: null,
  p_description: null, p_notes: null, p_synonyms: null, p_lemma: null,
  p_senses: [{ french: 'ciel', context: null }], p_example: null, ...over,
})

describe('lexicon insert guard and spellings table', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('lx-alice'), createUser('lx-bob')])
  })

  it('forces author, validation, votes, source and embedding on a client insert', async () => {
    const word = `ipa-${uid()}`
    const res = await alice.client
      .from('lexicon')
      .insert({
        bete_word: word, bete_phonetic: `lat-${uid()}`, french_candidates: [], top_french: 'manger', probability: 1,
        validated: true, upvotes: 50, source: 'seed', created_by: bob.id, entry_kind: 'marker', marker_meaning: 'faux',
      })
      .select('id')
      .single()
    expect(res.error).toBeNull()
    const row = must(await admin.from('lexicon').select('*').eq('id', res.data!.id).single(), 'row')
    expect(row).toMatchObject({
      created_by: alice.id, validated: false, upvotes: 0, source: 'contributed', embedding: null,
      entry_kind: 'word', marker_meaning: null,
    })
  })

  it('lets the service role write anything (seed scripts, security-definer functions)', async () => {
    const row = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${uid()}`, bete_phonetic: `lat-${uid()}`, french_candidates: [], top_french: 'x', probability: 1,
          validated: true, source: 'seed',
        })
        .select('validated, source')
        .single(),
      'seed',
    )
    expect(row).toEqual({ validated: true, source: 'seed' })
  })

  it('does not let a client change the kind or the marker fields by a direct update', async () => {
    const id = must(
      await admin
        .from('lexicon')
        .insert({ bete_word: `m-${uid()}`, bete_phonetic: `m-${uid()}`, french_candidates: [], top_french: '', probability: 0, entry_kind: 'marker' })
        .select('id')
        .single(),
      'marker',
    ).id as string
    await alice.client.from('lexicon').update({ entry_kind: 'word', marker_meaning: 'futur', marker_type: 'temps' }).eq('id', id)
    const row = must(await admin.from('lexicon').select('entry_kind, marker_meaning, marker_type').eq('id', id).single(), 'row')
    expect(row).toEqual({ entry_kind: 'marker', marker_meaning: null, marker_type: null })
  })

  it('stores spellings with a normalised form, once per entry, and lets only the service role insert', async () => {
    const id = must(
      await admin
        .from('lexicon')
        .insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'ciel', probability: 1 })
        .select('id')
        .single(),
      'word',
    ).id as string
    expect((await alice.client.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'x' })).error).not.toBeNull()
    expect((await anonClient().from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'x' })).error).not.toBeNull()
    expect((await admin.from('lexicon_spellings').insert({ lexicon_id: id, spelling: ' Ghéhi-Wu ' })).error).toBeNull()
    const rows = must(await admin.from('lexicon_spellings').select('spelling, spelling_norm').eq('lexicon_id', id), 'rows')
    expect(rows).toEqual([{ spelling: 'Ghéhi-Wu', spelling_norm: 'ghehiwu' }])
    expect((await admin.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'ghéhi-wu' })).error).not.toBeNull()
    expect((await anonClient().from('lexicon_spellings').select('id').eq('lexicon_id', id)).data).toHaveLength(1)
  })

  it('lets only the author or an admin delete a spelling', async () => {
    const id = must(
      await admin
        .from('lexicon')
        .insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'ciel', probability: 1 })
        .select('id')
        .single(),
      'word',
    ).id as string
    const sp = must(
      await admin.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'abc', created_by: alice.id }).select('id').single(),
      'sp',
    ).id as string
    await bob.client.from('lexicon_spellings').delete().eq('id', sp)
    expect(must(await admin.from('lexicon_spellings').select('id').eq('id', sp), 'still')).toHaveLength(1)
    await alice.client.from('lexicon_spellings').delete().eq('id', sp)
    expect(must(await admin.from('lexicon_spellings').select('id').eq('id', sp), 'gone')).toHaveLength(0)
    void makeAdmin
  })

  it('adds the link columns to the blocks and unlinks them when the entry is deleted', async () => {
    const text = must(
      await admin.from('community_texts').insert({ title: 'T', type: 'song', content_bete: 'a b', content_literal: 'x y', created_by: alice.id }).select('id').single(),
      'text',
    ).id as string
    const lex = must(
      await admin.from('lexicon').insert({ bete_word: `w-${uid()}`, bete_phonetic: `w-${uid()}`, french_candidates: [], top_french: 'ciel', probability: 1 }).select('id').single(),
      'lex',
    ).id as string
    const tr = must(await admin.from('lexicon_translations').select('id').eq('lexicon_id', lex).single(), 'tr').id as string
    const hash = must(await admin.rpc('verse_hash', { p_bete: 'a b', p_literal: 'x y', p_n: 1 }), 'hash') as unknown as string
    must(
      await admin.from('resource_word_blocks').insert({ resource_id: text, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash, lexicon_id: lex, translation_id: tr }).select('id').single(),
      'block',
    )
    await admin.from('lexicon').delete().eq('id', lex)
    const b = must(await admin.from('resource_word_blocks').select('lexicon_id, translation_id').eq('resource_id', text).single(), 'after')
    expect(b).toEqual({ lexicon_id: null, translation_id: null })
  })
})

export { rpc, entryArgs }
