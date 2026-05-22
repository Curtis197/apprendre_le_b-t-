import type { SupabaseClient } from '@supabase/supabase-js'
import type { DialectKey } from './dialect'
import { DIALECT_KEYS } from './dialect'

export const WORD_TARGET = 500
export const GRAMMAR_TARGET = 6

export interface TranslatorCounts {
  words: Record<DialectKey, number>
  grammar: number
}

export function dialectMeetsThreshold(counts: TranslatorCounts, dialect: DialectKey): boolean {
  return counts.words[dialect] >= WORD_TARGET && counts.grammar >= GRAMMAR_TARGET
}

export async function getTranslatorCounts(supabase: SupabaseClient): Promise<TranslatorCounts> {
  const [wordEntries, grammarCount] = await Promise.all([
    Promise.all(
      DIALECT_KEYS.map(d =>
        supabase
          .from('lexicon')
          .select('*', { count: 'exact', head: true })
          .eq('dialect', d)
          .eq('source', 'contributed')
          .then(({ count }) => [d, count ?? 0] as [DialectKey, number])
      )
    ),
    supabase
      .from('grammar_rules')
      .select('*', { count: 'exact', head: true })
      .then(({ count }) => count ?? 0),
  ])
  return {
    words: Object.fromEntries(wordEntries) as Record<DialectKey, number>,
    grammar: grammarCount as number,
  }
}
