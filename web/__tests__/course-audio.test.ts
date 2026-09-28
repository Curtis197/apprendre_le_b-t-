import { describe, expect, it } from 'vitest'
import { formatAudioDuration, isValidAudioFile, MAX_AUDIO_BYTES } from '../lib/courses/audio'

describe('audio validation', () => {
  it('accepts MP3 and M4A files within size limit', () => {
    expect(isValidAudioFile({ size: 1000, type: 'audio/mpeg', name: 'audio.mp3' })).toEqual({ valid: true })
    expect(isValidAudioFile({ size: 5000, type: 'audio/x-m4a', name: 'audio.m4a' })).toEqual({ valid: true })
    expect(isValidAudioFile({ size: 5000, type: 'audio/mp4', name: 'audio.m4a' })).toEqual({ valid: true })
  })

  it('rejects files larger than 10MB', () => {
    const res = isValidAudioFile({ size: MAX_AUDIO_BYTES + 1, type: 'audio/mpeg', name: 'big.mp3' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('10 Mo')
  })

  it('rejects unsupported audio formats (e.g. ogg, webm, wav)', () => {
    expect(isValidAudioFile({ size: 1000, type: 'audio/ogg', name: 'clip.ogg' }).valid).toBe(false)
    expect(isValidAudioFile({ size: 1000, type: 'audio/webm', name: 'clip.webm' }).valid).toBe(false)
  })
})

describe('formatAudioDuration', () => {
  it('formats seconds into m:ss format', () => {
    expect(formatAudioDuration(0)).toBe('0:00')
    expect(formatAudioDuration(45)).toBe('0:45')
    expect(formatAudioDuration(75)).toBe('1:15')
    expect(formatAudioDuration(605)).toBe('10:05')
  })
})
