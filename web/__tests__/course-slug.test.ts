import { describe, expect, it } from 'vitest'
import { buildSlug, randomSuffix, slugify } from '../lib/courses/slug'

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('slugify', () => {
  it('lowercases and strips accents', () => {
    expect(slugify('Salutations en bhété')).toBe('salutations-en-bhete')
  })

  it('collapses punctuation and trims separators', () => {
    expect(slugify('Les nombres (1–10) !')).toBe('les-nombres-1-10')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('ɔ ʋ')).toBe('')
  })

  it('caps the length at 60 without leaving a trailing hyphen', () => {
    const slug = slugify('mot '.repeat(30))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug).not.toMatch(/-$/)
    expect(slug).toMatch(SLUG_PATTERN)
  })
})

describe('randomSuffix', () => {
  it('produces the requested number of base-36 characters', () => {
    expect(randomSuffix(4, () => 0)).toBe('aaaa')
    expect(randomSuffix(6, Math.random)).toMatch(/^[a-z0-9]{6}$/)
  })
})

describe('buildSlug', () => {
  it('appends a 4-character suffix to the slugified title', () => {
    expect(buildSlug('Salutations', () => 0)).toBe('salutations-aaaa')
  })

  it('falls back to "cours" when the title has no usable characters', () => {
    expect(buildSlug('!!!', () => 0)).toBe('cours-aaaa')
  })

  it('always matches the database slug constraint', () => {
    const slug = buildSlug('Un très long titre de cours pour vérifier la contrainte de longueur '.repeat(3))
    expect(slug).toMatch(SLUG_PATTERN)
    expect(slug.length).toBeLessThanOrEqual(80)
  })
})
