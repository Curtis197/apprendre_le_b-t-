// lib/usages.ts — client for the find_usages SQL function, and display helpers for usage cards.
import type { SupabaseClient } from '@supabase/supabase-js'

export type UsageSide = 'bete' | 'fr'
export type UsageSourceType = 'resource' | 'example' | 'expression' | 'grammar'

export interface UsageRow {
  line_id: string
  source_type: UsageSourceType
  source_id: string
  ref_id: string | null          // resource id, or the lexicon entry of an example
  line_no: number
  title: string | null
  dialect: string | null
  bete: string
  literal: string | null         // mot à mot
  french: string | null
  match_kind: 'exact' | 'variant'
  matched_tokens: string[]       // the words as written in the line, for highlighting
  similarity: number
  total_count: number
}

export function normalizeSide(value?: string | null): UsageSide {
  return value === 'fr' ? 'fr' : 'bete'
}

export interface FindUsagesOptions {
  q: string
  side?: UsageSide
  limit?: number
  offset?: number
  /** A lexicon entry whose own examples are left out (its page already lists them) and not counted. */
  excludeRef?: string
  /** Leave out the spelling variants (words a letter away, which are often different words). */
  exactOnly?: boolean
}

/** Postgres / PostgREST codes for « no such function with these arguments »: the database is not updated yet. */
const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

/**
 * Keeps the exact rows of a page that mixes exact and variant rows. The database sorts exact rows first,
 * so when the page reaches a variant no exact row can follow, and the exact total is known; otherwise the
 * total is an upper bound.
 */
export function keepExactRows(rows: UsageRow[], offset: number): { rows: UsageRow[]; total: number } {
  const exact = rows.filter(r => r.match_kind === 'exact')
  const reachedVariants = rows.some(r => r.match_kind !== 'exact')
  return { rows: exact, total: reachedVariants ? offset + exact.length : rows[0]?.total_count ?? exact.length }
}

export async function findUsages(
  client: SupabaseClient,
  { q, side = 'bete', limit = 5, offset = 0, excludeRef, exactOnly = false }: FindUsagesOptions,
): Promise<{ rows: UsageRow[]; total: number; error: string | null }> {
  const text = q.trim()
  if (!text) return { rows: [], total: 0, error: null }

  const args = {
    q: text, p_side: side, p_limit: limit, p_offset: offset,
    ...(excludeRef ? { p_exclude_ref: excludeRef } : {}),
  }
  let { data, error } = await client.rpc('find_usages', exactOnly ? { ...args, p_exact_only: true } : args)
  if (error && exactOnly && MISSING_FUNCTION.has((error as { code?: string }).code ?? '')) {
    // The database does not know p_exact_only yet (migration not applied): ask the old way, drop the variants here.
    ;({ data, error } = await client.rpc('find_usages', args))
    if (!error) return { ...keepExactRows((data ?? []) as UsageRow[], offset), error: null }
  }
  if (error) return { rows: [], total: 0, error: 'La recherche a échoué. Veuillez réessayer.' }
  const rows = (data ?? []) as UsageRow[]
  return { rows, total: rows[0]?.total_count ?? 0, error: null }
}

// Word separators, mirroring usage_tokenize (SQL). Bété keeps apostrophes inside a word; French also
// splits on them (l'été -> l, été), so French lines must be split the same way to find the matched word.
// No regex lookbehind: unsupported before Safari 16.4.
const BETE_SEPARATORS = '[\\s.,;:!?«»"“”()\\[\\]…–—/]+'
const FRENCH_SEPARATORS = '[\\s.,;:!?«»"“”()\\[\\]…–—/\'’ʼ]+'
const EDGE_JUNK = /^['’ʼ‑-]+|['’ʼ‑-]+$/g

/**
 * Splits a line into parts, flagging the words that are in `tokens` (compared as stored, whole words only).
 * `side` is the language of the line: it decides whether an apostrophe separates words.
 */
export function splitHighlight(
  text: string,
  tokens: string[],
  side: UsageSide = 'bete',
): { text: string; match: boolean }[] {
  if (!text) return []
  const wanted = new Set(tokens.filter(Boolean))
  if (wanted.size === 0) return [{ text, match: false }]

  const parts: { text: string; match: boolean }[] = []
  const push = (value: string, match: boolean) => {
    if (!value) return
    const last = parts[parts.length - 1]
    if (last && last.match === match) last.text += value
    else parts.push({ text: value, match })
  }

  // A capturing split alternates words and separators and keeps every character.
  const separators = new RegExp(`(${side === 'fr' ? FRENCH_SEPARATORS : BETE_SEPARATORS})`)
  text.split(separators).forEach((piece, i) => {
    if (!piece) return
    if (i % 2 === 1) {                       // a separator run
      push(piece, false)
      return
    }
    const core = piece.replace(EDGE_JUNK, '')
    if (core && wanted.has(core)) {
      const start = piece.indexOf(core)
      push(piece.slice(0, start), false)
      push(core, true)
      push(piece.slice(start + core.length), false)
    } else {
      push(piece, false)
    }
  })
  return parts
}

const EXPRESSION_LABELS: Record<string, string> = {
  idiomatic: 'Expression idiomatique',
  fixed: 'Expression figée',
  proverb: 'Proverbe',
}

/** The badge text for a usage: the resource title, or the kind of source. */
export function usageSourceLabel(row: Pick<UsageRow, 'source_type' | 'title'>): string {
  switch (row.source_type) {
    case 'resource':
      return row.title?.trim() || 'Ressource'
    case 'example':
      return 'Exemple'
    case 'expression':
      return (row.title && EXPRESSION_LABELS[row.title]) || 'Expression'
    case 'grammar':
      return 'Règle de grammaire'
  }
}

/** Where the badge links to (null: the source has no page of its own). */
export function usageHref(row: Pick<UsageRow, 'source_type' | 'ref_id'>): string | null {
  if (!row.ref_id) return null
  if (row.source_type === 'resource') return `/resources/${row.ref_id}`
  if (row.source_type === 'example') return `/lexicon/${row.ref_id}`
  return null
}
