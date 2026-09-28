import { describe, expect, it } from 'vitest'
import { formatGradeDisplay, formatSubmissionStatusLabel } from '../lib/courses/assignment'

describe('formatGradeDisplay', () => {
  it('formats grade as percentage or unassigned placeholder', () => {
    expect(formatGradeDisplay(95)).toBe('95 / 100')
    expect(formatGradeDisplay(0)).toBe('0 / 100')
    expect(formatGradeDisplay(null)).toBe('Non noté')
    expect(formatGradeDisplay(undefined)).toBe('Non noté')
  })
})

describe('formatSubmissionStatusLabel', () => {
  it('returns French user-facing status label', () => {
    expect(formatSubmissionStatusLabel('submitted')).toBe('En attente de correction')
    expect(formatSubmissionStatusLabel('reviewed')).toBe('Évalué')
  })
})
