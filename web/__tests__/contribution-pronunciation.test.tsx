import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ContributionPronunciation } from '@/components/ContributionPronunciation'

describe('ContributionPronunciation', () => {
  it('is optional and offers the recorder', () => {
    const html = renderToStaticMarkup(<ContributionPronunciation blob={null} onChange={() => {}} />)
    expect(html).toContain('Prononciation (optionnel)')
    expect(html).toContain('Enregistrer la prononciation')
    expect(html).not.toContain('Retirer')
    expect(html).not.toContain('Garder')
  })
  it('says a recording is ready and lets the contributor remove it', () => {
    const html = renderToStaticMarkup(
      <ContributionPronunciation blob={new Blob([new Uint8Array(10)], { type: 'audio/webm' })} onChange={() => {}} />,
    )
    expect(html).toContain('sera publié avec le mot')
    expect(html).toContain('Retirer')
  })
})
