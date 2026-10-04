import { describe, expect, it } from 'vitest'
import {
  attachTo, autoGroup, blockKey, blockWords, buildUnits, contiguous, labelOf, mapInsert, mapRemove,
  mapReplace, nonEmptyLines, normWord, pairUnits, readerTokens, remapAtt, remapKeys, splitRuns, splitWords,
  type VerseWords,
} from '../lib/word-blocks'

// The Notre Père, as paired by hand in the mockups: the real fixtures of the pilot.
const BETE = [
  'A diba Lago ô wu mä ghèhi-wu nikpa wuo ni ghlimani na ngli',
  "Na'a komanon ni ghle glô sê wa zoua mä ghéhi-wu sê en yibhää gba wa kä sibhä mää dudu wu zumen",
  'Nya anyi ziê a lilê',
  "Sê a'a tatini a bhia a'a nyinyo li gbô yii Yaya tatini sibha a'a nyinyo li a gbô yi",
  'Téa anyi yi-tatini a ni ti nyinyo li men bhlini maa sè anyi Sataa a mentenon ngli diba na yizé en men kämaniè enmen tèemen enmen ghliyè kwadrekwadrenon Amen',
]
const LIT = [
  'Notre Père Dieu qui est là-bas au ciel les gens tous que élève ton nom',
  'Ton commandement que arrive terre comme ils font là-bas au ciel comme tu veux ordonne ils vont aussi ici en bas faire',
  "Donne nous aujourd'hui de nourriture",
  'Comme nous laissons nos amis leur mauvaise chose problème pardon laisse aussi nos mauvaise chose nos problème',
  'Ne nous laisse nous ne pas mauvaise chose dedans tomber mais enlève nous Satan son envoyé bouche père toi seul toi commande toi puissant toi grand éternellement Amen',
]

describe('splitWords / nonEmptyLines', () => {
  it('splits on spaces, tabs and non-breaking spaces and keeps hyphens and apostrophes', () => {
    expect(splitWords("  Na'a  ghèhi-wu\tô  ")).toEqual(["Na'a", 'ghèhi-wu', 'ô'])
    expect(splitWords('')).toEqual([])
    expect(splitWords('   ')).toEqual([])
  })

  it('splits on non-breaking spaces', () => {
    expect(splitWords('a\u00A0b')).toEqual(['a', 'b'])
  })

  it('numbers lines like numberLines: non-empty lines only, any line ending', () => {
    expect(nonEmptyLines('a b\r\n\r\n c \rd')).toEqual(['a b', 'c', 'd'])
    expect(nonEmptyLines('')).toEqual([])
  })
})

describe('normWord', () => {
  it('folds case, accents, tones, apostrophes and hyphens', () => {
    expect(normWord('Téa')).toBe('tea')
    expect(normWord("Na'a")).toBe('naa')
    expect(normWord('ghèhi-wu')).toBe('ghehiwu')
    expect(normWord('ghéhi-wu')).toBe('ghehiwu')
  })

  it('removes curly apostrophes', () => {
    expect(normWord('Na\u2019a')).toBe('naa')
  })
})

describe('autoGroup (French articles)', () => {
  it('groups an article with the next word, as in "au ciel" and "les gens"', () => {
    const gw = splitWords(LIT[0])
    expect(autoGroup(gw)).toEqual({ 6: 7, 8: 9 })
    expect(buildUnits(gw, autoGroup(gw))).toHaveLength(13)
  })

  it('does not group "de", which is a real Bété word in "Nya anyi ziê a lilê"', () => {
    expect(autoGroup(splitWords(LIT[2]))).toEqual({})
  })

  it('chains articles onto the head of the following group', () => {
    expect(autoGroup(['le', 'la', 'maison'])).toEqual({ 0: 2, 1: 2 })
  })
})

describe('buildUnits / attachTo / pairUnits', () => {
  it('verse 1 pairs 13 Bété words with 13 mot à mot units after article grouping', () => {
    const bu = buildUnits(splitWords(BETE[0]), {})
    const gw = splitWords(LIT[0])
    const gu = buildUnits(gw, autoGroup(gw))
    expect(bu).toHaveLength(13)
    const pairs = pairUnits(bu, gu, new Set())
    expect(pairs.every(p => p.b && p.g)).toBe(true)
    expect(labelOf(gw, pairs[6].g!.idx)).toBe('au ciel') // ghèhi-wu
    expect(labelOf(gw, pairs[7].g!.idx)).toBe('les gens') // nikpa
  })

  it('verse 4 balances at 17/17 when the two particles are linked to their tatini', () => {
    const bw = splitWords(BETE[3])
    const gw = splitWords(LIT[3])
    expect(bw).toHaveLength(19)
    expect(gw).toHaveLength(17)
    let att = attachTo({}, 9, 2) // yii -> first tatini
    att = attachTo(att, 18, 11) // yi -> second tatini
    const bu = buildUnits(bw, att)
    const gu = buildUnits(gw, autoGroup(gw))
    expect(bu).toHaveLength(17)
    const pairs = pairUnits(bu, gu, new Set())
    expect(pairs[2].b!.idx).toEqual([2, 9])
    expect(labelOf(gw, pairs[2].g!.idx)).toBe('laissons')
    expect(labelOf(bw, pairs[2].b!.idx)).toBe('tatini … yii')
    expect(pairs[10].b!.idx).toEqual([11, 18])
    expect(labelOf(gw, pairs[10].g!.idx)).toBe('laisse')
  })

  it('a marker with no mot à mot counterpart is set aside and does not shift the others', () => {
    const bw = splitWords('en ye zigbleh yi')
    const gw = splitWords('je demain venir')
    const bu = buildUnits(bw, {})
    const gu = buildUnits(gw, {})
    const pairs = pairUnits(bu, gu, new Set(['1']))
    expect(pairs.map(p => [p.b && blockWords(bw, p.b.idx), p.g && blockWords(gw, p.g.idx), !!p.solo])).toEqual([
      ['en', 'je', false],
      ['ye', null, true],
      ['zigbleh', 'demain', false],
      ['yi', 'venir', false],
    ])
  })

  it('ignores attachments that point outside the line or to a non-head', () => {
    expect(buildUnits(['a', 'b'], { 0: 5 })).toHaveLength(2)
    expect(buildUnits(['a', 'b', 'c'], { 0: 1, 1: 2 })).toHaveLength(2) // 1 is attached, so 0 -> 1 is ignored
  })
})

