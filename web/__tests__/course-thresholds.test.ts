import { describe, expect, it } from 'vitest'
import { FILL_IN_BLANK_PASS_PERCENT, QUIZ_PASS_PERCENT, fillInBlankOutcome } from '../lib/courses/thresholds'

describe('thresholds', () => {
  it('keeps the current pass marks', () => {
    expect(QUIZ_PASS_PERCENT).toBe(70)
    expect(FILL_IN_BLANK_PASS_PERCENT).toBe(80)
  })
})

describe('fillInBlankOutcome', () => {
  it('completes the lesson at or above the pass mark', () => {
    expect(fillInBlankOutcome(80)).toEqual({ passed: true, progressPercent: 100 })
    expect(fillInBlankOutcome(100)).toEqual({ passed: true, progressPercent: 100 })
  })

  it('does not turn a failed score into partial lesson progress', () => {
    expect(fillInBlankOutcome(79)).toEqual({ passed: false, progressPercent: 0 })
    expect(fillInBlankOutcome(0)).toEqual({ passed: false, progressPercent: 0 })
  })
})
