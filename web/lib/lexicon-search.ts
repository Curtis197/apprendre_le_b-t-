// web/lib/lexicon-search.ts — client for the search_lexicon SQL function.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LexiconSearchRow {
  id: string
  bete_word: string          // IPA / Bible form
  bete_phonetic: string      // western Latin form
  top_french: string
  pos: string[] | null
  dialect: string
  validated: boolean
  matched_french: string | null   // the French translation that matched, when the match came from French
  rank: number
  total_count: number
}

export interface LexiconSearchOptions {
  q: string
  dialect?: string | null
  pos?: string | null
  limit?: number
  offset?: number
}

export async function searchLexicon(
  client: SupabaseClient,
  { q, dialect = null, pos = null, limit = 20, offset = 0 }: LexiconSearchOptions,
): Promise<{ rows: LexiconSearchRow[]; total: number; error: string | null }> {
  const text = q.trim()
  if (!text) return { rows: [], total: 0, error: null }

  const { data, error } = await client.rpc('search_lexicon', {
    q: text, p_dialect: dialect, p_pos: pos, p_limit: limit, p_offset: offset,
  })
  if (error) return { rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.' }
  const rows = (data ?? []) as LexiconSearchRow[]
  return { rows, total: rows[0]?.total_count ?? 0, error: null }
}
