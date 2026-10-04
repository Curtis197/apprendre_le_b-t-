// lib/lexicon-links-data.ts — Supabase calls for the lexicon side of the word-link editor.
// Runs in the browser (editor) and on the server; no 'server-only'.
import type { SupabaseClient } from '@supabase/supabase-js'
import { splitList, type Candidate, type EntryForm } from './lexicon-links'
import { checkTranslationInput } from './lexicon'
import { parseLex, type Result } from './word-blocks-data'
import type { LexSummary } from './word-blocks'

export const LEX_ERROR_MESSAGES: Record<string, string> = {
  not_signed_in: 'Connectez-vous pour modifier le lexique.',
  bad_spelling: 'La graphie est vide ou trop longue (100 caractères au plus).',
  bad_dialect: 'Dialecte invalide.',
  bad_kind: 'Type d’entrée invalide.',
  sense_required: 'Ajoutez au moins un sens (le mot en français).',
  too_long: 'Un des textes est trop long.',
  entry_not_found: 'Cette entrée du lexique n’existe plus.',
  spelling_exists: 'Cette graphie existe déjà pour cette entrée.',
  not_a_marker: 'Cette entrée n’est pas un marqueur grammatical.',
  meaning_already_set:
    'Le sens de ce marqueur est déjà renseigné. Pour le changer, proposez une correction depuis la fiche du lexique.',
}

const GENERIC = 'Une erreur est survenue. Veuillez réessayer.'

export function lexErrorMessage(message: string): string {
  const code = Object.keys(LEX_ERROR_MESSAGES).find(c => message.includes(c))
  return code ? LEX_ERROR_MESSAGES[code] : GENERIC
}

function parseCandidate(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const entry = parseLex(r.entry)
  if (!entry) return null
  const matchKind = r.match_kind === 'exact' || r.match_kind === 'norm' || r.match_kind === 'near' ? r.match_kind : 'near'
  return {
    matchKind,
    matched: typeof r.matched === 'string' ? r.matched : entry.spelling,
    distance: typeof r.distance === 'number' ? r.distance : 0,
    entry,
  }
}

/** Entries whose spelling looks like `text`. Asks for one more than the panel shows, so it can say "more exist". */
export async function findCandidates(
  client: SupabaseClient,
  a: { text: string; dialect?: string | null; kind?: 'word' | 'marker' | null; limit?: number },
): Promise<Candidate[]> {
  const text = a.text.trim()
  if (!text) return []
  const { data, error } = await client.rpc('find_lexicon_candidates', {
    p_text: text,
    p_dialect: a.dialect ?? null,
    p_kind: a.kind ?? null,
    p_limit: a.limit ?? 7,
  })
  if (error || !Array.isArray(data)) return []
  return data.map(parseCandidate).filter((c): c is Candidate => c !== null)
}

export interface CreatedEntry {
  id: string
  existed: boolean
  senseIds: string[]
  entry: LexSummary
}

export async function createEntry(
  client: SupabaseClient,
  a: { form: EntryForm; kind: 'word' | 'marker'; example?: { bete: string; french: string; literal: string } | null },
): Promise<Result<CreatedEntry>> {
  const f = a.form
  const senses =
    a.kind === 'word'
      ? f.senses.filter(s => s.french.trim() !== '').map(s => ({ french: s.french.trim(), context: s.context.trim() || null }))
      : []
  const synonyms = splitList(f.synonyms)
  const { data, error } = await client.rpc('create_lexicon_entry', {
    p_spelling: f.spelling.trim(),
    p_ipa: f.ipa.trim() || null,
    p_dialect: f.dialect,
    p_kind: a.kind,
    p_pos: f.category && a.kind === 'word' ? [f.category] : null,
    p_description: f.description.trim() || null,
    p_notes: f.notes.trim() || null,
    p_synonyms: synonyms.length ? synonyms : null,
    p_lemma: f.lemma.trim() || null,
    p_senses: senses,
    p_example: a.example ?? null,
  })
  if (error) return { data: null, error: lexErrorMessage(error.message) }
  const d = data as { id: string; existed: boolean; sense_ids: string[]; entry: unknown }
  const entry = parseLex(d.entry)
  if (!entry) return { data: null, error: GENERIC }
  return { data: { id: d.id, existed: d.existed === true, senseIds: d.sense_ids ?? [], entry }, error: null }
}

export async function addSpelling(client: SupabaseClient, lexiconId: string, spelling: string): Promise<Result<true>> {
  const { error } = await client.rpc('add_lexicon_spelling', { p_lexicon_id: lexiconId, p_spelling: spelling.trim() })
  return error ? { data: null, error: lexErrorMessage(error.message) } : { data: true, error: null }
}

export async function setMarkerMeaning(
  client: SupabaseClient,
  lexiconId: string,
  v: { type: string; meaning: string; french: string },
): Promise<Result<true>> {
  const { error } = await client.rpc('set_marker_meaning', {
    p_lexicon_id: lexiconId,
    p_type: v.type,
    p_meaning: v.meaning,
    p_french: v.french,
  })
  return error ? { data: null, error: lexErrorMessage(error.message) } : { data: true, error: null }
}

/** A new sense on an existing entry (the existing "translations" policies and guard apply). */
export async function addSense(
  client: SupabaseClient,
  lexiconId: string,
  userId: string,
  v: { french: string; context: string },
): Promise<Result<true>> {
  const c = checkTranslationInput(v)
  if (c.error) return { data: null, error: c.error }
  const { error } = await client.from('lexicon_translations').insert({
    lexicon_id: lexiconId,
    french: c.french,
    context: c.context,
    created_by: userId,
  })
  if (error) {
    return { data: null, error: error.message.includes('duplicate') ? 'Ce sens existe déjà.' : lexErrorMessage(error.message) }
  }
  return { data: true, error: null }
}

export async function getEntry(client: SupabaseClient, lexiconId: string): Promise<LexSummary | null> {
  const { data, error } = await client.rpc('get_lexicon_entry', { p_id: lexiconId })
  return error ? null : parseLex(data)
}
