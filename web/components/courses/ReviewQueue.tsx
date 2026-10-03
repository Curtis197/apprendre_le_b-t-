'use client'
import { useState } from 'react'
import { CheckCircle2, Clock, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { reviewSubmission } from '@/lib/courses/mutations'
import { isPendingSubmission, type PendingReviewItem } from '@/lib/courses/assignment'
import { PronunciationReviewCard } from '@/components/courses/PronunciationReviewCard'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  initialItems: PendingReviewItem[]
}

export function ReviewQueue({ initialItems }: Props) {
  const [supabase] = useState(() => createClient())
  const [items, setItems] = useState<PendingReviewItem[]>(initialItems)
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('pending')
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')
  const [grade, setGrade] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = items.filter(item => {
    if (filter === 'pending') return isPendingSubmission(item.submission.status)
    if (filter === 'reviewed') return !isPendingSubmission(item.submission.status)
    return true
  })

  function handlePronunciationReviewed(submissionId: string, status: 'validated' | 'needs_retry', feedback: string) {
    setItems(prev =>
      prev.map(item =>
        item.submission.id === submissionId
          ? {
              ...item,
              submission: { ...item.submission, status, teacher_feedback: feedback, reviewed_at: new Date().toISOString() },
            }
          : item,
      ),
    )
  }

  async function handleSaveReview(submissionId: string) {
    setSubmitting(true)
    setError(null)
    const numericGrade = grade.trim() ? parseInt(grade, 10) : null

    const res = await reviewSubmission(supabase, submissionId, feedback, numericGrade)
    setSubmitting(false)

    if (res.error) {
      setError(res.error)
      return
    }

    setItems(prev =>
      prev.map(item =>
        item.submission.id === submissionId
          ? {
              ...item,
              submission: {
                ...item.submission,
                status: 'reviewed',
                teacher_feedback: feedback,
                grade: numericGrade,
                reviewed_at: new Date().toISOString(),
              },
            }
          : item,
      ),
    )
    setActiveSubmissionId(null)
    setFeedback('')
    setGrade('')
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'pending' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          À corriger ({items.filter(i => isPendingSubmission(i.submission.status)).length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('reviewed')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'reviewed' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Corrigés ({items.filter(i => !isPendingSubmission(i.submission.status)).length})
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Tous ({items.length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 border border-dashed border-border rounded-xl text-center text-muted-foreground">
          Aucun devoir dans cette file de correction.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(item => {
            if (item.lesson.kind === 'pronunciation') {
              return (
                <PronunciationReviewCard
                  key={item.submission.id}
                  item={item}
                  onReviewed={handlePronunciationReviewed}
                />
              )
            }
            const { submission, lesson, course, learner } = item
            return (
              <div key={submission.id} className="border border-border rounded-xl p-5 bg-card space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                  <span className="text-xs text-muted-foreground">{course.title}</span>
                  <h4 className="font-semibold text-base">{lesson.title}</h4>
                  <p className="text-xs text-muted-foreground">Par : {learner.full_name}</p>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted flex items-center gap-1">
                  {submission.status === 'reviewed' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Évalué ({submission.grade !== null ? `${submission.grade}/100` : 'Pas de note'})
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      En attente
                    </>
                  )}
                </span>
              </div>

              {/* Learner Answer */}
              {submission.answer_text && (
                <div className="bg-muted/40 p-4 rounded-lg space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Réponse de l’apprenant :</p>
                  <p className="text-sm whitespace-pre-wrap">{submission.answer_text}</p>
                </div>
              )}

              {/* Existing Review or Review Form */}
              {submission.status === 'reviewed' && activeSubmissionId !== submission.id ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>Votre correction</span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubmissionId(submission.id)
                        setFeedback(submission.teacher_feedback ?? '')
                        setGrade(submission.grade !== null ? String(submission.grade) : '')
                      }}
                      className="underline"
                    >
                      Modifier la correction
                    </button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <Textarea
                    value={activeSubmissionId === submission.id ? feedback : ''}
                    onChange={e => {
                      setActiveSubmissionId(submission.id)
                      setFeedback(e.target.value)
                    }}
                    placeholder="Écrivez votre commentaire de correction pour l’apprenant…"
                    rows={3}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium" htmlFor={`grade-${submission.id}`}>Note / 100 (optionnel) :</label>
                      <input
                        id={`grade-${submission.id}`}
                        type="number"
                        min={0}
                        max={100}
                        value={activeSubmissionId === submission.id ? grade : ''}
                        onChange={e => {
                          setActiveSubmissionId(submission.id)
                          setGrade(e.target.value)
                        }}
                        className="w-20 h-8 px-2 rounded border border-input text-sm text-center font-mono"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSaveReview(submission.id)}
                      disabled={submitting || activeSubmissionId !== submission.id || !feedback.trim()}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Envoyer la correction
                    </Button>
                  </div>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
