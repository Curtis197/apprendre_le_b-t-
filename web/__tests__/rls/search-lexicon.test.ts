// web/__tests__/rls/search-lexicon.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, must, uid } from './helpers'

type Row = { id: string; matched_french: string | null; total_count: number; rank: number }

describe('search_lexicon', () => {
  const tag = `zq${uid()}`
  const ids: Record<string, string> = {}

  async function seed(key: string, extra: Record<string, unknown>) {
    ids[key] = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${key}-${tag}`,
          bete_phonetic: `x-${key}`,
          french_candidates: [],
          top_french: 'manger',
          probability: 1,
          pos: ['noun'],
          ...extra,
        })
        .select('id')
        .single(),
      `seed ${key}`,
    ).id
  }

  const search = async (args: Record<string, unknown>) =>
    must(await anonClient().rpc('search_lexicon', args), 'search') as Row[]
  const idsOf = (rows: Row[]) => rows.map(r => r.id)

  beforeAll(async () => {
    await seed('exact', { bete_phonetic: tag })
    await seed('prefix', { bete_phonetic: `${tag}xa` })
    await seed('contains', { bete_phonetic: `ya${tag}` })
    await seed('accent', { bete_phonetic: `${tag}éba` })
    await seed('ipa', { bete_phonetic: 'zzz', bete_word: `${tag}ɛba` })
    await seed('french', { bete_phonetic: `${tag}fr` })
    await seed('verb', { bete_phonetic: `${tag}vb`, pos: ['verb'] })
    await seed('north', { bete_phonetic: `${tag}nd`, dialect: 'northern' })
    await seed('frag', { bete_phonetic: `${tag}fg`, pos: ['fragment'] })
    await seed('pending', { bete_phonetic: '', bete_word: `_pending_${tag}` })
    must(
      await admin.from('lexicon_translations').insert({ lexicon_id: ids.french, french: `${tag}été` }).select('id').single(),
      'extra translation',
    )
  })

  it('ranks exact, then prefix, then contains', async () => {
    const rows = await search({ q: tag, p_dialect: 'western' })
    const order = idsOf(rows).filter(id => [ids.exact, ids.prefix, ids.contains].includes(id))
    expect(order).toEqual([ids.exact, ids.prefix, ids.contains])
  })

  it('ignores case and accents, in the Latin form', async () => {
    expect(idsOf(await search({ q: `${tag}EBA` }))).toContain(ids.accent)
    expect(idsOf(await search({ q: `${tag}éba` }))).toContain(ids.accent)
  })

  it('matches the IPA form', async () => {
    expect(idsOf(await search({ q: `${tag}ɛba` }))).toContain(ids.ipa)
  })

  it('finds a word from any of its French translations and reports which one matched', async () => {
    const rows = await search({ q: `${tag}ete` })
    const hit = rows.find(r => r.id === ids.french)
    expect(hit?.matched_french).toBe(`${tag}été`)
  })

  it('does not treat % or _ as wildcards', async () => {
    expect(await search({ q: `${tag}%` })).toEqual([])
    expect(await search({ q: `${tag}_` })).toEqual([])
    expect(await search({ q: `${tag}\\` })).toEqual([])
  })

  it('returns nothing for a blank query', async () => {
    expect(await search({ q: '   ' })).toEqual([])
    expect(await search({ q: '' })).toEqual([])
  })

  it('hides placeholders and fragments', async () => {
    const found = idsOf(await search({ q: tag }))
    expect(found).not.toContain(ids.pending)
    expect(found).not.toContain(ids.frag)
  })

  it('filters by dialect (null = all) and by part of speech', async () => {
    expect(idsOf(await search({ q: tag, p_dialect: 'western' }))).not.toContain(ids.north)
    expect(idsOf(await search({ q: tag, p_dialect: 'northern' }))).toContain(ids.north)
    expect(idsOf(await search({ q: tag }))).toContain(ids.north)
    expect(idsOf(await search({ q: tag, p_pos: 'verb' }))).toEqual([ids.verb])
  })

  it('paginates and reports the full count on every row', async () => {
    const all = await search({ q: tag, p_dialect: 'western', p_limit: 50 })
    const first = await search({ q: tag, p_dialect: 'western', p_limit: 2, p_offset: 0 })
    const rest = await search({ q: tag, p_dialect: 'western', p_limit: 50, p_offset: 2 })
    expect(first).toHaveLength(2)
    expect(first[0].total_count).toBe(all.length)
    expect([...idsOf(first), ...idsOf(rest)]).toEqual(idsOf(all))
  })
})
