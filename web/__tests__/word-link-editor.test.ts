import { describe, expect, it } from 'vitest'
import {
  addWords, afterSave, attachUnits, buildCells, derive, editWords, initDraft, markSaved, readiness,
  readerWillShowWords, readinessMessage, reconcileDraft, removeWord, setKind, setLink,
  setMeta, splitUnit, staleVerseNumbers, toSave, unitMeta, unlinkedMarkers,
  type VerseDraft,
} from '../lib/word-link-editor'
import { blockKey, labelOf, splitWords, type Unit, type VerseWords } from '../lib/word-blocks'

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

const draftOf = (i: number): VerseDraft => initDraft(i + 1, BETE[i], LIT[i], undefined)
const unitAt = (d: VerseDraft, side: 'b' | 'g', first: number): Unit => {
  const r = derive(d)
  return (side === 'b' ? r.bu : r.gu).find(u => u.idx[0] === first)!
}

describe('initDraft / derive', () => {
  it('verse 1 is balanced from the start thanks to the article grouping', () => {
    const r = derive(draftOf(0))
    expect(r.balanced).toBe(true)
    expect(r.pairs).toHaveLength(13)
  })

  it('verse 3 is balanced and "de" stays a word of its own', () => {
    expect(derive(draftOf(2)).balanced).toBe(true)
  })

  it('verse 4 starts unbalanced (19 against 17) and balances once the two particles are linked', () => {
    let d = draftOf(3)
    expect(derive(d).balanced).toBe(false)
    d = attachUnits(d, 'b', 9, 2)
    d = attachUnits(d, 'b', 18, 11)
    const r = derive(d)
    expect(r.balanced).toBe(true)
    expect(r.pairs[2].b!.idx).toEqual([2, 9])
  })

  it('verse 5 starts unbalanced (29 against 28)', () => {
    expect(derive(draftOf(4)).balanced).toBe(false)
  })
})

describe('attach and split keep the notes of the surviving block', () => {
  it('a note on the target block follows it when another block is attached', () => {
    let d = setMeta(draftOf(3), '2', { note: 'verbe' })
    d = attachUnits(d, 'b', 9, 2)
    expect(d.meta['2-9']?.note).toBe('verbe')
    expect(d.meta['2']).toBeUndefined()
  })

  it('splitting gives the note back to the first word', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = setMeta(d, '2-9', { note: 'verbe' })
    d = splitUnit(d, 'b', 2)
    expect(d.meta['2']?.note).toBe('verbe')
    expect(d.meta['9']).toBeUndefined()
    expect(derive(d).bu).toHaveLength(19)
  })

  it('a solo marker on a merged block that is split does not produce two solo blocks', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = setKind(d, '2-9', 'marker', true)
    d = splitUnit(d, 'b', 2)
    expect(derive(d).pairs.filter(p => p.solo).length).toBeLessThanOrEqual(1)
  })

  it('removing the head of a linked block leaves no meta key that matches no unit', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = attachUnits(d, 'b', 10, 2)
    d = setMeta(d, '2-9-10', { note: 'ghost' })
    d = removeWord(d, 'b', 2)
    const bu = derive(d).bu
    expect(Object.keys(d.meta).every(k => bu.some(u => blockKey(u) === k))).toBe(true)
  })
})

describe('text corrections', () => {
  it('merging "en men" into "enmen" in verse 5 keeps the pairing and balances the verse', () => {
    let d = draftOf(4)
    d = attachUnits(d, 'b', 21, 20)
    expect(derive(d).balanced).toBe(true)
    const res = editWords(d, 'b', unitAt(d, 'b', 20), ['enmen'])
    expect('draft' in res).toBe(true)
    if (!('draft' in res)) return
    d = res.draft
    const bw = splitWords(d.bete)
    expect(bw).toHaveLength(28)
    expect(bw.slice(19, 24)).toEqual(['yizé', 'enmen', 'kämaniè', 'enmen', 'tèemen'])
    expect(derive(d).balanced).toBe(true)
  })

  it('refuses an empty correction and a count change for words that are apart', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    const apart = unitAt(d, 'b', 2)
    expect(editWords(d, 'b', apart, [])).toEqual({ error: expect.stringContaining('au moins un mot') })
    expect(editWords(d, 'b', apart, ['tatini'])).toEqual({ error: expect.stringContaining('côte à côte') })
    expect('draft' in editWords(d, 'b', apart, ['tatinì', 'yií'])).toBe(true)
    d = draftOf(0)
  })

  it('adds and removes a word and shifts the links after it', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = addWords(d, 'b', 0, ['Oh'])
    expect(splitWords(d.bete)).toHaveLength(20)
    expect(d.attB).toEqual({ 10: 3 }) // yii was 9, tatini was 2
    d = removeWord(d, 'b', 0)
    expect(d.attB).toEqual({ 9: 2 })
    expect(splitWords(d.bete)).toHaveLength(19)
  })

  it('removing a linked word drops the link', () => {
    const d = removeWord(attachUnits(draftOf(3), 'b', 9, 2), 'b', 9)
    expect(d.attB).toEqual({})
  })

  it('a correction on the mot à mot side does not touch the Bété links or notes', () => {
    let d = setMeta(attachUnits(draftOf(3), 'b', 9, 2), '2-9', { note: 'x' })
    d = addWords(d, 'g', 0, ['Alors'])
    expect(d.attB).toEqual({ 9: 2 })
    expect(d.meta['2-9']?.note).toBe('x')
    expect(splitWords(d.literal)).toHaveLength(18)
  })
})

