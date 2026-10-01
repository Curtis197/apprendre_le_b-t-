import { describe, expect, it } from 'vitest'
import { buildResourceDescription, resourceTypeSingular } from '../lib/resources'

const base = { title: 'Le chant du matin', type: 'song' as const, content_bete: 'na ŋɔ́nɔ́', content_french: null }

describe('resourceTypeSingular', () => {
  it('names each type in the singular and falls back for unknown ones', () => {
    expect(resourceTypeSingular('proverb')).toBe('Proverbe')
    expect(resourceTypeSingular('riddle')).toBe('Devinette')
    expect(resourceTypeSingular('nope')).toBe('Ressource')
  })
})

describe('buildResourceDescription', () => {
  it('uses the French translation when there is one', () => {
    const d = buildResourceDescription({ ...base, content_french: 'mon enfant' })
    expect(d).toBe('Chanson bhété « Le chant du matin » : mon enfant')
  })

  it('falls back to the Bhété text without a translation', () => {
    expect(buildResourceDescription(base)).toContain('na ŋɔ́nɔ́')
  })

  it('collapses line breaks so lyrics fit on one line', () => {
    expect(buildResourceDescription({ ...base, content_french: 'ligne un\n\nligne deux' })).toContain('ligne un ligne deux')
  })

  it('truncates long text on a word boundary within the limit', () => {
    const long = Array.from({ length: 80 }, (_, i) => `mot${i}`).join(' ')
    const d = buildResourceDescription({ ...base, content_french: long }, 120)
    expect(d.length).toBeLessThanOrEqual(121)
    expect(d.endsWith('…')).toBe(true)
    // never cuts a word in half: the last word before the ellipsis is a whole "motN"
    expect(d).toMatch(/ mot\d+…$/)
    expect(long.startsWith(d.slice(d.indexOf(' : ') + 3, -1))).toBe(true)
  })
})
