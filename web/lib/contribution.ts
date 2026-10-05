import type { DialectKey } from './dialect'

// Pure helpers behind ContributionForm's word branch, kept out of the component so
// they can be unit-tested without a DOM.

/** An example sentence is a pair: both sides filled, or neither. */
export type ExampleState = 'none' | 'complete' | 'incomplete'

export function exampleState(bete: string, french: string): ExampleState {
  const hasBete = bete.trim() !== ''
  const hasFrench = french.trim() !== ''
  if (!hasBete && !hasFrench) return 'none'
  return hasBete && hasFrench ? 'complete' : 'incomplete'
}

export interface WordFields {
  betePhonetic: string   // western Latin form → lexicon.bete_phonetic
  beteIPA: string        // IPA / Bible form   → lexicon.bete_word
  french: string
  pos: string
  description: string
  dialect: DialectKey
  userId: string
}

// Column naming is inverted vs. intuition: bete_word holds the IPA form and
// bete_phonetic the western Latin form (see lib/types.ts). When no IPA form is
// known, bete_word falls back to the Latin form.
export function buildWordPayload(f: WordFields) {
  return {
    bete_phonetic: f.betePhonetic,
    bete_word: f.beteIPA || f.betePhonetic,
    top_french: f.french,
    french_candidates: [{ word: f.french, prob: 1.0 }],
    probability: 1.0,
    pos: [f.pos],
    description: f.description.trim() || null,
    dialect: f.dialect,
    created_by: f.userId,
    source: 'contributed' as const,
  }
}

// Filling in an existing untranslated placeholder: the database only accepts the Bété forms,
// part of speech, dialect and description from the client, and stamps the author itself. The French
// word is not part of this payload; it is added as a translation.
export function buildWordClaimPayload(f: WordFields) {
  return {
    bete_phonetic: f.betePhonetic,
    bete_word: f.beteIPA || f.betePhonetic,
    pos: [f.pos],
    description: f.description.trim() || null,
    dialect: f.dialect,
  }
}

export interface ExampleFields {
  bete: string
  french: string
  dialect: DialectKey
  userId: string
}

export function buildExampleRow(lexiconId: string, f: ExampleFields) {
  return {
    lexicon_id: lexiconId,
    bete_snippet: f.bete.trim(),
    french_snippet: f.french.trim(),
    dialect: f.dialect,
    created_by: f.userId,
  }
}

const GENERIC_ERROR = "Erreur lors de l'envoi. Veuillez réessayer."

/** Set on the error thrown when the placeholder being filled in was translated by someone else first. */
export const WORD_ALREADY_CLAIMED = 'WORD_ALREADY_CLAIMED'

/**
 * User-facing message for a failed submit. 23505 = unique (bete_word, dialect) violation;
 * WORD_ALREADY_CLAIMED = another contributor translated this placeholder in the meantime.
 */
export function contributionErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code === '23505') return 'Ce mot existe déjà dans ce dialecte.'
  if (code === WORD_ALREADY_CLAIMED) {
    return "Ce mot vient d'être traduit par quelqu'un d'autre. Ouvrez sa fiche pour ajouter votre traduction."
  }
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
