import { describe, it, expect } from 'vitest'
import {
  parseFillInBlankText,
  isAnswerCorrect,
  normalizeAnswer,
  evaluateFillInBlankAnswers,
} from '../lib/courses/fill-in-blank'

describe('fill-in-blank parser & evaluator', () => {
  it('parses simple bracket blanks [[answer]]', () => {
    const text = 'En bhété, [[Awa]] veut dire bonjour.'
    const parsed = parseFillInBlankText(text)

    expect(parsed.blanks).toHaveLength(1)
    expect(parsed.blanks[0].expectedAnswer).toBe('Awa')
    expect(parsed.blanks[0].hint).toBeUndefined()
    expect(parsed.blanks[0].options).toBeUndefined()
    expect(parsed.tokens).toHaveLength(3)
  })

  it('parses multi-choice dropdown blanks [[correct|option1|option2]]', () => {
    const text = 'Je te dis [[Awa|Oua|N\'zue]].'
    const parsed = parseFillInBlankText(text)

    expect(parsed.blanks).toHaveLength(1)
    expect(parsed.blanks[0].expectedAnswer).toBe('Awa')
    expect(parsed.blanks[0].options).toHaveLength(3)
    expect(parsed.blanks[0].options).toContain('Awa')
    expect(parsed.blanks[0].options).toContain('Oua')
  })

  it('parses hints [[answer:hint]]', () => {
    const text = 'Bienvenue : [[Awa:Salutation du matin]].'
    const parsed = parseFillInBlankText(text)

    expect(parsed.blanks).toHaveLength(1)
    expect(parsed.blanks[0].expectedAnswer).toBe('Awa')
    expect(parsed.blanks[0].hint).toBe('Salutation du matin')
  })

  it('normalizes diacritics and case correctly', () => {
    expect(normalizeAnswer('  Àwá  ')).toBe('awa')
    expect(isAnswerCorrect('àwá', 'Awa')).toBe(true)
    expect(isAnswerCorrect('Bété', 'bete')).toBe(true)
    expect(isAnswerCorrect('faux', 'vrai')).toBe(false)
  })

  it('evaluates user responses and calculates score percentage', () => {
    const text = 'Le mot [[Awa]] veut dire bonjour et [[N\'zue]] veut dire eau.'
    const parsed = parseFillInBlankText(text)

    const result1 = evaluateFillInBlankAnswers(parsed.blanks, {
      blank_1: 'awa',
      blank_2: "n'zue",
    })
    expect(result1.scorePercent).toBe(100)
    expect(result1.results.blank_1).toBe(true)
    expect(result1.results.blank_2).toBe(true)

    const result2 = evaluateFillInBlankAnswers(parsed.blanks, {
      blank_1: 'awa',
      blank_2: 'mauvais',
    })
    expect(result2.scorePercent).toBe(50)
    expect(result2.results.blank_1).toBe(true)
    expect(result2.results.blank_2).toBe(false)
  })
})
