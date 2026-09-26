'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { setLessonCompleted } from '@/lib/courses/mutations'
import { Button } from '@/components/ui/button'

export function CompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
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
      <Button size="lg" variant={completed ? 'outline' : 'default'} onClick={toggle} disabled={loading}>
        {loading ? 'Enregistrement…' : completed ? 'Terminée ✓ (annuler)' : 'Marquer comme terminée'}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
