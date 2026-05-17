// lib/types.ts

export type { DialectKey } from './dialect'

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

// ── Community types ────────────────────────────────────────────────────────

export type ForumCategory = 'general' | 'grammar' | 'lexicon' | 'culture' | 'translation'
export type ContentType   = 'song' | 'story' | 'poem' | 'proverb' | 'speech' | 'riddle' | 'video' | 'course' | 'other'

export interface ForumThread {
  id: string
  title: string
  body: string
  category: ForumCategory
  author_name: string | null
  created_by: string | null
  upvotes: number
  created_at: string
}

export interface ForumPost {
  id: string
  thread_id: string
  content: string
  author_name: string | null
  created_by: string | null
  upvotes: number
  created_at: string
}

export interface CommunityText {
  id: string
  title: string
  type: ContentType
  content_bete: string
  content_french: string | null
  video_url: string | null
  author_name: string | null
  region: string | null
  created_by: string | null
  validated: boolean
  upvotes: number
  created_at: string
}

export interface CreateThreadInput {
  title: string
  body: string
  category: ForumCategory
  author_name?: string
}

export interface CreatePostInput {
  thread_id: string
  content: string
  author_name?: string
}

export interface CreateCommunityTextInput {
  title: string
  type: ContentType
  content_bete: string
  content_french?: string
  video_url?: string
  author_name?: string
  region?: string
}

// ── Translation types ──────────────────────────────────────────────────────

/**
 * One resolved word used internally and for word-level feedback.
 * bete_word    = IPA/Bible phonetic form (stored in lexicon.bete_word column)
 * bete_western = western Latin everyday form (stored in lexicon.bete_phonetic column)
 */
export interface FeedbackToken {
  french_word:  string
  bete_western: string   // from lexicon.bete_phonetic (western Latin)
  bete_word:    string   // from lexicon.bete_word (IPA/Bible phonetic)
  lexicon_id?:  string
}

export interface TranslationResult {
  input:             string
  sentence:          string    // fluent Bété — western Latin alphabet (bete_phonetic values)
  sentence_phonetic: string    // fluent Bété — IPA/Bible phonetic form (bete_word values)
  unknowns:          string[]  // French words with no Bété candidate
  rules_applied:     string[]  // grammar rule descriptions used
  tokens:            FeedbackToken[]  // kept for word-level feedback
  cached:            boolean
}
