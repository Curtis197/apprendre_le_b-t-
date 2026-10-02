import type { SubmissionStatus } from './assignment'

export const MAX_RECORDING_SECONDS = 60
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024
export const PRONUNCIATION_BUCKET = 'pronunciation-submissions'

const CANDIDATE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/** First recording format the browser's MediaRecorder supports, or null. */
export function pickRecordingMimeType(isSupported: (mime: string) => boolean): string | null {
  return CANDIDATE_MIME_TYPES.find(isSupported) ?? null
}

/** Storage compares the bare type, so `audio/webm;codecs=opus` must become `audio/webm`. */
export function baseMimeType(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase()
}

export function extensionForMime(mime: string): 'webm' | 'mp4' | 'ogg' {
  const base = baseMimeType(mime)
  if (base === 'audio/mp4') return 'mp4'
  if (base === 'audio/ogg') return 'ogg'
  return 'webm'
}

/** Storage RLS requires the learner id as the first folder. */
export function buildRecordingPath(userId: string, lessonId: string, nowMs: number, ext: string): string {
  return `${userId}/${lessonId}/${nowMs}.${ext}`
}

export function pronunciationStatusLabel(status: SubmissionStatus): string {
  switch (status) {
    case 'validated':
      return 'Prononciation validée'
    case 'needs_retry':
      return 'À refaire'
    case 'reviewed':
      return 'Évalué'
    default:
      return 'En attente de validation'
  }
}
