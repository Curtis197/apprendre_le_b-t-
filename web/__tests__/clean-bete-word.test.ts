import { describe, it, expect } from 'vitest'
import { cleanBeteWord } from '@/lib/utils'

describe('cleanBeteWord', () => {
  it('keeps the leading apostrophe: it is a tone mark', () => {
    expect(cleanBeteWord("'gwɛlenya")).toBe("'gwɛlenya")
  })

  it('still strips a leading hyphen that only links the word to the previous one', () => {
    expect(cleanBeteWord('\u2011mä')).toBe('mä')
    expect(cleanBeteWord('\u2010mä')).toBe('mä')
    expect(cleanBeteWord('\u2012mä')).toBe('mä')
  })

  it('still strips trailing punctuation and surrounding spaces', () => {
    expect(cleanBeteWord(' bhö, ')).toBe('bhö')
    expect(cleanBeteWord('lɛ.')).toBe('lɛ')
    expect(cleanBeteWord('lɛ?!')).toBe('lɛ')
  })
})
