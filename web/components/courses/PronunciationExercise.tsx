'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Mic, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { submitPronunciation } from '@/lib/courses/mutations'
import { pronunciationStatusLabel } from '@/lib/courses/pronunciation'
import type { Submission } from '@/lib/courses/assignment'
import { PronunciationRecorder } from '@/components/courses/PronunciationRecorder'

interface Props {
  lessonId: string
  initialSubmission: Submission | null
  initialAudioUrl: string | null
  readOnly?: boolean
}

export function PronunciationExercise({ lessonId, initialSubmission, initialAudioUrl, readOnly = false }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submission = initialSubmission

  const canRecord = !readOnly && (!submission || submission.status === 'submitted' || submission.status === 'needs_retry')

  async function handleSend(blob: Blob) {
    setSending(true)
    setError(null)
    const res = await submitPronunciation(supabase, lessonId, blob)
    setSending(false)
    if (res.error) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6 bg-card border border-border rounded-xl p-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <h3 className="font-heading text-lg font-semibold flex items-center gap-2">
          <Mic className="w-5 h-5 text-primary" />
          Votre prononciation
        </h3>
        {submission && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted flex items-center gap-1.5">
            {submission.status === 'validated' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            ) : submission.status === 'needs_retry' ? (
              <RotateCcw className="w-3.5 h-3.5 text-destructive" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-amber-500" />
            )}
            {pronunciationStatusLabel(submission.status)}
          </span>
        )}
      </div>

      {submission?.teacher_feedback && (
        <div className="bg-muted/60 border border-primary/20 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-primary uppercase tracking-wider">Commentaire de l’enseignant</p>
          <p className="text-sm whitespace-pre-wrap">{submission.teacher_feedback}</p>
        </div>
      )}

      {initialAudioUrl && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Votre dernier enregistrement :</p>
          <audio controls src={initialAudioUrl} className="w-full" />
        </div>
      )}

      {submission?.status === 'submitted' && (
        <p className="text-sm text-muted-foreground">
          Votre enseignant n’a pas encore écouté cet enregistrement. Vous pouvez le remplacer en en envoyant un nouveau.
        </p>
      )}

      {canRecord && <PronunciationRecorder sending={sending} onSend={handleSend} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
