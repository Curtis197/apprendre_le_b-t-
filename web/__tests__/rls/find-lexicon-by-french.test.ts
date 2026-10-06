// web/__tests__/rls/find-lexicon-by-french.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, must, uid } from './helpers'

type Row = { matched: string; context: string | null; entry: { id: string; spelling: string; dialect: string } }

describe('find_lexicon_by_french', () => {
  const tag = `zq${uid()}`
  const ids: Record<string, string> = {}

  async function seed(key: string, french: string, extra: Record<string, unknown> = {}) {
    ids[key] = must(
      await admin
        .from('lexicon')
        .insert({
          bete_word: `ipa-${key}-${tag}`,
          bete_phonetic: `${tag}-${key}`,
          french_candidates: [],
          top_french: french,
          probability: 1,
          pos: ['noun'],
          ...extra,
        })
        .select('id')
        .single(),
      `seed ${key}`,
    ).id
  }

  const find = async (args: Record<string, unknown>) =>
    must(await anonClient().rpc('find_lexicon_by_french', args), 'find') as Row[]
  const idsOf = (rows: Row[]) => rows.map(r => r.entry.id)

  beforeAll(async () => {
    await seed('plain', `${tag}été`)
    await seed('north', `${tag}été`, { dialect: 'northern' })
    await seed('pending', `${tag}été`, { bete_phonetic: '', bete_word: `_pending_${tag}` })
    await seed('other', `${tag}hiver`)
    must(
      await admin
        .from('lexicon_translations')
        .insert({ lexicon_id: ids.other, french: `${tag}saison froide`, context: 'climat' })
        .select('id')
        .single(),
      'second sense',
    )
  })

  it('matches ignoring case, accents and surrounding spaces', async () => {
    for (const q of [`${tag}été`, `${tag}ETE`, `  ${tag}Eté  `]) {
      expect(idsOf(await find({ p_french: q, p_dialect: 'western' }))).toContain(ids.plain)
    }
  })

  it('ignores one leading article', async () => {
    for (const q of [`le ${tag}été`, `L'${tag}été`, `l’${tag}été`, `un ${tag}ete`, `des ${tag}été`, `de la ${tag}été`]) {
      expect(idsOf(await find({ p_french: q, p_dialect: 'western' }))).toContain(ids.plain)
    }
  })

  it('also matches a stored translation that starts with an article', async () => {
    must(
      await admin.from('lexicon_translations').insert({ lexicon_id: ids.plain, french: `la ${tag}chaleur` }).select('id').single(),
      'article translation',
    )
    expect(idsOf(await find({ p_french: `${tag}chaleur`, p_dialect: 'western' }))).toContain(ids.plain)
  })

  it('reports which translation matched and its context', async () => {
    const hit = (await find({ p_french: `${tag}saison froide`, p_dialect: 'western' })).find(r => r.entry.id === ids.other)
    expect(hit?.matched).toBe(`${tag}saison froide`)
    expect(hit?.context).toBe('climat')
  })

  it('is exact: no near or partial matches', async () => {
    expect(idsOf(await find({ p_french: `${tag}ét`, p_dialect: 'western' }))).not.toContain(ids.plain)
    expect(idsOf(await find({ p_french: `${tag}étés`, p_dialect: 'western' }))).not.toContain(ids.plain)
    expect(idsOf(await find({ p_french: `${tag}saison`, p_dialect: 'western' }))).not.toContain(ids.other)
  })

  it('stays in the requested dialect', async () => {
    const western = idsOf(await find({ p_french: `${tag}été`, p_dialect: 'western' }))
    expect(western).toContain(ids.plain)
    expect(western).not.toContain(ids.north)
    expect(idsOf(await find({ p_french: `${tag}été`, p_dialect: 'northern' }))).toEqual([ids.north])
  })

  it('never suggests placeholders', async () => {
    expect(idsOf(await find({ p_french: `${tag}été`, p_dialect: 'western' }))).not.toContain(ids.pending)
  })

  it('returns one row per entry even when several translations match', async () => {
    must(
      await admin.from('lexicon_translations').insert({ lexicon_id: ids.plain, french: `${tag}été`, context: 'saison' }).select('id').single(),
      'duplicate meaning with a context',
    )
    const rows = await find({ p_french: `${tag}été`, p_dialect: 'western' })
    expect(rows.filter(r => r.entry.id === ids.plain)).toHaveLength(1)
  })

  it('returns nothing for blank, article-only or over-long input', async () => {
    for (const q of ['', '   ', 'le', 'le ', "l'", 'de la ', 'x'.repeat(201)]) {
      expect(await find({ p_french: q, p_dialect: 'western' })).toEqual([])
    }
  })

  it('returns nothing, not an error, for a null argument', async () => {
    expect(await find({ p_french: null, p_dialect: 'western' })).toEqual([])
  })

  it('caps the number of rows', async () => {
    expect((await find({ p_french: `${tag}été`, p_dialect: null, p_limit: 1 })).length).toBeLessThanOrEqual(1)
  })
})
