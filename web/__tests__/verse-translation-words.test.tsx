import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseTranslation } from '../components/VerseTranslation'
import type { VerseWords, WordBlock } from '../lib/word-blocks'

const block = (position: number, bete: number[], gloss: number[]): WordBlock => ({
  position, bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, marker: null,
})

const verse1: VerseWords = {
  verse_no: 1, stale: false, bete_line: 'ba ko', literal_line: 'l1 l2',
  blocks: [block(1, [0], [0]), block(2, [1], [1])],
}

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1])

describe('VerseTranslation with word blocks', () => {
  const props = { original: 'ba ko\nsa ni', literal: 'l1 l2\nl3 l4', french: 'F1\nF2' }

  it('shows tappable words for a verse that has blocks and the plain line for the others', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[verse1]} />)
    expect(buttons(html)).toContain('ba')
    expect(buttons(html)).toContain('ko')
    expect(html).toContain('sa ni') // verse 2 has no blocks: plain text as before
    expect(html).toContain('F1')
    expect(html).toContain('F2')
  })

  it('falls back to the plain text for a stale verse', () => {
    const html = renderToStaticMarkup(<VerseTranslation {...props} words={[{ ...verse1, stale: true, blocks: [] }]} />)
    expect(buttons(html)).not.toContain('ba')
    expect(html).toContain('ba ko')
  })

  it('renders exactly as before without words', () => {
    const without = renderToStaticMarkup(<VerseTranslation {...props} />)
    const empty = renderToStaticMarkup(<VerseTranslation {...props} words={[]} />)
    expect(empty).toBe(without)
    expect(without).toContain('ba ko')
  })

  it('offers the display toggle only when some verse has blocks', () => {
    expect(renderToStaticMarkup(<VerseTranslation {...props} words={[verse1]} />)).toContain('Mot par mot')
    expect(renderToStaticMarkup(<VerseTranslation {...props} />)).not.toContain('Mot par mot')
  })

  it('does not apply blocks when the reader splits a paragraph into sentences', () => {
    const html = renderToStaticMarkup(
      <VerseTranslation original="Ba ko. Sa ni." literal="L1. L2." french="F1. F2." words={[{ ...verse1, bete_line: 'Ba ko. Sa ni.' }]} />,
    )
    expect(buttons(html)).not.toContain('Ba')
  })

  it('shows the words of a single-line resource instead of the three-tier card', () => {
    const single: VerseWords = {
      verse_no: 1, stale: false, bete_line: 'wa yi sa zo', literal_line: 'ils vont ça faire',
      blocks: [block(1, [0], [0]), block(2, [1], [1]), block(3, [2], [2]), block(4, [3], [3])],
    }
    const html = renderToStaticMarkup(
      <VerseTranslation original="wa yi sa zo" literal="ils vont ça faire" french="ils vont faire comme ça" words={[single]} />,
    )
    expect(buttons(html)).toEqual(expect.arrayContaining(['wa', 'yi', 'sa', 'zo']))
    expect(html).toContain('ils vont faire comme ça')
    expect(html).not.toContain('Texte original')
  })

  it('keeps the three-tier card for a single line without blocks', () => {
    const html = renderToStaticMarkup(<VerseTranslation original="wa yi sa zo" literal="ils vont ça faire" french="ils vont faire comme ça" />)
    expect(html).toContain('Texte original')
  })
})
