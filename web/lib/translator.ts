import 'server-only'
// lib/translator.ts
import Anthropic from '@anthropic-ai/sdk'
import { SupabaseClient } from '@supabase/supabase-js'
import { embed } from './embedder'
import { lemmatize } from './lemmatizer'
import { FeedbackToken, TranslationResult, TranslationLogEntry } from './types'
import { type DialectKey } from './dialect'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Types used only inside this module ───────────────────────────────────────

interface Candidate {
  lexicon_id:   string
  // bete_word column = IPA/Bible phonetic form
  bete_phonetic_form: string  // from lexicon.bete_word
  // bete_phonetic column = western Latin everyday form
  bete_western_form:  string  // from lexicon.bete_phonetic
  sense_tag:    string | null
  probability:  number
  similarity:   number
}

interface ResolvedToken {
  french_form:  string  // original input token (with punctuation)
  french_clean: string  // cleaned + lemmatized
  candidates:   Candidate[]
  source:       'inflected_forms' | 'vector' | 'unknown'
}

interface GrammarRule {
  id:            string
  pattern_french: string
  pattern_bete:   string
  description:    string
  example_french: string | null
  example_bete:   string | null
}

// ── Step 1: check full phrase as expression ───────────────────────────────────

async function findExpression(
  client: SupabaseClient,
  phrase: string,
): Promise<{ bete_western: string; bete_phonetic_form: string } | null> {
  const { data } = await client
    .from('expressions')
    .select('bete_phrase, bete_phonetic')
    .eq('french_phrase', phrase.toLowerCase())
    .eq('validated', true)
    .maybeSingle()
  if (!data) return null
  // expressions.bete_phrase = western Latin form, expressions.bete_phonetic = IPA form
  return { bete_western: data.bete_phrase, bete_phonetic_form: data.bete_phonetic }
}

// ── Step 2: resolve each token ───────────────────────────────────────────────

