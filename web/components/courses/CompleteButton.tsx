'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { setLessonCompleted } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'

export function CompleteButton({
  lessonId,
  completed,
  progressPercent = 0,
  score,
}: {
  lessonId: string
  completed: boolean
  progressPercent?: number
  score?: number | null
}) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setLoading(true)
    setError(null)
    const { error: err } = await setLessonCompleted(supabase, lessonId, !completed)
    setLoading(false)
    if (err) {
      setError(err)
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" variant={completed ? 'outline' : 'default'} onClick={toggle} disabled={loading}>
          {loading ? 'Enregistrement…' : completed ? 'Terminée ✓ (annuler)' : 'Marquer comme terminée'}
        </Button>
        {!completed && progressPercent > 0 && (
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
            Progression : <strong className="text-foreground">{progressPercent}%</strong>
          </span>
        )}
        {score !== null && score !== undefined && (
          <span className="text-xs font-semibold text-secondary bg-secondary/10 px-2.5 py-1 rounded-full border border-secondary/20">
            Score : {score}%
          </span>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
