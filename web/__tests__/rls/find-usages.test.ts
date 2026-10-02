// web/__tests__/rls/find-usages.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, must, uid } from './helpers'

type Usage = {
  source_id: string
  line_no: number
  bete: string
  match_kind: 'exact' | 'variant'
  matched_tokens: string[]
  similarity: number
  total_count: number
}

describe('find_usages', () => {
  const ids = new Set<string>()
  let A: string // resource with several lines
  let B: string // resource with apostrophe/tone spellings
  let C: string // resource with 5 identical lines (paging)

  async function resource(content_bete: string, extra: Record<string, unknown> = {}) {
    const id = must(
      await admin.from('community_texts').insert({ title: 'T', type: 'song', content_bete, ...extra }).select('id').single(),
      'seed',
    ).id as string
    ids.add(id)
    return id
  }

  // Only our own fixtures count: the database may hold other texts.
  const find = async (args: Record<string, unknown>) => {
    const rows = must(await anonClient().rpc('find_usages', { p_limit: 50, ...args }), 'find') as Usage[]
    return rows.filter(r => ids.has(r.source_id))
  }

  beforeAll(async () => {
    A = await resource('kaba nunu sakuli\nkaaba mimi\nbá lolo\nzizu mimi', {
      content_french: 'Il mange le riz\nElle mangeait\nIl boit de l’eau\nL’été arrive',
    })
    B = await resource('mɔ̀ʼwa ko\nsa ni')
    C = await resource('zoro a\nzoro b\nzoro c\nzoro d\nzoro e')
  })

  afterAll(async () => {
    await admin.from('community_texts').delete().in('id', [...ids])
  })

  it('finds a word exactly and reports the matched token', async () => {
    const rows = await find({ q: 'nunu' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ source_id: A, line_no: 0, match_kind: 'exact', matched_tokens: ['nunu'], similarity: 1 })
  })

  it('lists exact matches before spelling variants', async () => {
    const rows = await find({ q: 'kaba' })
    expect(rows.map(r => [r.line_no, r.match_kind])).toEqual([[0, 'exact'], [1, 'variant']])
    expect(rows[1].matched_tokens).toEqual(['kaaba'])
    expect(rows[1].similarity).toBeGreaterThanOrEqual(0.4)
    expect(rows[1].similarity).toBeLessThan(1)
  })

  it('treats case, tone marks and apostrophes as the same word', async () => {
    expect((await find({ q: 'BA' })).map(r => [r.line_no, r.match_kind])).toContainEqual([2, 'exact'])
    const viaApostrophe = await find({ q: 'mɔwa' })
    expect(viaApostrophe).toMatchObject([{ source_id: B, line_no: 0, match_kind: 'exact', matched_tokens: ['mɔ̀ʼwa'] }])
    expect(await find({ q: "ʼMɔ̀wa" })).toHaveLength(1)
  })

  it('does not return half the corpus for a very short query', async () => {
    const rows = await find({ q: 'ba' })
    // 'ba' is exact in line 2 ("bá"); at most one-letter-edit neighbours of the same length window follow.
    expect(rows.every(r => r.match_kind === 'exact' || r.similarity > 0)).toBe(true)
    expect(rows.length).toBeLessThanOrEqual(6)
  })

  it('requires every word of a multi-word query on the same line', async () => {
    expect((await find({ q: 'kaba nunu' })).map(r => r.line_no)).toEqual([0])
    expect(await find({ q: 'kaba zizu' })).toEqual([])
  })

  it('bridges the Latin and IPA forms of a lexicon entry', async () => {
    const id = await resource('xyzza ɲazbi ko')
    expect(await find({ q: 'gnab' })).toEqual([])

    const word = must(
      await admin
        .from('lexicon')
        .insert({ bete_phonetic: 'gnab', bete_word: 'ɲazbi', french_candidates: [], top_french: 'x', probability: 1 })
        .select('id')
        .single(),
      'word',
    ).id
    try {
      const rows = await find({ q: 'gnab' })
      expect(rows).toMatchObject([{ source_id: id, match_kind: 'exact', matched_tokens: ['ɲazbi'] }])
      expect((await find({ q: 'ɲazbi' })).map(r => r.source_id)).toEqual([id])
    } finally {
      await admin.from('lexicon').delete().eq('id', word)
    }
  })

  describe('French side', () => {
    it('matches inflections by stem, ignoring accents', async () => {
      const rows = await find({ q: 'manger', p_side: 'fr' })
      expect(rows.map(r => r.line_no)).toEqual([0, 1])
      expect(rows.every(r => r.match_kind === 'exact')).toBe(true)
      expect((await find({ q: 'ete', p_side: 'fr' })).map(r => r.line_no)).toEqual([3])
      expect((await find({ q: "l'eau", p_side: 'fr' })).map(r => r.line_no)).toEqual([2])
    })

    it('does not search the Bété text', async () => {
      expect(await find({ q: 'nunu', p_side: 'fr' })).toEqual([])
    })
  })

  describe('hostile and degenerate queries', () => {
    it.each(['%', '_', '\\', '...', '   ', '', '%%%%', "'"])('returns nothing for %j and does not error', async q => {
      expect(await find({ q })).toEqual([])
    })

    it('ignores an unknown side', async () => {
      expect(await find({ q: 'nunu', p_side: 'xx' })).toEqual([])
    })

    it('caps the number of query words', async () => {
      const q = Array.from({ length: 12 }, (_, i) => `w${i}x`).join(' ')
      expect(await find({ q })).toEqual([])
    })
  })

  describe('paging', () => {
    it('pages through all usages with a stable order and a total on every row', async () => {
      const all = await find({ q: 'zoro', p_limit: 50 })
      expect(all).toHaveLength(5)
      const p1 = await find({ q: 'zoro', p_limit: 2, p_offset: 0 })
      const p2 = await find({ q: 'zoro', p_limit: 2, p_offset: 2 })
      const p3 = await find({ q: 'zoro', p_limit: 2, p_offset: 4 })
      expect([...p1, ...p2, ...p3].map(r => r.line_no)).toEqual(all.map(r => r.line_no))
      expect(p1[0].total_count).toBeGreaterThanOrEqual(5)
      expect(C).toBeTruthy()
    })

    it('defaults to 5 and never returns more than 50', async () => {
      const raw = must(await anonClient().rpc('find_usages', { q: 'zoro' }), 'default') as Usage[]
      expect(raw.length).toBeLessThanOrEqual(5)
      const big = must(await anonClient().rpc('find_usages', { q: 'zoro', p_limit: 5000 }), 'big') as Usage[]
      expect(big.length).toBeLessThanOrEqual(50)
    })
  })
})
