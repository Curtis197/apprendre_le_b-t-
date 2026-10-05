import { describe, expect, it } from 'vitest'
import {
  buildExampleRow,
  buildWordClaimPayload,
  buildWordPayload,
  audioFailedMessage,
  audioOutcome,
  contributionErrorMessage,
  exampleState,
  WORD_ALREADY_CLAIMED,
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
    description: '',
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

  it('stores an empty description as null and marks the entry as contributed', () => {
    const payload = buildWordPayload(base)
    expect(payload.description).toBeNull()
    expect(payload.source).toBe('contributed')
    expect(payload.created_by).toBe('user-1')
  })

  it('keeps a typed description, trimmed', () => {
    expect(buildWordPayload({ ...base, description: '  Un repas. ' }).description).toBe('Un repas.')
  })
})

describe('buildWordClaimPayload', () => {
  const base = {
    betePhonetic: 'ɓɔ', beteIPA: '', french: 'chien', pos: 'noun',
    description: '', dialect: 'western' as const, userId: 'user-1',
  }

  it('only carries what the database lets a contributor fill in (no French, score or owner)', () => {
    expect(Object.keys(buildWordClaimPayload(base)).sort()).toEqual(
      ['bete_phonetic', 'bete_word', 'description', 'dialect', 'pos'],
    )
  })

  it('applies the same IPA fallback and description trimming as a new word', () => {
    const p = buildWordClaimPayload({ ...base, description: ' Animal ' })
    expect(p.bete_word).toBe('ɓɔ')
    expect(p.description).toBe('Animal')
    expect(p.pos).toEqual(['noun'])
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

  it('explains that a placeholder was translated by someone else in the meantime', () => {
    expect(contributionErrorMessage({ code: WORD_ALREADY_CLAIMED })).toContain("vient d'être traduit")
  })

  it('falls back to a generic message otherwise', () => {
    expect(contributionErrorMessage({ code: '42501' })).toBe("Erreur lors de l'envoi. Veuillez réessayer.")
    expect(contributionErrorMessage(null)).toBe("Erreur lors de l'envoi. Veuillez réessayer.")
    expect(contributionErrorMessage(new Error('boom'))).toBe("Erreur lors de l'envoi. Veuillez réessayer.")
  })
})

describe('audioOutcome', () => {
  it('says nothing when no recording was attempted', () => {
    expect(audioOutcome({ attempted: false, error: null })).toBe('none')
    expect(audioOutcome({ attempted: false, error: 'x' })).toBe('none')
  })
  it('distinguishes a sent recording from a failed one', () => {
    expect(audioOutcome({ attempted: true, error: null })).toBe('saved')
    expect(audioOutcome({ attempted: true, error: 'Vous avez déjà 3 enregistrements pour ce mot.' })).toBe('failed')
  })
})

describe('audioFailedMessage', () => {
  it('tells the word is saved and how to redo the recording', () => {
    const m = audioFailedMessage(null)
    expect(m).toMatch(/Mot enregistré/)
    expect(m).toMatch(/fiche du mot/)
  })
  it('appends the reason when there is one', () => {
    expect(audioFailedMessage('Enregistrement trop volumineux (1 Mo maximum).')).toContain('(Enregistrement trop volumineux (1 Mo maximum).)')
  })
})
