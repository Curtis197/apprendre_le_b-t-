import { describe, expect, it } from 'vitest'
import {
  MAX_RECORDING_BYTES,
  baseMimeType,
  buildRecordingPath,
  extensionForMime,
  pickRecordingMimeType,
  pronunciationStatusLabel,
} from '../lib/courses/pronunciation'

describe('pickRecordingMimeType', () => {
  it('prefers webm/opus where supported (Chrome, Firefox)', () => {
    const supported = new Set(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
    expect(pickRecordingMimeType(m => supported.has(m))).toBe('audio/webm;codecs=opus')
  })

  it('falls back to mp4 on Safari', () => {
    expect(pickRecordingMimeType(m => m === 'audio/mp4')).toBe('audio/mp4')
  })

  it('returns null when nothing is supported so the UI can explain', () => {
    expect(pickRecordingMimeType(() => false)).toBeNull()
  })
})

describe('baseMimeType / extensionForMime', () => {
  it('strips codec parameters so the storage allow-list matches', () => {
    expect(baseMimeType('audio/webm;codecs=opus')).toBe('audio/webm')
    expect(baseMimeType('audio/mp4')).toBe('audio/mp4')
  })

  it('maps mime to file extension', () => {
    expect(extensionForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForMime('audio/mp4')).toBe('mp4')
    expect(extensionForMime('audio/ogg;codecs=opus')).toBe('ogg')
  })
})

describe('buildRecordingPath', () => {
  it('puts the learner id first (storage RLS) then the lesson id', () => {
    expect(buildRecordingPath('u1', 'l1', 1700000000000, 'webm')).toBe('u1/l1/1700000000000.webm')
  })
})

describe('limits and labels', () => {
  it('caps recordings at 5 MB', () => {
    expect(MAX_RECORDING_BYTES).toBe(5 * 1024 * 1024)
  })

  it('labels each status in French', () => {
    expect(pronunciationStatusLabel('submitted')).toBe('En attente de validation')
    expect(pronunciationStatusLabel('validated')).toBe('Prononciation validée')
    expect(pronunciationStatusLabel('needs_retry')).toBe('À refaire')
    expect(pronunciationStatusLabel('reviewed')).toBe('Évalué')
  })
})
