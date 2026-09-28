export interface BlankToken {
  type: 'blank'
  id: string
  expectedAnswer: string
  options?: string[]
  hint?: string
}

export interface TextToken {
  type: 'text'
  content: string
}

export type Token = TextToken | BlankToken

export interface FillInBlankParsed {
  tokens: Token[]
  blanks: BlankToken[]
  allWordBankOptions: string[]
}

/** Normalizes diacritics, case, and whitespace for fair string comparisons. */
export function normalizeAnswer(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

export function isAnswerCorrect(userAnswer: string, expectedAnswer: string): boolean {
  if (!userAnswer || !expectedAnswer) return false
  return normalizeAnswer(userAnswer) === normalizeAnswer(expectedAnswer)
}

/** Deterministic Fisher-Yates shuffle with fixed seed option or array copy. */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Parses markdown source text containing [[blank]] or [[correct|option1|option2:hint]] patterns. */
export function parseFillInBlankText(text: string): FillInBlankParsed {
  const regex = /\[\[(.*?)\]\]/g
  const tokens: Token[] = []
  const blanks: BlankToken[] = []
  const allWordBankSet = new Set<string>()

  let lastIndex = 0
  let match: RegExpExecArray | null
  let blankCounter = 0

  while ((match = regex.exec(text)) !== null) {
    // Add text preceding the blank
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      })
    }

    const rawExpr = match[1].trim()
    let hint: string | undefined = undefined
    let choicesPart = rawExpr

    // Separate hint if present via ':'
    if (rawExpr.includes(':')) {
      const colonIndex = rawExpr.indexOf(':')
      choicesPart = rawExpr.substring(0, colonIndex).trim()
      hint = rawExpr.substring(colonIndex + 1).trim() || undefined
    }

    const choices = choicesPart.split('|').map(s => s.trim()).filter(Boolean)
    const expectedAnswer = choices[0] ?? ''

    blankCounter++
    const id = `blank_${blankCounter}`

    let options: string[] | undefined = undefined
    if (choices.length > 1) {
      options = shuffleArray(choices)
      choices.forEach(c => allWordBankSet.add(c))
    } else if (expectedAnswer) {
      allWordBankSet.add(expectedAnswer)
    }

    const blankToken: BlankToken = {
      type: 'blank',
      id,
      expectedAnswer,
      options,
      hint,
    }

    tokens.push(blankToken)
    blanks.push(blankToken)

    lastIndex = regex.lastIndex
  }

  // Add trailing text
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.substring(lastIndex),
    })
  }

  // Shuffle word bank for drag/tap interaction
  const allWordBankOptions = shuffleArray(Array.from(allWordBankSet))

  return {
    tokens,
    blanks,
    allWordBankOptions,
  }
}

/** Evaluates user responses against expected answers and computes accuracy score. */
export function evaluateFillInBlankAnswers(
  blanks: BlankToken[],
  userAnswers: Record<string, string>,
): {
  scorePercent: number
  correctCount: number
  totalCount: number
  results: Record<string, boolean>
} {
  if (blanks.length === 0) {
    return { scorePercent: 100, correctCount: 0, totalCount: 0, results: {} }
  }

  let correctCount = 0
  const results: Record<string, boolean> = {}

  for (const blank of blanks) {
    const userVal = userAnswers[blank.id] ?? ''
    const isCorrect = isAnswerCorrect(userVal, blank.expectedAnswer)
    results[blank.id] = isCorrect
    if (isCorrect) correctCount++
  }

  const scorePercent = Math.round((correctCount / blanks.length) * 100)

  return {
    scorePercent,
    correctCount,
    totalCount: blanks.length,
    results,
  }
}
