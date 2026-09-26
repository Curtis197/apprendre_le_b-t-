'use client'
import { useState } from 'react'
import { Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { reportCourse } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ReportCourseButton({ courseId }: { courseId: string }) {
  const [supabase] = useState(() => createClient())
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setLoading(true)
    setError(null)
    const { error: err } = await reportCourse(supabase, courseId, reason)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    setSent(true)
  }

  if (sent) {
    return <p className="text-sm text-muted-foreground">Merci, votre signalement a été transmis à l’équipe.</p>
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Flag className="w-3.5 h-3.5" />
        Signaler ce cours
      </button>
    )
  }

  return (
    <div className="space-y-2 max-w-md">
      <Textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Pourquoi signalez-vous ce cours ?"
        rows={3}
        maxLength={1000}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={loading || reason.trim().length < 5}>
          {loading ? 'Envoi…' : 'Envoyer le signalement'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  )
}
