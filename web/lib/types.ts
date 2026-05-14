// lib/types.ts

export interface LexiconEntry {
  id: string
  bete_word: string
  bete_phonetic: string
  french_candidates: { word: string; score: number }[]
  top_french: string
  probability: number
  pos: string[] | null
  notes: string | null
  validated: boolean
  upvotes: number
}

export interface LexiconExample {
  id: string
  lexicon_id: string
  verse_id: string
  bete_snippet: string
  french_snippet: string
}

export interface GrammarRule {
  id: string
  category: 'verb' | 'noun' | 'tense' | 'agreement' | 'other'
  pattern_french: string
  pattern_bete: string
  description: string
  example_french: string | null
  example_bete: string | null
  example_bete_phonetic: string | null
  validated: boolean
  upvotes: number
  created_by: string | null
  created_at: string
}

export interface Expression {
  id: string
  french_phrase: string
  bete_phrase: string
  bete_phonetic: string
  type: 'idiomatic' | 'fixed' | 'proverb'
  validated: boolean
  upvotes: number
  created_by: string | null
  created_at: string
}

export interface TranslationToken {
  french_word: string
  bete_word: string
  bete_phonetic: string
  score: number
  is_expression: boolean
  lexicon_id?: string
}

export interface TranslationResult {
  input: string
  tokens: TranslationToken[]
  cached: boolean
}
