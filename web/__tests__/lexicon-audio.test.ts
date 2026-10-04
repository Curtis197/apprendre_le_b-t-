import { describe, expect, it } from 'vitest'
import {
  LEXICON_AUDIO_BUCKET, MAX_AUDIO_PER_USER, MAX_LEXICON_AUDIO_BYTES, MAX_LEXICON_AUDIO_SECONDS,
  checkAudioSize, lexiconAudioPath, publicAudioUrl,
} from '@/lib/lexicon-audio'

describe('lexicon audio constants', () => {
  it('match the migration', () => {
    expect(LEXICON_AUDIO_BUCKET).toBe('lexicon-pronunciations')
    expect(MAX_LEXICON_AUDIO_SECONDS).toBe(10)
    expect(MAX_LEXICON_AUDIO_BYTES).toBe(1048576)
    expect(MAX_AUDIO_PER_USER).toBe(3)
  })
})

describe('lexiconAudioPath', () => {
  it('puts the author first, then the entry, then the timestamp', () => {
    expect(lexiconAudioPath('u1', 'e1', 1700000000000, 'webm')).toBe('u1/e1/1700000000000.webm')
  })
})

describe('checkAudioSize', () => {
  it('accepts a normal recording and refuses empty or too large ones in French', () => {
    expect(checkAudioSize({ size: 50_000 })).toBeNull()
    expect(checkAudioSize({ size: MAX_LEXICON_AUDIO_BYTES })).toBeNull()
    expect(checkAudioSize({ size: 0 })).toMatch(/vide/)
    expect(checkAudioSize({ size: MAX_LEXICON_AUDIO_BYTES + 1 })).toMatch(/1 Mo/)
  })
})

describe('publicAudioUrl', () => {
  it('builds the public storage URL and tolerates a trailing slash', () => {
    expect(publicAudioUrl('u1/e1/1.webm', 'https://x.supabase.co')).toBe(
      'https://x.supabase.co/storage/v1/object/public/lexicon-pronunciations/u1/e1/1.webm',
    )
    expect(publicAudioUrl('u1/e1/1.webm', 'https://x.supabase.co/')).toBe(
      'https://x.supabase.co/storage/v1/object/public/lexicon-pronunciations/u1/e1/1.webm',
    )
  })
})
