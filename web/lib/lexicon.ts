// Lexicon entries awaiting translation carry an empty `bete_phonetic` and a
// "_pending_…" placeholder in `bete_word`. Neither is a real Bété form, so they
// must never leak into <title>, structured data, or the sitemap. Returns a clean
// Bété form, or '' when the entry is not yet translated.
export function cleanBeteForm(value?: string | null): string {
  const s = value?.trim() ?? ''
  return !s || s.startsWith('_pending_') ? '' : s
}
