// web/__tests__/rls/resource-word-links.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { normWord, splitWords } from '../../lib/word-blocks'
import { admin, anonClient, createUser, must, type TestUser } from './helpers'

const BLOCK = (bete: number[], gloss: number[], over: Record<string, unknown> = {}) => ({
  bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, ...over,
})

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

  it('does not let clients write blocks directly', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const hash = await hashOf('a b c', 'x y z', 1)
    const row = { resource_id: id, verse_no: 1, position: 1, bete_idx: [0], gloss_idx: [0], verse_hash: hash }
    expect((await alice.client.from('resource_word_blocks').insert(row)).error).not.toBeNull()
    expect((await anonClient().from('resource_word_blocks').insert(row)).error).not.toBeNull()
    expect((await alice.client.from('lexicon_spellings').insert({ lexicon_id: id, spelling: 'a' })).error).not.toBeNull()

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

describe('save_resource_verse', () => {
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([createUser('wls-alice'), createUser('wls-bob')])
  })

  const THREE = [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [2])]

  const save = (user: TestUser, id: string, over: Record<string, unknown> = {}) =>
    user.client.rpc('save_resource_verse', {
      p_resource: id, p_verse: 1, p_base_bete: 'a b c', p_base_literal: 'x y z',
      p_bete_line: null, p_literal_line: null, p_blocks: THREE, ...over,
    })

  const rows = async (id: string) =>
    must(await admin.from('resource_word_blocks').select('*').eq('resource_id', id).order('verse_no').order('position'), 'rows')

  it('saves a balanced verse for the contributor and numbers the blocks by sentence order', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    const res = await save(alice, id, { p_blocks: [BLOCK([2], [0]), BLOCK([0, 1], [1, 2])] })
    expect(res.error).toBeNull()
    expect(res.data.saved).toBe(2)
    const saved = await rows(id)
    expect(saved.map(r => [r.position, r.bete_idx, r.gloss_idx])).toEqual([[1, [0, 1], [1, 2]], [2, [2], [0]]])
    expect(saved[0].verse_hash).toBe(res.data.verse_hash)
  })

  it('refuses anyone but the contributor, and anonymous callers', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    expect((await save(bob, id)).error?.message).toContain('not_owner')
    expect((await save({ client: anonClient() } as TestUser, id)).error?.code).toBe('42501')
    expect(await rows(id)).toHaveLength(0)
  })

  it('refuses a save built on an older text and writes nothing', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    ok(await admin.from('community_texts').update({ content_bete: 'a b d' }).eq('id', id), 'edit elsewhere')
    const res = await save(alice, id)
    expect(res.error?.message).toContain('text_changed')
    expect(await rows(id)).toHaveLength(0)
  })

  it.each([
    ['empty_block', [BLOCK([], [0])]],
    ['bete_index_out_of_range', [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([5], [2])]],
    ['bete_index_not_increasing', [BLOCK([1, 0], [0]), BLOCK([2], [1, 2])]],
    ['bete_word_in_two_blocks', [BLOCK([0, 1], [0]), BLOCK([1], [1]), BLOCK([2], [2])]],
    ['bete_word_uncovered', [BLOCK([0], [0]), BLOCK([1], [1, 2])]],
    ['gloss_index_out_of_range', [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [9])]],
    ['gloss_word_in_two_blocks', [BLOCK([0], [0]), BLOCK([1], [0, 1]), BLOCK([2], [2])]],
    ['gloss_word_uncovered', [BLOCK([0], [0]), BLOCK([1, 2], [1])]],
    ['block_without_gloss', [BLOCK([0], [0, 1, 2]), BLOCK([1], []), BLOCK([2], [])]],
    ['solo_has_gloss', [BLOCK([0], [0]), BLOCK([1], [1], { solo: true, is_marker: true }), BLOCK([2], [2])]],
    ['solo_not_marker', [BLOCK([0], [0, 1]), BLOCK([1], [], { solo: true }), BLOCK([2], [2])]],
  ])('rejects %s', async (code, blocks) => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const res = await save(alice, id, { p_blocks: blocks })
    expect(res.error?.message).toContain(code)
    expect(await rows(id)).toHaveLength(0)
  })

  it('replaces the previous blocks of the verse atomically and leaves other verses alone', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    expect((await save(alice, id)).error).toBeNull()
    expect((await save(alice, id, { p_verse: 2, p_base_bete: 'd e', p_base_literal: 'w v', p_blocks: [BLOCK([0], [0]), BLOCK([1], [1])] })).error).toBeNull()
    expect((await save(alice, id, { p_blocks: [BLOCK([0, 1, 2], [0, 1, 2])] })).error).toBeNull()
    const saved = await rows(id)
    expect(saved.map(r => [r.verse_no, r.position])).toEqual([[1, 1], [2, 1], [2, 2]])
    // a failing save leaves the verse as it was
    expect((await save(alice, id, { p_blocks: [BLOCK([0], [0])] })).error).not.toBeNull()
    expect((await rows(id)).filter(r => r.verse_no === 1)).toHaveLength(1)
  })

  it('applies a corrected line to the text and keeps blank lines and the usage index', async () => {
    const id = await resource(alice.id, 'a b c\n\nd e', 'x y z\n\nw v')
    const res = await save(alice, id, {
      p_bete_line: 'a bb c', p_literal_line: 'x yy z',
      p_blocks: THREE,
    })
    expect(res.error).toBeNull()
    const text = must(await admin.from('community_texts').select('content_bete, content_literal').eq('id', id).single(), 'text')
    expect(text.content_bete).toBe('a bb c\n\nd e')
    expect(text.content_literal).toBe('x yy z\n\nw v')
    const lines = must(await admin.from('usage_lines').select('bete').eq('source_type', 'resource').eq('source_id', id), 'usage')
    expect(lines.map(l => l.bete)).toContain('a bb c')
    // the saved verse is not stale after its own correction
    const { data } = await anonClient().rpc('get_resource_words', { p_resource: id })
    expect(data[0].stale).toBe(false)
  })

  it('lets a correction merge two words into one', async () => {
    const id = await resource(alice.id, 'a en men c', 'x y z')
    const res = await save(alice, id, {
      p_base_bete: 'a en men c', p_bete_line: 'a enmen c', p_blocks: THREE,
    })
    expect(res.error).toBeNull()
    const text = must(await admin.from('community_texts').select('content_bete').eq('id', id).single(), 'text')
    expect(text.content_bete).toBe('a enmen c')
  })

  it('counts words like the browser with tabs, non-breaking spaces and Windows line endings', async () => {
    const id = await resource(alice.id, 'x\r\na\u00a0b\tc  d', 'p q r s')
    const res = await save(alice, id, {
      p_verse: 2, p_base_bete: 'a\u00a0b\tc  d', p_base_literal: 'p q r s',
      p_blocks: [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [2]), BLOCK([3], [3])],
    })
    // the literal field has a single line, so verse 2 has no mot à mot
    expect(res.error?.message).toContain('literal_missing')
    const id2 = await resource(alice.id, 'x\r\na\u00a0b\tc  d', 'y\r\np q r s')
    const ok = await save(alice, id2, {
      p_verse: 2, p_base_bete: 'a\u00a0b\tc  d', p_base_literal: 'p q r s',
      p_blocks: [BLOCK([0], [0]), BLOCK([1], [1]), BLOCK([2], [2]), BLOCK([3], [3])],
    })
    expect(ok.error).toBeNull()
  })

  it('refuses a verse that does not exist', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    expect((await save(alice, id, { p_verse: 4 })).error?.message).toContain('verse_not_found')
  })

  it('deletes the blocks with the resource', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    await save(alice, id, { p_blocks: THREE })
    ok(await admin.from('community_texts').delete().eq('id', id), 'delete resource')
    expect(await rows(id)).toHaveLength(0)
  })

  const textOf = async (id: string) =>
    must(await admin.from('community_texts').select('content_bete, content_literal').eq('id', id).single(), 'text')

  it('refuses a blank corrected line and leaves text and blocks alone', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    expect((await save(alice, id)).error).toBeNull()
    const res = await save(alice, id, { p_bete_line: ' ' })
    expect(res.error?.message).toContain('bad_line')
    expect(await textOf(id)).toEqual({ content_bete: 'a b c\nd e', content_literal: 'x y z\nw v' })
    expect(await rows(id)).toHaveLength(3)
  })

  it('refuses a corrected line containing a line break', async () => {
    const id = await resource(alice.id, 'a b c\nd e', 'x y z\nw v')
    const res = await save(alice, id, { p_literal_line: 'x y\nz' })
    expect(res.error?.message).toContain('bad_line')
    expect(await textOf(id)).toEqual({ content_bete: 'a b c\nd e', content_literal: 'x y z\nw v' })
    expect(await rows(id)).toHaveLength(0)
  })

  it('refuses an empty block list on a verse that has words', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    const res = await save(alice, id, { p_blocks: [] })
    expect(res.error?.message).toContain('bete_word_uncovered')
    expect(await rows(id)).toHaveLength(0)
  })

  it('leaves the text unchanged when text_changed fires with a correction', async () => {
    const id = await resource(alice.id, 'a b c', 'x y z')
    ok(await admin.from('community_texts').update({ content_bete: 'a b d' }).eq('id', id), 'edit elsewhere')
    const res = await save(alice, id, { p_bete_line: 'a b zz' })
    expect(res.error?.message).toContain('text_changed')
    expect((await textOf(id)).content_bete).toBe('a b d')
  })

  it('is not callable by anonymous clients', async () => {
    const res = await anonClient().rpc('save_resource_verse', {
      p_resource: '00000000-0000-0000-0000-000000000000', p_verse: 1, p_base_bete: '', p_base_literal: '',
      p_bete_line: null, p_literal_line: null, p_blocks: [],
    })
    expect(res.error?.code).toBe('42501')
  })
})
