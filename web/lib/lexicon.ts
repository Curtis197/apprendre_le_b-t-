// Lexicon entries awaiting translation carry an empty `bete_phonetic` and a
// "_pending_…" placeholder in `bete_word`. Neither is a real Bété form, so they
// must never leak into <title>, structured data, or the sitemap. Returns a clean
// Bété form, or '' when the entry is not yet translated.
export function cleanBeteForm(value?: string | null): string {
  const s = value?.trim() ?? ''
  return !s || s.startsWith('_pending_') ? '' : s
}

export const TRANSLATION_FRENCH_MAX = 200
export const TRANSLATION_CONTEXT_MAX = 300
export const DESCRIPTION_MAX = 2000

/** Cleans a translation form (error null: valid). A blank context is stored as null. */
export function checkTranslationInput(input: { french: string; context?: string | null }): {
  french: string
  context: string | null
  error: string | null
} {
  const french = input.french.trim()
  const context = input.context?.trim() || null
  let error: string | null = null
  if (!french) error = 'Le mot français est obligatoire.'
  else if (french.length > TRANSLATION_FRENCH_MAX)
    error = `Le mot français ne peut pas dépasser ${TRANSLATION_FRENCH_MAX} caractères.`
  else if (context && context.length > TRANSLATION_CONTEXT_MAX)
    error = `Le contexte ne peut pas dépasser ${TRANSLATION_CONTEXT_MAX} caractères.`
  return { french, context, error }
}

/** A blank description clears it (null). */
export function checkDescription(text: string): { description: string | null; error: string | null } {
  const description = text.trim() || null
  if (description && description.length > DESCRIPTION_MAX) {
    return { description, error: `La description ne peut pas dépasser ${DESCRIPTION_MAX} caractères.` }
  }
  return { description, error: null }
}

/** Primary translation first (lowest position), then oldest. Returns a new array. */
export function sortTranslations<T extends { position: number; created_at: string }>(ts: T[]): T[] {
  return [...ts].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  )
}

/** "manger, se nourrir": distinct French words, case-insensitively, in order. */
export function translationsSummary(ts: { french: string }[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const { french } of ts) {
    const key = french.trim().toLowerCase()
    if (key && !seen.has(key)) {
      seen.add(key)
      out.push(french.trim())
    }
  }
  return out.join(', ')
}

/** "+2 autres sens" for a word with `total` translations, null when there is only one. */
export function otherMeaningsLabel(total: number): string | null {
  const extra = total - 1
  if (extra < 1) return null
  return `+${extra} ${extra === 1 ? 'autre sens' : 'autres sens'}`
}

/** Reads the count of a PostgREST `lexicon_translations(count)` embed. */
export function translationCount(rel?: { count: number }[] | null): number {
  return rel?.[0]?.count ?? 0
}

/** The description, falling back to the legacy free-text `notes`. */
export function pickDescription(e: { description?: string | null; notes?: string | null }): string {
  return e.description?.trim() || e.notes?.trim() || ''
}
