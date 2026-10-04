import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { VerseWords } from '../components/VerseWords'
import type { VerseWords as VerseData, WordBlock } from '../lib/word-blocks'

const block = (position: number, bete: number[], gloss: number[], over: Partial<WordBlock> = {}): WordBlock => ({
  position, bete_idx: bete, gloss_idx: gloss, is_marker: false, solo: false, note: null, composition: null, marker: null, ...over,
})

// Sê a'a tatini a yii  /  Comme nous laissons nos : "tatini" and "yii" are one word, apart.
const VERSE: VerseData = {
  verse_no: 4, stale: false,
  bete_line: "Sê a'a tatini a yii",
  literal_line: 'Comme nous laissons nos',
  blocks: [block(1, [0], [0]), block(2, [1], [1], { note: 'sujet' }), block(3, [2, 4], [2]), block(4, [3], [3])],
}

// renderToStaticMarkup escapes apostrophes: compare the words as the reader sees them
const decode = (s: string) => s.replace(/&#x27;/g, "'")
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => decode(m[1]))

describe('VerseWords', () => {
  it('shows the words in the original sentence order, in both modes', () => {
    expect(buttons(renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" />))).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
    const a = renderToStaticMarkup(<VerseWords verse={VERSE} mode="A" />)
    const words = [...a.matchAll(/<span class="[^"]*font-semibold[^"]*">([^<]*)<\/span>/g)].map(m => decode(m[1]))
    expect(words).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
  })

  it('mode A shows the exact gloss under each word and points linked words at each other', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="A" />)
    expect(html).toContain('laissons')
    expect(html).toContain('Comme')
    expect(html).toContain('↔ tatini') // under yii
    expect(html).toContain('↔ yii') // under tatini
  })

  it('opens the detail of a word with its partner when the block has separated words', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" initialOpen={4} />)
    expect(html).toContain('tatini … yii')
    expect(html).toContain('Lié à')
    expect(html).toContain('laissons')
    expect(html.match(/data-tied="true"/g)).toHaveLength(2) // tatini and yii are highlighted together
  })

  it('shows a note on the opened word', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" initialOpen={1} />)
    expect(html).toContain('sujet')
    expect(html).not.toContain('Lié à')
  })

  it('says "sens à préciser" for a marker whose meaning was never filled in', () => {
    const verse: VerseData = {
      verse_no: 1, stale: false, bete_line: 'en wo yi do', literal_line: 'je suis venir -ant',
      blocks: [block(1, [0], [0]), block(2, [1], [1], { is_marker: true, marker: null }), block(3, [2], [2]), block(4, [3], [3])],
    }
    const html = renderToStaticMarkup(<VerseWords verse={verse} mode="B" initialOpen={1} />)
    expect(html).toContain('Marqueur grammatical')
    expect(html).toContain('sens à préciser')
  })

  it('shows the shared meaning of a marker and how French renders it', () => {
    const verse: VerseData = {
      verse_no: 2, stale: false, bete_line: 'en ye zigbleh yi', literal_line: 'je demain venir',
      blocks: [
        block(1, [0], [0]),
        block(2, [1], [], { is_marker: true, solo: true, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe : je vais venir' } }),
        block(3, [2], [1]),
        block(4, [3], [2]),
      ],
    }
    const html = renderToStaticMarkup(<VerseWords verse={verse} mode="B" initialOpen={1} />)
    expect(html).toContain('temps : futur')
    expect(html).toContain('aller + verbe : je vais venir')
    expect(html).toContain('⟨futur⟩') // no mot à mot word: the meaning stands in for the gloss
  })

  it('renders nothing but the words for a verse without blocks', () => {
    const html = renderToStaticMarkup(<VerseWords verse={{ ...VERSE, blocks: [] }} mode="B" />)
    expect(buttons(html)).toEqual([])
  })
})