describe('runs and labels', () => {
  it('detects separated words and labels them with an ellipsis', () => {
    expect(contiguous([3, 4, 5])).toBe(true)
    expect(contiguous([2, 9])).toBe(false)
    expect(splitRuns([2, 9, 10])).toEqual([[2], [9, 10]])
    expect(blockKey({ head: 2, idx: [2, 9] })).toBe('2-9')
    expect(labelOf(['a', 'b', 'c', 'd'], [0, 2])).toBe('a … c')
    expect(labelOf(['a', 'b', 'c', 'd'], [1, 2])).toBe('b c')
    expect(blockWords(['a', 'b', 'c', 'd'], [0, 2])).toBe('a c')
  })
})

describe('index remapping after a text correction', () => {
  it('merging "en men" into "enmen" in verse 5 shifts every later index by one', () => {
    const f = mapReplace([20, 21], 1)
    expect(f(19)).toBe(19)
    expect(f(20)).toBe(20)
    expect(f(21)).toBeNull()
    expect(f(22)).toBe(21)
    expect(remapAtt({ 21: 20, 25: 24 }, f)).toEqual({ 24: 23 })
    expect(remapKeys({ '20-21': 'x', '22': 'y' }, f)).toEqual({ '20': 'x', '21': 'y' })
  })

  it('inserting and removing a word', () => {
    expect(mapInsert(3, 2)(2)).toBe(2)
    expect(mapInsert(3, 2)(3)).toBe(5)
    expect(mapRemove(3)(3)).toBeNull()
    expect(mapRemove(3)(4)).toBe(3)
    expect(remapAtt({ 4: 2 }, mapRemove(4))).toEqual({})
  })

  it('splitting one word into two grows the line', () => {
    const f = mapReplace([5], 2)
    expect(f(5)).toBe(5)
    expect(f(6)).toBe(7)
  })
})

describe('readerTokens', () => {
  const verse: VerseWords = {
    verse_no: 4,
    stale: false,
    bete_line: "Sê a'a tatini a yii",
    literal_line: 'Comme nous laissons nos',
    blocks: [
      { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null },
      { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: false, solo: false, note: 'sujet', composition: null, marker: null },
      { position: 3, bete_idx: [2, 4], gloss_idx: [2], is_marker: false, solo: false, note: null, composition: null, marker: null },
      { position: 4, bete_idx: [3], gloss_idx: [3], is_marker: false, solo: false, note: null, composition: 'a (x) + a (y)', marker: null },
    ],
  }

  it('gives one token per word place, in the original sentence order', () => {
    const tokens = readerTokens(verse)
    expect(tokens.map(t => t.t)).toEqual(['Sê', "a'a", 'tatini', 'a', 'yii'])
  })

  it('links the pieces of a block with separated words', () => {
    const [, , tatini, , yii] = readerTokens(verse)
    expect(tatini.bid).toBe(yii.bid)
    expect(tatini.k).toBe(0)
    expect(yii.k).toBe(1)
    expect(tatini.runs).toEqual(['tatini', 'yii'])
    expect(tatini.whole).toBe('tatini … yii')
    expect(tatini.gloss).toBe('laissons')
  })

  it('carries notes, compositions and a solo marker with no gloss', () => {
    const solo: VerseWords = {
      verse_no: 2, stale: false, bete_line: 'en ye zigbleh yi', literal_line: 'je demain venir',
      blocks: [
        { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null },
        { position: 2, bete_idx: [1], gloss_idx: [], is_marker: true, solo: true, note: null, composition: null, marker: { type: 'temps', meaning: 'futur', french: 'aller + verbe' } },
        { position: 3, bete_idx: [2], gloss_idx: [1], is_marker: false, solo: false, note: null, composition: null, marker: null },
        { position: 4, bete_idx: [3], gloss_idx: [2], is_marker: false, solo: false, note: null, composition: null, marker: null },
      ],
    }
    const ye = readerTokens(solo)[1]
    expect(ye.gloss).toBeNull()
    expect(ye.isMarker).toBe(true)
    expect(ye.marker?.meaning).toBe('futur')
    expect(readerTokens(verse)[1].note).toBe('sujet')
    expect(readerTokens(verse)[3].composition).toBe('a (x) + a (y)')
  })
})
