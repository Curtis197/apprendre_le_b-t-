'use client'
import { useState } from 'react'
import { CheckCircle2, XCircle, RotateCcw, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { submitQuizAnswers } from '@/lib/courses/mutations'
import type { QuizQuestion, QuizSubmissionResult } from '@/lib/courses/quiz'
import { AudioPlayer } from './AudioPlayer'
import { Button } from '@/components/ui/button'

interface Props {
  lessonId: string
  questions: QuizQuestion[]
  onPassed?: () => void
}

export function QuizPlayer({ lessonId, questions, onPassed }: Props) {
  const [supabase] = useState(() => createClient())
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizSubmissionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggleOption(questionId: string, optionId: string) {
    if (result) return // Locked after submit until reset
    setSelectedAnswers(prev => {
      const current = prev[questionId] ?? []
      const exists = current.includes(optionId)
      return {
        ...prev,
        [questionId]: exists ? current.filter(id => id !== optionId) : [...current, optionId],
      }
    })
  }

  async function handleSubmit() {
    // Check all questions answered
    const unanswered = questions.some(q => !(selectedAnswers[q.id]?.length > 0))
    if (unanswered) {
      setError('Veuillez répondre à toutes les questions avant de valider.')
      return
    }

    setSubmitting(true)
    setError(null)
    const res = await submitQuizAnswers(supabase, lessonId, selectedAnswers)
    setSubmitting(false)

    if (res.error || !res.data) {
      setError(res.error ?? 'Erreur inattendue.')
      return
    }

    setResult(res.data)
    if (res.data.passed && onPassed) {
      onPassed()
    }
  }

  function handleRetry() {
    setResult(null)
    setSelectedAnswers({})
    setError(null)
  }

  return (
    <div className="space-y-8">
      {/* Quiz questions */}
      <div className="space-y-6">
        {questions.map((q, qIndex) => {
          const correction = result?.details.find(d => d.question_id === q.id)
          const isCorrect = correction?.is_correct

          return (
            <div
              key={q.id}
              className={`bg-card border rounded-xl p-5 space-y-4 transition-colors ${
                result
                  ? isCorrect
                    ? 'border-secondary/40 bg-secondary/5'
                    : 'border-destructive/40 bg-destructive/5'
                  : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-heading font-semibold text-base">
                  <span className="text-primary mr-2">{qIndex + 1}.</span>
                  {q.prompt}
                </h3>
                {result && (
                  <span className="shrink-0">
                    {isCorrect ? (
                      <CheckCircle2 className="w-5 h-5 text-secondary" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </span>
                )}
              </div>

              {/* Optional audio prompt */}
              {q.audio_path && (
                <AudioPlayer src={q.audio_path} title="Écouter la question" className="bg-muted" />
              )}

              {/* Choices */}
              <div className="space-y-2">
                {q.options.map(opt => {
                  const isSelected = (selectedAnswers[q.id] ?? []).includes(opt.id)
                  const keyRevealed = Boolean(correction?.correct_option_ids)
                  const isActualCorrect = correction?.correct_option_ids?.includes(opt.id)

                  let choiceStyle = 'border-border hover:bg-muted'
                  if (result) {
                    if (isActualCorrect || (!keyRevealed && isSelected && correction?.is_correct)) {
                      choiceStyle = 'border-secondary bg-secondary/15 text-secondary font-medium'
                    } else if (isSelected && (keyRevealed || correction?.is_correct === false)) {
                      choiceStyle = 'border-destructive bg-destructive/15 text-destructive'
                    } else {
                      choiceStyle = 'border-border opacity-50'
                    }
                  } else if (isSelected) {
                    choiceStyle = 'border-primary bg-primary/10 text-primary font-medium'
                  }

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={Boolean(result)}
                      onClick={() => toggleOption(q.id, opt.id)}
                      className={`w-full text-left p-3 rounded-lg border text-sm flex items-center justify-between transition-colors ${choiceStyle}`}
                    >
                      <span>{opt.text}</span>
                      {isSelected && !result && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Correction explanation */}
              {correction?.explanation && (
                <div className="text-xs bg-muted/60 rounded-lg p-3 text-muted-foreground italic">
                  <strong>Explication :</strong> {correction.explanation}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Action / Result banner */}
      {result ? (
        <div className={`rounded-xl border p-6 text-center space-y-4 ${result.passed ? 'bg-secondary/10 border-secondary/30' : 'bg-destructive/10 border-destructive/30'}`}>
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-background mb-1">
            <Award className={`w-8 h-8 ${result.passed ? 'text-secondary' : 'text-destructive'}`} />
          </div>
          <div>
            <h4 className="font-heading text-xl font-bold">
              {result.passed ? 'Félicitations, quiz réussi !' : 'Score insuffisant'}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              Votre score : <strong>{result.score} %</strong> ({result.correct_count} sur {result.total_questions} bonnes réponses).
              {result.passed ? ' Cette leçon est désormais validée.' : ' Un score d’au moins 70 % est nécessaire pour valider.'}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Recommencer le quiz
          </Button>
        </div>
      ) : (
        <Button size="lg" onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto">
          {submitting ? 'Validation en cours…' : 'Valider mes réponses'}
        </Button>
      )}
    </div>
  )
}
