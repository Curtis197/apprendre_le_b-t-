import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AlphabetReference } from '@/components/AlphabetReference'

describe('AlphabetReference', () => {
  it('renders the default dialect with its groups, counts and empty content slots', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain('Voyelles')
    expect(html).toContain('Voyelles à tréma')
    expect(html).toContain('Marques')
    expect(html).toContain('ɩ')
    expect(html).toContain('Exemples à venir')
    expect(html).toContain('Note à venir')
    expect(html).toContain('à valider')
    expect(html).toContain('50')   // a formatted frequency, e.g. 50 714
  })

  it('offers the three dialects as tabs', () => {
    const html = renderToStaticMarkup(<AlphabetReference />)
    expect(html).toContain('Occidental')
    expect(html).toContain('Oriental')
    expect(html).toContain('Septentrional')
  })
})
