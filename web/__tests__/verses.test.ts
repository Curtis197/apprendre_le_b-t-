import { describe, expect, it } from 'vitest'
import { alignVerses, countVerses, describeAlignment, splitSentences, splitStanzas } from '../lib/verses'

describe('splitStanzas', () => {
  it('splits on blank lines, trims lines and drops empty ones', () => {
    expect(splitStanzas('  a \n b \n\n\n c \n')).toEqual([['a', 'b'], ['c']])
  })

  it('handles Windows line endings and whitespace-only separator lines', () => {
    expect(splitStanzas('a\r\nb\r\n  \r\nc')).toEqual([['a', 'b'], ['c']])
  })
})

describe('splitSentences', () => {
  it('cuts after . ! ? and …, keeping the punctuation', () => {
    expect(splitSentences('Il pleut. Où vas-tu ? Viens ! Attends…')).toEqual([
      'Il pleut.',
      'Où vas-tu ?',
      'Viens !',
      'Attends…',
    ])
  })

  it('keeps a trailing fragment without punctuation', () => {
    expect(splitSentences('Il pleut. Et après')).toEqual(['Il pleut.', 'Et après'])
  })
})

describe('alignVerses', () => {
  it('treats one line as single (nothing to align)', () => {
    expect(alignVerses('lagɔ bhïte', 'Dieu frappe', 'Il pleut')).toEqual({ kind: 'single' })
  })

  it('aligns line by line, grouped in stanzas', () => {
    const r = alignVerses(
      'b1\nb2\n\nb3',
      'l1\nl2\n\nl3',
      'f1\nf2\n\nf3',
    )
    expect(r.kind).toBe('verses')
    if (r.kind !== 'verses') return
    expect(r.unit).toBe('line')
    expect(r.stanzas).toEqual([
      [
        { original: 'b1', literal: 'l1', french: 'f1' },
        { original: 'b2', literal: 'l2', french: 'f2' },
      ],
      [{ original: 'b3', literal: 'l3', french: 'f3' }],
    ])
    expect(countVerses(r)).toBe(3)
  })

  it('keeps the mot à mot optional: French only, or no translation at all', () => {
    const frenchOnly = alignVerses('b1\nb2', null, 'f1\nf2')
    expect(frenchOnly.kind).toBe('verses')
    if (frenchOnly.kind === 'verses') {
      expect(frenchOnly.stanzas[0]).toEqual([
        { original: 'b1', literal: undefined, french: 'f1' },
        { original: 'b2', literal: undefined, french: 'f2' },
      ])
    }
    expect(alignVerses('b1\nb2', '', '').kind).toBe('verses')
  })

  it('works when only the literal is given', () => {
    const r = alignVerses('b1\nb2', 'l1\nl2', undefined)
    expect(r.kind).toBe('verses')
  })

  it('falls back to stanza blocks when stanzas match but lines differ inside them', () => {
    const r = alignVerses('b1\nb2\n\nb3', null, 'f1\n\nf2\nf3')
    expect(r.kind).toBe('stanzas')
    if (r.kind !== 'stanzas') return
    expect(r.stanzas).toEqual([
      { original: 'b1\nb2', literal: undefined, french: 'f1' },
      { original: 'b3', literal: undefined, french: 'f2\nf3' },
    ])
  })

  it('reports line counts when the fields do not line up', () => {
    const r = alignVerses('b1\nb2\nb3', 'l1\nl2', 'f1\n\nf2\n\nf3')
    expect(r).toEqual({ kind: 'misaligned', counts: { original: 3, literal: 2, french: 3 } })
  })

  it('aligns a paragraph sentence by sentence', () => {
    const r = alignVerses(
      'Awa ɛ wa. Kouassi ɛ wa.',
      'Awa est venue. Kouassi est venu.',
      'Awa est arrivée. Kouassi est arrivé.',
    )
    expect(r.kind).toBe('verses')
    if (r.kind !== 'verses') return
    expect(r.unit).toBe('sentence')
    expect(r.stanzas).toHaveLength(1)
    expect(r.stanzas[0]).toHaveLength(2)
    expect(r.stanzas[0][1]).toEqual({
      original: 'Kouassi ɛ wa.',
      literal: 'Kouassi est venu.',
      french: 'Kouassi est arrivé.',
    })
  })

  it('does not align a paragraph whose sentence counts differ', () => {
    const r = alignVerses('Awa ɛ wa. Kouassi ɛ wa.', null, 'Awa et Kouassi sont arrivés.')
    expect(r.kind).toBe('misaligned')
  })

  it('does not treat a single sentence as a paragraph to split', () => {
    expect(alignVerses('Awa ɛ wa.', null, 'Awa est arrivée.')).toEqual({ kind: 'single' })
  })
})

describe('describeAlignment', () => {
  it('says nothing about a single line', () => {
    expect(describeAlignment(alignVerses('lagɔ bhïte', null, 'Il pleut'))).toBeNull()
  })

  it('confirms aligned verses and sentences with their count', () => {
    expect(describeAlignment(alignVerses('b1\nb2\nb3', null, 'f1\nf2\nf3'))).toEqual({
      ok: true,
      message: '✓ 3 vers alignés',
    })
    expect(describeAlignment(alignVerses('A a. B b.', null, 'A. B.'))).toEqual({
      ok: true,
      message: '✓ 2 phrases alignées',
    })
  })

  it('warns with the line count of every field that was filled in', () => {
    const hint = describeAlignment(alignVerses('b1\nb2\nb3', null, 'f1\nf2'))
    expect(hint?.ok).toBe(false)
    expect(hint?.message).toContain('bhété : 3')
    expect(hint?.message).toContain('français : 2')
    expect(hint?.message).not.toContain('mot à mot')
  })

  it('explains a mismatch inside a single stanza with the line counts', () => {
    const hint = describeAlignment(alignVerses('b1\nb2\nb3', null, 'f1\nf2'))
    expect(hint?.ok).toBe(false)
    expect(hint?.message).toContain('un seul bloc')
    expect(hint?.message).not.toContain('couplets')
  })

  it('asks for the same number of lines when stanza counts differ too', () => {
    const hint = describeAlignment(alignVerses('b1\nb2\nb3', 'l1\nl2', 'f1\n\nf2\n\nf3'))
    expect(hint?.ok).toBe(false)
    expect(hint?.message).toContain('bhété : 3')
    expect(hint?.message).toContain('mot à mot : 2')
    expect(hint?.message).toContain('français : 3')
  })

  it('explains the couplet-by-couplet fallback', () => {
    const hint = describeAlignment(alignVerses('b1\nb2\n\nb3', null, 'f1\n\nf2\nf3'))
    expect(hint?.ok).toBe(false)
    expect(hint?.message).toContain('2 couplets')
    expect(hint?.message).toContain('bhété : 3')
  })
})
