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

  it('mode B shows the detail panel under the words, not as an absolute popover inside the paragraph', () => {
    const html = renderToStaticMarkup(<VerseWords verse={VERSE} mode="B" initialOpen={4} />)
    expect(html).not.toContain('absolute')
    const para = /<p class="font-semibold[^"]*">[\s\S]*?<\/p>/.exec(html)![0]
    expect(para).not.toContain('role="dialog"')
    expect(html).toContain('role="dialog"')
  })

  const entry = (over = {}) => ({
    id: 'L1', kind: 'word' as const, spelling: 'ghèhi-wu', ipa: 'ɡɛ̀hiwu', dialect: 'western', pos: ['noun'],
    description: 'Le lieu en haut.', synonyms: ['firmament'], marker: { type: null, meaning: null, french: null },
    senses: [{ id: 'S1', french: 'ciel', context: 'en haut' }, { id: 'S2', french: 'haut', context: null }],
    senseId: 'S1', spellings: ['ghèhi-wu'], ...over,
  })
  const oneBlock = (lex: unknown, extra: Record<string, unknown> = {}) => ({
    verse_no: 1, stale: false, bete_line: 'ghèhi-wu', literal_line: 'au ciel',
    blocks: [{ position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null, lex, ...extra }],
  })

  it('shows the dictionary part of a linked word, the sense used first', () => {
    const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry()) as never} mode="B" initialOpen={0} />)
    expect(html).toContain('Nom')
    expect(html).toContain('ɡɛ̀hiwu')
    expect(html).toContain('Le lieu en haut.')
    expect(html).toContain('firmament')
    expect(html).toContain('ghèhi-wu')
    expect(html).toContain('/lexicon/L1')
    expect(html.indexOf('ciel')).toBeLessThan(html.indexOf('haut</'))
    expect(html).toContain('data-current-sense')
  })

  it('says an unlinked word is not in the lexicon yet', () => {
    expect(renderToStaticMarkup(<VerseWords verse={oneBlock(null) as never} mode="B" initialOpen={0} />)).toContain('Pas encore dans le lexique')
  })

  it('shows a marker from its entry, and "sens à préciser" when empty', () => {
    const m = entry({ kind: 'marker', senses: [], senseId: null, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe' } })
    const withMeaning = renderToStaticMarkup(
      <VerseWords verse={oneBlock(m, { is_marker: true, marker: m.marker }) as never} mode="B" initialOpen={0} />,
    )
    expect(withMeaning).toContain('Marqueur grammatical')
    expect(withMeaning).toContain('temps : futur')
    expect(withMeaning).toContain('aller + verbe')
    const empty = entry({ kind: 'marker', senses: [], senseId: null })
    const html = renderToStaticMarkup(
      <VerseWords verse={oneBlock(empty, { is_marker: true, marker: empty.marker }) as never} mode="B" initialOpen={0} />,
    )
    expect(html).toContain('sens à préciser')
    expect(html).not.toContain('Préciser le sens')
    const editable = renderToStaticMarkup(
      <VerseWords verse={oneBlock(empty, { is_marker: true, marker: empty.marker }) as never} mode="B" initialOpen={0} canEditMarkers />,
    )
    expect(editable).toContain('Préciser le sens')
  })

  it('treats a marker block whose entry was deleted as meaning-less', () => {
    const html = renderToStaticMarkup(
      <VerseWords verse={oneBlock(null, { is_marker: true, marker: null }) as never} mode="B" initialOpen={0} />,
    )
    expect(html).toContain('sens à préciser')
  })

  it('offers to listen to a word that has a recording, without loading the audio', () => {
    const rec = (id: string) => ({ id, path: `u/e/${id}.webm`, author: 'Awa', createdAt: '2026-10-04T10:00:00Z' })
    const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry({ audio: [rec('1')] })) as never} mode="B" initialOpen={0} />)
    expect(html).toContain('aria-label="Écouter la prononciation"')
    expect(html).not.toContain('<audio')
    expect(html).not.toContain('Voir toutes les prononciations')
  })

  it('links to all the recordings when there are several', () => {
    const rec = (id: string) => ({ id, path: `u/e/${id}.webm`, author: 'Awa', createdAt: '2026-10-04T10:00:00Z' })
    const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry({ audio: [rec('1'), rec('2')] })) as never} mode="B" initialOpen={0} />)
    expect(html).toContain('Voir toutes les prononciations')
    expect(html).toContain('/lexicon/L1#prononciation')
  })

  it('shows nothing about sound when the entry has no recording or the field is missing', () => {
    for (const audio of [[], undefined]) {
      const html = renderToStaticMarkup(<VerseWords verse={oneBlock(entry({ audio })) as never} mode="B" initialOpen={0} />)
      expect(html).not.toContain('Écouter la prononciation')
      expect(html).not.toContain('prononciations')
    }
  })

  it('offers the play button on a marker entry too', () => {
    const rec = (id: string) => ({ id, path: `u/e/${id}.webm`, author: 'Awa', createdAt: '2026-10-04T10:00:00Z' })
    const m = entry({ kind: 'marker', senses: [], senseId: null, audio: [rec('1')], marker: { type: 'temps', meaning: 'futur', french: null } })
    const html = renderToStaticMarkup(<VerseWords verse={oneBlock(m, { is_marker: true, marker: m.marker }) as never} mode="B" initialOpen={0} />)
    expect(html).toContain('aria-label="Écouter la prononciation"')
  })
})


