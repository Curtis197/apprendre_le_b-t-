import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseTranslation } from '../components/VerseTranslation'
import type { VerseWords, WordBlock } from '../lib/word-blocks'

const block = (position: number, bete: number[], gloss: number[]): WordBlock => ({
  position, bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, marker: null,
})
const verse = (no: number, bete: string, literal: string): VerseWords => ({
  verse_no: no, stale: false, bete_line: bete, literal_line: literal,
  blocks: bete.split(' ').map((_, i) => block(i + 1, [i], [i])),
})

const props = { original: 'ba ko\nsa ni', literal: 'l1 l2\nl3 l4', french: 'F1\nF2' }
const buttonTexts = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1].trim())

// The word views ("Texte" and "Mot par mot") already give the exact word-for-word reading, so the older
// "Mot à mot" button only stays for verses that are not linked yet.
describe('the older "Mot à mot" button', () => {
  it('is hidden when every verse is shown with its words', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[verse(1, 'ba ko', 'l1 l2'), verse(2, 'sa ni', 'l3 l4')]} />)
    expect(buttonTexts(html)).toContain('Texte')
    expect(buttonTexts(html)).toContain('Mot par mot')
    expect(buttonTexts(html).some(t => t.startsWith('Mot à mot'))).toBe(false)
  })

  it('stays when some verse is not linked yet', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[verse(1, 'ba ko', 'l1 l2')]} />)
    expect(buttonTexts(html)).toContain('Mot par mot')
    expect(buttonTexts(html).some(t => t.startsWith('Mot à mot'))).toBe(true)
  })

  it('stays when a linked verse went stale', () => {
    const stale = { ...verse(2, 'sa ni', 'l3 l4'), stale: true, blocks: [] }
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[verse(1, 'ba ko', 'l1 l2'), stale]} />)
    expect(buttonTexts(html).some(t => t.startsWith('Mot à mot'))).toBe(true)
  })

  it('stays on a resource without any link', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} />)
    expect(buttonTexts(html).some(t => t.startsWith('Mot à mot'))).toBe(true)
  })

  it('stays when the mot à mot is shown for a verse whose words do not match the displayed line', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[verse(1, 'ba ko', 'l1 l2'), verse(2, 'other line', 'l3 l4')]} />)
    expect(buttonTexts(html).some(t => t.startsWith('Mot à mot'))).toBe(true)
  })
})
