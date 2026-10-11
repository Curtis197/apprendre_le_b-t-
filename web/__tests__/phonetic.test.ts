import { describe, it, expect } from 'vitest'
import { toStoredForm, insertAtSelection } from '@/lib/phonetic'

describe('toStoredForm', () => {
  it('composes a letter and a combining diaeresis into one character', () => {
    expect(toStoredForm('gö')).toBe('gö')
    expect(toStoredForm('gö').length).toBe(2)
  })

  it('leaves plain text, IPA letters, apostrophes and hyphens untouched', () => {
    const s = "gwälɩɛ 'mö ‑mä -yɛ \"ne"
    expect(toStoredForm(s)).toBe(s)
  })

  it('keeps line breaks and blank lines (verse numbering relies on them)', () => {
    const s = 'ä b\n\nc\r\nd'
    expect(toStoredForm(s)).toBe('ä b\n\nc\r\nd')
  })

  it('is idempotent and handles the empty string', () => {
    const once = toStoredForm('öë')
    expect(toStoredForm(once)).toBe(once)
    expect(toStoredForm('')).toBe('')
  })
})

describe('insertAtSelection', () => {
  it('inserts at the cursor and puts the caret after the glyph', () => {
    expect(insertAtSelection('ab', 1, 1, 'ɛ')).toEqual({ value: 'aɛb', caret: 2 })
  })

  it('replaces the selection', () => {
    expect(insertAtSelection('abcd', 1, 3, 'ɔ')).toEqual({ value: 'aɔd', caret: 2 })
  })

  it('works on an empty field and at both ends', () => {
    expect(insertAtSelection('', 0, 0, 'ɩ')).toEqual({ value: 'ɩ', caret: 1 })
    expect(insertAtSelection('ab', 0, 0, 'ʋ')).toEqual({ value: 'ʋab', caret: 1 })
    expect(insertAtSelection('ab', 2, 2, 'ŋ')).toEqual({ value: 'abŋ', caret: 3 })
  })

  it('clamps a position beyond the text to the end', () => {
    expect(insertAtSelection('ab', 99, 99, 'ɛ')).toEqual({ value: 'abɛ', caret: 3 })
  })

  it('composes a typed letter with an inserted combining mark', () => {
    expect(insertAtSelection('go', 2, 2, '̈')).toEqual({ value: 'gö', caret: 2 })
  })

  it('refuses when the result would exceed the maximum length', () => {
    expect(insertAtSelection('abc', 3, 3, 'ɛ', 3)).toBeNull()
    expect(insertAtSelection('abc', 3, 3, 'ɛ', 4)).toEqual({ value: 'abcɛ', caret: 4 })
    expect(insertAtSelection('abc', 0, 3, 'ɛ', 3)).toEqual({ value: 'ɛ', caret: 1 })
  })

  it('treats a max of 0 as "no limit"', () => {
    expect(insertAtSelection('abc', 3, 3, 'ɛ', 0)?.value).toBe('abcɛ')
  })
})
