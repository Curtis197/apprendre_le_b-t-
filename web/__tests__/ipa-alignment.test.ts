import { describe, it, expect } from 'vitest'
import { alignIpa, describeIpa, hasIpa } from '@/lib/ipa-alignment'

const LATIN = "Sê a'a tatini a yii\nKaba nunu"

describe('alignIpa', () => {
  it('has one element per non-empty Latin line, and "none" without an IPA text', () => {
    const v = alignIpa(LATIN + '\n\nTroisième', null)
    expect(v.map(x => x.status)).toEqual(['none', 'none', 'none'])
    expect(v.map(x => x.no)).toEqual([1, 2, 3])
    expect(v[0].beteWords).toBe(5)
    expect(alignIpa(LATIN, '   \n ').map(x => x.status)).toEqual(['none', 'none'])
  })

  it('links the words by position when the counts are equal', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii\nKaba nʋnʋ")
    expect(v[0]).toMatchObject({ status: 'ok', line: "Sɛ a'a tatɩnɩ a yii", words: ['Sɛ', "a'a", 'tatɩnɩ', 'a', 'yii'] })
    expect(v[1].words).toEqual(['Kaba', 'nʋnʋ'])
  })

  it('never gives words when the counts differ, but keeps the line for the plain view', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ yii\nKaba nʋnʋ")
    expect(v[0]).toMatchObject({ status: 'words-differ', words: null, line: "Sɛ a'a tatɩnɩ yii", beteWords: 5, ipaWords: 4 })
    expect(v[1].status).toBe('ok')
  })

  it('marks the verses that have no IPA line, and ignores extra IPA lines', () => {
    const fewer = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii")
    expect(fewer.map(x => x.status)).toEqual(['ok', 'line-missing'])
    expect(fewer[1]).toMatchObject({ line: null, words: null, ipaWords: 0 })
    const more = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii\nKaba nʋnʋ\nde trop")
    expect(more).toHaveLength(2)
  })

  it('splits on spaces and tabs only, and skips blank lines on both sides', () => {
    const v = alignIpa("a\tb\n\n  c d  ", "x\ty\n\n z   w ")
    expect(v.map(x => x.status)).toEqual(['ok', 'ok'])
    expect(v[1].words).toEqual(['z', 'w'])
  })

  it('treats a hyphenated tone mark as part of its word', () => {
    expect(alignIpa("‑nyɛ Davidɩ", "‑nyɛ Davidɩ")[0].words).toEqual(['‑nyɛ', 'Davidɩ'])
  })
})

describe('hasIpa', () => {
  it('is true when at least one verse has an IPA line', () => {
    expect(hasIpa(alignIpa(LATIN, null))).toBe(false)
    expect(hasIpa(alignIpa(LATIN, 'x'))).toBe(true)
  })
})

describe('describeIpa', () => {
  it('says nothing without an IPA text', () => {
    expect(describeIpa(alignIpa(LATIN, ''), 0)).toBeNull()
  })

  it('confirms when every line is linked', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii\nKaba nʋnʋ")
    expect(describeIpa(v, 2)).toEqual({ ok: true, message: 'Les mots API sont reliés à leurs mots latins, ligne par ligne.' })
  })

  it('names the lines whose word counts differ, with the same numbers as the gutter', () => {
    const v = alignIpa(LATIN, "Sɛ a'a tatɩnɩ yii\nKaba nʋnʋ")
    const d = describeIpa(v, 2)
    expect(d?.ok).toBe(false)
    expect(d?.message).toContain('ligne 1 : 5 mots en latin, 4 en API')
    expect(d?.message).not.toContain('ligne 2')
  })

  it('says how many lines are missing or extra', () => {
    expect(describeIpa(alignIpa(LATIN, "Sɛ a'a tatɩnɩ a yii"), 1)?.message).toContain('Le texte API a 1 ligne, le texte latin en a 2')
    expect(describeIpa(alignIpa(LATIN, 'a\nb\nc'), 3)?.message).toContain('Le texte API a 3 lignes, le texte latin en a 2')
  })
})
