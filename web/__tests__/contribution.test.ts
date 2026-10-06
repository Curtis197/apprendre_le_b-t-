import { describe, expect, it } from 'vitest'
import {
  audioFailedMessage,
  audioOutcome,
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
