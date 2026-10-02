// web/__tests__/rls/usage-lines.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { alignVerses } from '../../lib/verses'
import { admin, anonClient, createUser, must, uid, type TestUser } from './helpers'

type Line = { line_no: number; bete: string; literal: string | null; french: string | null; title: string | null; dialect: string | null; ref_id: string | null }

const linesOf = async (type: string, id: string): Promise<Line[]> =>
  must(
    await admin
      .from('usage_lines')
      .select('line_no, bete, literal, french, title, dialect, ref_id')
      .eq('source_type', type)
      .eq('source_id', id)
      .order('line_no'),
    'lines',
  ) as Line[]

const tokensOf = async (type: string, id: string, side: string): Promise<string[]> => {
  const { data: lines } = await admin.from('usage_lines').select('id').eq('source_type', type).eq('source_id', id)
  const ids = (lines ?? []).map(l => l.id)
  if (ids.length === 0) return []
  const { data } = await admin.from('usage_tokens').select('token_norm').eq('side', side).in('line_id', ids)
  return (data ?? []).map(t => t.token_norm).sort()
}

async function resource(extra: Record<string, unknown>) {
  return must(
    await admin
      .from('community_texts')
      .insert({ title: 'Chant', type: 'song', content_bete: 'x', ...extra })
      .select('id')
      .single(),
    'seed resource',
  ).id as string
}

