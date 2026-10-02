import { describe, expect, it } from 'vitest'
import { escapeHtml, formatGradeDisplay, formatSubmissionStatusLabel, isPendingSubmission } from '../lib/courses/assignment'

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

describe('isPendingSubmission', () => {
  it('is true only while the teacher still has to act', () => {
    expect(isPendingSubmission('submitted')).toBe(true)
    expect(isPendingSubmission('reviewed')).toBe(false)
    expect(isPendingSubmission('validated')).toBe(false)
    expect(isPendingSubmission('needs_retry')).toBe(false)
  })
})

describe('escapeHtml', () => {
  it('neutralises markup and quotes in teacher-supplied text', () => {
    expect(escapeHtml(`<a href="https://x">clic</a> & 'ok'`)).toBe(
      '&lt;a href=&quot;https://x&quot;&gt;clic&lt;/a&gt; &amp; &#39;ok&#39;',
    )
  })
})

