// lib/lexicon-audio-data.ts — Supabase calls for the pronunciation recordings of lexicon entries.
// Runs in the browser; no 'server-only'. The database enforces who may do what; this adds French errors
// and keeps storage and database in step (a refused row removes its file, a deleted row removes its file).
import type { SupabaseClient } from '@supabase/supabase-js'
import { baseMimeType, extensionForMime } from './courses/pronunciation'
import { checkCorrectionInput } from './corrections'
import { LEXICON_AUDIO_BUCKET, checkAudioSize, lexiconAudioPath } from './lexicon-audio'
import type { Result } from './word-blocks-data'

export interface PronunciationRow {
  id: string
  path: string
  author: string
  createdBy: string
  createdAt: string
}

const MESSAGES: Record<string, string> = {
  not_signed_in: 'Connectez-vous pour enregistrer une prononciation.',
  entry_not_found: 'Ce mot n’existe plus dans le lexique.',
  bad_path: 'Le fichier envoyé est invalide.',
  file_not_found: 'Le fichier n’a pas pu être enregistré. Veuillez réessayer.',
  too_many: 'Vous avez déjà 3 enregistrements pour ce mot : supprimez-en un pour en ajouter.',
  not_allowed: 'Seul l’auteur de l’enregistrement ou un administrateur peut le supprimer.',
  not_found: 'Cet enregistrement n’existe plus.',
}
const GENERIC = 'Une erreur est survenue. Veuillez réessayer.'

export function audioErrorMessage(message: string): string {
  const code = Object.keys(MESSAGES).find(c => message.includes(c))
  return code ? MESSAGES[code] : GENERIC
}

export async function uploadPronunciation(
  client: SupabaseClient,
  a: { userId: string; lexiconId: string; blob: Blob },
): Promise<Result<{ id: string }>> {
  const tooBig = checkAudioSize(a.blob)
  if (tooBig) return { data: null, error: tooBig }

  const path = lexiconAudioPath(a.userId, a.lexiconId, Date.now(), extensionForMime(a.blob.type))
  const bucket = client.storage.from(LEXICON_AUDIO_BUCKET)
  const up = await bucket.upload(path, a.blob, { contentType: baseMimeType(a.blob.type), upsert: false })
  if (up.error) return { data: null, error: GENERIC }

  const { data, error } = await client.rpc('add_lexicon_pronunciation', { p_lexicon_id: a.lexiconId, p_path: path })
  if (error) {
    await bucket.remove([path])
    return { data: null, error: audioErrorMessage(error.message) }
  }
  return { data: { id: data as string }, error: null }
}

export async function deletePronunciation(client: SupabaseClient, id: string): Promise<Result<true>> {
  const { data, error } = await client.rpc('delete_lexicon_pronunciation', { p_id: id })
  if (error) return { data: null, error: audioErrorMessage(error.message) }
  // Best effort: the row is gone, an orphan file is harmless.
  if (typeof data === 'string' && data) await client.storage.from(LEXICON_AUDIO_BUCKET).remove([data])
  return { data: true, error: null }
}

export async function listPronunciations(client: SupabaseClient, lexiconId: string): Promise<PronunciationRow[]> {
  const { data, error } = await client.rpc('get_lexicon_pronunciations', { p_lexicon_id: lexiconId })
  if (error || !Array.isArray(data)) return []
  return (data as Record<string, string>[]).map(r => ({
    id: r.id,
    path: r.path,
    author: r.author,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }))
}

/** Reports a recording with a message (there is nothing to propose in place of a sound). */
export async function reportPronunciation(client: SupabaseClient, recordingId: string, message: string): Promise<Result<true>> {
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { data: null, error: 'Connectez-vous pour signaler un enregistrement.' }
  const input = { targetType: 'pronunciation' as const, targetId: recordingId, field: 'audio', kind: 'other' as const, message }
  const checked = checkCorrectionInput(input)
  if (!checked.message) return { data: null, error: 'Expliquez le problème (par exemple : bruit, mauvais mot).' }
  if (checked.error) return { data: null, error: checked.error }
  const { error } = await client.from('corrections').insert({
    target_type: 'pronunciation',
    target_id: recordingId,
    field: 'audio',
    kind: 'other',
    message: checked.message,
    suggestion: null,
    reporter_id: user.id,
  })
  if (error?.code === '23505') return { data: null, error: 'Vous avez déjà signalé cet enregistrement.' }
  if (error) return { data: null, error: error.message }
  return { data: true, error: null }
}