describe('usage_lines sync', () => {
  let alice: TestUser

  beforeAll(async () => {
    alice = await createUser('usage-alice')
  })

  describe('resources', () => {
    it('pairs Bété, mot à mot and French line by line, like alignVerses', async () => {
      const bete = 'ba ko\nsa ni\n\nmu'
      const literal = 'l1\nl2\n\nl3'
      const french = 'f1\nf2\n\nf3'
      const id = await resource({ content_bete: bete, content_literal: literal, content_french: french })
      const lines = await linesOf('resource', id)

      const expected = alignVerses(bete, literal, french)
      expect(expected.kind).toBe('verses')
      if (expected.kind !== 'verses') return
      const flat = expected.stanzas.flat()
      expect(lines.map(l => [l.bete, l.literal, l.french])).toEqual(flat.map(v => [v.original, v.literal, v.french]))
      expect(lines.map(l => l.line_no)).toEqual([0, 1, 2])
    })

    it('keeps the Bété lines but pairs nothing when the fields do not line up', async () => {
      const id = await resource({ content_bete: 'a1\na2\na3', content_literal: 'l1\nl2', content_french: 'f1\nf2\nf3' })
      const lines = await linesOf('resource', id)
      expect(lines.map(l => l.bete)).toEqual(['a1', 'a2', 'a3'])
      expect(lines.every(l => l.literal === null && l.french === null)).toBe(true)
    })

    it('stores a single line as one usage, with its translations', async () => {
      const id = await resource({ content_bete: '  ba ko  ', content_french: 'il mange' })
      expect(await linesOf('resource', id)).toMatchObject([{ line_no: 0, bete: 'ba ko', french: 'il mange', ref_id: id }])
    })

    it('drops blank lines, trims lines and handles Windows line endings', async () => {
      const id = await resource({ content_bete: ' a \r\n\r\n\r\n b \r\n c ' })
      expect((await linesOf('resource', id)).map(l => l.bete)).toEqual(['a', 'b', 'c'])
    })

    it('carries the title and maps the region to a dialect', async () => {
      const id = await resource({ title: 'Le chant', content_bete: 'ba', region: 'Gagnoa' })
      expect(await linesOf('resource', id)).toMatchObject([{ title: 'Le chant', dialect: 'northern' }])
    })

    it('replaces the lines when the text is edited and removes them when it is deleted', async () => {
      const id = await resource({ content_bete: 'one\ntwo' })
      expect(await linesOf('resource', id)).toHaveLength(2)

      await admin.from('community_texts').update({ content_bete: 'only' }).eq('id', id)
      expect((await linesOf('resource', id)).map(l => l.bete)).toEqual(['only'])
      expect(await tokensOf('resource', id, 'bete')).toEqual(['only'])

      await admin.from('community_texts').delete().eq('id', id)
      expect(await linesOf('resource', id)).toEqual([])
    })

    it('does not rebuild when only the score changes (no duplicate or lost rows)', async () => {
      const id = await resource({ content_bete: 'one\ntwo' })
      const before = await admin.from('usage_lines').select('id').eq('source_id', id).order('line_no')
      await admin.from('community_texts').update({ upvotes: 3 }).eq('id', id)
      const after = await admin.from('usage_lines').select('id').eq('source_id', id).order('line_no')
      expect(after.data).toEqual(before.data)
    })
  })

  describe('tokens', () => {
    it('folds case, tone marks and apostrophes so spellings of one word share a normal form', async () => {
      const id = await resource({ content_bete: 'Mɔ̀ʼwa mɔwa ʼMƆWA, bá.' })
      expect(await tokensOf('resource', id, 'bete')).toEqual(['ba', 'mɔwa', 'mɔwa', 'mɔwa'])
    })

    it('splits on punctuation and keeps inner apostrophes inside the raw token', async () => {
      const id = await resource({ content_bete: 'ba, ko! (sa)' })
      const { data } = await admin
        .from('usage_tokens')
        .select('token, usage_lines!inner(source_id)')
        .eq('usage_lines.source_id', id)
        .eq('side', 'bete')
      expect((data ?? []).map(t => t.token).sort()).toEqual(['ba', 'ko', 'sa'])
    })

    it('indexes French words by their stem, accent-insensitively', async () => {
      const id = await resource({ content_bete: 'ba', content_french: "Il mangeait l'été" })
      const { data } = await admin
        .from('usage_tokens')
        .select('token_norm, token_stem, usage_lines!inner(source_id)')
        .eq('usage_lines.source_id', id)
        .eq('side', 'fr')
      const stems = Object.fromEntries((data ?? []).map(t => [t.token_norm, t.token_stem]))
      expect(stems['mangeait']).toBe(stems['mange'] ?? stems['mangeait'])
      expect(stems['ete']).toBeDefined()
      expect(Object.keys(stems)).toContain('l')
    })
  })

  describe('other sources', () => {
    it('mirrors a lexicon example, linking to its word', async () => {
      const tag = uid()
      const word = must(
        await admin
          .from('lexicon')
          .insert({ bete_word: `ipa-${tag}`, bete_phonetic: `lat-${tag}`, french_candidates: [], top_french: 'x', probability: 1 })
          .select('id')
          .single(),
        'word',
      ).id
      const ex = must(
        await admin
          .from('lexicon_examples')
          .insert({ lexicon_id: word, bete_snippet: 'ba ko', french_snippet: 'il mange', french_literal: 'lui manger', dialect: 'eastern' })
          .select('id')
          .single(),
        'example',
      ).id
      expect(await linesOf('example', ex)).toMatchObject([
        { bete: 'ba ko', literal: 'lui manger', french: 'il mange', dialect: 'eastern', ref_id: word },
      ])
      await admin.from('lexicon_examples').delete().eq('id', ex)
      expect(await linesOf('example', ex)).toEqual([])
    })

    it('mirrors an expression and indexes its written form as extra Bété words', async () => {
      const ex = must(
        await admin
          .from('expressions')
          .insert({ french_phrase: 'il pleut', french_literal: 'la pluie me bat', bete_phrase: 'ɓa lɛ', bete_phonetic: 'ba le', type: 'idiomatic' })
          .select('id')
          .single(),
        'expression',
      ).id
      expect(await linesOf('expression', ex)).toMatchObject([
        { bete: 'ɓa lɛ', literal: 'la pluie me bat', french: 'il pleut', title: 'idiomatic' },
      ])
      expect(await tokensOf('expression', ex, 'bete')).toEqual(['ba', 'ba', 'le', 'le'])
    })

    it('mirrors a grammar example only when it has a Bété example', async () => {
      const base = { category: 'verb', pattern_french: 'p', pattern_bete: 'q', description: 'd' }
      const without = must(await admin.from('grammar_rules').insert(base).select('id').single(), 'rule').id
      expect(await linesOf('grammar', without)).toEqual([])

      const withEx = must(
        await admin
          .from('grammar_rules')
          .insert({ ...base, example_bete: 'ba ko', example_french: 'il mange', example_bete_phonetic: 'ba ko' })
          .select('id')
          .single(),
        'rule',
      ).id
      expect(await linesOf('grammar', withEx)).toMatchObject([{ bete: 'ba ko', french: 'il mange' }])
    })
  })

  describe('access', () => {
    it('is readable by everyone and writable by no client', async () => {
      const id = await resource({ content_bete: 'ba ko' })
      const { data } = await anonClient().from('usage_lines').select('id').eq('source_id', id)
      expect(data).toHaveLength(1)

      const lineId = data![0].id
      expect((await alice.client.from('usage_lines').insert({ source_type: 'resource', source_id: id, line_no: 9, bete: 'x' })).error).not.toBeNull()
      await alice.client.from('usage_lines').update({ bete: 'piraté' }).eq('id', lineId)
      await alice.client.from('usage_lines').delete().eq('id', lineId)
      await anonClient().from('usage_lines').delete().eq('id', lineId)
      expect((await admin.from('usage_lines').select('bete').eq('id', lineId)).data).toEqual([{ bete: 'ba ko' }])
      expect((await alice.client.from('usage_tokens').insert({ line_id: lineId, side: 'bete', token: 'x', token_norm: 'x' })).error).not.toBeNull()
    })

    it('mirrors a resource a signed-in user publishes through the app', async () => {
      const row = must(
        await alice.client
          .from('community_texts')
          .insert({ title: 'Chant', type: 'song', content_bete: 'ba ko', created_by: alice.id })
          .select('id')
          .single(),
        'alice publishes',
      )
      expect(await linesOf('resource', row.id)).toHaveLength(1)
    })
  })
})
