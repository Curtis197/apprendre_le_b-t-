'use client'
import { useState } from 'react'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { saveQuiz } from '@/lib/courses/mutations'
import { validateQuiz, type QuizQuestionDraft, type QuizAnswerKey } from '@/lib/courses/quiz'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  lessonId: string
  initialQuestions: QuizQuestionDraft[]
  initialKeys: Map<string, QuizAnswerKey>
  readOnly?: boolean
  onSaved: () => void
}

export function QuizBuilder({ lessonId, initialQuestions, readOnly = false, onSaved }: Props) {
  const [supabase] = useState(() => createClient())
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>(() => {
    if (initialQuestions.length > 0) return initialQuestions
    return [
      {
        prompt: '',
        position: 0,
        options: [
          { text: '', position: 0 },
          { text: '', position: 1 },
        ],
        correctOptionIndices: [0],
        explanation: '',
      },
    ]
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addQuestion() {
    setQuestions(prev => [
      ...prev,
      {
        prompt: '',
        position: prev.length,
        options: [
          { text: '', position: 0 },
          { text: '', position: 1 },
        ],
        correctOptionIndices: [0],
        explanation: '',
      },
    ])
  }

  function removeQuestion(index: number) {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  function addOption(qIndex: number) {
    setQuestions(prev => {
      const copy = [...prev]
      const q = copy[qIndex]
      q.options.push({ text: '', position: q.options.length })
      return copy
    })
  }

  function removeOption(qIndex: number, optIndex: number) {
    setQuestions(prev => {
      const copy = [...prev]
      const q = copy[qIndex]
      if (q.options.length <= 2) return prev // Minimum 2 options
      q.options = q.options.filter((_, i) => i !== optIndex)
      q.correctOptionIndices = q.correctOptionIndices
        .filter(idx => idx !== optIndex)
        .map(idx => (idx > optIndex ? idx - 1 : idx))
      if (q.correctOptionIndices.length === 0) q.correctOptionIndices = [0]
      return copy
    })
  }

  function toggleCorrect(qIndex: number, optIndex: number) {
    setQuestions(prev => {
      const copy = [...prev]
      const q = copy[qIndex]
      const exists = q.correctOptionIndices.includes(optIndex)
      if (exists) {
        if (q.correctOptionIndices.length > 1) {
          q.correctOptionIndices = q.correctOptionIndices.filter(i => i !== optIndex)
        }
      } else {
        q.correctOptionIndices = [...q.correctOptionIndices, optIndex]
      }
      return copy
    })
  }

  async function handleSave() {
    const blocker = validateQuiz({ questions })
    if (blocker) {
      setError(blocker)
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    const res = await saveQuiz(supabase, lessonId, { questions })
    setSaving(false)

    if (res.error) {
      setError(res.error)
      return
    }

    setSaved(true)
    onSaved()
  }

  return (
    <div className="space-y-6">
      {questions.map((q, qIndex) => (
        <div key={qIndex} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold text-primary">Question {qIndex + 1}</span>
            {!readOnly && questions.length > 1 && (
              <button
                type="button"
                onClick={() => removeQuestion(qIndex)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
                aria-label="Supprimer la question"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor={`q-${qIndex}-prompt`}>Énoncé de la question</label>
            <Input
              id={`q-${qIndex}-prompt`}
              value={q.prompt}
              onChange={e => {
                const val = e.target.value
                setQuestions(prev => {
                  const copy = [...prev]
                  copy[qIndex].prompt = val
                  return copy
                })
              }}
              placeholder="Ex : Quel est le mot pour désigner l’eau ?"
              disabled={readOnly}
            />
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="text-xs font-medium">Options de réponse (cliquez sur le cercle pour marquer la bonne réponse)</label>
            {q.options.map((opt, optIndex) => {
              const isCorrect = q.correctOptionIndices.includes(optIndex)
              return (
                <div key={optIndex} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => !readOnly && toggleCorrect(qIndex, optIndex)}
                    className="p-1 text-primary hover:opacity-80 transition-opacity"
                    title={isCorrect ? 'Bonne réponse' : 'Marquer comme bonne réponse'}
                  >
                    {isCorrect ? <CheckCircle2 className="w-5 h-5 text-secondary" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
                  </button>
                  <Input
                    value={opt.text}
                    onChange={e => {
                      const val = e.target.value
                      setQuestions(prev => {
                        const copy = [...prev]
                        copy[qIndex].options[optIndex].text = val
                        return copy
                      })
                    }}
                    placeholder={`Option ${optIndex + 1}`}
                    disabled={readOnly}
                    className="flex-1"
                  />
                  {!readOnly && q.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(qIndex, optIndex)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}

            {!readOnly && q.options.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={() => addOption(qIndex)}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                Ajouter une option
              </Button>
            )}
          </div>

          {/* Explanation */}
          <div className="space-y-1 pt-2 border-t border-border">
            <label className="text-xs font-medium" htmlFor={`q-${qIndex}-explanation`}>Explication pédagogique (affichée après réponse)</label>
            <Textarea
              id={`q-${qIndex}-explanation`}
              value={q.explanation}
              onChange={e => {
                const val = e.target.value
                setQuestions(prev => {
                  const copy = [...prev]
                  copy[qIndex].explanation = val
                  return copy
                })
              }}
              placeholder="Expliquez pourquoi cette réponse est correcte…"
              rows={2}
              disabled={readOnly}
            />
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={addQuestion}>
            <Plus className="w-4 h-4 mr-1" />
            Nouvelle question
          </Button>

          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement…' : saved ? 'Quiz enregistré ✓' : 'Enregistrer le quiz'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
