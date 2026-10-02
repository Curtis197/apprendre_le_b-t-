// web/__tests__/lexicon-search.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { searchLexicon } from '../lib/lexicon-search'

const fake = (result: { data: unknown; error: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue(result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

describe('searchLexicon', () => {
  it('does not call the database for a blank query', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    expect(await searchLexicon(client, { q: '   ' })).toEqual({ rows: [], total: 0, error: null })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('maps its options onto the SQL function arguments', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    await searchLexicon(client, { q: ' été ', dialect: 'northern', pos: 'verb', limit: 6, offset: 12 })
    expect(rpc).toHaveBeenCalledWith('search_lexicon', {
      q: 'été', p_dialect: 'northern', p_pos: 'verb', p_limit: 6, p_offset: 12,
    })
  })

  it('defaults to all dialects, no pos filter, 20 rows', async () => {
    const { client, rpc } = fake({ data: [], error: null })
    await searchLexicon(client, { q: 'ba' })
    expect(rpc).toHaveBeenCalledWith('search_lexicon', {
      q: 'ba', p_dialect: null, p_pos: null, p_limit: 20, p_offset: 0,
    })
  })

  it('returns the rows and the total from the first row', async () => {
    const rows = [{ id: 'a', total_count: 7 }, { id: 'b', total_count: 7 }]
    const { client } = fake({ data: rows, error: null })
    const res = await searchLexicon(client, { q: 'ba' })
    expect(res.rows).toHaveLength(2)
    expect(res.total).toBe(7)
  })

  it('reports a French error message when the call fails', async () => {
    const { client } = fake({ data: null, error: { message: 'boom' } })
    expect(await searchLexicon(client, { q: 'ba' })).toEqual({
      rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.',
    })
  })
})
