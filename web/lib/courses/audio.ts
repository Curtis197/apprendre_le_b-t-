export const MAX_AUDIO_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
]

const ALLOWED_EXTENSIONS = ['.mp3', '.m4a']

export function isValidAudioFile(file: { size: number; type: string; name: string }): { valid: boolean; error?: string } {
  if (file.size > MAX_AUDIO_BYTES) {
    return { valid: false, error: 'Le fichier audio ne doit pas dépasser 10 Mo.' }
  }

  const nameLower = file.name.toLowerCase()
  const hasValidExt = ALLOWED_EXTENSIONS.some(ext => nameLower.endsWith(ext))
  const hasValidMime = ALLOWED_AUDIO_MIME_TYPES.includes(file.type.toLowerCase())

  if (!hasValidExt && !hasValidMime) {
    return { valid: false, error: 'Seuls les formats audio MP3 et M4A sont autorisés.' }
  }

  return { valid: true }
}

export function formatAudioDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