async function resolveToken(
  client: SupabaseClient,
  rawToken: string,
  dialect: DialectKey,
): Promise<ResolvedToken> {
  const clean = rawToken.replace(/[.,!?;:«»"''']/g, '').toLowerCase().trim()
  const lemma = lemmatize(clean)

  // 2a. Check inflected_forms (exact French form match — fastest, no embedding needed)
  const { data: inflected } = await client
    .from('inflected_forms')
    .select('lexicon_id, bete_form, bete_phonetic, inflection_tag')
    .eq('french_form', clean)
    .eq('validated', true)
    .limit(3)

  if (inflected && inflected.length > 0) {
    // Verify lexicon entry belongs to the correct dialect
    const ids = inflected.map(r => r.lexicon_id)
    const { data: lexRows } = await client
      .from('lexicon')
      .select('id, bete_word, bete_phonetic, sense_tag, probability')
      .in('id', ids)
      .eq('dialect', dialect)

    const dialectIds = new Set((lexRows ?? []).map(r => r.id))
    const valid = inflected.filter(r => dialectIds.has(r.lexicon_id))

    if (valid.length > 0) {
      const candidates: Candidate[] = valid.map(r => {
        const lex = (lexRows ?? []).find(l => l.id === r.lexicon_id)
        return {
          lexicon_id:          r.lexicon_id,
          bete_phonetic_form:  r.bete_phonetic,  // IPA form for this inflection
          bete_western_form:   r.bete_form,       // western Latin form for this inflection
          sense_tag:           lex?.sense_tag ?? null,
          probability:         lex?.probability ?? 0,
          similarity:          1.0,
        }
      })
      return { french_form: rawToken, french_clean: clean, candidates, source: 'inflected_forms' }
    }
  }

  // 2b. Vector search on lemma embedding
  let embedding: number[]
  try {
    embedding = await embed(lemma || clean)
  } catch {
    return { french_form: rawToken, french_clean: clean, candidates: [], source: 'unknown' }
  }

  const { data: matches } = await client.rpc('match_lexicon', {
    query_embedding: embedding,
    match_dialect:   dialect,
    match_count:     3,
  })

  if (!matches || matches.length === 0) {
    return { french_form: rawToken, french_clean: clean, candidates: [], source: 'unknown' }
  }

  const candidates: Candidate[] = matches.map((m: {
    id: string; bete_word: string; bete_phonetic: string;
    sense_tag: string | null; probability: number; similarity: number
  }) => ({
    lexicon_id:         m.id,
    bete_phonetic_form: m.bete_word,      // lexicon.bete_word = IPA/Bible form
    bete_western_form:  m.bete_phonetic,  // lexicon.bete_phonetic = western Latin form
    sense_tag:          m.sense_tag,
    probability:        m.probability,
    similarity:         m.similarity,
  }))

  return { french_form: rawToken, french_clean: clean, candidates, source: 'vector' }
}

// ── Step 3: retrieve grammar rules by sentence embedding ─────────────────────

async function retrieveGrammarRules(
  client: SupabaseClient,
  frenchSentence: string,
): Promise<GrammarRule[]> {
  let embedding: number[]
  try {
    embedding = await embed(frenchSentence)
  } catch {
    return []
  }

  const { data } = await client.rpc('match_grammar_rules', {
    query_embedding: embedding,
    match_count: 5,
  })

  return (data ?? []) as GrammarRule[]
}

// ── Step 4: build Claude prompt ───────────────────────────────────────────────

function buildPrompt(
  frenchText: string,
  resolvedTokens: ResolvedToken[],
  rules: GrammarRule[],
): string {
  const tokenLines = resolvedTokens.map(t => {
    if (t.candidates.length === 0) return `- "${t.french_form}" → [unknown — keep French word]`
    const opts = t.candidates
      .map(c => `${c.bete_western_form}${c.sense_tag ? ` (${c.sense_tag})` : ''} [score:${c.similarity.toFixed(2)}]`)
      .join(', ')
    return `- "${t.french_form}" → ${opts}`
  })

  const ruleLines = rules.length > 0
    ? rules.map(r =>
        `[${r.pattern_french} → ${r.pattern_bete}] ${r.description}` +
        (r.example_french ? `\n  ex: "${r.example_french}" → "${r.example_bete}"` : '')
      ).join('\n')
    : '(aucune règle disponible — utilisez votre meilleur jugement)'

  return `You are a French → Bété translator. Bété is a language from Côte d'Ivoire.
Use ONLY the candidate words provided — never invent Bété vocabulary.
Unknown words must remain as French.

French input: ${frenchText}

Resolved token candidates (western Latin Bété forms):
${tokenLines.join('\n')}

Active grammar rules:
${ruleLines}

Return ONLY this JSON (no explanation):
{
  "sentence": "<one fluent Bété sentence using western Latin forms>",
  "unknowns": ["<french word>", ...],
  "rules_applied": ["<short rule description>", ...]
}`
}

// ── Step 5: call Claude and parse ─────────────────────────────────────────────

async function assembleWithClaude(
  prompt: string,
): Promise<{ sentence: string; unknowns: string[]; rules_applied: string[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  // Strip markdown code fences if present
  const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  const parsed = JSON.parse(json)
  const sentence = String(parsed.sentence ?? '')
  if (!sentence) throw new Error('Claude returned empty sentence')
  return {
    sentence,
    unknowns:      Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
    rules_applied: Array.isArray(parsed.rules_applied) ? parsed.rules_applied : [],
  }
}

// ── Build phonetic sentence from western sentence ─────────────────────────────

function buildPhoneticSentence(
  westernSentence: string,
  resolvedTokens: ResolvedToken[],
): string {
  // Build map: western form → IPA/Bible form (from top candidate)
  const westernToPhonetic = new Map<string, string>()
  for (const t of resolvedTokens) {
    if (t.candidates.length > 0) {
      westernToPhonetic.set(
        t.candidates[0].bete_western_form.toLowerCase(),
        t.candidates[0].bete_phonetic_form,
      )
    }
  }

  return westernSentence
    .split(/\s+/)
    .map(w => {
      const stripped = w.replace(/[.,!?;:«»"''']/g, '')
      const phonetic = westernToPhonetic.get(stripped.toLowerCase())
      return phonetic ? phonetic + w.slice(stripped.length) : w
    })
    .join(' ')
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function translate(
  client: SupabaseClient,
  frenchText: string,
  dialect: DialectKey = 'western',
): Promise<TranslationResult> {
  const input = frenchText.trim()
  const t0 = Date.now()
  const log: TranslationLogEntry[] = []
  const ms = () => Date.now() - t0

  log.push({ step: 'start', detail: `"${input}" — dialect: ${dialect}`, ms: ms() })
  console.log(`\n[translator] ── "${input}" (${dialect}) ──`)

  // Check full phrase as expression first
  const expr = await findExpression(client, input)
  if (expr) {
    log.push({ step: 'expression hit', detail: `Found in expressions table → "${expr.bete_western}"`, ms: ms() })
    console.log(`[translator] ${ms()}ms  expression hit → "${expr.bete_western}"`)
    return {
      input,
      sentence:          expr.bete_western,
      sentence_phonetic: expr.bete_phonetic_form,
      unknowns:          [],
      rules_applied:     ['expression idiomatique'],
      tokens:            [],
      cached:            false,
      debug:             log,
    }
  }
  log.push({ step: 'expression lookup', detail: 'No match in expressions table', ms: ms() })
  console.log(`[translator] ${ms()}ms  expression lookup — no match`)

  // Resolve each token in parallel
  const rawTokens = input.split(/\s+/).filter(Boolean)
  log.push({ step: 'tokenize', detail: `${rawTokens.length} token(s): ${rawTokens.map(t => `"${t}"`).join(', ')}`, ms: ms() })
  console.log(`[translator] ${ms()}ms  tokenize → ${rawTokens.join(' | ')}`)

  const resolvedTokens = await Promise.all(
    rawTokens.map(t => resolveToken(client, t, dialect))
  )

  for (const t of resolvedTokens) {
    if (t.source === 'inflected_forms') {
      log.push({ step: `token "${t.french_form}"`, detail: `inflected_forms hit → "${t.candidates[0]?.bete_western_form}"`, ms: ms() })
      console.log(`[translator] ${ms()}ms  "${t.french_form}" → inflected_forms: "${t.candidates[0]?.bete_western_form}"`)
    } else if (t.source === 'vector') {
      const top = t.candidates[0]
      log.push({ step: `token "${t.french_form}"`, detail: `vector → lemma "${t.french_clean}", top match "${top?.bete_western_form}" (score ${top?.similarity.toFixed(3)})`, ms: ms() })
      console.log(`[translator] ${ms()}ms  "${t.french_form}" → vector [lemma:"${t.french_clean}"] "${top?.bete_western_form}" score:${top?.similarity.toFixed(3)}`)
    } else {
      log.push({ step: `token "${t.french_form}"`, detail: `unknown — no match found`, ms: ms() })
      console.log(`[translator] ${ms()}ms  "${t.french_form}" → unknown`)
    }
  }

  // Retrieve grammar rules
  const rules = await retrieveGrammarRules(client, input)
  log.push({ step: 'grammar rules', detail: rules.length > 0 ? `${rules.length} rule(s): ${rules.map(r => r.pattern_french).join(', ')}` : 'no validated rules with embeddings', ms: ms() })
  console.log(`[translator] ${ms()}ms  grammar rules → ${rules.length > 0 ? rules.map(r => r.pattern_french).join(', ') : 'none'}`)

  const allUnambiguous = resolvedTokens.every(t => t.candidates.length === 1)
  const noRules = rules.length === 0

  let sentence: string
  let unknowns: string[]
  let rules_applied: string[]

  if (allUnambiguous && noRules) {
    sentence = resolvedTokens
      .map(t => t.candidates[0]?.bete_western_form ?? t.french_form)
      .join(' ')
    unknowns = resolvedTokens.filter(t => t.candidates.length === 0).map(t => t.french_form)
    rules_applied = []
    log.push({ step: 'assembly', detail: 'fast-path (all unambiguous, no rules) — skipped Claude', ms: ms() })
    console.log(`[translator] ${ms()}ms  assembly: fast-path (no Claude)`)
  } else {
    const prompt = buildPrompt(input, resolvedTokens, rules)
    log.push({ step: 'claude prompt', detail: `${prompt.length} chars — sending to claude-haiku`, ms: ms() })
    console.log(`[translator] ${ms()}ms  claude prompt: ${prompt.length} chars`)
    try {
      ;({ sentence, unknowns, rules_applied } = await assembleWithClaude(prompt))
      log.push({ step: 'claude response', detail: `"${sentence}"${unknowns.length ? ` — unknowns: ${unknowns.join(', ')}` : ''}`, ms: ms() })
      console.log(`[translator] ${ms()}ms  claude → "${sentence}"`)
    } catch (err) {
      log.push({ step: 'claude error', detail: `${err} — falling back to concatenation`, ms: ms() })
      console.log(`[translator] ${ms()}ms  claude error: ${err}`)
      sentence = resolvedTokens
        .map(t => t.candidates[0]?.bete_western_form ?? t.french_form)
        .join(' ')
      unknowns = resolvedTokens.filter(t => t.candidates.length === 0).map(t => t.french_form)
      rules_applied = []
    }
  }

  const sentence_phonetic = buildPhoneticSentence(sentence, resolvedTokens)
  log.push({ step: 'done', detail: `→ "${sentence}" / "${sentence_phonetic}" in ${ms()}ms`, ms: ms() })
  console.log(`[translator] ${ms()}ms  done → "${sentence}"`)
  console.log(`[translator] phonetic  → "${sentence_phonetic}"`)
  console.log(`[translator] ──────────────────────────────────────`)

  const tokens: FeedbackToken[] = resolvedTokens.map(t => ({
    french_word:  t.french_form,
    bete_western: t.candidates[0]?.bete_western_form ?? t.french_form,
    bete_word:    t.candidates[0]?.bete_phonetic_form ?? t.french_form,
    lexicon_id:   t.candidates[0]?.lexicon_id,
  }))

  return { input, sentence, sentence_phonetic, unknowns, rules_applied, tokens, cached: false, debug: log }
}
