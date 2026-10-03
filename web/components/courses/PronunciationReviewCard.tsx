'use client'
import { useState } from 'react'
import { CheckCircle2, Clock, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { reviewPronunciation } from '@/lib/courses/mutations'
import { pronunciationStatusLabel } from '@/lib/courses/pronunciation'
import type { PendingReviewItem } from '@/lib/courses/assignment'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  item: PendingReviewItem
  onReviewed: (submissionId: string, status: 'validated' | 'needs_retry', feedback: string) => void
}

export function PronunciationReviewCard({ item, onReviewed }: Props) {
  const { submission, lesson, course, learner, audioUrl } = item
  const [supabase] = useState(() => createClient())
  const [feedback, setFeedback] = useState(submission.teacher_feedback ?? '')
  const [editing, setEditing] = useState(submission.status === 'submitted')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function decide(outcome: 'validated' | 'needs_retry') {
    setBusy(true)
    setError(null)
    const res = await reviewPronunciation(supabase, submission.id, outcome, feedback)
    setBusy(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setEditing(false)
    onReviewed(submission.id, outcome, feedback.trim())
  }

  return (
    <div className="border border-border rounded-xl p-5 bg-card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <span className="text-xs text-muted-foreground">{course.title}</span>
          <h4 className="font-semibold text-base">{lesson.title}</h4>
          <p className="text-xs text-muted-foreground">Par : {learner.full_name}</p>
        </div>
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted flex items-center gap-1">
          {submission.status === 'validated' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          ) : submission.status === 'needs_retry' ? (
            <RotateCcw className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          )}
          {pronunciationStatusLabel(submission.status)}
        </span>
      </div>

      {audioUrl ? (
        <audio controls src={audioUrl} className="w-full" />
      ) : (
        <p className="text-sm text-muted-foreground">Enregistrement indisponible.</p>
      )}

      {editing ? (
        <div className="space-y-3">
          <Textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            rows={3}
            placeholder="Commentaire pour l’apprenant (obligatoire) : ce qui est bien, ce qu’il faut corriger…"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => decide('validated')} disabled={busy || !feedback.trim()}>
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Valider
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide('needs_retry')} disabled={busy || !feedback.trim()}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              À refaire
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-muted/40 p-4 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Votre commentaire</span>
            <button type="button" className="underline" onClick={() => setEditing(true)}>
              Modifier la décision
            </button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
