import { describe, expect, it } from 'vitest'
import {
  checkEntryForm, dialectForRegion, emptyEntryForm, groupCandidates, senseSeed, splitList, stripArticle,
  type Candidate,
} from '@/lib/lexicon-links'
import type { LexSummary } from '@/lib/word-blocks'

const summary = (id: string, kind: 'word' | 'marker' = 'word'): LexSummary => ({
  id, kind, spelling: id, ipa: null, dialect: 'western', pos: [], description: null, synonyms: [],
  marker: { type: null, meaning: null, french: null }, senses: [], senseId: null, spellings: [],
})
const cand = (id: string, matchKind: Candidate['matchKind'], kind: 'word' | 'marker' = 'word'): Candidate => ({
  matchKind, matched: id, distance: matchKind === 'near' ? 1 : 0, entry: summary(id, kind),
})

describe('stripArticle', () => {
  it.each([
    ['au ciel', 'ciel'], ['les gens', 'gens'], ['la maison', 'maison'], ['un homme', 'homme'], ['des enfants', 'enfants'],
    ['du pain', 'pain'], ['aux hommes', 'hommes'], ['Le Père', 'Père'], ["l'eau", 'eau'], ['l’eau', 'eau'],
    ['au\u00a0ciel', 'ciel'], ['  les gens  ', 'gens'],
  ])('%s -> %s', (input, expected) => expect(stripArticle(input)).toBe(expected))

  it('keeps a lone article and words that merely start like one', () => {
    expect(stripArticle('au')).toBe('au')
    expect(stripArticle('du')).toBe('du')
    expect(stripArticle('lent')).toBe('lent')
    expect(stripArticle('desert')).toBe('desert')
    expect(stripArticle('')).toBe('')
  })

  it('seeds the first sense from the gloss', () => {
    expect(senseSeed('au ciel')).toBe('ciel')
    expect(senseSeed('est')).toBe('est')
  })
})

describe('dialectForRegion', () => {
  it.each([['Guiberoua', 'western'], ['Gagnoa', 'northern'], ['Daloa', 'eastern'], ['Autre', 'western'], [null, 'western'], [undefined, 'western']])(
    '%s -> %s', (region, dialect) => expect(dialectForRegion(region)).toBe(dialect),
  )
})

describe('groupCandidates', () => {
  it('splits exact, variants and the other kind', () => {
    const rows = [cand('a', 'exact'), cand('b', 'norm'), cand('c', 'near'), cand('m', 'exact', 'marker'), cand('n', 'near', 'marker')]
    const g = groupCandidates(rows, 'word')
    expect(g.exact.map(c => c.entry.id)).toEqual(['a'])
    expect(g.variants.map(c => c.entry.id)).toEqual(['b', 'c'])
    expect(g.otherKind.map(c => c.entry.id)).toEqual(['m', 'n'])
    expect(groupCandidates(rows, 'marker').exact.map(c => c.entry.id)).toEqual(['m'])
  })
  it('handles an empty list', () => {
    expect(groupCandidates([], 'word')).toEqual({ exact: [], variants: [], otherKind: [] })
  })
})

describe('entry form', () => {
  it('starts with the spelling, the dialect and a sense seeded from the gloss', () => {
    const f = emptyEntryForm('ghèhi-wu', 'au ciel', 'northern')
    expect(f).toMatchObject({ spelling: 'ghèhi-wu', dialect: 'northern', useExample: false })
    expect(f.senses).toEqual([{ french: 'ciel', context: '' }])
  })
  it('splits comma and semicolon lists', () => {
    expect(splitList(' a, b ;c,, ')).toEqual(['a', 'b', 'c'])
    expect(splitList('')).toEqual([])
  })
  it('needs a spelling and, for a word, one sense', () => {
    const f = emptyEntryForm('x', 'y', 'western')
    expect(checkEntryForm(f, 'word')).toBeNull()
    expect(checkEntryForm({ ...f, spelling: ' ' }, 'word')).toMatch(/graphie/i)
    expect(checkEntryForm({ ...f, senses: [{ french: ' ', context: '' }] }, 'word')).toMatch(/sens/i)
    expect(checkEntryForm({ ...f, senses: [] }, 'marker')).toBeNull()
  })
  it('reuses the lexicon length rules', () => {
    const f = emptyEntryForm('x', 'y', 'western')
    expect(checkEntryForm({ ...f, description: 'd'.repeat(2001) }, 'word')).toMatch(/2000/)
    expect(checkEntryForm({ ...f, senses: [{ french: 'f'.repeat(201), context: '' }] }, 'word')).toMatch(/200/)
    expect(checkEntryForm({ ...f, spelling: 's'.repeat(101) }, 'word')).toMatch(/100/)
  })
})
