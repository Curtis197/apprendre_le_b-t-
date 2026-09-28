'use client'
import { useState } from 'react'
import { CheckCircle2, Clock, Send, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { submitAssignment } from '@/lib/courses/mutations'
import type { Submission } from '@/lib/courses/assignment'
import { formatGradeDisplay } from '@/lib/courses/assignment'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  lessonId: string
  initialSubmission: Submission | null
  readOnly?: boolean
}

export function AssignmentForm({ lessonId, initialSubmission, readOnly = false }: Props) {
  const [supabase] = useState(() => createClient())
  const [submission, setSubmission] = useState<Submission | null>(initialSubmission)
  const [answerText, setAnswerText] = useState(initialSubmission?.answer_text ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    setSuccess(false)

    const res = await submitAssignment(supabase, lessonId, answerText, null)
    setSubmitting(false)

    if (res.error || !res.data) {
      setError(res.error ?? 'Erreur lors de la remise de votre devoir.')
      return
    }

    setSubmission(res.data)
    setSuccess(true)
  }

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Remise de votre devoir
        </h3>
        {submission && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted flex items-center gap-1.5">
            {submission.status === 'reviewed' ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Évalué ({formatGradeDisplay(submission.grade)})
              </>
            ) : (
              <>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                En attente de correction
              </>
            )}
          </span>
        )}
      </div>

      {/* Teacher Feedback Display */}
      {submission && submission.status === 'reviewed' && submission.teacher_feedback && (
        <div className="bg-muted/60 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Commentaire de l’enseignant</p>
          <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
        </div>
      )}

      {/* Answer Form */}
      <div className="space-y-3">
        <label className="text-sm font-medium" htmlFor="assignment-answer">
          Votre réponse écrite :
        </label>
        <Textarea
          id="assignment-answer"
          value={answerText}
          onChange={e => setAnswerText(e.target.value)}
          rows={6}
          disabled={readOnly || submitting || submission?.status === 'reviewed'}
          placeholder="Rédigez votre réponse ici…"
          className="font-mono text-sm"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600 font-medium">Votre devoir a été transmis avec succès !</p>}

      {!readOnly && submission?.status !== 'reviewed' && (
        <Button onClick={handleSubmit} disabled={submitting || !answerText.trim()}>
          <Send className="w-4 h-4 mr-2" />
          {submitting ? 'Transmission…' : submission ? 'Mettre à jour ma réponse' : 'Remettre mon devoir'}
        </Button>
      )}
    </div>
  )
}