describe('markers', () => {
  const mk = () => initDraft(2, 'en ye zigbleh yi', 'je demain venir', undefined)

  it('a marker with no mot à mot counterpart is set aside and the verse balances', () => {
    let d = mk()
    expect(derive(d).balanced).toBe(false)
    d = setKind(d, '1', 'marker', true)
    expect(d.meta['1']).toEqual({ isMarker: true, solo: true, note: '', composition: '', lexiconId: null, translationId: null })
    const r = derive(d)
    expect(r.balanced).toBe(true)
    expect(r.pairs.map(p => [labelOf(r.bw, p.b!.idx), p.g ? labelOf(r.gw, p.g.idx) : null])).toEqual([
      ['en', 'je'], ['ye', null], ['zigbleh', 'demain'], ['yi', 'venir'],
    ])
  })

  it('turning a block back into a word clears the marker flags', () => {
    const d = setKind(setKind(mk(), '1', 'marker', true), '1', 'word', false)
    expect(d.meta['1']).toMatchObject({ isMarker: false, solo: false })
  })

  it('lists the stale verse numbers', () => {
    const v = (verse_no: number, stale: boolean): VerseWords => ({ verse_no, stale, bete_line: 'a', literal_line: 'b', blocks: [] })
    expect(staleVerseNumbers([v(1, false), v(2, true), v(5, true)])).toEqual([2, 5])
    expect(staleVerseNumbers([])).toEqual([])
  })
})

describe('toSave / markSaved', () => {
  it('sends only the lines that were corrected, and the base lines never change until saved', () => {
    const d0 = draftOf(2)
    expect(toSave(d0).beteLine).toBeNull()
    expect(toSave(d0).literalLine).toBeNull()
    const d1 = addWords(d0, 'b', 5, ['x'])
    expect(toSave(d1).beteLine).toBe('Nya anyi ziê a lilê x')
    expect(d1.baseBete).toBe(BETE[2])
    expect(toSave(markSaved(d1)).beteLine).toBeNull()
  })

  it('round-trips: a saved verse reopens as the same pairs, notes and markers', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = attachUnits(d, 'b', 18, 11)
    d = setMeta(d, '2-9', { note: 'verbe + particule' })
    const blocks = toSave(d).blocks
    const saved: VerseWords = {
      verse_no: 4, stale: false, bete_line: d.bete, literal_line: d.literal,
      blocks: blocks.map((b, i) => ({
        position: i + 1, bete_idx: b.bete_idx, gloss_idx: b.gloss_idx, is_marker: b.is_marker, solo: b.solo,
        note: b.note, composition: b.composition, marker: null,
      })),
    }
    const reopened = initDraft(4, d.bete, d.literal, saved)
    const a = derive(d)
    const b = derive(reopened)
    const flat = (r: ReturnType<typeof derive>) => r.pairs.map(p => [p.b!.idx, p.g!.idx])
    expect(flat(b)).toEqual(flat(a))
    expect(reopened.meta['2-9']?.note).toBe('verbe + particule')
  })

  it('on an unbalanced verse emits no block with an empty gloss unless solo', () => {
    const blocks = toSave(initDraft(1, 'a b c', 'x y', undefined)).blocks
    expect(blocks.every(b => b.gloss_idx.length > 0 || b.solo)).toBe(true)
  })

  it('ignores saved blocks of a stale verse and starts from the automatic grouping', () => {
    const stale: VerseWords = { verse_no: 1, stale: true, bete_line: 'x', literal_line: 'y', blocks: [] }
    const d = initDraft(1, BETE[0], LIT[0], stale)
    expect(derive(d).balanced).toBe(true)
  })
})

