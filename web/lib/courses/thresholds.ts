/** Must match the `v_score >= 70.0` check in the `submit_quiz` SQL function. */
export const QUIZ_PASS_PERCENT = 70

export const FILL_IN_BLANK_PASS_PERCENT = 80

/**
 * A failed exercise records its score but adds no lesson progress: progress
 * means "how far through the lesson", the score means "how well it went".
 */
export function fillInBlankOutcome(scorePercent: number): { passed: boolean; progressPercent: number } {
  const passed = scorePercent >= FILL_IN_BLANK_PASS_PERCENT
  return { passed, progressPercent: passed ? 100 : 0 }
}
