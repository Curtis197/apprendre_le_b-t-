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

describe('create_lexicon_entry', () => {
  let alice: TestUser
  beforeAll(async () => {
    alice = await createUser('cle-alice')
  })

  it('creates a word with its senses, spellings fields and example, authored by the caller', async () => {
    const args = entryArgs({
      p_ipa: `ɡɛ̀hi-${uid()}`, p_pos: ['noun'], p_description: 'Le ciel.', p_synonyms: ['firmament'],
      p_senses: [{ french: 'ciel', context: 'en haut' }, { french: 'haut', context: null }],
      p_example: { bete: 'a b', french: 'x y', literal: 'x y' },
    })
    const res = await rpc(alice, 'create_lexicon_entry', args)
    expect(res.error).toBeNull()
    expect(res.data.existed).toBe(false)
    expect(res.data.sense_ids).toHaveLength(2)
    const row = must(await admin.from('lexicon').select('*').eq('id', res.data.id).single(), 'row')
    expect(row).toMatchObject({
      created_by: alice.id, validated: false, source: 'contributed', entry_kind: 'word', top_french: 'ciel',
      bete_phonetic: args.p_spelling, bete_word: args.p_ipa, pos: ['noun'], description: 'Le ciel.', embedding: null,
    })
    const senses = must(await admin.from('lexicon_translations').select('french, context, position').eq('lexicon_id', res.data.id).order('position'), 's')
    expect(senses.map(s => [s.french, s.context])).toEqual([['ciel', 'en haut'], ['haut', null]])
    expect(must(await admin.from('lexicon_examples').select('bete_snippet, created_by').eq('lexicon_id', res.data.id), 'ex')).toEqual([
      { bete_snippet: 'a b', created_by: alice.id },
    ])
    expect(res.data.entry).toMatchObject({ id: res.data.id, kind: 'word', spelling: args.p_spelling, ipa: args.p_ipa, pos: ['noun'] })
    expect(res.data.entry.senses.map((s: { french: string }) => s.french)).toEqual(['ciel', 'haut'])
  })

  it('uses the spelling as the IPA field when none is given, and reports no IPA', async () => {
    const args = entryArgs()
    const res = await rpc(alice, 'create_lexicon_entry', args)
    const row = must(await admin.from('lexicon').select('bete_word, bete_phonetic').eq('id', res.data.id).single(), 'row')
    expect(row.bete_word).toBe(args.p_spelling)
    expect(res.data.entry.ipa).toBeNull()
  })

  it('returns the existing entry instead of a duplicate, also for a concurrent pair', async () => {
    const args = entryArgs()
    const [a, b] = await Promise.all([rpc(alice, 'create_lexicon_entry', args), rpc(alice, 'create_lexicon_entry', args)])
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data.id).toBe(b.data.id)
    expect([a.data.existed, b.data.existed].sort()).toEqual([false, true])
    const again = await rpc(alice, 'create_lexicon_entry', args)
    expect(again.data).toMatchObject({ id: a.data.id, existed: true })
  })

  it('creates a marker with no sense, no French and an empty meaning', async () => {
    const res = await rpc(alice, 'create_lexicon_entry', entryArgs({ p_kind: 'marker', p_senses: [] }))
    expect(res.error).toBeNull()
    const row = must(await admin.from('lexicon').select('*').eq('id', res.data.id).single(), 'row')
    expect(row).toMatchObject({ entry_kind: 'marker', top_french: '', marker_meaning: null, pos: null, probability: 0 })
    expect(must(await admin.from('lexicon_translations').select('id').eq('lexicon_id', res.data.id), 't')).toHaveLength(0)
  })

  it.each([
    ['sense_required', { p_senses: [] }],
    ['sense_required', { p_senses: [{ french: '  ', context: null }] }],
    ['bad_spelling', { p_spelling: '   ' }],
    ['bad_spelling', { p_spelling: 'x'.repeat(101) }],
    ['bad_dialect', { p_dialect: 'martian' }],
    ['bad_kind', { p_kind: 'verb' }],
  ])('refuses with %s', async (code, over) => {
    const res = await rpc(alice, 'create_lexicon_entry', entryArgs(over))
    expect(res.error?.message).toContain(code)
  })

  it('is not callable by anonymous clients', async () => {
    expect((await rpc(null, 'create_lexicon_entry', entryArgs())).error?.code).toBe('42501')
  })
})