describe('readiness', () => {
  it('is ready when both fields have the same number of lines', () => {
    expect(readiness(BETE.join('\n'), LIT.join('\n'))).toEqual({ ok: true, verses: 5 })
  })

  it('explains a missing mot à mot, a missing text and a line count mismatch', () => {
    expect(readiness('a b', null)).toMatchObject({ ok: false, reason: 'no_literal' })
    expect(readiness('', 'x')).toMatchObject({ ok: false, reason: 'no_bete' })
    const mismatch = readiness('a\nb\nc', 'x\ny')
    expect(mismatch).toMatchObject({ ok: false, reason: 'line_count', bete: 3, literal: 2 })
    expect(readinessMessage(mismatch)).toContain('3 lignes')
    expect(readinessMessage(mismatch)).toContain('2 lignes')
  })

  it('counts lines like the gutter: blank lines and Windows line endings do not count', () => {
    expect(readiness('a\r\n\r\nb', 'x\n\ny')).toEqual({ ok: true, verses: 2 })
  })
})

describe('readiness with special spaces', () => {
  it('refuses a line made only of a non-breaking space, which the reader would not count', () => {
    const nb = String.fromCharCode(160)
    const r = readiness('A a\n' + nb + '\nB b', 'x y\n' + nb + '\nz t')
    expect(r).toMatchObject({ ok: false, reason: 'odd_whitespace' })
    expect(readinessMessage(r)).toContain('espaces spéciaux')
    expect(readiness('A a\nB b', 'x y\n' + nb + '\nz t')).toMatchObject({ ok: false, reason: 'odd_whitespace' })
  })
})

describe('readerWillShowWords', () => {
  it('is ok when the three fields line up line by line, or when there is a single verse', () => {
    expect(readerWillShowWords('a b\nc d\ne f', 'x y\nz t\nu v', 'un\ndeux\ntrois')).toEqual({ ok: true })
    expect(readerWillShowWords('a b c', 'x y z', 'un deux trois')).toEqual({ ok: true })
    expect(readerWillShowWords('a b\nc d', 'x y\nz t', null)).toEqual({ ok: true })
  })

  it('warns when the French has fewer lines', () => {
    const r = readerWillShowWords('a b\nc d\ne f', 'x y\nz t\nu v', 'un\ndeux')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('ne s’alignent pas')
  })

  it('warns when a one-line paragraph is cut into sentences', () => {
    const r = readerWillShowWords('A a. B b.', 'x y. z t.', 'Un. Deux.')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('découpé en phrases')
  })

  it('is ok for a single sentence', () => {
    expect(readerWillShowWords('A a b.', 'x y z.', 'Un deux.')).toEqual({ ok: true })
  })
})

describe('buildCells', () => {
  it('keeps the sentence order and puts the partner of a linked word at its own place', () => {
    let d = attachUnits(draftOf(3), 'b', 9, 2)
    d = attachUnits(d, 'b', 18, 11)
    const r = derive(d)
    const cells = buildCells(r.pairs, r.bw)
    const texts = cells.map(c => c.text)
    expect(texts.join(' ')).toBe(r.bw.join(' '))
    const yii = cells.find(c => c.text === 'yii')!
    expect(yii.run).toBe(1)
    expect(yii.runs).toEqual(['tatini', 'yii'])
    expect(cells.find(c => c.text === 'tatini' && c.run === 0)!.pairIndex).toBe(yii.pairIndex)
    expect(texts.indexOf('yii')).toBeGreaterThan(texts.indexOf('gbô'))
  })

  it('puts a mot à mot unit that has no Bété word at the end', () => {
    const d = initDraft(1, 'a b', 'x y z', undefined)
    const r = derive(d)
    const cells = buildCells(r.pairs, r.bw)
    expect(cells[cells.length - 1].pair.b).toBeNull()
  })
})

describe('unitMeta', () => {
  it('returns empty meta for a block that has none', () => {
    const d = draftOf(0)
    expect(unitMeta(d, { head: 0, idx: [0] })).toEqual({ isMarker: false, solo: false, note: '', composition: '', lexiconId: null, translationId: null })
  })
})

