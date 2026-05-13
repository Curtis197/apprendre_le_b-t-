// lib/translator.ts
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { LexiconEntry, Expression, GrammarRule, TranslationToken, TranslationResult } from './types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function findExpression(
  client: SupabaseClient,
  frenchPhrase: string
): Promise<Expression | null> {
  const { data } = await client
    .from('expressions')
    .select('*')
    .eq('french_phrase', frenchPhrase.toLowerCase())
    .eq('validated', true)
    .maybeSingle()
  return data ?? null
}

async function lookupWord(
  client: SupabaseClient,
  frenchWord: string
): Promise<LexiconEntry | null> {
  // 1. Exact match
  const { data: exact } = await client
    .from('lexicon')
    .select('*')
    .eq('top_french', frenchWord.toLowerCase())
    .maybeSingle()
  if (exact) return exact as LexiconEntry

  // 2. pgvector similarity via RPC
  const { data: similar } = await client
    .rpc('match_lexicon_by_french', { query_text: frenchWord, match_count: 1 })
    .maybeSingle()
  return (similar as LexiconEntry) ?? null
}

async function fetchGrammarRules(
  client: SupabaseClient
): Promise<GrammarRule[]> {
  const { data } = await client
    .from('grammar_rules')
    .select('*')
    .eq('validated', true)
    .order('upvotes', { ascending: false })
    .limit(10)
  return (data ?? []) as GrammarRule[]
}

export async function translate(
  client: SupabaseClient,
  frenchText: string
): Promise<TranslationResult> {
  const tokens = frenchText.trim().split(/\s+/)
  const resolvedTokens: TranslationToken[] = []

  // Check whole phrase for expression match
  const fullExpression = await findExpression(client, frenchText)
  if (fullExpression) {
    return {
      input: frenchText,
      tokens: [{
        french_word: frenchText,
        bete_word: fullExpression.bete_phrase,
        bete_phonetic: fullExpression.bete_phonetic,
        score: 1.0,
        is_expression: true,
      }],
      cached: false,
    }
  }

  // Look up each token
  const lexiconMatches: Record<string, LexiconEntry | null> = {}
  for (const token of tokens) {
    const clean = token.replace(/[.,!?;:«»"']/g, '').toLowerCase()
    if (clean) {
      lexiconMatches[clean] = await lookupWord(client, clean)
    }
  }

  const grammarRules = await fetchGrammarRules(client)

  // Build prompt for Claude Haiku
  const lexiconContext = Object.entries(lexiconMatches)
    .map(([fr, entry]) => {
      if (!entry) return `${fr} → [unknown]`
      return `${fr} → ${entry.bete_phonetic} (standard: ${entry.bete_word}, score: ${entry.probability})`
    })
    .join('\n')

  const grammarContext = grammarRules
    .map(r => `[${r.category}] ${r.pattern_french} → ${r.pattern_bete}: ${r.description}`)
    .join('\n')

  const prompt = `You are a French to Bété translator assistant.
Bété is a language from Côte d'Ivoire. Use ONLY the phonetic forms provided — do not invent new Bété words.

Lexicon matches (French → Bété phonetic):
${lexiconContext || '(no matches found)'}

Active grammar rules:
${grammarContext || '(none)'}

Translate the following French text to Bété.
Return a JSON array of objects with this exact shape:
[{"french_word": "...", "bete_phonetic": "...", "score": 0.0-1.0}]
One object per French input token, in order. For unknown words, use the French word as bete_phonetic and score 0.
Return ONLY the JSON array, no explanation.

French input: ${frenchText}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const firstBlock = message.content[0]
  const raw = firstBlock.type === 'text' ? firstBlock.text.trim() : ''
  let llmTokens: { french_word: string; bete_phonetic: string; score: number }[] = []
  try {
    llmTokens = JSON.parse(raw)
  } catch {
    // Fallback: direct lookup without LLM
    llmTokens = tokens.map(t => {
      const clean = t.replace(/[.,!?;:«»"']/g, '').toLowerCase()
      const entry = lexiconMatches[clean]
      return {
        french_word: t,
        bete_phonetic: entry?.bete_phonetic ?? t,
        score: entry?.probability ?? 0,
      }
    })
  }

  // Resolve standard Bété form from lexicon
  for (const lt of llmTokens) {
    const clean = lt.french_word.replace(/[.,!?;:«»"']/g, '').toLowerCase()
    const entry = lexiconMatches[clean]
    resolvedTokens.push({
      french_word: lt.french_word,
      bete_word: entry?.bete_word ?? lt.bete_phonetic,
      bete_phonetic: lt.bete_phonetic,
      score: lt.score,
      is_expression: false,
    })
  }

  return { input: frenchText, tokens: resolvedTokens, cached: false }
}
