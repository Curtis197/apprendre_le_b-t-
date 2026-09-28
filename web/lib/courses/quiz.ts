export interface QuizOption {
  id: string
  question_id: string
  text: string
  position: number
}

export interface QuizQuestion {
  id: string
  lesson_id: string
  prompt: string
  audio_path: string | null
  position: number
  options: QuizOption[]
}

export interface QuizAnswerKey {
  question_id: string
  correct_option_ids: string[]
  explanation: string
}

export interface QuizQuestionDraft {
  id?: string
  prompt: string
  audio_path?: string | null
  position: number
  options: { id?: string; text: string; position: number }[]
  correctOptionIndices: number[]
  explanation: string
}

export interface QuizInput {
  questions: QuizQuestionDraft[]
}

export interface QuizCorrectionItem {
  question_id: string
  is_correct: boolean
  correct_option_ids: string[]
  explanation: string
}

export interface QuizSubmissionResult {
  score: number
  passed: boolean
  total_questions: number
  correct_count: number
  details: QuizCorrectionItem[]
}

export function validateQuiz(input: QuizInput): string | null {
  if (input.questions.length === 0) {
    return 'Le quiz doit contenir au moins une question.'
  }

  for (const q of input.questions) {
    if (!q.prompt.trim()) {
      return 'Chaque question doit avoir un énoncé.'
    }
    if (q.options.length < 2) {
      return 'Chaque question doit avoir au moins 2 options de réponse.'
    }
    if (q.options.some(opt => !opt.text.trim())) {
      return 'Toutes les options de réponse doivent être renseignées.'
    }
    if (q.correctOptionIndices.length === 0) {
      return 'Veuillez désigner au moins une bonne réponse pour chaque question.'
    }
  }

  return null
}
