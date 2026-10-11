// Pure helpers for Bhété text: the corpus mixes a letter + combining diaeresis (U+0308) with the
// precomposed letter, so everything stored or inserted goes through NFC. Hyphens and apostrophes are
// left alone: they differ by dialect.

/** The form we store: NFC, nothing else changed. */
export function toStoredForm(text: string): string {
  return text.normalize('NFC')
}

/**
 * Inserts `glyph` at the selection of `value`. Returns the new value and where the caret goes, or
 * `null` when `max` (> 0) would be exceeded: a programmatic value change ignores the field's
 * `maxLength`, so the caller must check.
 */
export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  glyph: string,
  max = 0,
): { value: string; caret: number } | null {
  const a = Math.max(0, Math.min(start, value.length))
  const b = Math.max(a, Math.min(end, value.length))
  const before = value.slice(0, a)
  const after = value.slice(b)
  const next = toStoredForm(before + glyph + after)
  if (max > 0 && next.length > max) return null
  return { value: next, caret: toStoredForm(before + glyph).length }
}
