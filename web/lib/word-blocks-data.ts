// lib/word-blocks-data.ts — Supabase calls for the word-by-word layer (reader and editor).
// No 'server-only' import: the reader page calls getResourceWords on the server, the editor
// calls saveVerse in the browser.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlockInput, LexSummary, MarkerInfo, VerseWords, WordBlock } from './word-blocks'

export type Result<T> = { data: T; error: null } | { data: null; error: string }

const ints = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

function parseMarker(v: unknown): MarkerInfo | null {
  if (!v || typeof v !== 'object') return null
  const m = v as Record<string, unknown>
  return { type: text(m.type), meaning: text(m.meaning), french: text(m.french) }
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** A lexicon entry summary as the database returns it (see lexicon_summary), or null if it is not one. */
export function parseLex(v: unknown): LexSummary | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.id !== 'string' || (r.kind !== 'word' && r.kind !== 'marker')) return null
  const senses = Array.isArray(r.senses) ? (r.senses as Record<string, unknown>[]) : []
  return {
    id: r.id,
    kind: r.kind,
    spelling: typeof r.spelling === 'string' ? r.spelling : '',
    ipa: text(r.ipa),
    dialect: typeof r.dialect === 'string' ? r.dialect : 'western',
    pos: strs(r.pos),
    description: text(r.description),
    synonyms: strs(r.synonyms),
    marker: parseMarker(r.marker) ?? { type: null, meaning: null, french: null },
    senses: senses
      .filter(s => s && typeof s.id === 'string' && typeof s.french === 'string')
      .map(s => ({ id: s.id as string, french: s.french as string, context: text(s.context) })),
    senseId: typeof r.sense_id === 'string' ? r.sense_id : null,
    spellings: strs(r.spellings),
  }
}

function parseBlock(raw: Record<string, unknown>): WordBlock {
  return {
    position: Number(raw.position),
    bete_idx: ints(raw.bete_idx),
    gloss_idx: ints(raw.gloss_idx),
    is_marker: raw.is_marker === true,
    solo: raw.solo === true,
    note: text(raw.note),
    composition: text(raw.composition),
    marker: raw.is_marker === true ? parseMarker(raw.marker) : null,
    lex: parseLex(raw.lex),
  }
}

export function parseVerse(raw: Record<string, unknown>): VerseWords {
  const blocks = Array.isArray(raw.blocks) ? (raw.blocks as Record<string, unknown>[]) : []
  return {
    verse_no: Number(raw.verse_no),
    stale: raw.stale === true,
    bete_line: typeof raw.bete_line === 'string' ? raw.bete_line : '',
    literal_line: typeof raw.literal_line === 'string' ? raw.literal_line : '',
    blocks: blocks.map(parseBlock),
  }
}

/** The verses of a resource that have word blocks (stale verses come back without blocks). */
export async function getResourceWords(client: SupabaseClient, resourceId: string): Promise<VerseWords[]> {
  const { data, error } = await client.rpc('get_resource_words', { p_resource: resourceId })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, unknown>[]).map(parseVerse)
}

export const SAVE_ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'Connectez-vous pour enregistrer.',
  not_owner: 'Seul le contributeur de cette ressource peut relier ses mots.',
  resource_not_found: "Cette ressource n'existe plus.",
  text_changed: "Le texte de ce vers a changé depuis l'ouverture de la page. Rechargez la page, puis reprenez.",
  verse_not_found: "Ce vers n'existe pas dans le texte.",
  bad_line: 'La ligne corrigée est vide ou contient un saut de ligne.',
  literal_missing: "Ce vers n'a pas de mot à mot.",
  bad_verse: 'Numéro de vers invalide.',
  bad_blocks: 'Les blocs envoyés sont invalides.',
  empty_block: 'Un bloc ne contient aucun mot.',
  bete_index_out_of_range: 'Un bloc désigne un mot bhété qui n’existe pas.',
  bete_index_not_increasing: 'Les mots bhété d’un bloc sont dans le désordre.',
  bete_word_in_two_blocks: 'Un mot bhété est dans deux blocs.',
  bete_word_uncovered: 'Un mot bhété n’est dans aucun bloc.',
  gloss_index_out_of_range: 'Un bloc désigne un mot du mot à mot qui n’existe pas.',
  gloss_index_not_increasing: 'Les mots du mot à mot d’un bloc sont dans le désordre.',
  gloss_word_in_two_blocks: 'Un mot du mot à mot est dans deux blocs.',
  gloss_word_uncovered: 'Un mot du mot à mot n’est dans aucun bloc.',
  solo_has_gloss: 'Un marqueur « sans mot correspondant » ne peut pas avoir de mot à mot.',
  solo_not_marker: 'Seul un marqueur grammatical peut être sans mot correspondant.',
  block_without_gloss: 'Un bloc n’a aucun mot du mot à mot.',
  marker_needs_entry: 'Un marqueur grammatical doit être relié à une entrée du lexique : créez-la ou choisissez-la dans le panneau.',
  marker_needs_marker_entry: 'Un marqueur doit être relié à une entrée de type marqueur.',
  word_needs_word_entry: 'Un mot ne peut pas être relié à une entrée de type marqueur.',
  sense_not_of_entry: 'Le sens choisi n’appartient pas à cette entrée du lexique.',
  sense_without_entry: 'Un sens est choisi sans entrée du lexique.',
  entry_not_found: 'Cette entrée du lexique n’existe plus : déliez le mot et choisissez-en une autre.',
  bad_link: 'Le lien vers le lexique est invalide.',
}

const GENERIC_SAVE_ERROR = "Erreur lors de l'enregistrement. Veuillez réessayer."

/** The database raises plain codes; find one inside whatever text the client library returns. */
export function saveErrorMessage(message: string): string {
  const code = Object.keys(SAVE_ERROR_MESSAGES).find(c => message.includes(c))
  return code ? SAVE_ERROR_MESSAGES[code] : GENERIC_SAVE_ERROR
}

export interface SaveVerseArgs {
  resourceId: string
  verseNo: number
  /** The verse lines the editor was built on; the database refuses the save if the text moved. */
  baseBete: string
  baseLiteral: string
  /** Corrected lines, or null when unchanged. */
  beteLine: string | null
  literalLine: string | null
  blocks: BlockInput[]
}

export async function saveVerse(
  client: SupabaseClient,
  a: SaveVerseArgs,
): Promise<Result<{ saved: number; verse_hash: string }>> {
  const { data, error } = await client.rpc('save_resource_verse', {
    p_resource: a.resourceId,
    p_verse: a.verseNo,
    p_base_bete: a.baseBete,
    p_base_literal: a.baseLiteral,
    p_bete_line: a.beteLine,
    p_literal_line: a.literalLine,
    p_blocks: a.blocks,
  })
  if (error) return { data: null, error: saveErrorMessage(error.message) }
  const d = data as { saved: number; verse_hash: string }
  return { data: { saved: d.saved, verse_hash: d.verse_hash }, error: null }
}
