// web/__tests__/rls/resource-word-links.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { normWord, splitWords } from '../../lib/word-blocks'
import { admin, anonClient, createUser, must, type TestUser } from './helpers'

const BLOCK = (bete: number[], gloss: number[], over: Record<string, unknown> = {}) => ({
  bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, ...over,
})
void BLOCK

async function resource(ownerId: string, bete: string, literal: string | null) {
  return must(
    await admin
      .from('community_texts')
      .insert({ title: 'Chant', type: 'song', content_bete: bete, content_literal: literal, created_by: ownerId })
      .select('id')
      .single(),
    'seed resource',
  ).id as string
}

/** insert/update/delete return no data by default: only the error matters. */
const ok = (res: { error: { message: string } | null }, what: string) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
}

const hashOf = async (bete: string, literal: string, n: number) =>
  must(await admin.rpc('verse_hash', { p_bete: bete, p_literal: literal, p_n: n }), 'verse_hash') as unknown as string

describe('resource word links: tables and reading', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('wl-alice'), createUser('wl-bob')])
  })

  it('does not let clients write blocks or markers directly', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const hash = await hashOf('a b c', 'x y z', 1)
    const row = { resource_id: id, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash }
    expect((await alice.client.from('resource_word_blocks').insert(row)).error).not.toBeNull()
    expect((await anonClient().from('resource_word_blocks').insert(row)).error).not.toBeNull()
    expect((await alice.client.from('resource_word_markers').insert({ resource_id: id, word_norm: 'a', word: 'a' })).error).not.toBeNull()

    ok(await admin.from('resource_word_blocks').insert(row), 'seed block')
    // with RLS and no policy, update and delete match no row (no error, no effect)
    await alice.client.from('resource_word_blocks').update({ note: 'hack' }).eq('resource_id', id)
    await alice.client.from('resource_word_blocks').delete().eq('resource_id', id)
    const after = must(await admin.from('resource_word_blocks').select('note').eq('resource_id', id), 'read back')
    expect(after).toHaveLength(1)
    expect(after[0].note).toBeNull()
  })

  it('returns each verse with its blocks to anonymous readers', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    const hash = await hashOf('a b c\nd e', 'x y z\nw v', 1)
    ok(
      await admin.from('resource_word_blocks').insert([
        { resource_id: id, verse_no: 1, position: 1, bete_idx: [0, 2], gloss_idx: [0], verse_hash: hash, note: 'n' },
        { resource_id: id, verse_no: 1, position: 2, bete_idx: [1], gloss_idx: [1, 2], verse_hash: hash },
      ]),
      'seed blocks',
    )
    const { data, error } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ verse_no: 1, stale: false, bete_line: 'a b c', literal_line: 'x y z' })
    expect(data[0].blocks.map((b: { position: number }) => b.position)).toEqual([1, 2])
    expect(data[0].blocks[0]).toMatchObject({ bete_idx: [0, 2], gloss_idx: [0], note: 'n', is_marker: false, marker: null })
  })

  it('marks a verse stale and returns no blocks once its text changed', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const hash = await hashOf('a b c', 'x y z', 1)
    ok(await admin.from('resource_word_blocks').insert({ resource_id: id, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash }), 'seed')
    ok(await admin.from('community_texts').update({ content_literal: 'x y q' }).eq('id', id), 'edit text')
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data[0]).toMatchObject({ verse_no: 1, stale: true, blocks: [] })
  })

  it('attaches the shared marker meaning to every block of that word', async () => {
    const id = await resource(alice.id, 'en ye\nen ye', 'je va\nje va')
    const h1 = await hashOf('en ye\nen ye', 'je va\nje va', 1)
    const h2 = await hashOf('en ye\nen ye', 'je va\nje va', 2)
    ok(
      await admin.from('resource_word_blocks').insert([
        { resource_id: id, verse_no: 1, position: 1, bete_idx: [1], gloss_idx: [1], is_marker: true, verse_hash: h1 },
        { resource_id: id, verse_no: 2, position: 1, bete_idx: [1], gloss_idx: [1], is_marker: true, verse_hash: h2 },
      ]),
      'seed',
    )
    ok(await admin.from('resource_word_markers').insert({ resource_id: id, word_norm: 'ye', word: 'ye', marker_type: 'temps', marker_meaning: 'futur', marker_french: 'aller + verbe' }), 'marker')
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data.map((v: { blocks: { marker: unknown }[] }) => v.blocks[0].marker)).toEqual([
      { type: 'temps', meaning: 'futur', french: 'aller + verbe' },
      { type: 'temps', meaning: 'futur', french: 'aller + verbe' },
    ])
  })

  it('returns nothing for a resource without blocks or one that does not exist', async () => {
    const id = await resource(alice.id, 'a b', 'x y')
    expect((await anonClient().rpc('get_resource_words', { p_resource: id })).data).toEqual([])
    expect((await anonClient().rpc('get_resource_words', { p_resource: '00000000-0000-0000-0000-000000000000' })).data).toEqual([])
  })

  it('keeps word counting in step with the browser, including odd whitespace and CRLF', async () => {
    const lines = ['a  b\tc', 'a b c', '  a b  ', "Na'a ghèhi-wu ô"]
    for (const line of lines) {
      const { data } = await admin.rpc('block_words', { p_line: line, p_idx: splitWords(line).map((_, i) => i) })
      expect(data).toBe(splitWords(line).join(' '))
    }
  })

  it('computes the same marker key as the browser for ordinary Bété words', async () => {
    for (const w of ['ghèhi-wu', "Na'a", 'ô', 'mä', 'kämaniè', 'Téa', 'Sataa', 'A', 'ghéhi-wu']) {
      const { data } = await admin.rpc('block_word_norm', { p_line: w, p_idx: [0] })
      expect(data).toBe(normWord(w))
    }
  })

  it('keeps the helper functions away from clients', async () => {
    for (const [fn, args] of [
      ['verse_line', { p_text: 'a', p_n: 1 }],
      ['verse_hash', { p_bete: 'a', p_literal: 'b', p_n: 1 }],
      ['replace_nth_line', { p_text: 'a', p_n: 1, p_line: 'b' }],
      ['word_count', { p_line: 'a b' }],
    ] as const) {
      expect((await alice.client.rpc(fn, args)).error?.code).toBe('42501')
      expect((await anonClient().rpc(fn, args)).error?.code).toBe('42501')
    }
    void bob
  })
})