describe('add_lexicon_spelling and set_marker_meaning', () => {
  let alice: TestUser
  let bob: TestUser
  let boss: TestUser
  beforeAll(async () => {
    ;[alice, bob, boss] = await Promise.all([createUser('sp-alice'), createUser('sp-bob'), createUser('sp-boss')])
    await makeAdmin(boss.id)
  })

  const word = async () => (await rpc(alice, 'create_lexicon_entry', entryArgs())).data as { id: string; entry: { spelling: string } }
  const marker = async () => (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_kind: 'marker', p_senses: [] }))).data.id as string

  it('adds a spelling, trimmed, and refuses empty, own-form and repeated spellings', async () => {
    const w = await word()
    const ok = await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: '  ghéhi-wu ' })
    expect(ok.error).toBeNull()
    const row = must(await admin.from('lexicon_spellings').select('spelling, created_by').eq('id', ok.data).single(), 'row')
    expect(row).toEqual({ spelling: 'ghéhi-wu', created_by: bob.id })
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: 'GHÉHI-WU' })).error?.message).toContain('spelling_exists')
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: w.entry.spelling.toUpperCase() })).error?.message).toContain('spelling_exists')
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: ' ' })).error?.message).toContain('bad_spelling')
    expect((await rpc(bob, 'add_lexicon_spelling', { p_lexicon_id: '00000000-0000-0000-0000-000000000000', p_spelling: 'zz' })).error?.message).toContain('entry_not_found')
    expect((await rpc(null, 'add_lexicon_spelling', { p_lexicon_id: w.id, p_spelling: 'zz' })).error?.code).toBe('42501')
  })

  it('lets anyone set a marker meaning while it is empty, then only the author or an admin', async () => {
    const id = await marker()
    expect((await rpc(bob, 'set_marker_meaning', { p_lexicon_id: id, p_type: ' temps ', p_meaning: 'futur', p_french: 'aller + verbe' })).error).toBeNull()
    const row = must(await admin.from('lexicon').select('marker_type, marker_meaning, marker_french').eq('id', id).single(), 'row')
    expect(row).toEqual({ marker_type: 'temps', marker_meaning: 'futur', marker_french: 'aller + verbe' })
    expect((await rpc(bob, 'set_marker_meaning', { p_lexicon_id: id, p_type: 'x', p_meaning: 'y', p_french: '' })).error?.message).toContain('meaning_already_set')
    expect((await rpc(alice, 'set_marker_meaning', { p_lexicon_id: id, p_type: 'temps', p_meaning: 'futur proche', p_french: '' })).error).toBeNull()
    expect((await rpc(boss, 'set_marker_meaning', { p_lexicon_id: id, p_type: 'temps', p_meaning: 'futur', p_french: '' })).error).toBeNull()
    expect((await rpc(null, 'set_marker_meaning', { p_lexicon_id: id, p_type: '', p_meaning: 'a', p_french: '' })).error?.code).toBe('42501')
  })

  it('refuses a word entry and too-long text', async () => {
    const w = await word()
    expect((await rpc(alice, 'set_marker_meaning', { p_lexicon_id: w.id, p_type: '', p_meaning: 'a', p_french: '' })).error?.message).toContain('not_a_marker')
    const id = await marker()
    expect((await rpc(alice, 'set_marker_meaning', { p_lexicon_id: id, p_type: '', p_meaning: 'x'.repeat(301), p_french: '' })).error?.message).toContain('too_long')
  })

  it('keeps the entry empty when the first fill is blank', async () => {
    const id = await marker()
    expect((await rpc(bob, 'set_marker_meaning', { p_lexicon_id: id, p_type: '', p_meaning: '  ', p_french: '' })).error).toBeNull()
    expect(must(await admin.from('lexicon').select('marker_meaning').eq('id', id).single(), 'row').marker_meaning).toBeNull()
  })
})

