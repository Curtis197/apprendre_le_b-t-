// web/__tests__/usages.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findUsages, normalizeSide, splitHighlight, usageHref, usageSourceLabel } from '../lib/usages'

const fake = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('findUsages', () => {
  it('does not call the database for a blank query', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    expect(await findUsages(client, { q: '  ' })).toEqual({ rows: [], total: 0, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps its options onto the SQL function arguments, defaulting to the Bété side and 5 rows', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    await findUsages(client, { q: ' kaba ' })
    expect(rpc).toHaveBeenCalledWith('find_usages', { q: 'kaba', p_side: 'bete', p_limit: 5, p_offset: 0 })
    await findUsages(client, { q: 'manger', side: 'fr', limit: 20, offset: 40 })
    expect(rpc).toHaveBeenLastCalledWith('find_usages', { q: 'manger', p_side: 'fr', p_limit: 20, p_offset: 40 })
  })

  it('returns the rows and the total from the first row', async () => {
    const { client } = fake({ data: [{ line_id: 'a', total_count: 9 }, { line_id: 'b', total_count: 9 }], error: null })
    const res = await findUsages(client, { q: 'kaba' })
    expect(res.rows).toHaveLength(2)
    expect(res.total).toBe(9)
  })

  it('reports a French error when the call fails', async () => {
    const { client } = fake({ data: null, error: { message: 'boom' } })
    expect(await findUsages(client, { q: 'kaba' })).toEqual({
      rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.',
    })
  })
})

describe('splitHighlight', () => {
  const joined = (parts: { text: string }[]) => parts.map(p => p.text).join('')

  it('marks the matched words and keeps every other character, including punctuation', () => {
    const parts = splitHighlight('Kaba nunu, sakuli!', ['nunu'])
    expect(joined(parts)).toBe('Kaba nunu, sakuli!')
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['nunu'])
  })

  it('matches the whole word only, not a substring of another word', () => {
    const parts = splitHighlight('kaba kabana', ['kaba'])
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['kaba'])
  })

  it('matches the word as stored: case, tone marks and apostrophes included', () => {
    const parts = splitHighlight('Mɔ̀ʼwa ko mɔwa', ['Mɔ̀ʼwa'])
    expect(parts.filter(p => p.match).map(p => p.text)).toEqual(['Mɔ̀ʼwa'])
  })

  it('returns one plain part when there is nothing to highlight', () => {
    expect(splitHighlight('kaba nunu', [])).toEqual([{ text: 'kaba nunu', match: false }])
    expect(splitHighlight('', ['x'])).toEqual([])
  })

  it('does not treat tokens as patterns', () => {
    expect(joined(splitHighlight('a.b a+b', ['a+b', '.*']))).toBe('a.b a+b')
  })
})

describe('labels and links', () => {
  it('names each source in French', () => {
    expect(usageSourceLabel({ source_type: 'resource', title: 'Le chant' })).toBe('Le chant')
    expect(usageSourceLabel({ source_type: 'resource', title: null })).toBe('Ressource')
    expect(usageSourceLabel({ source_type: 'example', title: null })).toBe('Exemple')
    expect(usageSourceLabel({ source_type: 'expression', title: 'proverb' })).toBe('Proverbe')
    expect(usageSourceLabel({ source_type: 'expression', title: 'idiomatic' })).toBe('Expression idiomatique')
    expect(usageSourceLabel({ source_type: 'expression', title: null })).toBe('Expression')
    expect(usageSourceLabel({ source_type: 'grammar', title: null })).toBe('Règle de grammaire')
  })

  it('links resources and lexicon examples to their page, nothing else', () => {
    expect(usageHref({ source_type: 'resource', ref_id: 'r1' })).toBe('/resources/r1')
    expect(usageHref({ source_type: 'example', ref_id: 'w1' })).toBe('/lexicon/w1')
    expect(usageHref({ source_type: 'expression', ref_id: null })).toBeNull()
    expect(usageHref({ source_type: 'resource', ref_id: null })).toBeNull()
  })

  it('normalises the side from a URL parameter', () => {
    expect(normalizeSide('fr')).toBe('fr')
    expect(normalizeSide('bete')).toBe('bete')
    expect(normalizeSide('nope')).toBe('bete')
    expect(normalizeSide(undefined)).toBe('bete')
  })
})
