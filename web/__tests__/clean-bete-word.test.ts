import { describe, it, expect } from 'vitest'
import { cleanBeteWord } from '@/lib/utils'

describe('cleanBeteWord', () => {
  it('keeps the leading apostrophe: it is a tone mark', () => {
    expect(cleanBeteWord("'gwɛlenya")).toBe("'gwɛlenya")
  })

  it('keeps a leading hyphen: it is the low-tone mark written before the word', () => {
    expect(cleanBeteWord('‑mä')).toBe('‑mä')
    expect(cleanBeteWord('-mä')).toBe('-mä')
    expect(cleanBeteWord(" '‑mä, ")).toBe("'‑mä")
  })

  it('still strips trailing punctuation and surrounding spaces', () => {
    expect(cleanBeteWord(' bhö, ')).toBe('bhö')
    expect(cleanBeteWord('lɛ.')).toBe('lɛ')
    expect(cleanBeteWord('lɛ?!')).toBe('lɛ')
  })
})