describe('find_lexicon_candidates and get_lexicon_entry', () => {
  let alice: TestUser
  const tag = uid()
  let westId: string
  let eastId: string
  let markerId: string

  beforeAll(async () => {
    alice = await createUser('fc-alice')
    westId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `ghèhiwu${tag}`, p_dialect: 'western' }))).data.id
    eastId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `ghèhiwu${tag}`, p_ipa: `ɡɛ̀hiwu${tag}`, p_dialect: 'eastern' }))).data.id
    markerId = (await rpc(alice, 'create_lexicon_entry', entryArgs({ p_spelling: `ye${tag}`, p_kind: 'marker', p_senses: [] }))).data.id
    await rpc(alice, 'add_lexicon_spelling', { p_lexicon_id: westId, p_spelling: `rhéhiwu${tag}` })
  })

  const find = async (text: string, extra: Record<string, unknown> = {}) => {
    const res = await rpc(null, 'find_lexicon_candidates', { p_text: text, ...extra })
    expect(res.error).toBeNull()
    return res.data as { match_kind: string; matched: string; distance: number; entry: { id: string; kind: string; spellings: string[] } }[]
  }

  it('finds an exact spelling, ignoring case, in both dialects with the asked dialect first', async () => {
    const rows = await find(`GHÈHIWU${tag}`, { p_dialect: 'eastern' })
    expect(rows.map(r => [r.entry.id, r.match_kind])).toEqual([[eastId, 'exact'], [westId, 'exact']])
    expect((await find(`ghèhiwu${tag}`, { p_dialect: 'western' })).map(r => r.entry.id)).toEqual([westId, eastId])
  })

  it('finds a spelling without accents or tones as a normalised match', async () => {
    const rows = await find(`ghehiwu${tag}`)
    expect(rows.map(r => r.match_kind)).toEqual(['norm', 'norm'])
  })

  it('finds an extra spelling and a near spelling (distance 1 from 3 characters)', async () => {
    const extra = await find(`rhéhiwu${tag}`)
    expect(extra.find(r => r.entry.id === westId)).toMatchObject({ match_kind: 'exact', matched: `rhéhiwu${tag}` })
    const near = await find(`ghèhiwo${tag}`)
    expect(near.find(r => r.entry.id === westId)).toMatchObject({ match_kind: 'near', distance: 1 })
  })

  it('does not match short words by distance and tolerates odd input', async () => {
    expect(await find('zz')).toEqual([])
    for (const odd of ['', '   ', 'a', "%_'\"\\", 'x'.repeat(100), '\u00a0\u00a0', 'ÀÉÎÕÜ']) {
      const res = await rpc(null, 'find_lexicon_candidates', { p_text: odd })
      expect(res.error).toBeNull()
    }
  })

  it('filters by kind and returns both kinds without a filter', async () => {
    expect((await find(`ye${tag}`)).map(r => r.entry.kind)).toEqual(['marker'])
    expect(await find(`ye${tag}`, { p_kind: 'word' })).toEqual([])
    expect((await find(`ye${tag}`, { p_kind: 'marker' }))[0].entry.id).toBe(markerId)
  })

  it('caps the list', async () => {
    expect((await find(`ghèhiwu${tag}`, { p_limit: 1 })).length).toBe(1)
  })

  it('returns the summary through get_lexicon_entry for anyone, null when missing', async () => {
    const res = await rpc(null, 'get_lexicon_entry', { p_id: westId })
    expect(res.data).toMatchObject({ id: westId, kind: 'word', spellings: [`rhéhiwu${tag}`] })
    expect((await rpc(null, 'get_lexicon_entry', { p_id: '00000000-0000-0000-0000-000000000000' })).data).toBeNull()
    expect((await rpc(null, 'lexicon_summary', { p_id: westId })).error?.code).toBe('42501')
  })
})

export { rpc, entryArgs }
