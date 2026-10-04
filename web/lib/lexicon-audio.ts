// lib/lexicon-audio.ts — constants and pure helpers for the pronunciation recordings of lexicon entries.
// The limits mirror supabase/migrations/20261009000000_lexicon_pronunciations.sql.

export const LEXICON_AUDIO_BUCKET = 'lexicon-pronunciations'
export const MAX_LEXICON_AUDIO_SECONDS = 10
export const MAX_LEXICON_AUDIO_BYTES = 1048576
export const MAX_AUDIO_PER_USER = 3

/** Storage RLS requires the author's id as the first folder, the database the entry id as the second. */
export function lexiconAudioPath(userId: string, lexiconId: string, nowMs: number, ext: string): string {
  return `${userId}/${lexiconId}/${nowMs}.${ext}`
}

/** A French message, or null when the recording can be sent. */
export function checkAudioSize(blob: { size: number }): string | null {
  if (blob.size === 0) return 'L’enregistrement est vide, veuillez recommencer.'
  if (blob.size > MAX_LEXICON_AUDIO_BYTES) return 'Enregistrement trop volumineux (1 Mo maximum).'
  return null
}

/** The public URL of a recording (the bucket is public: no signed URL, no sign-in needed to play). */
export function publicAudioUrl(path: string, base: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''): string {
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${LEXICON_AUDIO_BUCKET}/${path}`
}
