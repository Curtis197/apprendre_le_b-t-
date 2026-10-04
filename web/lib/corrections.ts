// web/lib/corrections.ts — reports and proposed corrections on community content.
//
// The list of correctable fields is enforced by the database too: correction_column() in
// supabase/migrations/20261003000005_corrections.sql. Change both together (a test ties them).

export type CorrectionTargetType = 'translation' | 'word' | 'expression' | 'grammar_rule' | 'resource'
export type CorrectionKind = 'mistranslation' | 'spelling' | 'other'
export type CorrectionStatus = 'open' | 'accepted' | 'rejected'

export interface Correction {
  id: string
  target_type: CorrectionTargetType
  target_id: string
  field: string
  kind: CorrectionKind
  message: string | null
  suggestion: string | null
  /** The field's text when it was reported. */
  original: string | null
  /** What the content is called, for lists. */
  label: string | null
  /** The page that shows it (the word, or the resource); null for expressions and grammar rules. */
  ref_id: string | null
  owner_id: string | null
  reporter_id: string
  reporter_name: string
  status: CorrectionStatus
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export interface CorrectableField {
  field: string
  label: string
  /** Long text (a song, a description): shown in a multi-line box. */
  multiline?: boolean
}

export const CORRECTION_FIELDS: Record<CorrectionTargetType, CorrectableField[]> = {
  translation: [
    { field: 'french', label: 'Traduction' },
    { field: 'context', label: 'Contexte' },
  ],
  word: [
    { field: 'bete_phonetic', label: 'Écriture usuelle' },
    { field: 'bete_word', label: 'Forme phonétique' },
    { field: 'description', label: 'Description', multiline: true },
    { field: 'marker_type', label: 'Type du marqueur' },
    { field: 'marker_meaning', label: 'Ce que le marqueur indique' },
    { field: 'marker_french', label: 'Comment le français le rend' },
    { field: 'entry_kind', label: 'Nature de l’entrée (mot ou marqueur)' },
  ],
  expression: [
    { field: 'bete_phrase', label: 'Bhété' },
    { field: 'bete_phonetic', label: 'Phonétique' },
    { field: 'french_phrase', label: 'Français' },
    { field: 'french_literal', label: 'Mot à mot' },
  ],
  grammar_rule: [
    { field: 'pattern_french', label: 'Modèle français' },
    { field: 'pattern_bete', label: 'Modèle bhété' },
    { field: 'description', label: 'Description', multiline: true },
    { field: 'example_bete', label: 'Exemple en bhété' },
    { field: 'example_french', label: 'Exemple en français' },
  ],
  resource: [
    { field: 'title', label: 'Titre' },
    { field: 'content_bete', label: 'Texte en bhété', multiline: true },
    { field: 'content_literal', label: 'Mot à mot', multiline: true },
    { field: 'content_french', label: 'Traduction en français', multiline: true },
  ],
}

export const CORRECTION_KINDS: { value: CorrectionKind; label: string }[] = [
  { value: 'mistranslation', label: 'Mauvaise traduction' },
  { value: 'spelling', label: 'Faute d’orthographe' },
  { value: 'other', label: 'Autre' },
]

export const MESSAGE_MAX = 1000
export const SUGGESTION_MAX = 10000

export function correctionFields(type: CorrectionTargetType): CorrectableField[] {
  return CORRECTION_FIELDS[type]
}

export function isCorrectableField(type: string, field: string): boolean {
  return (CORRECTION_FIELDS[type as CorrectionTargetType] ?? []).some(f => f.field === field)
}

export function fieldLabel(type: CorrectionTargetType, field: string): string {
  return CORRECTION_FIELDS[type]?.find(f => f.field === field)?.label ?? field
}

export function kindLabel(kind: CorrectionKind): string {
  return CORRECTION_KINDS.find(k => k.value === kind)?.label ?? kind
}

export interface CorrectionInput {
  targetType: CorrectionTargetType
  targetId: string
  field: string
  kind: CorrectionKind
  message?: string | null
  suggestion?: string | null
}

/**
 * Cleans what the user typed and says what is wrong with it (error: null when it is fine).
 * `current` is the field's text now: a "correction" identical to it is not a correction.
 */
export function checkCorrectionInput(
  input: CorrectionInput,
  current?: string | null,
): { message: string | null; suggestion: string | null; error: string | null } {
  const message = input.message?.trim() || null
  const suggestion = input.suggestion?.trim() || null
  const fail = (error: string) => ({ message, suggestion, error })

  if (!isCorrectableField(input.targetType, input.field)) return fail('Ce champ ne peut pas être signalé.')
  if (!CORRECTION_KINDS.some(k => k.value === input.kind)) return fail('Choisissez le type de problème.')
  if (!message && !suggestion) return fail('Expliquez le problème ou proposez une correction.')
  if (message && message.length > MESSAGE_MAX) return fail(`Le message ne peut pas dépasser ${MESSAGE_MAX} caractères.`)
  if (suggestion && suggestion.length > SUGGESTION_MAX) {
    return fail(`La correction ne peut pas dépasser ${SUGGESTION_MAX} caractères.`)
  }
  if (suggestion && current != null && suggestion === current.trim()) {
    return fail('La correction proposée est identique au texte actuel.')
  }
  return { message, suggestion, error: null }
}

/** The text changed since the report: accepting it would be refused. */
export function isStale(correction: Pick<Correction, 'original'>, currentValue: string | null | undefined): boolean {
  return (correction.original ?? '') !== (currentValue ?? '')
}

/** Only the content's author, or an admin, can accept or reject; nobody for content with no author but an admin. */
export function canResolve(
  correction: Pick<Correction, 'owner_id' | 'status'>,
  userId: string | null,
  isAdmin: boolean,
): boolean {
  if (correction.status !== 'open' || !userId) return false
  return isAdmin || (correction.owner_id !== null && correction.owner_id === userId)
}

/** Where to read the corrected content (null: it has no page of its own). */
export function correctionHref(correction: Pick<Correction, 'target_type' | 'ref_id'>): string | null {
  switch (correction.target_type) {
    case 'translation':
    case 'word':
      return correction.ref_id ? `/lexicon/${correction.ref_id}` : null
    case 'resource':
      return correction.ref_id ? `/resources/${correction.ref_id}` : null
    case 'grammar_rule':
      return '/grammar'
    case 'expression':
      return '/contribute'
  }
}

export const TARGET_TYPE_LABELS: Record<CorrectionTargetType, string> = {
  translation: 'Traduction',
  word: 'Mot',
  expression: 'Expression',
  grammar_rule: 'Règle de grammaire',
  resource: 'Ressource',
}