describe('afterSave', () => {
  it('keeps edits typed during the save and rebases on the lines that were sent', () => {
    const sent = draftOf(0)
    const current = { ...sent, bete: sent.bete + ' x' }
    const r = afterSave(current, sent)
    expect(r.bete).toBe(sent.bete + ' x')
    expect(r.baseBete).toBe(sent.bete)
    expect(toSave(r).beteLine).toBe(sent.bete + ' x')
  })
})

describe('reconcileDraft', () => {
  const initial = draftOf(0)
  const dirty = (d: VerseDraft): VerseDraft => ({ ...d, attB: { 1: 0 } })
  it('keeps an unsaved in-memory draft built on the same text', () => {
    const cur = dirty(initial)
    expect(reconcileDraft(initial, cur, JSON.stringify(initial), null)).toBe(cur)
  })
  it('uses a stored draft when the in-memory one is not dirty', () => {
    const stored = dirty(initial)
    expect(reconcileDraft(initial, initial, JSON.stringify(initial), stored)).toEqual({ ...initial, ...stored })
  })
  it('ignores a stored draft built on text that moved', () => {
    const stored = { ...dirty(initial), baseBete: 'other' }
    expect(reconcileDraft(initial, undefined, undefined, stored)).toBe(initial)
  })
  it('does not keep a dirty in-memory draft built on text that moved', () => {
    const cur = { ...dirty(initial), baseLiteral: 'other' }
    expect(reconcileDraft(initial, cur, JSON.stringify(initial), null)).toBe(initial)
  })
  it('returns the server draft when nothing else exists', () => {
    expect(reconcileDraft(initial, undefined, undefined, null)).toBe(initial)
  })
})

describe('links in the draft', () => {
  const draft = () => initDraft(1, 'en ye', 'je va', undefined)
  const saved: VerseWords = {
    verse_no: 1, stale: false, bete_line: 'en ye', literal_line: 'je va',
    blocks: [
      { position: 1, bete_idx: [0], gloss_idx: [0], is_marker: false, solo: false, note: null, composition: null, marker: null,
        lex: { id: 'L1', kind: 'word', spelling: 'en', ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
               marker: { type: null, meaning: null, french: null }, senses: [{ id: 'S1', french: 'je', context: null }], senseId: 'S1', spellings: [] } },
      { position: 2, bete_idx: [1], gloss_idx: [1], is_marker: true, solo: false, note: null, composition: null, marker: null, lex: null },
    ],
  }

  it('restores the entry and sense of saved blocks', () => {
    const d = initDraft(1, 'en ye', 'je va', saved)
    expect(d.meta['0']).toMatchObject({ lexiconId: 'L1', translationId: 'S1' })
    expect(d.meta['1']).toMatchObject({ lexiconId: null, translationId: null, isMarker: true })
  })

  it('sends the link with each block', () => {
    let d = setLink(draft(), '0', 'L1', 'S1')
    const out = toSave(d).blocks
    expect(out[0]).toMatchObject({ lexicon_id: 'L1', translation_id: 'S1' })
    expect(out[1]).toMatchObject({ lexicon_id: null, translation_id: null })
    expect('marker' in out[0]).toBe(false)
    d = setLink(d, '0', null, null)
    expect(toSave(d).blocks[0]).toMatchObject({ lexicon_id: null, translation_id: null })
  })

  it('drops the link when the block changes kind', () => {
    let d = setLink(draft(), '1', 'L9', null)
    d = setKind(d, '1', 'marker', false)
    expect(d.meta['1']).toMatchObject({ isMarker: true, lexiconId: null, translationId: null })
    d = setLink(d, '1', 'M1', null)
    d = setKind(d, '1', 'word', false)
    expect(d.meta['1']).toMatchObject({ isMarker: false, lexiconId: null })
  })

  it('keeps the link when the marker box is re-selected as marker (no kind change)', () => {
    let d = setKind(draft(), '1', 'marker', false)
    d = setLink(d, '1', 'M1', null)
    d = setKind(d, '1', 'marker', true)
    expect(d.meta['1']).toMatchObject({ lexiconId: 'M1', solo: true })
  })

  it('lists the marker blocks that have no entry yet', () => {
    let d = setKind(draft(), '1', 'marker', false)
    expect(unlinkedMarkers(d)).toEqual(['ye'])
    d = setLink(d, '1', 'M1', null)
    expect(unlinkedMarkers(d)).toEqual([])
    void derive
  })
})
