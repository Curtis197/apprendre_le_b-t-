import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlphabetReference } from '@/components/AlphabetReference'
import { DIALECT_NOTES } from '@/lib/phonetic-alphabet'

describe('AlphabetReference', () => {
  it('renders the default dialect with its groups, counts, sourced notes and empty example slots', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain('Voyelles')
    expect(html).toContain('Voyelles à tréma')
    expect(html).toContain('Marques')
    expect(html).toContain('ɩ')
    expect(html).toContain('Exemples à venir')
    expect(html).toContain('à valider')
    expect(html).toContain('Source :')
    expect(html).toContain('50')   // a formatted frequency, e.g. 50 714
  })

  it('introduces the dialect and says which tréma vowels its text writes', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain(DIALECT_NOTES.western.slice(0, 50))   // before any apostrophe, so no HTML escaping
    expect(html).toContain('quatre voyelles à tréma')
  })

  it('offers the three dialects as tabs', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain('Occidental')
    expect(html).toContain('Oriental')
    expect(html).toContain('Septentrional')
  })
})
