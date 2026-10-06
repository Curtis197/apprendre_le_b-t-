// Pure helpers for the contribution form, kept out of the component so
// they can be unit-tested without a DOM.

/** An example sentence is a pair: both sides filled, or neither. */
export type ExampleState = 'none' | 'complete' | 'incomplete'

export function exampleState(bete: string, french: string): ExampleState {
  const hasBete = bete.trim() !== ''
  const hasFrench = french.trim() !== ''
  if (!hasBete && !hasFrench) return 'none'
  return hasBete && hasFrench ? 'complete' : 'incomplete'
}

const GENERIC_ERROR = "Erreur lors de l'envoi. Veuillez réessayer."

/**
 * User-facing message for a failed submit. 23505 = unique (bete_word, dialect) violation.
 */
export function contributionErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code === '23505') return 'Ce mot existe déjà dans ce dialecte.'
  return GENERIC_ERROR
}

/** What happened to the optional recording that goes with a new word. */
export type AudioOutcome = 'none' | 'saved' | 'failed'

export function audioOutcome(a: { attempted: boolean; error: string | null }): AudioOutcome {
  if (!a.attempted) return 'none'
  return a.error ? 'failed' : 'saved'
}

/** The word is saved even when its recording is not: say so, and how to redo it. */
export function audioFailedMessage(reason: string | null): string {
  const base = 'Mot enregistré, mais l’enregistrement audio n’a pas pu être envoyé : vous pourrez le refaire depuis la fiche du mot.'
  return reason ? `${base} (${reason})` : base
}

/** The word form looks for close lexicon entries from this many characters. */
export function shouldSearchSimilar(text: string): boolean {
  const t = text.trim()
  return t.length >= 2 && t.length <= 100
}

export type SimilarKind = 'same' | 'variant'

/** An exact match is the same word (it already exists); a normalised or near match is a variant spelling. */
export function similarKind(c: { matchKind: 'exact' | 'norm' | 'near' }): SimilarKind {
  return c.matchKind === 'exact' ? 'same' : 'variant'
}

/** Why a new word cannot be sent yet, or null. A recording in progress is checked first. */
export function wordBlockingProblem(a: { exampleBete: string; exampleFrench: string; recording: boolean }): string | null {
  if (a.recording) return 'Terminez l’enregistrement avant de créer l’entrée.'
  if (exampleState(a.exampleBete, a.exampleFrench) === 'incomplete') {
    return 'Renseignez la phrase et sa traduction, ou laissez les deux champs vides.'
  }
  return null
}
