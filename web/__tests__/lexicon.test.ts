// web/__tests__/lexicon.test.ts
import { describe, expect, it } from 'vitest'
import {
  checkDescription,
  checkTranslationInput,
  otherMeaningsLabel,
  pickDescription,
  sortTranslations,
  translationCount,
  translationsSummary,
} from '../lib/lexicon'

describe('checkTranslationInput', () => {
  it('trims and turns a blank context into null', () => {
    expect(checkTranslationInput({ french: '  manger ', context: '   ' })).toEqual({
      french: 'manger', context: null, error: null,
    })
  })
  it('requires a French word', () => {
    expect(checkTranslationInput({ french: '  ' }).error).toBe('Le mot français est obligatoire.')
  })
  it('rejects over-long fields with a French message', () => {
    expect(checkTranslationInput({ french: 'x'.repeat(201) }).error).toContain('200')
    expect(checkTranslationInput({ french: 'a', context: 'x'.repeat(301) }).error).toContain('300')
  })
})

describe('checkDescription', () => {
  it('stores a blank description as null', () => {
    expect(checkDescription('  \n ')).toEqual({ description: null, error: null })
  })
  it('trims and enforces the limit', () => {
    expect(checkDescription('  Un repas. ').description).toBe('Un repas.')
    expect(checkDescription('x'.repeat(2001)).error).toContain('2000')
  })
})

describe('translation display helpers', () => {
  const t = (position: number, created_at: string, french = 'a') => ({ position, created_at, french })
  it('orders by position, then age', () => {
    const sorted = sortTranslations([t(1, '2026-01-02', 'b'), t(0, '2026-01-05', 'a'), t(1, '2026-01-01', 'c')])
    expect(sorted.map(x => x.french)).toEqual(['a', 'c', 'b'])
  })
  it('does not mutate its input', () => {
    const input = [t(1, '2026-01-02'), t(0, '2026-01-01')]
    sortTranslations(input)
    expect(input[0].position).toBe(1)
  })
  it('summarises distinct French words', () => {
    expect(translationsSummary([{ french: 'manger' }, { french: 'se nourrir' }, { french: 'Manger' }])).toBe(
      'manger, se nourrir',
    )
  })
  it('labels extra meanings', () => {
    expect(otherMeaningsLabel(1)).toBeNull()
    expect(otherMeaningsLabel(2)).toBe('+1 autre sens')
    expect(otherMeaningsLabel(4)).toBe('+3 autres sens')
  })
  it('reads the embedded count', () => {
    expect(translationCount([{ count: 3 }])).toBe(3)
    expect(translationCount(undefined)).toBe(0)
    expect(translationCount(null)).toBe(0)
  })
  it('prefers the description over legacy notes', () => {
    expect(pickDescription({ description: 'D', notes: 'N' })).toBe('D')
    expect(pickDescription({ description: ' ', notes: 'N' })).toBe('N')
    expect(pickDescription({})).toBe('')
  })
})
