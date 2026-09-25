import { describe, expect, it } from 'vitest'
import {
  buildExampleRow,
  buildWordPayload,
  contributionErrorMessage,
  exampleState,
} from '../lib/contribution'

describe('exampleState', () => {
  it('is "none" when both fields are empty or blank', () => {
    expect(exampleState('', '')).toBe('none')
    expect(exampleState('  ', '\n')).toBe('none')
  })

  it('is "complete" when both fields have content', () => {
    expect(exampleState('Ɓa li', 'Il mange')).toBe('complete')
  })

  it('is "incomplete" when only one side is filled', () => {
    expect(exampleState('Ɓa li', '')).toBe('incomplete')
    expect(exampleState('', 'Il mange')).toBe('incomplete')
    expect(exampleState('Ɓa li', '   ')).toBe('incomplete')
  })
})

describe('buildWordPayload', () => {
  const base = {
    betePhonetic: 'gnaa',
    beteIPA: '',
    french: 'mère',
    pos: 'noun',
    notes: '',
    dialect: 'northern' as const,
    userId: 'user-1',
  }

  it('carries the chosen dialect', () => {
    expect(buildWordPayload(base).dialect).toBe('northern')
  })

  it('falls back to the Latin form when no IPA is given (column naming is inverted)', () => {
    const payload = buildWordPayload(base)
    expect(payload.bete_phonetic).toBe('gnaa')
    expect(payload.bete_word).toBe('gnaa')
  })

  it('uses the IPA form for bete_word when provided', () => {
    const payload = buildWordPayload({ ...base, beteIPA: 'ɲaa' })
    expect(payload.bete_word).toBe('ɲaa')
    expect(payload.bete_phonetic).toBe('gnaa')
  })

  it('stores empty notes as null and marks the entry as contributed', () => {
    const payload = buildWordPayload(base)
    expect(payload.notes).toBeNull()
    expect(payload.source).toBe('contributed')
    expect(payload.created_by).toBe('user-1')
  })
})

describe('buildExampleRow', () => {
  it('links the sentence to the word, dialect and author, trimming whitespace', () => {
    expect(
      buildExampleRow('lex-1', {
        bete: '  Ɓa li  ',
        french: ' Il mange ',
        dialect: 'eastern',
        userId: 'user-1',
      }),
    ).toEqual({
      lexicon_id: 'lex-1',
      bete_snippet: 'Ɓa li',
      french_snippet: 'Il mange',
      dialect: 'eastern',
      created_by: 'user-1',
    })
  })
})

describe('contributionErrorMessage', () => {
  it('explains a duplicate word in the same dialect (unique violation)', () => {
    expect(contributionErrorMessage({ code: '23505' })).toBe('Ce mot existe déjà dans ce dialecte.')
  })

  it('falls back to a generic message otherwise', () => {
    expect(contributionErrorMessage({ code: '42501' })).toBe("Erreur lors de l'envoi. Veuillez réessayer.")
    expect(contributionErrorMessage(null)).toBe("Erreur lors de l'envoi. Veuillez réessayer.")
    expect(contributionErrorMessage(new Error('boom'))).toBe("Erreur lors de l'envoi. Veuillez réessayer.")
  })
})
