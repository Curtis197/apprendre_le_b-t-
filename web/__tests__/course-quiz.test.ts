import { describe, expect, it } from 'vitest'
import { validateQuiz, type QuizInput } from '../lib/courses/quiz'

describe('validateQuiz', () => {
  it('passes for a valid quiz with questions, options, and keys', () => {
    const quiz: QuizInput = {
      questions: [
        {
          prompt: 'Question 1',
          position: 0,
          options: [{ text: 'A', position: 0 }, { text: 'B', position: 1 }],
          correctOptionIndices: [0],
          explanation: 'Parce que A.',
        },
      ],
    }
    expect(validateQuiz(quiz)).toBeNull()
  })

  it('blocks quizzes with no questions', () => {
    expect(validateQuiz({ questions: [] })).toBe('Le quiz doit contenir au moins une question.')
  })

  it('blocks questions with fewer than 2 options', () => {
    const quiz: QuizInput = {
      questions: [
        {
          prompt: 'Question 1',
          position: 0,
          options: [{ text: 'A', position: 0 }],
          correctOptionIndices: [0],
          explanation: '',
        },
      ],
    }
    expect(validateQuiz(quiz)).toBe('Chaque question doit avoir au moins 2 options de réponse.')
  })

  it('blocks questions without any correct option selected', () => {
    const quiz: QuizInput = {
      questions: [
        {
          prompt: 'Question 1',
          position: 0,
          options: [{ text: 'A', position: 0 }, { text: 'B', position: 1 }],
          correctOptionIndices: [],
          explanation: '',
        },
      ],
    }
    expect(validateQuiz(quiz)).toBe('Veuillez désigner au moins une bonne réponse pour chaque question.')
  })
})
